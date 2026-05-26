import "server-only";

import {
  buildJoinDecisionMessage,
  buildJoinRequestMessage,
  buildPredictionReminderMessage,
} from "@/lib/notifications/templates";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOptionalServerEnv } from "@/lib/env.server";

type EventNotificationResult = {
  sentMessages: number;
  skippedMessages: number;
  errors: string[];
};

type JoinRequestRow = {
  id: string;
  group_id: string;
  requested_by: string;
  status: "pending" | "approved" | "rejected";
  requested_name: string | null;
  requested_phone: string | null;
  admin_action_token: string;
};

type GroupRow = {
  id: string;
  name: string;
  created_by: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  phone: string | null;
  notification_enabled: boolean;
};

type MatchReminderRow = {
  id: string;
  group_id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  ended: boolean;
};

type GroupMemberRow = {
  user_id: string;
};

type MatchPredictionRow = {
  user_id: string;
};

export async function notifyJoinRequestAdmins(
  requestId: string
): Promise<EventNotificationResult> {
  const result: EventNotificationResult = {
    sentMessages: 0,
    skippedMessages: 0,
    errors: [],
  };

  const request = await loadJoinRequest(requestId);
  const group = await loadGroup(request.group_id);
  const requester = await loadProfile(request.requested_by);

  const requestedName =
    request.requested_name?.trim() || requester.display_name || "Usuario";
  const requestedPhone =
    request.requested_phone?.trim() || requester.phone || "No disponible";

  const recipients = await loadGroupAdminProfiles(group);
  const uniqueRecipients = uniqueProfilesById(recipients);

  const reviewLink = buildJoinReviewLink(request.id, request.admin_action_token);

  const body = buildJoinRequestMessage({
    groupName: group.name,
    requestedName,
    requestedPhone,
    reviewLink: reviewLink ?? undefined,
  });

  for (const recipient of uniqueRecipients) {
    if (!recipient.phone || !recipient.notification_enabled) {
      result.skippedMessages += 1;
      continue;
    }

    const sendResult = await sendWhatsAppMessage(recipient.phone, body);
    if (sendResult.sent) {
      result.sentMessages += 1;
    } else {
      result.skippedMessages += 1;
      result.errors.push(
        `Join request ${request.id}, admin ${recipient.id}: ${
          sendResult.error ?? "send failed"
        }`
      );
    }
  }

  return result;
}

export async function notifyJoinDecisionUser(
  requestId: string
): Promise<EventNotificationResult> {
  const result: EventNotificationResult = {
    sentMessages: 0,
    skippedMessages: 0,
    errors: [],
  };

  const request = await loadJoinRequest(requestId);
  const group = await loadGroup(request.group_id);
  const requester = await loadProfileOptional(request.requested_by);

  if (request.status !== "approved" && request.status !== "rejected") {
    result.skippedMessages += 1;
    result.errors.push(
      `Join request ${request.id}: status ${request.status} is not notifiable`
    );
    return result;
  }

  const candidatePhones = uniquePhones([
    request.requested_phone,
    requester?.phone ?? null,
  ]);

  if (candidatePhones.length === 0) {
    result.skippedMessages += 1;
    result.errors.push(
      `Join request ${request.id}: no phone available for requester ${request.requested_by}`
    );
    return result;
  }

  // For transactional decisions (approved/rejected), always attempt delivery if a phone exists.
  // requested_phone is prioritized because it is the number captured at request time.
  if (requester && !requester.notification_enabled && !request.requested_phone) {
    result.skippedMessages += 1;
    result.errors.push(
      `Join request ${request.id}: user notifications disabled and no requested_phone fallback`
    );
    return result;
  }

  const body = buildJoinDecisionMessage({
    groupName: group.name,
    status: request.status,
    nextStepLink: buildApprovedNextStepLink(group.id, request.status),
  });

  for (const phone of candidatePhones) {
    const sendResult = await sendWhatsAppMessage(phone, body);
    if (sendResult.sent) {
      result.sentMessages += 1;
      return result;
    }

    result.errors.push(
      `Join request ${request.id}, user ${request.requested_by}, phone ${phone}: ${
        sendResult.error ?? "send failed"
      }`
    );
  }

  result.skippedMessages += 1;

  return result;
}

export async function sendPredictionReminders(
  windowMinutes = 120
): Promise<EventNotificationResult> {
  const result: EventNotificationResult = {
    sentMessages: 0,
    skippedMessages: 0,
    errors: [],
  };

  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60_000);

  const { data: matches, error: matchesError } = await supabaseAdmin
    .from("matches")
    .select("id, group_id, home_team, away_team, kickoff_at, ended")
    .eq("ended", false)
    .gte("kickoff_at", now.toISOString())
    .lte("kickoff_at", windowEnd.toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(100);

  if (matchesError) {
    throw new Error(`Could not load matches for reminders: ${matchesError.message}`);
  }

  for (const match of (matches ?? []) as MatchReminderRow[]) {
    const group = await loadGroup(match.group_id);

    const { data: members, error: membersError } = await supabaseAdmin
      .from("group_members")
      .select("user_id")
      .eq("group_id", match.group_id);

    if (membersError) {
      result.errors.push(
        `Match ${match.id}: failed loading group members (${membersError.message})`
      );
      continue;
    }

    const { data: predictions, error: predictionsError } = await supabaseAdmin
      .from("predictions")
      .select("user_id")
      .eq("match_id", match.id);

    if (predictionsError) {
      result.errors.push(
        `Match ${match.id}: failed loading predictions (${predictionsError.message})`
      );
      continue;
    }

    const predictedUserIds = new Set(
      ((predictions ?? []) as MatchPredictionRow[]).map((row) => row.user_id)
    );
    const missingPredictionUserIds = ((members ?? []) as GroupMemberRow[])
      .map((row) => row.user_id)
      .filter((userId) => !predictedUserIds.has(userId));

    if (missingPredictionUserIds.length === 0) {
      continue;
    }

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, phone, notification_enabled")
      .in("id", missingPredictionUserIds);

    if (profilesError) {
      result.errors.push(
        `Match ${match.id}: failed loading profile phones (${profilesError.message})`
      );
      continue;
    }

    const message = buildPredictionReminderMessage({
      groupName: group.name,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      kickoffAt: new Date(match.kickoff_at).toISOString(),
    });

    for (const profile of (profiles ?? []) as ProfileRow[]) {
      if (!profile.phone || !profile.notification_enabled) {
        result.skippedMessages += 1;
        continue;
      }

      const sendResult = await sendWhatsAppMessage(profile.phone, message);
      if (sendResult.sent) {
        result.sentMessages += 1;
      } else {
        result.skippedMessages += 1;
        result.errors.push(
          `Reminder match ${match.id}, user ${profile.id}: ${
            sendResult.error ?? "send failed"
          }`
        );
      }
    }
  }

  return result;
}

async function loadJoinRequest(requestId: string): Promise<JoinRequestRow> {
  const { data, error } = await supabaseAdmin
    .from("join_requests")
    .select(
      "id, group_id, requested_by, status, requested_name, requested_phone, admin_action_token"
    )
    .eq("id", requestId)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not load join request ${requestId}: ${error?.message ?? "not found"}`
    );
  }

  return data as JoinRequestRow;
}

function buildJoinReviewLink(
  requestId: string,
  adminActionToken: string
): string | null {
  const configuredBaseUrl = (getOptionalServerEnv("NEXT_PUBLIC_APP_BASE_URL") || "").trim();
  if (!configuredBaseUrl) {
    return null;
  }

  const base = configuredBaseUrl.replace(/\/$/, "");
  return `${base}/join-requests/${requestId}/review?t=${adminActionToken}`;
}

function buildApprovedNextStepLink(
  groupId: string,
  status: "approved" | "rejected"
): string | undefined {
  if (status !== "approved") {
    return undefined;
  }

  const configuredBaseUrl = (getOptionalServerEnv("NEXT_PUBLIC_APP_BASE_URL") || "").trim();
  if (!configuredBaseUrl) {
    return undefined;
  }

  const base = configuredBaseUrl.replace(/\/$/, "");
  return `${base}/groups/${groupId}/predictions`;
}

async function loadGroup(groupId: string): Promise<GroupRow> {
  const { data, error } = await supabaseAdmin
    .from("groups")
    .select("id, name, created_by")
    .eq("id", groupId)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not load group ${groupId}: ${error?.message ?? "not found"}`
    );
  }

  return data as GroupRow;
}

async function loadProfile(profileId: string): Promise<ProfileRow> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, phone, notification_enabled")
    .eq("id", profileId)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not load profile ${profileId}: ${error?.message ?? "not found"}`
    );
  }

  return data as ProfileRow;
}

async function loadProfileOptional(profileId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, phone, notification_enabled")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return (data as ProfileRow | null) ?? null;
}

async function loadGroupAdminProfiles(group: GroupRow): Promise<ProfileRow[]> {
  const { data: members, error } = await supabaseAdmin
    .from("group_members")
    .select("user_id")
    .eq("group_id", group.id)
    .eq("is_admin", true);

  if (error) {
    throw new Error(
      `Could not load admins for group ${group.id}: ${error.message}`
    );
  }

  const adminIds = ((members ?? []) as GroupMemberRow[]).map((row) => row.user_id);
  if (!adminIds.includes(group.created_by)) {
    adminIds.push(group.created_by);
  }

  if (adminIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, phone, notification_enabled")
    .in("id", adminIds);

  if (profilesError) {
    throw new Error(
      `Could not load admin profile phones for group ${group.id}: ${profilesError.message}`
    );
  }

  return (profiles ?? []) as ProfileRow[];
}

function uniqueProfilesById(profiles: ProfileRow[]): ProfileRow[] {
  const map = new Map<string, ProfileRow>();
  for (const profile of profiles) {
    map.set(profile.id, profile);
  }
  return Array.from(map.values());
}

function uniquePhones(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];

  for (const value of values) {
    const phone = value?.trim();
    if (!phone || seen.has(phone)) {
      continue;
    }

    seen.add(phone);
    phones.push(phone);
  }

  return phones;
}
