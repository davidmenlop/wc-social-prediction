import { NextResponse } from "next/server";
import { notifyJoinDecisionUser } from "@/lib/notifications/events";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ActionStatus = "approved" | "rejected";

export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await context.params;
    const url = new URL(request.url);
    const action = (url.searchParams.get("action") || "").trim() as ActionStatus;
    const token = (url.searchParams.get("token") || "").trim();

    if ((action !== "approved" && action !== "rejected") || !token) {
      return plain(
        400,
        "Invalid action link. Please ask the group creator to resend the request notification."
      );
    }

    const { data: joinRequest, error: requestError } = await supabaseAdmin
      .from("join_requests")
      .select("id, group_id, requested_by, status, admin_action_token")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !joinRequest) {
      return plain(404, "Join request not found.");
    }

    if (joinRequest.admin_action_token !== token) {
      return plain(403, "This action link is not valid for this request.");
    }

    if (joinRequest.status === "approved" || joinRequest.status === "rejected") {
      return plain(200, `This request was already ${joinRequest.status}.`);
    }

    const { error: updateError } = await supabaseAdmin
      .from("join_requests")
      .update({
        status: action,
        reviewed_by: null,
        reviewed_at: new Date().toISOString(),
        admin_notes: action === "approved" ? "Approved via WhatsApp link" : "Rejected via WhatsApp link",
      })
      .eq("id", requestId)
      .eq("status", "pending");

    if (updateError) {
      return plain(500, `Could not update request: ${updateError.message}`);
    }

    if (action === "approved") {
      const { error: memberError } = await supabaseAdmin.from("group_members").upsert(
        {
          group_id: joinRequest.group_id,
          user_id: joinRequest.requested_by,
          is_admin: false,
        },
        { onConflict: "group_id,user_id", ignoreDuplicates: true }
      );

      if (memberError) {
        return plain(500, `Request updated but failed to add member: ${memberError.message}`);
      }
    }

    await notifyJoinDecisionUser(requestId);

    if (action === "approved") {
      return plain(200, "Request approved. The user was added to the group and notified.");
    }

    return plain(200, "Request rejected. The user was notified.");
  } catch (error) {
    return plain(
      500,
      error instanceof Error ? error.message : "Unknown error while processing request"
    );
  }
}

function plain(status: number, text: string) {
  return new NextResponse(text, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
