"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { StatusMessage } from "@/app/components/status-message";
import type { AsyncStatus } from "@/lib/async-status";
import { REDUCED_MOTION_QUERY, prefersReducedMotion } from "@/lib/reduced-motion";
import {
  summarizeFocusSessions,
  type FocusSession,
  type FocusSessionOutcome,
} from "@/lib/focus-session";
import {
  createFocusSessionStore,
  type FocusSessionStoreAdapter,
} from "@/lib/focus-session-store";
import {
  FOCUS_SESSION_COPY as C,
  FOCUS_SESSION_NOTIFICATION_BODY,
  FOCUS_SESSION_NOTIFICATION_TAG,
  FOCUS_SESSION_NOTIFICATION_TITLE,
} from "@/lib/focus-session-copy";
import { showNotification } from "@/lib/reminder-notifications";

const DURATIONS = [5, 15, 25] as const;

type Phase = "setup" | "running" | "done";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function NowPage() {
  const { authUser } = useCoachAuth();
  const scope = authUser?.uid ?? "guest";
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("setup");
  const [task, setTask] = useState("");
  const [minutes, setMinutes] = useState<(typeof DURATIONS)[number]>(15);
  const [elapsed, setElapsed] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<FocusSessionOutcome | null>(null);
  const notifiedRef = useRef(false);

  // v0.12 PR2: sessions resolve their backend through the shared policy
  // (docs/design/FOCUS_IN_TRENDS.md section 5), so a signed-in person's
  // sessions are written to and read from Firestore instead of only this
  // browser. Memoized on signed-in state, mirroring /trends and
  // use-coach-planner.ts's v0.4 pattern.
  const signedIn = scope !== "guest";
  const focusStore: FocusSessionStoreAdapter = useMemo(
    () => createFocusSessionStore(undefined, { signedIn }),
    [signedIn],
  );

  // Today's tally. The read is async now (the Firestore backend returns a
  // promise, and the local one returns [] during a server render either way),
  // so the sessions live in state and the summary is derived from them. A
  // recorded session is appended to that state from the write's own result
  // rather than triggering a re-read, which keeps the tally correct on both
  // backends without a second round trip per session.
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [migrationStatus, setMigrationStatus] = useState<AsyncStatus>({ type: "idle" });
  const summary = useMemo(() => summarizeFocusSessions(sessions), [sessions]);

  useEffect(() => {
    let active = true;

    async function loadSessions() {
      // v0.13: bring sessions recorded signed out along, BEFORE the first
      // read, so signing in never shows a zeroed tally while the real
      // sessions sit in guest-scoped storage. Sequenced ahead of the read
      // exactly as /journal and planner-session.ts sequence theirs. A no-op
      // for the guest scope, for an empty guest history, and on every load
      // after the first successful copy.
      const migration = await focusStore.migrateGuestFocusSessions(scope);
      const stored = await focusStore.listFocusSessions(scope);
      if (!active) {
        return;
      }

      setSessions(stored);
      // Calm and one-directional (GUEST_DATA_MIGRATION.md D5): only a copy
      // that actually moved something says anything. "skipped" and
      // "already-migrated" stay silent, because a person who never used the
      // app signed out should never be told about a migration.
      //
      // "error" no longer stays silent (v0.21 PR2, STATUS_VOCABULARY.md D4).
      // Silence there is indistinguishable from "there was nothing to bring
      // across", so the one outcome where sessions are NOT where the person
      // expects them was the only one they could not tell apart. `/` has
      // announced its own migration failures since v0.4; this closes the gap
      // on the two pages that never did.
      if (migration.status === "migrated" && migration.migratedCount > 0) {
        setMigrationStatus({ type: "ok", message: C.migrationNote });
      } else if (migration.status === "error") {
        setMigrationStatus({ type: "error", message: C.migrationErrorNote });
      }
    }

    void loadSessions();

    return () => {
      active = false;
    };
  }, [focusStore, scope]);

  const plannedSeconds = minutes * 60;

  // The one interval that drives the running clock.
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // When the planned time is reached, surface a gentle (never blocking) nudge
  // once. It does not stop the session; the person decides when to wrap up.
  useEffect(() => {
    if (phase === "running" && !notifiedRef.current && elapsed >= plannedSeconds) {
      notifiedRef.current = true;
      setTimeUp(true);
      showNotification(
        FOCUS_SESSION_NOTIFICATION_TITLE,
        FOCUS_SESSION_NOTIFICATION_BODY,
        FOCUS_SESSION_NOTIFICATION_TAG,
      );
    }
  }, [phase, elapsed, plannedSeconds]);

  const start = useCallback(() => {
    if (!task.trim()) return;
    setElapsed(0);
    setTimeUp(false);
    notifiedRef.current = false;
    setPhase("running");
  }, [task]);

  const finish = useCallback(
    (outcome: FocusSessionOutcome) => {
      // The close-out is never gated on the write: the person sees their
      // "done" screen immediately, and the tally refreshes once the session
      // is persisted (the adapter falls back to local storage on a Firestore
      // error, so the session is recorded either way).
      setLastOutcome(outcome);
      setPhase("done");
      void focusStore
        .addFocusSession(
          { task: task.trim(), plannedMinutes: minutes, focusedSeconds: elapsed, outcome },
          scope,
        )
        .then((stored) => setSessions((previous) => [...previous, stored]));
    },
    [task, minutes, elapsed, scope, focusStore],
  );

  const reset = useCallback(() => {
    setTask("");
    setElapsed(0);
    setTimeUp(false);
    setLastOutcome(null);
    setPhase("setup");
  }, []);

  const remaining = Math.max(0, plannedSeconds - elapsed);
  const progress = plannedSeconds > 0 ? Math.min(1, elapsed / plannedSeconds) : 0;

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{C.heading}</h1>
          <p className="mt-1.5 text-sm text-[--muted-strong]">{C.subheading}</p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-full border border-[--line] bg-[--surface-strong] px-3.5 py-1.5 text-xs font-semibold text-[--foreground] transition-colors hover:bg-[--panel]"
        >
          Back
        </Link>
      </div>

      <StatusMessage
        tone="success"
        className="mb-4"
        data-testid="focus-migration-note"
        message={migrationStatus.type === "ok" ? migrationStatus.message : null}
      />
      <StatusMessage
        tone="error"
        className="mb-4"
        data-testid="focus-migration-error"
        message={migrationStatus.type === "error" ? migrationStatus.message : null}
      />

      {phase === "setup" && (
        <div className="rounded-2xl border border-[--line] bg-[--panel] p-6 shadow-xl">
          <label htmlFor="focus-task" className="block text-sm font-semibold text-[--foreground]">
            {C.taskLabel}
          </label>
          <input
            id="focus-task"
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") start();
            }}
            placeholder={C.taskPlaceholder}
            className="mt-2 w-full rounded-xl border border-[--line] bg-[--surface-strong] px-3.5 py-2.5 text-sm text-[--foreground] outline-none focus:border-[--accent]"
          />

          <p className="mt-5 text-sm font-semibold text-[--foreground]">{C.durationLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={minutes === d}
                onClick={() => setMinutes(d)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                  minutes === d
                    ? "border-[--accent] bg-(--accent)/15 text-[--accent]"
                    : "border-[--line] bg-[--surface-strong] text-[--muted-strong] hover:bg-[--panel]"
                }`}
              >
                {d} min
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={start}
            disabled={!task.trim()}
            className="primary-button mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {C.start}
          </button>
        </div>
      )}

      {phase === "running" && (
        <div className="rounded-2xl border border-[--line] bg-[--panel] p-6 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[--muted]">{C.focusingOn}</p>
          <p className="mt-1 text-lg font-semibold text-[--foreground]">{task}</p>

          <div className="mt-6 flex flex-col items-center">
            <span className="font-mono text-5xl text-[--accent]" aria-live="off">
              {formatClock(remaining)}
            </span>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[--surface-strong]">
              <div
                className={reducedMotion ? "h-full rounded-full bg-(--accent)/70" : "h-full rounded-full bg-(--accent)/70 transition-[width] duration-500 ease-linear"}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            {timeUp && <p className="mt-4 text-center text-sm text-[--muted-strong]">{C.timeUpNote}</p>}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => finish("wrapped-up")} className="primary-button flex-1">
              {C.wrapUp}
            </button>
            <button type="button" onClick={() => finish("stopped-early")} className="secondary-button flex-1">
              {C.stopEarly}
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-2xl border border-[--line] bg-[--panel] p-6 shadow-xl">
          <p className="text-base text-[--foreground]">
            {lastOutcome === "wrapped-up" ? C.wrappedUpNote : C.stoppedEarlyNote}
          </p>
          <p className="mt-4 text-sm text-[--muted-strong]">
            {summary.sessionsToday > 0
              ? `${summary.minutesToday} min ${C.summaryToday} across ${summary.sessionsToday} ${
                  summary.sessionsToday === 1 ? "session" : "sessions"
                }.`
              : C.emptyToday}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={reset} className="primary-button flex-1">
              Focus on one more thing
            </button>
            <Link href="/" className="secondary-button flex-1 text-center">
              Back to dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
