import "server-only";

import { getRequiredServerEnv } from "@/lib/env.server";
import { getFixturesByDate } from "@/lib/results/api-football";
import { supabaseAdmin } from "@/lib/supabase/admin";

const FINAL_STATUSES = new Set(["FT", "AET", "PEN"]);

type MatchRow = {
  id: string;
  external_fixture_id: number | null;
  league_id: number | null;
  season: number | null;
  kickoff_at: string;
  ended: boolean;
  home_goals: number | null;
  away_goals: number | null;
};

type PredictionRow = {
  id: string;
  home_score: number;
  away_score: number;
};

export type SyncResultsPayload = {
  date: string;
  league: number;
  season: number;
  timezone: string;
  requestsUsed: number;
  fetchedFixtures: number;
  consideredMatches: number;
  updatedMatches: number;
  finalizedMatches: number;
  recalculatedPredictions: number;
  errors: string[];
};

export async function syncResultsForDate(options?: {
  date?: string;
  league?: number;
  season?: number;
  timezone?: string;
}): Promise<SyncResultsPayload> {
  const timezone = options?.timezone || getRequiredServerEnv("FOOTBALL_DEFAULT_TIMEZONE");
  const league =
    options?.league ?? Number.parseInt(getRequiredServerEnv("FOOTBALL_DEFAULT_LEAGUE_ID"), 10);
  const season =
    options?.season ?? Number.parseInt(getRequiredServerEnv("FOOTBALL_DEFAULT_SEASON"), 10);

  if (Number.isNaN(league) || Number.isNaN(season)) {
    throw new Error("Invalid league or season configuration for API-Football sync");
  }

  const date = options?.date ?? getDateInTimezone(new Date(), timezone);
  const payload: SyncResultsPayload = {
    date,
    league,
    season,
    timezone,
    requestsUsed: 0,
    fetchedFixtures: 0,
    consideredMatches: 0,
    updatedMatches: 0,
    finalizedMatches: 0,
    recalculatedPredictions: 0,
    errors: [],
  };

  const fixtures = await getFixturesByDate({ date, league, season, timezone });
  payload.requestsUsed += 1;
  payload.fetchedFixtures = fixtures.length;

  if (fixtures.length === 0) {
    return payload;
  }

  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.fixture.id, fixture]));

  const dateRange = getUtcRangeForDate(date, timezone);
  const { data: matches, error: matchesError } = await supabaseAdmin
    .from("matches")
    .select("id, external_fixture_id, league_id, season, kickoff_at, ended, home_goals, away_goals")
    .gte("kickoff_at", dateRange.start)
    .lt("kickoff_at", dateRange.end)
    .not("external_fixture_id", "is", null)
    .limit(300);

  if (matchesError) {
    throw new Error(`Could not load local matches for sync: ${matchesError.message}`);
  }

  for (const match of (matches ?? []) as MatchRow[]) {
    payload.consideredMatches += 1;

    if (!match.external_fixture_id) {
      continue;
    }

    const fixture = fixtureMap.get(match.external_fixture_id);
    if (!fixture) {
      continue;
    }

    const statusShort = fixture.fixture.status.short;
    const statusLong = fixture.fixture.status.long;
    const isFinal = FINAL_STATUSES.has(statusShort);

    const nextHomeGoals = fixture.goals.home;
    const nextAwayGoals = fixture.goals.away;

    const scoreChanged =
      nextHomeGoals !== match.home_goals || nextAwayGoals !== match.away_goals;
    const endedChanged = isFinal !== match.ended;

    const updateData: Record<string, unknown> = {
      status_short: statusShort,
      status_long: statusLong,
      api_sync_at: new Date().toISOString(),
      league_id: league,
      season,
      ended: isFinal,
    };

    if (nextHomeGoals !== null && nextAwayGoals !== null) {
      updateData.home_goals = nextHomeGoals;
      updateData.away_goals = nextAwayGoals;
    }

    if (isFinal && (scoreChanged || endedChanged)) {
      // If final score changes, re-open notifications to emit corrected winners.
      updateData.notified_at = null;
    }

    const needsUpdate = scoreChanged || endedChanged || match.league_id !== league || match.season !== season;

    if (!needsUpdate) {
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("matches")
      .update(updateData)
      .eq("id", match.id);

    if (updateError) {
      payload.errors.push(`Match ${match.id}: ${updateError.message}`);
      continue;
    }

    payload.updatedMatches += 1;

    const recalcCount = await recalculatePredictionsForMatch({
      matchId: match.id,
      isFinal,
      homeGoals: nextHomeGoals,
      awayGoals: nextAwayGoals,
      kickoffAt: match.kickoff_at,
    });

    payload.recalculatedPredictions += recalcCount;
    if (isFinal) {
      payload.finalizedMatches += 1;
    }
  }

  return payload;
}

async function recalculatePredictionsForMatch(params: {
  matchId: string;
  isFinal: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  kickoffAt: string;
}): Promise<number> {
  const { data: predictions, error } = await supabaseAdmin
    .from("predictions")
    .select("id, home_score, away_score")
    .eq("match_id", params.matchId);

  if (error) {
    throw new Error(`Could not load predictions for match ${params.matchId}: ${error.message}`);
  }

  let updated = 0;
  const now = new Date();
  const kickoff = new Date(params.kickoffAt);

  for (const prediction of (predictions ?? []) as PredictionRow[]) {
    const status = params.isFinal
      ? "decided"
      : kickoff <= now
        ? "locked"
        : "pending";

    const points =
      params.isFinal && params.homeGoals !== null && params.awayGoals !== null
        ? calculatePoints({
            predictedHome: prediction.home_score,
            predictedAway: prediction.away_score,
            realHome: params.homeGoals,
            realAway: params.awayGoals,
          })
        : 0;

    const { error: updateError } = await supabaseAdmin
      .from("predictions")
      .update({
        points,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prediction.id);

    if (updateError) {
      throw new Error(
        `Could not update prediction ${prediction.id} for match ${params.matchId}: ${updateError.message}`
      );
    }

    updated += 1;
  }

  return updated;
}

function calculatePoints(params: {
  predictedHome: number;
  predictedAway: number;
  realHome: number;
  realAway: number;
}): number {
  if (params.predictedHome === params.realHome && params.predictedAway === params.realAway) {
    return 3;
  }

  const predictedDiff = params.predictedHome - params.predictedAway;
  const realDiff = params.realHome - params.realAway;

  if ((predictedDiff === 0 && realDiff === 0) || (predictedDiff > 0 && realDiff > 0) || (predictedDiff < 0 && realDiff < 0)) {
    return 1;
  }

  return 0;
}

function getDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getUtcRangeForDate(date: string, timezone: string): { start: string; end: string } {
  const [year, month, day] = date.split("-").map((value) => Number.parseInt(value, 10));
  const start = zonedDateToUtc(year, month, day, timezone);
  const end = zonedDateToUtc(year, month, day + 1, timezone);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function zonedDateToUtc(year: number, month: number, day: number, timezone: string): Date {
  const tentative = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(tentative).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  const asIfUtc = Date.UTC(
    Number.parseInt(parts.year, 10),
    Number.parseInt(parts.month, 10) - 1,
    Number.parseInt(parts.day, 10),
    Number.parseInt(parts.hour, 10),
    Number.parseInt(parts.minute, 10),
    Number.parseInt(parts.second, 10)
  );

  const offsetMs = asIfUtc - tentative.getTime();
  return new Date(tentative.getTime() - offsetMs);
}
