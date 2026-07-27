"use client";

import { useEffect, useMemo, useState } from "react";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { useCoachPlanner } from "@/app/hooks/use-coach-planner";
import type { FocusArea } from "@/lib/plan";
import { SwipeStepCard } from "@/app/components/swipe-step-card";
import { CalmEmptyState } from "@/app/components/empty-state";
import { createCheckinStore, type CheckinStoreAdapter } from "@/lib/checkin-store";
import type { BrowserCheckin } from "@/lib/browser-checkins";
import {
  filterCheckinsInWindow,
  getCompletionPercent,
  getMostUsedDose,
  getPatternSummary,
  getPeakCompletionWindow,
  getSkipReasonInsights,
  getWeekOverWeekChange,
} from "@/lib/review-insights";

// A 14-day window: the current 7-day summary window plus the 7 days before it
// that getWeekOverWeekChange compares against (its priorStart is
// weeklySummary.windowStart - 7). filterCheckinsInWindow and
// getWeekOverWeekChange both re-filter by explicit date, so any range that
// covers [windowStart - 7, windowEnd] is behaviour-identical to the old
// "fetch every check-in" call for the panels on this page.
const REVIEW_HISTORY_DAYS = 14;

export default function ReviewPage() {
  const { authUser } = useCoachAuth();
  const storageScope = authUser?.uid ?? "guest";
  const { weeklySummary, topFocus, checkinStatus } = useCoachPlanner({
    storageScope,
    authEmail: authUser?.email,
  });

  // Read check-in history through CheckinStoreAdapter (mirrors trends/page.tsx
  // and use-coach-planner.ts's v0.4 memoization pattern), re-created on
  // sign-in/out so the unset-env default can resolve to Firestore for
  // signed-in users, with createCheckinStore's own safe local fallback. The
  // previous direct listCheckins(storageScope) call read only the local list,
  // so a signed-in user whose check-ins live in Firestore saw the
  // week-over-week and skip-reason panels silently render empty (backlog bug
  // filed 2026-07-20; the exact trap trends/page.tsx was built to avoid).
  const signedIn = storageScope !== "guest";
  const checkinStore: CheckinStoreAdapter = useMemo(
    () => createCheckinStore(undefined, { signedIn }),
    [signedIn],
  );

  const [rangeCheckins, setRangeCheckins] = useState<BrowserCheckin[]>([]);

  useEffect(() => {
    let active = true;

    async function loadCheckins() {
      const inRange = await checkinStore.getCheckinsInRange(
        REVIEW_HISTORY_DAYS,
        undefined,
        storageScope,
      );

      if (!active) {
        return;
      }

      setRangeCheckins(inRange);
    }

    void loadCheckins();

    return () => {
      active = false;
    };
  }, [storageScope, checkinStore]);

  const completionPercent = useMemo(() => getCompletionPercent(weeklySummary), [weeklySummary]);

  const hasWeeklyProgress = completionPercent > 0;

  const checkinsInWindow = useMemo(() => {
    return filterCheckinsInWindow(rangeCheckins, weeklySummary);
  }, [rangeCheckins, weeklySummary]);

  const mostUsedDose = useMemo(() => getMostUsedDose(checkinsInWindow), [checkinsInWindow]);

  const completionWindow = useMemo(() => getPeakCompletionWindow(checkinsInWindow), [checkinsInWindow]);

  const patternSummary = useMemo(() => getPatternSummary(completionPercent), [completionPercent]);

  const skipReasonsList = useMemo(() => getSkipReasonInsights(checkinsInWindow), [checkinsInWindow]);

  const weekOverWeek = useMemo(() => {
    return getWeekOverWeekChange(rangeCheckins, weeklySummary);
  }, [rangeCheckins, weeklySummary]);

  const focusBreakdown = useMemo(() => {
    if (!weeklySummary) {
      return [];
    }

    return Object.entries(weeklySummary.byFocus)
      .map(([focusArea, counts]) => ({
        focusArea,
        done: counts.done,
        skipped: counts.skipped,
        total: counts.done + counts.skipped,
      }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.done - a.done);
  }, [weeklySummary]);

  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <SwipeStepCard
          stepLabel="Step 3"
          title="Review and adjust"
          description="Track weekly outcomes and decide where to focus your next 5, 15, or 30 minutes."
          previousHref="/execute"
          previousLabel="Back: Execute"
          nextHref="/"
          nextLabel="Complete loop: Dashboard"
        >
          {!weeklySummary ? (
          <section aria-label="No insights yet">
            <CalmEmptyState
              variant="insights"
              title="Your insights are still sprouting"
              message="Complete at least one check-in to unlock weekly insights. One calm session is all it takes to begin."
              actionHref="/focus"
              actionLabel="Set today's focus"
            />
          </section>
        ) : (
          <section className="space-y-4">
            <h2 className="mb-2 text-xl font-semibold">Weekly summary</h2>
            {checkinStatus.type !== "ok" ? (
              <p className="mb-3 rounded-lg border border-(--line) bg-(--field) px-3 py-2 text-sm text-slate-700">
                Close today in Execute to refresh this panel with your latest check-in.
              </p>
            ) : null}

            <div className="mb-4 flex flex-col md:flex-row items-center gap-5 rounded-xl border border-(--line) bg-(--field) p-4">
              {/* High-fidelity SVG Circular Progress Ring */}
              <div className="relative flex h-24 w-24 items-center justify-center shrink-0">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                  <circle
                    className="text-slate-200 dark:text-slate-800"
                    strokeWidth="10"
                    stroke="currentColor"
                    fill="transparent"
                    r="40"
                    cx="50"
                    cy="50"
                  />
                  <circle
                    className="text-[--accent] transition-all duration-700 ease-out"
                    strokeWidth="10"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - completionPercent / 100)}`}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="40"
                    cx="50"
                    cy="50"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-bold font-mono tracking-tight text-slate-800">
                    {completionPercent}%
                  </span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">
                    Rate
                  </span>
                </div>
              </div>

              <div className="flex-1 w-full">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Weekly completion trend
                  </p>
                  <p className={`progress-badge text-sm font-semibold ${hasWeeklyProgress ? "is-animated" : ""}`}>
                    {completionPercent}% Completion
                  </p>
                </div>
                <div
                  className={`progress-track ${hasWeeklyProgress ? "is-animated" : ""}`}
                  role="img"
                  aria-label={`Weekly completion ${completionPercent}%`}
                >
                  <div
                    className={`progress-fill ${hasWeeklyProgress ? "is-animated" : ""}`}
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-600 leading-normal">
                  Your rolling 7-day effort score. Maintain more than 70% to accumulate solid execution momentum.
                </p>
              </div>
            </div>

            <div className="summary-grid grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 sm:text-base">
              <div className="summary-card">
                <p className="summary-label">Check-ins</p>
                <p className="summary-value">{weeklySummary.total}</p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Completed</p>
                <p className="summary-value">{weeklySummary.done}</p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Skipped</p>
                <p className="summary-value">{weeklySummary.skipped}</p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Completion rate</p>
                <p className="summary-value">{completionPercent}%</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 mt-4">
              <div className="rounded-xl border border-(--line) bg-(--field) p-3 text-sm flex items-start gap-2.5">
                <div className="text-lg shrink-0 mt-0.5">🎯</div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Top focus area</p>
                  <p className="font-semibold text-slate-800">{topFocus ? (topFocus as FocusArea) : "N/A"}</p>
                </div>
              </div>
              <div className="rounded-xl border border-(--line) bg-(--field) p-3 text-sm flex items-start gap-2.5">
                <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">🔋</span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Most-used dose</p>
                  <p className="font-semibold capitalize text-slate-800">{mostUsedDose}</p>
                </div>
              </div>
              <div className="rounded-xl border border-(--line) bg-(--field) p-3 text-sm flex items-start gap-2.5">
                <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">📈</span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Peak momentum window</p>
                  <p className="font-semibold text-slate-800">{completionWindow}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-(--line) bg-(--field) p-4 mt-4 text-sm text-slate-700">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm shrink-0" aria-hidden="true">✨</span>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coach insights & patterns</p>
              </div>
              <p className="leading-6">{patternSummary}</p>
            </div>

            {weekOverWeek && (
              <div className="rounded-xl border border-(--line) bg-(--field) p-4 mt-4 text-sm text-slate-700">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm shrink-0" aria-hidden="true">🔁</span>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What changed this week</p>
                </div>
                <p className="leading-6">{weekOverWeek.narrative}</p>
                {weekOverWeek.hasPriorData && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span
                      className="rounded-full border border-(--line) bg-(--surface-strong) px-3 py-1 font-semibold"
                      data-testid="wow-sessions-delta"
                    >
                      {weekOverWeek.doneDelta >= 0 ? "+" : ""}
                      {weekOverWeek.doneDelta} sessions vs last week
                    </span>
                    <span
                      className="rounded-full border border-(--line) bg-(--surface-strong) px-3 py-1 font-semibold"
                      data-testid="wow-completion-delta"
                    >
                      {weekOverWeek.completionDelta >= 0 ? "+" : ""}
                      {weekOverWeek.completionDelta} pts completion rate
                    </span>
                  </div>
                )}
              </div>
            )}

            {focusBreakdown.length > 0 && (
              <div className="focus-breakdown-list mt-5 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Focus category trend breakdown
                </p>
                {focusBreakdown.map((item) => (
                  <div key={item.focusArea} className={`focus-row ${item.done > 0 ? "has-progress" : ""}`}>
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

            {skipReasonsList.length > 0 && (
              <div className="mt-5 rounded-xl border border-(--line) bg-(--field) p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2.5">
                  Analyze & scale local friction points
                </p>
                <div className="space-y-3 divide-y divide-(--line)">
                  {skipReasonsList.map((item, idx) => (
                    <div key={idx} className={`text-xs sm:text-sm ${idx !== 0 ? "pt-3 border-t border-(--line)" : ""}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-slate-800">{item.focus}</span>
                        <span className="text-slate-500 text-[10px] sm:text-xs">Logged {item.date}</span>
                      </div>
                      <p className="text-slate-600 italic">“{item.reason}”</p>
                      <div className="mt-2 text-xs flex items-start gap-1 text-[--accent] font-medium">
                        <span aria-hidden="true">💡</span>
                        <span>{item.recommendation}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
          <div className="mt-5 rounded-xl border border-(--line) bg-(--field) p-3 text-sm text-slate-700">
            Finish this step by returning to Dashboard, then begin your next cycle from Focus.
          </div>
        </SwipeStepCard>
      </div>
    </div>
  );
}
