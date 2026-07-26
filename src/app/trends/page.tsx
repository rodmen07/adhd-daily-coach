"use client";

import { useEffect, useMemo, useState } from "react";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { CalmEmptyState } from "@/app/components/empty-state";
import type { AsyncStatus } from "@/lib/async-status";
import { createCheckinStore, type CheckinStoreAdapter } from "@/lib/checkin-store";
import type { BrowserCheckin } from "@/lib/browser-checkins";
import { getTrendSummary } from "@/lib/trend-insights";
import { summarizeFocusSessions, type FocusSession } from "@/lib/focus-session";
import {
  createFocusSessionStore,
  type FocusSessionStoreAdapter,
} from "@/lib/focus-session-store";
import { FOCUS_SESSION_COPY, focusWeekRecap } from "@/lib/focus-session-copy";

// A fixed 28-day / 4-week window (docs/design/TRENDS_OVER_TIME.md section
// 3.1): an overridable default, not a hard product decision. A selectable
// range (4 / 8 / 12 weeks) is a natural follow-up once this default is live.
const TREND_WINDOW_DAYS = 28;
const TREND_WEEKS = 4;

export default function TrendsPage() {
  const { authUser } = useCoachAuth();
  const storageScope = authUser?.uid ?? "guest";

  // Mirrors use-coach-planner.ts's v0.4 memoization pattern: re-created on
  // sign-in/out so the unset-env default can resolve to Firestore for
  // signed-in users, with createCheckinStore's own safe local fallback. Every
  // read below goes through this adapter's getCheckinsInRange - never a
  // direct browser-checkins.ts call - which is the fix that avoids repeating
  // the review/page.tsx bug filed in the backlog (its week-over-week and
  // skip-reason panels bypass this adapter and silently show empty data for
  // signed-in Firestore-synced users).
  const signedIn = storageScope !== "guest";
  const checkinStore: CheckinStoreAdapter = useMemo(
    () => createCheckinStore(undefined, { signedIn }),
    [signedIn],
  );

  // v0.12 PR2 (docs/design/FOCUS_IN_TRENDS.md section 5): focus sessions now
  // resolve their backend through the same policy, so a signed-in person's
  // sessions come from Firestore here just as their check-ins do. Same
  // memoization and the same rule as the check-in store above: never a direct
  // focus-session.ts call from a page.
  const focusStore: FocusSessionStoreAdapter = useMemo(
    () => createFocusSessionStore(undefined, { signedIn }),
    [signedIn],
  );

  const [checkins, setCheckins] = useState<BrowserCheckin[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [migrationStatus, setMigrationStatus] = useState<AsyncStatus>({ type: "idle" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      // v0.13: the guest copy has to land BEFORE the session read, or someone
      // who focused signed out and then signed in sees a zeroed card here and
      // their sessions only appear on the next visit. The check-in read does
      // not depend on either, so it still runs alongside rather than queuing
      // behind a Firestore round trip.
      const [inRange, migration] = await Promise.all([
        checkinStore.getCheckinsInRange(TREND_WINDOW_DAYS, undefined, storageScope),
        focusStore.migrateGuestFocusSessions(storageScope),
      ]);
      const sessions = await focusStore.listFocusSessions(storageScope);

      if (!active) {
        return;
      }

      setCheckins(inRange);
      setFocusSessions(sessions);
      // Same calm rule as /now (GUEST_DATA_MIGRATION.md D5), and the marker is
      // what keeps the line to ONCE across both pages: whichever loads first
      // does the copy, the other sees "already-migrated" and stays silent.
      if (migration.status === "migrated" && migration.migratedCount > 0) {
        setMigrationStatus({ type: "ok", message: FOCUS_SESSION_COPY.migrationNote });
      }
      setLoaded(true);
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [storageScope, checkinStore, focusStore]);

  const focusSummary = useMemo(() => summarizeFocusSessions(focusSessions), [focusSessions]);

  const trendSummary = useMemo(
    () => getTrendSummary(checkins, TREND_WEEKS),
    [checkins],
  );

  const hasAnyCheckins = trendSummary.buckets.some((bucket) => bucket.total > 0);
  const totalCheckins = trendSummary.buckets.reduce((sum, bucket) => sum + bucket.total, 0);

  // The focus card is additive: it never replaces or reshapes a check-in
  // panel. It appears whenever the page has real content to sit beside, and
  // also stands alone for someone who has used /now but not checked in yet -
  // otherwise their sessions would be invisible behind the check-in empty
  // state. With neither kind of history the page stays one calm empty state
  // (and one heading), which is what the v0.11 a11y audit asked for.
  const showFocusCard = loaded && (hasAnyCheckins || focusSummary.sessionsThisWeek > 0);

  const focusTotals = useMemo(() => {
    const totals = new Map<string, { done: number; total: number }>();

    for (const bucket of trendSummary.buckets) {
      for (const [focusArea, counts] of Object.entries(bucket.byFocus)) {
        const existing = totals.get(focusArea) ?? { done: 0, total: 0 };
        totals.set(focusArea, {
          done: existing.done + counts.done,
          total: existing.total + counts.done + counts.skipped,
        });
      }
    }

    return Array.from(totals.entries())
      .map(([focusArea, counts]) => ({ focusArea, ...counts }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.done - a.done);
  }, [trendSummary]);

  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="panel">
          <p className="eyebrow">Trends</p>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Your last 4 weeks
          </h1>
          <p className="mb-4 text-sm leading-6 text-slate-700 sm:text-base">
            A longer-horizon view of your check-ins, so a single busy or quiet
            week never looks like the whole story.
          </p>

          {migrationStatus.type === "ok" ? (
            <p
              className="mb-4 text-sm text-emerald-700"
              aria-live="polite"
              data-testid="focus-migration-note"
            >
              {migrationStatus.message}
            </p>
          ) : null}

          {!loaded || !hasAnyCheckins ? (
            <section aria-label="No trends yet">
              <CalmEmptyState
                variant="insights"
                title="Your trends are still sprouting"
                message="Complete at least one check-in to unlock the 4-week view. One calm session is all it takes to begin."
                actionHref="/focus"
                actionLabel="Set today's focus"
              />
            </section>
          ) : (
            <div className="space-y-5">
              <div className="summary-grid grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 sm:text-base">
                <div className="summary-card">
                  <p className="summary-label">Overall completion</p>
                  <p className="summary-value">{trendSummary.overallCompletionRate}%</p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">Weeks tracked</p>
                  <p className="summary-value">{trendSummary.buckets.length}</p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">Total check-ins</p>
                  <p className="summary-value">{totalCheckins}</p>
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Weekly completion
                </h2>
                <div className="space-y-2">
                  {trendSummary.buckets.map((bucket, index) => {
                    const percent = Math.round(bucket.completionRate * 100);
                    return (
                      <div
                        key={bucket.windowStart}
                        className={`focus-row ${bucket.done > 0 ? "has-progress" : ""}`}
                        data-testid="trend-bucket"
                        data-week-index={index}
                      >
                        <div className="mb-1 flex items-center justify-between gap-1.5 text-xs sm:text-sm">
                          <span className="font-medium text-slate-700">
                            {bucket.windowStart} to {bucket.windowEnd}
                          </span>
                          <span className="text-slate-600" data-testid="trend-bucket-count">
                            {bucket.done}/{bucket.total} complete
                          </span>
                        </div>
                        <div
                          className={`progress-track ${bucket.done > 0 ? "is-animated" : ""}`}
                          role="img"
                          aria-label={`Week of ${bucket.windowStart}: ${percent}% completion`}
                        >
                          <div
                            className={`progress-fill ${bucket.done > 0 ? "is-animated" : ""}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="summary-card">
                  <p className="summary-label">Light sessions</p>
                  <p className="summary-value">{trendSummary.doseDistribution.light}</p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">Medium sessions</p>
                  <p className="summary-value">{trendSummary.doseDistribution.medium}</p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">Deep sessions</p>
                  <p className="summary-value">{trendSummary.doseDistribution.deep}</p>
                </div>
              </div>

              {focusTotals.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Focus areas across the window
                  </h2>
                  {focusTotals.map((item) => (
                    <div
                      key={item.focusArea}
                      className={`focus-row ${item.done > 0 ? "has-progress" : ""}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1.5 text-xs sm:text-sm">
                        <span className="font-medium text-slate-700">{item.focusArea}</span>
                        <span className="text-slate-600">
                          {item.done}/{item.total} complete
                        </span>
                      </div>
                      <div
                        className={`progress-track ${item.done > 0 ? "is-animated" : ""}`}
                        role="img"
                        aria-label={`${item.focusArea} completion ${Math.round((item.done / item.total) * 100)}%`}
                      >
                        <div
                          className={`progress-fill ${item.done > 0 ? "is-animated" : ""}`}
                          style={{ width: `${Math.round((item.done / item.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-(--line) bg-(--field) p-4 text-sm text-slate-700">
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-sm shrink-0" aria-hidden="true">
                    ✨
                  </span>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    What the last 4 weeks show
                  </h2>
                </div>
                <p className="leading-6">{trendSummary.narrative}</p>
              </div>
            </div>
          )}

          {showFocusCard && (
            <div className="mt-5 space-y-2" data-testid="focus-week-card">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {FOCUS_SESSION_COPY.trendsHeading}
              </h2>
              <div className="summary-grid grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 sm:text-base">
                <div className="summary-card">
                  <p className="summary-label">{FOCUS_SESSION_COPY.trendsSessionsLabel}</p>
                  <p className="summary-value" data-testid="focus-week-sessions">
                    {focusSummary.sessionsThisWeek}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">{FOCUS_SESSION_COPY.trendsMinutesLabel}</p>
                  <p className="summary-value" data-testid="focus-week-minutes">
                    {focusSummary.minutesThisWeek}
                  </p>
                </div>
              </div>
              <p className="text-sm leading-6 text-slate-700" data-testid="focus-week-recap">
                {focusWeekRecap(focusSummary.sessionsThisWeek, focusSummary.minutesThisWeek)}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
