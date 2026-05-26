import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type GroupRow = {
  id: string;
  name: string;
  privacy: "open" | "approval_required";
  registration_deadline: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await context.params;

    const { data: group, error } = await supabaseAdmin
      .from("groups")
      .select("id, name, privacy, registration_deadline")
      .eq("id", groupId)
      .single();

    if (error || !group) {
      return NextResponse.json(
        { ok: false, error: "Group not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, group: group as GroupRow });
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
