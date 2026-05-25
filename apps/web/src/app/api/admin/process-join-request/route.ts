import { NextResponse } from "next/server";
import { isInternalTokenValid } from "@/lib/auth/internal-token";
import { notifyJoinDecisionUser } from "@/lib/notifications/events";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ProcessJoinRequestBody = {
  requestId?: string;
  status?: "approved" | "rejected";
  reviewedBy?: string;
  adminNotes?: string;
};

export async function POST(request: Request) {
  if (!isInternalTokenValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as ProcessJoinRequestBody;

    if (!body.requestId || !body.status) {
      return NextResponse.json(
        { error: "requestId and status are required" },
        { status: 400 }
      );
    }

    if (body.status !== "approved" && body.status !== "rejected") {
      return NextResponse.json(
        { error: "status must be approved or rejected" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("join_requests")
      .select("id, group_id, requested_by, status")
      .eq("id", body.requestId)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        {
          ok: false,
          error: `Join request not found: ${existingError?.message ?? "unknown"}`,
        },
        { status: 404 }
      );
    }

    const updatePayload = {
      status: body.status,
      reviewed_by: body.reviewedBy ?? null,
      reviewed_at: new Date().toISOString(),
      admin_notes: body.adminNotes?.trim() || null,
    };

    const { error: updateError } = await supabaseAdmin
      .from("join_requests")
      .update(updatePayload)
      .eq("id", body.requestId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Could not update request: ${updateError.message}` },
        { status: 500 }
      );
    }

    if (body.status === "approved") {
      const { error: memberError } = await supabaseAdmin
        .from("group_members")
        .upsert(
          {
            group_id: existing.group_id,
            user_id: existing.requested_by,
            is_admin: false,
          },
          { onConflict: "group_id,user_id", ignoreDuplicates: true }
        );

      if (memberError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Request updated but membership failed: ${memberError.message}`,
          },
          { status: 500 }
        );
      }
    }

    const notifyResult = await notifyJoinDecisionUser(body.requestId);

    return NextResponse.json({ ok: true, notifyResult });
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
