"use client";

import { supabase } from "@/lib/supabase/client";
import { FormEvent, useEffect, useMemo, useState } from "react";

type GroupPrivacy = "open" | "approval_required";

type GroupSummary = {
  id: string;
  name: string;
  privacy: GroupPrivacy;
  registration_deadline: string | null;
  created_at: string;
};

type GroupInsertRow = {
  id: string;
  name: string;
  privacy: GroupPrivacy;
  registration_deadline: string | null;
  created_at: string;
};

function shortCodeFromGroupId(groupId: string) {
  const base = groupId.replace(/-/g, "").toUpperCase();
  return base.slice(0, 8);
}

function buildDisplayName(name: string, userId: string) {
  const trimmed = name.trim();
  if (trimmed.length >= 3) {
    return trimmed;
  }
  return `Guest-${userId.slice(0, 6)}`;
}

function toIsoOrNull(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function MvpBoard() {
  const [displayName, setDisplayName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [privacy, setPrivacy] = useState<GroupPrivacy>("approval_required");
  const [deadline, setDeadline] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "ok" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const baseUrl =
    (process.env.NEXT_PUBLIC_APP_BASE_URL || "").trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const inviteLink = useMemo(() => {
    if (!selectedGroup || !baseUrl) {
      return "";
    }

    return `${baseUrl}/join/${selectedGroup.id}`;
  }, [baseUrl, selectedGroup]);

  const whatsappHref = useMemo(() => {
    if (!inviteLink || !selectedGroup) {
      return "#";
    }

    const message = encodeURIComponent(
      `Join my group ${selectedGroup.name} in World Cup Social Prediction: ${inviteLink}`
    );

    return `https://wa.me/?text=${message}`;
  }, [inviteLink, selectedGroup]);

  useEffect(() => {
    async function loadData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setConnectionStatus("ok");
          setIsLoadingGroups(false);
          return;
        }

        const { data: memberships, error } = await supabase
          .from("group_members")
          .select(
            "group:groups!group_members_group_id_fkey(id, name, privacy, registration_deadline, created_at)"
          )
          .eq("user_id", user.id)
          .order("joined_at", { ascending: false });

        if (error) {
          setConnectionStatus("error");
          setErrorMessage(
            "Could not load your groups. Verify Supabase policies and session setup."
          );
          setIsLoadingGroups(false);
          return;
        }

        const parsedGroups: GroupSummary[] = (memberships ?? [])
          .map((row) => {
            const item = row as {
              group?: GroupSummary | GroupSummary[] | null;
            };

            if (!item.group) {
              return null;
            }

            if (Array.isArray(item.group)) {
              return item.group[0] ?? null;
            }

            return item.group;
          })
          .filter((item): item is GroupSummary => Boolean(item));

        setGroups(parsedGroups);
        setSelectedGroup(parsedGroups[0] ?? null);
        setConnectionStatus("ok");
      } catch {
        setConnectionStatus("error");
        setErrorMessage("Unexpected error while loading your groups.");
      } finally {
        setIsLoadingGroups(false);
      }
    }

    loadData();
  }, []);

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!groupName.trim()) {
      setErrorMessage("Group name is required.");
      return;
    }

    const registrationDeadline = toIsoOrNull(deadline);
    if (deadline.trim() && !registrationDeadline) {
      setErrorMessage("Deadline must be a valid date and time.");
      return;
    }

    setIsSubmitting(true);

    try {
      let userId: string | null = null;

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (currentUser) {
        userId = currentUser.id;
      } else {
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();

        if (anonError || !anonData.user) {
          setErrorMessage(
            "Could not start a guest session. Enable Anonymous Auth in Supabase."
          );
          return;
        }

        userId = anonData.user.id;
      }

      if (!userId) {
        setErrorMessage("Could not determine user session.");
        return;
      }

      const profilePayload = {
        id: userId,
        display_name: buildDisplayName(displayName, userId),
      };

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id", ignoreDuplicates: false });

      if (profileError) {
        setErrorMessage(`Could not create profile: ${profileError.message}`);
        return;
      }

      const { data: createdGroup, error: groupError } = await supabase
        .from("groups")
        .insert({
          name: groupName.trim(),
          privacy,
          registration_deadline: registrationDeadline,
          created_by: userId,
        })
        .select("id, name, privacy, registration_deadline, created_at")
        .single();

      if (groupError || !createdGroup) {
        setErrorMessage(`Could not create group: ${groupError?.message ?? "unknown error"}`);
        return;
      }

      const inserted = createdGroup as GroupInsertRow;

      const { error: membershipError } = await supabase.from("group_members").insert({
        group_id: inserted.id,
        user_id: userId,
        is_admin: true,
      });

      if (membershipError) {
        setErrorMessage(
          `Group created but owner membership failed: ${membershipError.message}`
        );
        return;
      }

      const nextGroup: GroupSummary = {
        id: inserted.id,
        name: inserted.name,
        privacy: inserted.privacy,
        registration_deadline: inserted.registration_deadline,
        created_at: inserted.created_at,
      };

      setGroups((prev) => [nextGroup, ...prev]);
      setSelectedGroup(nextGroup);
      setGroupName("");
      setDeadline("");
      setSuccessMessage("Group created. Your invitation link is ready to share.");
      setConnectionStatus("ok");
    } catch {
      setErrorMessage("Unexpected error creating group.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/40 bg-white/75 p-6 shadow-lg shadow-slate-200 backdrop-blur sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          MVP launch flow
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Create your group, share it, and start playing
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
          Start in less than a minute. Create a private prediction group and invite friends with one
          WhatsApp message.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            Supabase: {connectionStatus === "ok" ? "Connected" : "Checking"}
          </span>
          {connectionStatus === "error" && (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
              Connection issue detected
            </span>
          )}
          {selectedGroup && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
              Active code: {shortCodeFromGroupId(selectedGroup.id)}
            </span>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
          <h2 className="text-xl font-semibold text-slate-900">Create group</h2>
          <p className="mt-1 text-sm text-slate-600">
            Primary action for new users: define your group and invite your friends.
          </p>

          <form className="mt-4 space-y-4" onSubmit={createGroup}>
            <label className="block text-sm font-medium text-slate-700">
              Your display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Example: David"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Group name
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Example: Office Cup 2026"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring"
                required
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Group type
                <select
                  value={privacy}
                  onChange={(event) => setPrivacy(event.target.value as GroupPrivacy)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring"
                >
                  <option value="approval_required">Private (approval required)</option>
                  <option value="open">Open (auto join)</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Registration deadline (optional)
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-500 transition focus:ring"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Creating group..." : "Create group"}
            </button>
          </form>

          {errorMessage && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
          )}

          {successMessage && (
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {successMessage}
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Join with code</h2>
          <p className="mt-1 text-sm text-slate-600">
            Secondary action for invited users.
          </p>

          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="Enter invite code"
            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-500 transition focus:ring"
          />
          <button
            type="button"
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
            disabled
          >
            Join flow coming next
          </button>
          <p className="mt-2 text-xs text-slate-500">
            Next iteration will resolve code to group and submit join request when required.
          </p>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Invitation and activation</h2>
            <p className="mt-1 text-sm text-slate-600">
              Share this link after creating a group. No localhost is used in this output.
            </p>
          </div>
        </div>

        {selectedGroup ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">{selectedGroup.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              Privacy: {selectedGroup.privacy === "open" ? "Open" : "Approval required"}
            </p>
            <p className="mt-3 text-xs font-medium text-slate-700">Share link</p>
            <p className="mt-1 break-all text-sm text-slate-600">{inviteLink || "Missing app base url"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (inviteLink) {
                    navigator.clipboard.writeText(inviteLink);
                  }
                }}
                className="inline-flex rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Copy link
              </button>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                Share on WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            {isLoadingGroups
              ? "Loading your groups..."
              : "Create your first group to unlock invitation links and member approvals."}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-slate-900">Your groups</h2>
        <p className="mt-1 text-sm text-slate-600">Only real groups are displayed. No sample ranking or fake predictions.</p>

        {groups.length > 0 ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {groups.map((group) => (
              <li key={group.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{group.name}</p>
                <p className="mt-1 text-xs text-slate-600">{group.privacy === "open" ? "Open" : "Approval required"}</p>
                <button
                  type="button"
                  onClick={() => setSelectedGroup(group)}
                  className="mt-2 text-xs font-semibold text-sky-700 underline-offset-2 hover:underline"
                >
                  Use this group for sharing
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-600">You have no groups yet. Create one to start inviting friends.</p>
        )}
      </section>
    </div>
  );
}
