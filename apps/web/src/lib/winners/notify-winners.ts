import "server-only";

import { buildWinnerMessage } from "@/lib/notifications/templates";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp";
import { supabaseAdmin } from "@/lib/supabase/admin";

type MatchRow = {
  id: string;
  group_id: string;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
};

type PredictionWithProfile = {
  points: number;
  profiles: {
    display_name: string;
    phone: string | null;
    notification_enabled: boolean;
  } | { display_name: string; phone: string | null; notification_enabled: boolean }[] | null;
};

export type NotifyWinnersResult = {
  processedMatches: number;
  notifiedMatches: number;
  sentMessages: number;
  skippedMessages: number;
  errors: string[];
};

export async function notifyWinners(limit = 20): Promise<NotifyWinnersResult> {
  const result: NotifyWinnersResult = {
    processedMatches: 0,
    notifiedMatches: 0,
    sentMessages: 0,
    skippedMessages: 0,
    errors: [],
  };

  const { data: matches, error: matchesError } = await supabaseAdmin
    .from("matches")
    .select("id, group_id, home_team, away_team, home_goals, away_goals")
    .eq("ended", true)
    .is("notified_at", null)
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (matchesError) {
    throw new Error(`Could not load matches: ${matchesError.message}`);
  }

  const extractProfile = (prediction: PredictionWithProfile) => {
    const { profiles } = prediction;
    if (Array.isArray(profiles)) {
      return profiles[0] ?? null;
    }
    return profiles;
  };

  for (const match of (matches as MatchRow[]) ?? []) {
    result.processedMatches += 1;

    const { data: predictions, error: predictionsError } = await supabaseAdmin
      .from("predictions")
      .select("points, profiles:profiles!predictions_user_id_fkey(display_name, phone, notification_enabled)")
      .eq("match_id", match.id);

    if (predictionsError) {
      result.errors.push(
        `Match ${match.id}: failed loading predictions (${predictionsError.message})`
      );
      continue;
    }

    const typedPredictions: PredictionWithProfile[] = (predictions ?? []).map((row) => ({
      points: Number((row as { points?: unknown }).points ?? 0),
      profiles: (row as { profiles?: PredictionWithProfile["profiles"] }).profiles ?? null,
    }));
    const maxPoints = typedPredictions.reduce((max, row) => Math.max(max, row.points), 0);
    const winners = typedPredictions.filter((row) => row.points === maxPoints);

    for (const winner of winners) {
      const profile = extractProfile(winner);
      if (!profile?.phone || !profile.notification_enabled) {
        result.skippedMessages += 1;
        continue;
      }

      const message = buildWinnerMessage({
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        homeGoals: match.home_goals,
        awayGoals: match.away_goals,
        points: winner.points,
      });

      const sendResult = await sendWhatsAppMessage(profile.phone, message);
      if (sendResult.sent) {
        result.sentMessages += 1;
      } else {
        result.skippedMessages += 1;
        result.errors.push(
          `Match ${match.id}, winner ${profile.display_name}: ${sendResult.error ?? "send failed"}`
        );
      }
    }

    const { error: markNotifiedError } = await supabaseAdmin
      .from("matches")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", match.id);

    if (markNotifiedError) {
      result.errors.push(
        `Match ${match.id}: failed setting notified_at (${markNotifiedError.message})`
      );
      continue;
    }

    result.notifiedMatches += 1;
  }

  return result;
}
