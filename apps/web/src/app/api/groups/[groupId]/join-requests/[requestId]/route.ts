import { NextResponse } from "next/server";
import { notifyJoinDecisionUser } from "@/lib/notifications/events";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ProcessBody = {
  status?: "approved" | "rejected";
  adminNotes?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string; requestId: string }> }
) {
  try {
    const { groupId, requestId } = await context.params;
    const userId = await resolveUserIdFromAuthorization(request);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const adminAccess = await hasAdminAccess(groupId, userId);
    if (!adminAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ProcessBody;
    if (body.status !== "approved" && body.status !== "rejected") {
      return NextResponse.json(
        { ok: false, error: "status must be approved or rejected" },
        { status: 400 }
      );
    }

    const { data: joinRequest, error: requestError } = await supabaseAdmin
      .from("join_requests")
      .select("id, group_id, requested_by, status")
      .eq("id", requestId)
      .eq("group_id", groupId)
      .maybeSingle();

    if (requestError || !joinRequest) {
      return NextResponse.json({ ok: false, error: "Join request not found" }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("join_requests")
      .update({
        status: body.status,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        admin_notes: body.adminNotes?.trim() || null,
      })
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Could not update request: ${updateError.message}` },
        { status: 500 }
      );
    }

    if (body.status === "approved") {
      const { error: memberError } = await supabaseAdmin.from("group_members").upsert(
        {
          group_id: groupId,
          user_id: joinRequest.requested_by,
          is_admin: false,
        },
        { onConflict: "group_id,user_id", ignoreDuplicates: true }
      );

      if (memberError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Request updated but could not add member: ${memberError.message}`,
          },
          { status: 500 }
        );
      }
    }

    const notifyResult = await notifyJoinDecisionUser(requestId);
    return NextResponse.json({
      ok: true,
      notifyResult,
      notificationWarning:
        notifyResult.sentMessages > 0
          ? null
          : notifyResult.errors.join(" | ") || "Notification was not delivered",
    });
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

async function hasAdminAccess(groupId: string, userId: string): Promise<boolean> {
  const { data: member, error: memberError } = await supabaseAdmin
    .from("group_members")
    .select("is_admin")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!memberError && member?.is_admin) {
    return true;
  }

  const { data: group, error: groupError } = await supabaseAdmin
    .from("groups")
    .select("created_by")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError || !group) {
    return false;
  }

  return group.created_by === userId;
}
