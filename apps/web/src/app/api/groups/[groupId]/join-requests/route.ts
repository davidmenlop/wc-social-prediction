import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type JoinRequestRow = {
  id: string;
  requested_by: string;
  status: "pending" | "approved" | "rejected";
  requested_name: string | null;
  requested_phone: string | null;
  created_at: string;
  reviewed_at: string | null;
  admin_notes: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string;
  phone: string | null;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await context.params;
    const userId = await resolveUserIdFromAuthorization(request);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const adminAccess = await hasAdminAccess(groupId, userId);
    if (!adminAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: joinRequests, error: requestsError } = await supabaseAdmin
      .from("join_requests")
      .select(
        "id, requested_by, status, requested_name, requested_phone, created_at, reviewed_at, admin_notes"
      )
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (requestsError) {
      return NextResponse.json(
        { ok: false, error: `Could not load join requests: ${requestsError.message}` },
        { status: 500 }
      );
    }

    const rows = (joinRequests ?? []) as JoinRequestRow[];
    const requestedByIds = Array.from(new Set(rows.map((row) => row.requested_by)));

    let profilesMap = new Map<string, ProfileRow>();
    if (requestedByIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, phone")
        .in("id", requestedByIds);

      profilesMap = new Map(
        ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile])
      );
    }

    const result = rows.map((row) => {
      const profile = profilesMap.get(row.requested_by);
      return {
        id: row.id,
        status: row.status,
        requestedBy: row.requested_by,
        requestedName:
          row.requested_name?.trim() || profile?.display_name || `Guest-${row.requested_by.slice(0, 6)}`,
        requestedPhone: row.requested_phone || profile?.phone || null,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
        adminNotes: row.admin_notes,
      };
    });

    return NextResponse.json({ ok: true, requests: result });
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
