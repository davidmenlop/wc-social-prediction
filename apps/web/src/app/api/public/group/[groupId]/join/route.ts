import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { notifyJoinRequestAdmins } from "@/lib/notifications/events";
import { getOptionalServerEnv } from "@/lib/env.server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type JoinBody = {
  requestedName?: string;
  requestedPhone?: string;
};

type GroupRow = {
  id: string;
  name: string;
  privacy: "open" | "approval_required";
  registration_deadline: string | null;
};

type JoinRequestRow = {
  id: string;
  status: "pending" | "approved" | "rejected";
  requested_name: string | null;
  requested_phone: string | null;
};

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await context.params;
    const userId = await resolveUserIdFromAuthorization(request);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as JoinBody;
    const requestedName = body.requestedName?.trim() || null;
    const defaultCountryCode = getOptionalServerEnv("WHATSAPP_DEFAULT_COUNTRY_CODE");
    const phoneResult = normalizePhone(body.requestedPhone || "", defaultCountryCode);
    if (phoneResult.error) {
      return NextResponse.json(
        { ok: false, error: phoneResult.error },
        { status: 400 }
      );
    }
    const requestedPhone = phoneResult.value;

    const { data: group, error: groupError } = await supabaseAdmin
      .from("groups")
      .select("id, name, privacy, registration_deadline")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ ok: false, error: "Group not found" }, { status: 404 });
    }

    const typedGroup = group as GroupRow;
    if (isRegistrationClosed(typedGroup.registration_deadline)) {
      return NextResponse.json(
        { ok: false, code: "registration_closed", error: "Group registration is closed" },
        { status: 409 }
      );
    }

    if (typedGroup.privacy === "approval_required" && !requestedPhone) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "WhatsApp number is required for approval-required groups. Use international format like +573001112233.",
        },
        { status: 400 }
      );
    }

    const profilePayload = {
      id: userId,
      display_name: requestedName || `Guest-${userId.slice(0, 6)}`,
      phone: requestedPhone,
      notification_enabled: true,
    };

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id", ignoreDuplicates: false });

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: `Could not upsert profile: ${profileError.message}` },
        { status: 500 }
      );
    }

    const { data: existingMember } = await supabaseAdmin
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json({ ok: true, status: "already_member" });
    }

    if (typedGroup.privacy === "open") {
      const { error: joinError } = await supabaseAdmin.from("group_members").upsert(
        {
          group_id: groupId,
          user_id: userId,
          is_admin: false,
        },
        { onConflict: "group_id,user_id", ignoreDuplicates: true }
      );

      if (joinError) {
        return NextResponse.json(
          { ok: false, error: `Could not join group: ${joinError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, status: "joined" });
    }

    const { data: existingRequest } = await supabaseAdmin
      .from("join_requests")
      .select("id, status, requested_name, requested_phone")
      .eq("group_id", groupId)
      .eq("requested_by", userId)
      .maybeSingle();

    const existing = (existingRequest ?? null) as JoinRequestRow | null;

    if (existing?.status === "pending") {
      return NextResponse.json({ ok: true, status: "already_pending", requestId: existing.id });
    }

    let requestId = existing?.id;
    if (!existing) {
      const { data: created, error: createError } = await supabaseAdmin
        .from("join_requests")
        .insert({
          group_id: groupId,
          requested_by: userId,
          status: "pending",
          requested_name: requestedName,
          requested_phone: requestedPhone,
          admin_action_token: randomUUID(),
        })
        .select("id")
        .single();

      if (createError || !created) {
        return NextResponse.json(
          {
            ok: false,
            error: `Could not create join request: ${createError?.message ?? "unknown"}`,
          },
          { status: 500 }
        );
      }

      requestId = created.id as string;
    } else {
      const safePhone = existing.requested_phone || requestedPhone;
      const { error: updateError } = await supabaseAdmin
        .from("join_requests")
        .update({
          status: "pending",
          requested_name: requestedName || existing.requested_name,
          requested_phone: safePhone,
          admin_action_token: randomUUID(),
          reviewed_by: null,
          reviewed_at: null,
          admin_notes: null,
        })
        .eq("id", requestId);

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: `Could not update join request: ${updateError.message}` },
          { status: 500 }
        );
      }
    }

    if (!requestId) {
      return NextResponse.json(
        { ok: false, error: "Could not resolve join request id" },
        { status: 500 }
      );
    }

    const notifyResult = await notifyJoinRequestAdmins(requestId);
    return NextResponse.json({ ok: true, status: "pending", requestId, notifyResult });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function resolveUserIdFromAuthorization(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authHeader.slice("Bearer ".length).trim();
  if (!accessToken) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

function normalizePhone(
  raw: string,
  defaultCountryCode?: string
): { value: string | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null };
  }

  const keepPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!digitsOnly) {
    return { value: null, error: "Invalid WhatsApp number." };
  }

  let normalized = "";
  if (keepPlus) {
    normalized = `+${digitsOnly}`;
  } else {
    const ccDigits = (defaultCountryCode || "").replace(/\D/g, "");
    if (ccDigits) {
      normalized = `+${ccDigits}${digitsOnly}`;
    } else if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
      normalized = `+${digitsOnly}`;
    } else {
      return {
        value: null,
        error:
          "WhatsApp number must include country code (e.g. +573001112233) or configure WHATSAPP_DEFAULT_COUNTRY_CODE.",
      };
    }
  }

  const normalizedDigits = normalized.replace(/\D/g, "");
  if (normalizedDigits.length < 8 || normalizedDigits.length > 15) {
    return {
      value: null,
      error:
        "WhatsApp number format is invalid. Use international format like +573001112233.",
    };
  }

  return { value: normalized };
}

function isRegistrationClosed(registrationDeadline: string | null): boolean {
  if (!registrationDeadline) {
    return false;
  }

  const deadline = new Date(registrationDeadline);
  if (Number.isNaN(deadline.getTime())) {
    return false;
  }

  return Date.now() > deadline.getTime();
}
