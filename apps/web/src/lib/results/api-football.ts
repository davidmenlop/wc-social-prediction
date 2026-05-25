import "server-only";

import { getRequiredServerEnv } from "@/lib/env.server";

export type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    status: {
      short: string;
      long: string;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

type ApiFootballResponse = {
  response: ApiFootballFixture[];
};

export async function getFixturesByDate(params: {
  date: string;
  league: number;
  season: number;
  timezone: string;
}): Promise<ApiFootballFixture[]> {
  const baseUrl = getRequiredServerEnv("FOOTBALL_API_BASE_URL");
  const apiKey = getRequiredServerEnv("FOOTBALL_API_KEY");

  const normalizedBaseUrl = baseUrl.startsWith("http")
    ? baseUrl
    : `https://${baseUrl}`;

  const url = new URL("/fixtures", normalizedBaseUrl);
  url.searchParams.set("date", params.date);
  url.searchParams.set("league", String(params.league));
  url.searchParams.set("season", String(params.season));
  url.searchParams.set("timezone", params.timezone);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-apisports-key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`API-Football error (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as ApiFootballResponse;
  return payload.response ?? [];
}
