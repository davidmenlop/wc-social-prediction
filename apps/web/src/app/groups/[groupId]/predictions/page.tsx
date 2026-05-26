"use client";

import { supabase } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

type MatchRow = {
  id: string;
  group_id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  ended: boolean;
  home_goals: number | null;
  away_goals: number | null;
};

type PredictionRow = {
  match_id: string;
  home_score: number;
  away_score: number;
  status: "pending" | "locked" | "decided";
};

type InputByMatch = Record<string, { home: string; away: string }>;

type SaveStateByMatch = Record<string, "idle" | "saving" | "saved" | "error">;

type FixturesPayload = {
  ok?: boolean;
  error?: string;
  matches?: MatchRow[];
};

export default function GroupPredictionsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const [groupId, setGroupId] = useState("");
  const [userId, setUserId] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [inputs, setInputs] = useState<InputByMatch>({});
  const [saveState, setSaveState] = useState<SaveStateByMatch>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Cargando partidos...");

  const loadMatches = useCallback(async (currentGroupId: string, currentUserId: string) => {
    setLoading(true);

    const accessToken = await ensureSessionAndGetAccessToken();
    if (!accessToken) {
      setMessage("No pudimos iniciar sesion para cargar los partidos.");
      setLoading(false);
      return;
    }

    const fixturesResponse = await fetch(`/api/groups/${currentGroupId}/fixtures?days=7`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const fixturesPayload = (await fixturesResponse.json().catch(() => ({}))) as FixturesPayload;
    if (!fixturesResponse.ok || !fixturesPayload.matches) {
      setMessage(fixturesPayload.error || "No pudimos cargar los partidos desde la API de football.");
      setLoading(false);
      return;
    }

    const parsedMatches = fixturesPayload.matches;
    setMatches(parsedMatches);

    const { data: predictionRows } = await supabase
      .from("predictions")
      .select("match_id, home_score, away_score, status")
      .eq("group_id", currentGroupId)
      .eq("user_id", currentUserId);

    const byMatch: InputByMatch = {};
    for (const row of (predictionRows ?? []) as PredictionRow[]) {
      byMatch[row.match_id] = {
        home: String(row.home_score),
        away: String(row.away_score),
      };
    }

    setInputs(byMatch);

    if (parsedMatches.length === 0) {
      setMessage("Este grupo aun no tiene partidos cargados.");
    } else {
      setMessage("Completa tus pronosticos antes del cierre de cada partido.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const resolved = await params;
      if (!mounted) {
        return;
      }

      setGroupId(resolved.groupId);

      const resolvedUserId = await ensureSessionAndGetUserId();
      if (!resolvedUserId) {
        setMessage("No pudimos iniciar sesion para cargar tus pronosticos.");
        setLoading(false);
        return;
      }

      setUserId(resolvedUserId);
      await loadMatches(resolved.groupId, resolvedUserId);
    }

    init();

    return () => {
      mounted = false;
    };
  }, [params, loadMatches]);

  async function savePrediction(match: MatchRow) {
    if (!groupId || !userId) {
      return;
    }

    const values = inputs[match.id];
    if (!values) {
      setSaveState((prev) => ({ ...prev, [match.id]: "error" }));
      return;
    }

    const homeScore = Number.parseInt(values.home, 10);
    const awayScore = Number.parseInt(values.away, 10);

    if (Number.isNaN(homeScore) || Number.isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      setSaveState((prev) => ({ ...prev, [match.id]: "error" }));
      return;
    }

    if (isMatchLocked(match.kickoff_at, match.ended)) {
      setSaveState((prev) => ({ ...prev, [match.id]: "error" }));
      return;
    }

    setSaveState((prev) => ({ ...prev, [match.id]: "saving" }));

    const { error } = await supabase.from("predictions").upsert(
      {
        group_id: groupId,
        match_id: match.id,
        user_id: userId,
        home_score: homeScore,
        away_score: awayScore,
        status: "pending",
      },
      { onConflict: "match_id,user_id", ignoreDuplicates: false }
    );

    if (error) {
      setSaveState((prev) => ({ ...prev, [match.id]: "error" }));
      return;
    }

    setSaveState((prev) => ({ ...prev, [match.id]: "saved" }));
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-4xl px-4 py-6 sm:px-6">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Grupo
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Tus pronosticos
        </h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>

        {loading ? (
          <p className="mt-6 text-sm text-slate-600">Cargando...</p>
        ) : matches.length === 0 ? null : (
          <ul className="mt-6 space-y-3">
            {matches.map((match) => {
              const kickoff = new Date(match.kickoff_at);
              const lockAt = new Date(kickoff.getTime() - 60 * 60 * 1000);
              const isLocked = isMatchLocked(match.kickoff_at, match.ended);
              const status =
                match.ended && match.home_goals !== null && match.away_goals !== null
                  ? `Finalizado: ${match.home_goals}-${match.away_goals}`
                  : isLocked
                  ? "Bloqueado"
                  : "Abierto";

              return (
                <li key={match.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {match.home_team} vs {match.away_team}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isLocked ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    Kickoff: {kickoff.toLocaleString()} | Cierre: {lockAt.toLocaleString()}
                  </p>

                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      disabled={isLocked}
                      value={inputs[match.id]?.home ?? ""}
                      onChange={(event) =>
                        setInputs((prev) => ({
                          ...prev,
                          [match.id]: {
                            home: event.target.value,
                            away: prev[match.id]?.away ?? "",
                          },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder="0"
                    />
                    <span className="text-sm font-semibold text-slate-500">-</span>
                    <input
                      type="number"
                      min={0}
                      disabled={isLocked}
                      value={inputs[match.id]?.away ?? ""}
                      onChange={(event) =>
                        setInputs((prev) => ({
                          ...prev,
                          [match.id]: {
                            home: prev[match.id]?.home ?? "",
                            away: event.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder="0"
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={isLocked || saveState[match.id] === "saving"}
                      onClick={() => savePrediction(match)}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {saveState[match.id] === "saving" ? "Guardando..." : "Guardar pronostico"}
                    </button>

                    {saveState[match.id] === "saved" && (
                      <span className="text-xs font-medium text-emerald-700">Guardado</span>
                    )}
                    {saveState[match.id] === "error" && (
                      <span className="text-xs font-medium text-rose-700">
                        Revisa el score o el estado del partido
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function isMatchLocked(kickoffAtIso: string, ended: boolean): boolean {
  if (ended) {
    return true;
  }

  const kickoffMs = new Date(kickoffAtIso).getTime();
  if (Number.isNaN(kickoffMs)) {
    return false;
  }

  const lockMs = kickoffMs - 60 * 60 * 1000;
  return Date.now() >= lockMs;
}

async function ensureSessionAndGetAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    return session.access_token;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session?.access_token) {
    return null;
  }

  return data.session.access_token;
}

async function ensureSessionAndGetUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    return null;
  }

  return data.user?.id ?? data.session?.user.id ?? null;
}
