"use client";

import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type GroupInfo = {
  id: string;
  name: string;
  privacy: "open" | "approval_required";
  registration_deadline: string | null;
};

type JoinStatus =
  | "idle"
  | "loading"
  | "joined"
  | "pending"
  | "already_member"
  | "already_pending"
  | "closed"
  | "error";

export default function JoinGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const router = useRouter();
  const [groupId, setGroupId] = useState("");
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [requestedName, setRequestedName] = useState("");
  const [requestedPhone, setRequestedPhone] = useState("");
  const [status, setStatus] = useState<JoinStatus>("loading");
  const [message, setMessage] = useState("Loading invitation...");

  const isApprovalRequired = group?.privacy === "approval_required";

  const deadlineLabel = (() => {
    if (!group?.registration_deadline) {
      return "No registration deadline";
    }

    const date = new Date(group.registration_deadline);
    if (Number.isNaN(date.getTime())) {
      return "No registration deadline";
    }

    return `Registration closes on ${date.toLocaleString()}`;
  })();

  useEffect(() => {
    let mounted = true;

    async function init() {
      const resolved = await params;
      if (!mounted) {
        return;
      }

      setGroupId(resolved.groupId);

      const response = await fetch(`/api/public/group/${resolved.groupId}`, {
        method: "GET",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        group?: GroupInfo;
        error?: string;
      };

      if (!mounted) {
        return;
      }

      if (!response.ok || !payload.group) {
        setStatus("error");
        setMessage(payload.error || "Group not found");
        return;
      }

      setGroup(payload.group);
      setStatus("idle");
      setMessage("Lista para unirte.");
    }

    init();

    return () => {
      mounted = false;
    };
  }, [params]);

  async function handleJoin() {
    if (!groupId || !group) {
      return;
    }

    if (group.privacy === "approval_required" && !requestedPhone.trim()) {
      setStatus("error");
      setMessage("Tu numero de WhatsApp es obligatorio para grupos privados. Usa el formato +573001112233.");
      return;
    }

    setStatus("loading");
    setMessage("Procesando...");

    const accessToken = await ensureSessionAndGetAccessToken();
    if (!accessToken) {
      setStatus("error");
      setMessage("No pudimos iniciar tu sesion de invitado.");
      return;
    }

    const response = await fetch(`/api/public/group/${groupId}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        requestedName,
        requestedPhone,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      status?: JoinStatus;
      error?: string;
      code?: string;
    };

    if (response.status === 409 || payload.code === "registration_closed") {
      setStatus("closed");
      setMessage("Este grupo esta cerrado para nuevos miembros.");
      return;
    }

    if (!response.ok || !payload.status) {
      setStatus("error");
      setMessage(payload.error || "No pudimos procesar tu solicitud.");
      return;
    }

    setStatus(payload.status);

    if (payload.status === "joined" || payload.status === "already_member") {
      router.push(`/groups/${groupId}/predictions`);
      return;
    }

    if (payload.status === "pending" || payload.status === "already_pending") {
      setMessage("Tu solicitud esta pendiente de aprobacion por el admin.");
      return;
    }

    setMessage("Accion completada.");
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-2xl items-center px-4 py-6 sm:px-6">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Invitacion
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {group ? group.name : "Unirse al grupo"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{deadlineLabel}</p>

        {group && (
          <p className="mt-2 text-xs text-slate-500">
            Tipo: {group.privacy === "open" ? "Grupo abierto" : "Privado con aprobacion"}
          </p>
        )}

        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Tu nombre
            <input
              value={requestedName}
              onChange={(event) => setRequestedName(event.target.value)}
              placeholder="Ejemplo: Laura"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Tu numero de WhatsApp
            {isApprovalRequired && (
              <span className="ml-1 text-rose-500">*</span>
            )}
            <input
              type="tel"
              required={isApprovalRequired}
              value={requestedPhone}
              onChange={(event) => setRequestedPhone(event.target.value)}
              placeholder="Ejemplo: +573001112233"
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring ${
                isApprovalRequired && !requestedPhone.trim()
                  ? "border-rose-300 bg-rose-50"
                  : "border-slate-300"
              }`}
            />
            <span className="mt-1 block text-xs text-slate-500">
              {isApprovalRequired
                ? "Obligatorio. Se usara para notificarte cuando el admin apruebe tu solicitud."
                : "Opcional. Para recibir recordatorios y resultados."}
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={handleJoin}
          disabled={!group || status === "loading" || status === "closed" || (isApprovalRequired && !requestedPhone.trim())}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {status === "loading"
            ? "Procesando..."
            : isApprovalRequired
            ? "Solicitar acceso"
            : "Unirme ahora"}
        </button>

        <p
          className={`mt-4 rounded-xl px-3 py-2 text-sm ${
            status === "error"
              ? "bg-rose-50 text-rose-700"
              : status === "closed"
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-50 text-slate-700"
          }`}
        >
          {message}
        </p>
      </section>
    </main>
  );
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
