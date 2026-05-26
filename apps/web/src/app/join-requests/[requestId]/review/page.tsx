"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function JoinRequestReviewPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState("Choose an action for this request.");
  const [resultKind, setResultKind] = useState<"idle" | "ok" | "error">("idle");
  const searchParams = useSearchParams();

  useEffect(() => {
    let mounted = true;

    params.then((resolved) => {
      if (mounted) {
        setRequestId(resolved.requestId);
      }
    });

    return () => {
      mounted = false;
    };
  }, [params]);

  const token = (searchParams.get("t") || "").trim();

  async function runDecision(action: "approved" | "rejected") {
    if (!requestId || !token || busy) {
      return;
    }

    setBusy(true);
    setResultKind("idle");
    setResultText("Processing action...");

    try {
      const endpoint = `/api/public/join-requests/${requestId}/decision?action=${action}&token=${encodeURIComponent(token)}`;
      const response = await fetch(endpoint, { method: "GET" });
      const text = await response.text();

      if (!response.ok) {
        setResultKind("error");
        setResultText(text || "Could not process request.");
        return;
      }

      setResultKind("ok");
      setResultText(text || "Action completed.");
    } catch {
      setResultKind("error");
      setResultText("Unexpected error while processing action.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-xl items-center px-4 py-6 sm:px-6">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Admin action
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Review join request
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Use one of the actions below to approve or reject this request.
        </p>

        {!token && (
          <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Missing token in the link. Ask for a new WhatsApp notification.
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => runDecision("approved")}
            disabled={!token || busy || !requestId}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => runDecision("rejected")}
            disabled={!token || busy || !requestId}
            className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Reject
          </button>
        </div>

        <p
          className={`mt-4 rounded-xl px-3 py-2 text-sm ${
            resultKind === "error"
              ? "bg-rose-50 text-rose-700"
              : resultKind === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-50 text-slate-700"
          }`}
        >
          {resultText}
        </p>
      </section>
    </main>
  );
}
