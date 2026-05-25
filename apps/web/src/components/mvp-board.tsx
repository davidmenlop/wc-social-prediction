"use client";

import { supabase } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";

type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  locked: boolean;
};

const seededMatches: Match[] = [
  {
    id: "m1",
    homeTeam: "Argentina",
    awayTeam: "Mexico",
    kickoff: "2026-06-14T19:00:00Z",
    locked: false,
  },
  {
    id: "m2",
    homeTeam: "Brazil",
    awayTeam: "Spain",
    kickoff: "2026-06-15T21:00:00Z",
    locked: false,
  },
  {
    id: "m3",
    homeTeam: "France",
    awayTeam: "Germany",
    kickoff: "2026-06-16T18:00:00Z",
    locked: true,
  },
];

const leaderboard = [
  { user: "Paula", points: 9 },
  { user: "Diego", points: 7 },
  { user: "Maria", points: 6 },
  { user: "Leo", points: 4 },
];

export function MvpBoard() {
  const [groupName, setGroupName] = useState("Mundial con amigos");
  const [isPrivate, setIsPrivate] = useState(true);
  const [inviteCode, setInviteCode] = useState("MUNDIAL26");
  const [predictions, setPredictions] = useState<Record<string, string>>({});
  const [groupsCount, setGroupsCount] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "ok" | "error"
  >("idle");

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000";
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";

  const inviteLink = useMemo(() => {
    return `${baseUrl}/join/${inviteCode}`;
  }, [baseUrl, inviteCode]);

  const whatsappMessage = encodeURIComponent(
    `Te invito al grupo ${groupName} para pronosticar el Mundial. Unite aqui: ${inviteLink}`
  );

  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`
    : `https://wa.me/?text=${whatsappMessage}`;

  useEffect(() => {
    async function checkSupabaseConnection() {
      const { count, error } = await supabase
        .from("groups")
        .select("id", { count: "exact", head: true });

      if (error) {
        setConnectionStatus("error");
        return;
      }

      setGroupsCount(count ?? 0);
      setConnectionStatus("ok");
    }

    checkSupabaseConnection();
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/30 bg-white/70 p-5 shadow-lg shadow-sky-100 backdrop-blur sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
          MVP dia 1
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          World Cup Social Prediction
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
          Base operativa para lanzar en 5 dias: grupos privados, predicciones,
          ranking y comunicacion por WhatsApp.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            Supabase: {connectionStatus === "ok" ? "Conectado" : "Pendiente"}
          </span>
          {groupsCount !== null && (
            <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">
              Grupos cargados: {groupsCount}
            </span>
          )}
          {connectionStatus === "error" && (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
              Falta aplicar migracion SQL o ajustar RLS
            </span>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold text-slate-900">Grupo e invitacion</h2>
          <p className="mt-1 text-sm text-slate-600">
            Flujo social para crear grupo y compartir enlace.
          </p>

          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Nombre del grupo
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 transition focus:ring"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Codigo de invitacion
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 transition focus:ring"
              />
            </label>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(event) => setIsPrivate(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Requiere aprobacion para ingresar
            </label>

            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700">Link de invitacion:</p>
              <p className="mt-1 break-all text-slate-600">{inviteLink}</p>
            </div>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Compartir por WhatsApp
            </a>

            <p className="text-xs text-slate-500">
              Estado del grupo: {isPrivate ? "Privado con aprobacion" : "Abierto"}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold text-slate-900">Predicciones</h2>
          <p className="mt-1 text-sm text-slate-600">
            Estado social: pendiente, bloqueada o resuelta.
          </p>

          <div className="mt-4 space-y-3">
            {seededMatches.map((match) => {
              const status = match.locked ? "Bloqueada" : "Pendiente";
              return (
                <article
                  key={match.id}
                  className="rounded-2xl border border-slate-200 p-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">
                      {match.homeTeam} vs {match.awayTeam}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        match.locked
                          ? "bg-slate-200 text-slate-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{match.kickoff}</p>
                  <input
                    disabled={match.locked}
                    placeholder="Ej: 2-1"
                    value={predictions[match.id] || ""}
                    onChange={(event) =>
                      setPredictions((prev) => ({
                        ...prev,
                        [match.id]: event.target.value,
                      }))
                    }
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 transition focus:ring disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Ranking del grupo</h2>
            <p className="mt-1 text-sm text-slate-600">
              Score MVP: exacto = 3, ganador = 1.
            </p>
          </div>
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
            Actualizacion rapida
          </span>
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {leaderboard.map((entry, index) => (
            <li
              key={entry.user}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Puesto #{index + 1}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{entry.user}</p>
              <p className="text-sm text-slate-600">{entry.points} pts</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
