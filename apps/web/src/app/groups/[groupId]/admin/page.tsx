"use client";

import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type RequestItem = {
  id: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  requestedName: string;
  requestedPhone: string | null;
  createdAt: string;
  reviewedAt: string | null;
  adminNotes: string | null;
};

export default function GroupAdminRequestsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const [groupId, setGroupId] = useState("");
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const loadJoinRequests = useCallback(async (resolvedGroupId: string) => {
    if (!resolvedGroupId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const accessToken = await ensureSessionAndGetAccessToken();
      if (!accessToken) {
        setError("Could not start session.");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/groups/${resolvedGroupId}/join-requests`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        requests?: RequestItem[];
      };

      if (!response.ok || !payload.requests) {
        setError(payload.error || "Could not load join requests.");
        setLoading(false);
        return;
      }

      setItems(payload.requests);
    } catch {
      setError("Unexpected error while loading requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const resolved = await params;
      if (!mounted) {
        return;
      }

      setGroupId(resolved.groupId);
      await loadJoinRequests(resolved.groupId);
    }

    init();

    return () => {
      mounted = false;
    };
  }, [params, loadJoinRequests]);

  async function processRequest(requestId: string, status: "approved" | "rejected") {
    if (!groupId) {
      return;
    }

    setBusyRequestId(requestId);
    setError(null);
    setNotice(null);

    try {
      const accessToken = await ensureSessionAndGetAccessToken();
      if (!accessToken) {
        setError("Could not start session.");
        setBusyRequestId(null);
        return;
      }

      const response = await fetch(
        `/api/groups/${groupId}/join-requests/${requestId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            status,
            adminNotes: notesById[requestId] || "",
          }),
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error || "Could not process request.");
        setBusyRequestId(null);
        return;
      }

      setNotice(`Request ${status} successfully.`);
      await loadJoinRequests(groupId);
    } catch {
      setError("Unexpected error while processing request.");
    } finally {
      setBusyRequestId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-4xl px-4 py-6 sm:px-6">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Group admin
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Join requests
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Review pending requests and notify users automatically.
            </p>
          </div>
          {groupId && (
            <Link
              href={`/join/${groupId}`}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              View invite page
            </Link>
          )}
        </div>

        {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {notice && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-slate-600">Loading requests...</p>
        ) : items.length === 0 ? (
          <p className="mt-6 text-sm text-slate-600">No requests yet for this group.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {items.map((item) => {
              const createdAt = new Date(item.createdAt);
              const createdLabel = Number.isNaN(createdAt.getTime())
                ? item.createdAt
                : createdAt.toLocaleString();

              return (
                <li key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.requestedName}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        item.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : item.status === "approved"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-600">Phone: {item.requestedPhone || "Not provided"}</p>
                  <p className="mt-1 text-xs text-slate-500">Requested at: {createdLabel}</p>

                  {item.status === "pending" && (
                    <>
                      <label className="mt-3 block text-xs font-medium text-slate-700">
                        Admin notes (optional)
                        <input
                          value={notesById[item.id] ?? ""}
                          onChange={(event) =>
                            setNotesById((prev) => ({ ...prev, [item.id]: event.target.value }))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring"
                          placeholder="Reason or context"
                        />
                      </label>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => processRequest(item.id, "approved")}
                          disabled={busyRequestId === item.id}
                          className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => processRequest(item.id, "rejected")}
                          disabled={busyRequestId === item.id}
                          className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          Reject
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
