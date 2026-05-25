import { NextResponse } from "next/server";
import { isInternalTokenValid } from "@/lib/auth/internal-token";
import { notifyJoinRequestAdmins } from "@/lib/notifications/events";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type SubmitJoinRequestBody = {
  groupId?: string;
  requestedBy?: string;
  requestedName?: string;
  requestedPhone?: string;
};

export async function POST(request: Request) {
  if (!isInternalTokenValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as SubmitJoinRequestBody;

    if (!body.groupId || !body.requestedBy) {
      return NextResponse.json(
        { error: "groupId and requestedBy are required" },
        { status: 400 }
      );
    }

    const payload = {
      group_id: body.groupId,
      requested_by: body.requestedBy,
      status: "pending",
      requested_name: body.requestedName?.trim() || null,
      requested_phone: body.requestedPhone?.trim() || null,
    };

    const { data: created, error: createError } = await supabaseAdmin
      .from("join_requests")
      .insert(payload)
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

    const notifyResult = await notifyJoinRequestAdmins(created.id as string);

    return NextResponse.json({ ok: true, requestId: created.id, notifyResult });
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
