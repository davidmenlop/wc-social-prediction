import { NextResponse } from "next/server";
import { getRequiredServerEnv } from "@/lib/env.server";
import { getFixturesByDate } from "@/lib/results/api-football";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FINAL_STATUSES = new Set(["FT", "AET", "PEN"]);

type MatchRow = {
  id: string;
  group_id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  ended: boolean;
  home_goals: number | null;
  away_goals: number | null;
  external_fixture_id: number | null;
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

    const isMember = await hasMembership(groupId, userId);
    if (!isMember) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const timezone = getRequiredServerEnv("FOOTBALL_DEFAULT_TIMEZONE");
    const league = Number.parseInt(getRequiredServerEnv("FOOTBALL_DEFAULT_LEAGUE_ID"), 10);
    const season = Number.parseInt(getRequiredServerEnv("FOOTBALL_DEFAULT_SEASON"), 10);

    if (Number.isNaN(league) || Number.isNaN(season)) {
      return NextResponse.json(
        { ok: false, error: "Invalid league/season configuration" },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const daysRaw = Number.parseInt(url.searchParams.get("days") || "5", 10);
    const days = Number.isNaN(daysRaw) ? 5 : Math.min(Math.max(daysRaw, 1), 10);

    const today = new Date();
    const fixtureDates = Array.from({ length: days }).map((_, i) => {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() + i);
      return getDateInTimezone(date, timezone);
    });

    const existingMatches = await loadGroupMatches(groupId);
    const existingByFixture = new Map<number, MatchRow>();
    for (const match of existingMatches) {
      if (match.external_fixture_id !== null) {
        existingByFixture.set(match.external_fixture_id, match);
      }
    }

    let requestsUsed = 0;
    let inserted = 0;
    let updated = 0;

    for (const date of fixtureDates) {
      const fixtures = await getFixturesByDate({
        date,
        league,
        season,
        timezone,
      });

      requestsUsed += 1;

      for (const fixture of fixtures) {
        const fixtureId = fixture.fixture.id;
        const homeTeam = fixture.teams?.home?.name || "Home";
        const awayTeam = fixture.teams?.away?.name || "Away";
        const kickoffAt = fixture.fixture.date;
        const isFinal = FINAL_STATUSES.has(fixture.fixture.status.short);

        const payload = {
          group_id: groupId,
          external_fixture_id: fixtureId,
          league_id: league,
          season,
          home_team: homeTeam,
          away_team: awayTeam,
          kickoff_at: kickoffAt,
          ended: isFinal,
          home_goals: isFinal ? fixture.goals.home : null,
          away_goals: isFinal ? fixture.goals.away : null,
          status_short: fixture.fixture.status.short,
          status_long: fixture.fixture.status.long,
          api_sync_at: new Date().toISOString(),
        };

        const existing = existingByFixture.get(fixtureId);
        if (!existing) {
          const { error } = await supabaseAdmin.from("matches").insert(payload);
          if (!error) {
            inserted += 1;
          }
          continue;
        }

        const { error } = await supabaseAdmin
          .from("matches")
          .update(payload)
          .eq("id", existing.id);

        if (!error) {
          updated += 1;
        }
      }
    }

    const refreshedMatches = await loadGroupMatches(groupId);
    const nowIso = new Date().toISOString();
    const upcomingMatches = refreshedMatches.filter(
      (match) => match.kickoff_at >= nowIso || !match.ended
    );

    return NextResponse.json({
      ok: true,
      requestsUsed,
      inserted,
      updated,
      matches: upcomingMatches,
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

async function hasMembership(groupId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  return !error && Boolean(data);
}

async function loadGroupMatches(groupId: string): Promise<MatchRow[]> {
  const { data } = await supabaseAdmin
    .from("matches")
    .select(
      "id, group_id, home_team, away_team, kickoff_at, ended, home_goals, away_goals, external_fixture_id"
    )
    .eq("group_id", groupId)
    .order("kickoff_at", { ascending: true })
    .limit(200);

  return (data ?? []) as MatchRow[];
}

function getDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
