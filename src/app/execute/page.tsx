"use client";

import Link from "next/link";
import { useState } from "react";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { useCoachPlanner } from "@/app/hooks/use-coach-planner";
import { SwipeStepCard } from "@/app/components/swipe-step-card";
import { CalmEmptyState } from "@/app/components/empty-state";
import { StatusMessage } from "@/app/components/status-message";

export default function ExecutePage() {
  const { authUser } = useCoachAuth();
  const storageScope = authUser?.uid ?? "guest";
  const {
    plan,
    checkinStatus,
    submitCheckin,
    skipReason,
    setSkipReason,
    startNextDay,
    checkinAdvice,
    updatePlan,
  } = useCoachPlanner({
    storageScope,
    authEmail: authUser?.email,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editedAction, setEditedAction] = useState("");
  const [editedReflection, setEditedReflection] = useState("");

  const handleStartEdit = () => {
    if (plan) {
      setEditedAction(plan.action);
      setEditedReflection(plan.reflection);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (editedAction.trim() && editedReflection.trim()) {
      updatePlan({
        action: editedAction.trim(),
        reflection: editedReflection.trim(),
      });
      setIsEditing(false);
    }
  };

  const hasCheckedIn = checkinStatus.type === "ok";
  const canSubmitCheckin = Boolean(plan) && !hasCheckedIn;

  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <SwipeStepCard
          stepLabel="Step 2"
          title="Execute your plan"
          description="Work through your action sprint, reflect, and close the day with one outcome."
          previousHref="/focus"
          previousLabel="Back: Focus"
          nextHref="/review"
          nextLabel="Next: Review"
        >
          {!plan ? (
          <section aria-label="No active plan">
            <CalmEmptyState
              variant="plan"
              title="No plan yet, and that is okay"
              message="Today is still open. Start from Focus to shape one small, deliberate step whenever you are ready."
              actionHref="/focus"
              actionLabel="Start in Focus"
              actionVariant="primary"
            />
          </section>
        ) : (
          <section>
            <h2 className="mb-4 text-xl font-semibold">Today&apos;s deliberate dose</h2>
            <div className="plan-meta-grid mb-5 text-sm">
              <div className="plan-pill flex items-start gap-2.5 p-3 rounded-xl border border-[var(--line)] bg-[var(--field)] text-(--muted)">
                <div className="rounded-lg bg-(--accent)/10 text-(--accent) p-1.5 shrink-0">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="plan-pill-label text-[10px] font-bold uppercase tracking-wider text-slate-500">Focus</span>
                  <span className="plan-pill-value text-sm font-semibold text-slate-800 mt-0.5">{plan.focus}</span>
                </div>
              </div>

              <div className="plan-pill flex items-start gap-2.5 p-3 rounded-xl border border-[var(--line)] bg-[var(--field)] text-(--muted)">
                <div className="rounded-lg bg-(--accent)/10 text-(--accent) p-1.5 shrink-0">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="plan-pill-label text-[10px] font-bold uppercase tracking-wider text-slate-500">Dose</span>
                  <span className="plan-pill-value text-sm font-semibold capitalize text-slate-800 mt-0.5">{plan.dose}</span>
                </div>
              </div>

              <div className="plan-pill flex items-start gap-2.5 p-3 rounded-xl border border-[var(--line)] bg-[var(--field)] text-(--muted)">
                <div className="rounded-lg bg-(--accent)/10 text-(--accent) p-1.5 shrink-0">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="plan-pill-label text-[10px] font-bold uppercase tracking-wider text-slate-500">Time Limit</span>
                  <span className="plan-pill-value text-sm font-semibold text-slate-800 mt-0.5">{plan.minutes} min</span>
                </div>
              </div>
            </div>

            <div className="relative pl-6 border-l border-[var(--line)] space-y-6 my-6">
              {/* Step 1 */}
              <div className="relative plan-step bg-transparent border-0 !p-0">
                <span className="absolute -left-[35px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-(--panel) border border-(--accent) text-[10px] font-bold text-(--accent)">
                  1
                </span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-(--accent) mb-1 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Action sprint
                  </h3>
                  <p className="text-sm sm:text-base text-slate-800 dark:text-(--muted-strong) leading-relaxed font-semibold">{plan.action}</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative plan-step bg-transparent border-0 !p-0">
                <span className="absolute -left-[35px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-(--panel) border border-(--accent) text-[10px] font-bold text-(--accent)">
                  2
                </span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-(--accent) mb-1 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                    Reflection checkpoint
                  </h3>
                  <p className="text-sm sm:text-base text-slate-800 dark:text-(--muted-strong) leading-relaxed font-semibold">{plan.reflection}</p>
                </div>
              </div>

              {/* Step 3 Optional */}
              {plan.optionalResource ? (
                <div className="relative plan-step bg-transparent border-0 !p-0">
                  <span className="absolute -left-[35px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-(--panel) border border-slate-500 text-[10px] font-bold text-slate-500">
                    3
                  </span>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
                      </svg>
                      Optional extra
                    </h3>
                    <p className="text-sm sm:text-base text-slate-850 dark:text-(--muted-strong) leading-relaxed">{plan.optionalResource}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {!hasCheckedIn && (
              <div className="mt-4">
                {isEditing ? (
                  <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--field)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Customize plan targets (constrained edits)
                    </p>
                    <div>
                      <label htmlFor="edit-action" className="label text-xs">Action sprint description</label>
                      <textarea
                        id="edit-action"
                        className="field min-h-16 text-sm"
                        value={editedAction}
                        onChange={(e) => setEditedAction(e.target.value)}
                        maxLength={280}
                      />
                      <p className="text-[10px] text-slate-700 mt-1">Maximum 280 characters. Characterized effort window remains locked.</p>
                    </div>
                    <div>
                      <label htmlFor="edit-reflection" className="label text-xs">Reflection checkpoint question</label>
                      <input
                        id="edit-reflection"
                        className="field text-sm"
                        value={editedReflection}
                        onChange={(e) => setEditedReflection(e.target.value)}
                        maxLength={180}
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        className="primary-button text-xs py-1.5 px-4"
                        disabled={!editedAction.trim() || !editedReflection.trim()}
                        onClick={handleSave}
                      >
                        Save adjustments
                      </button>
                      <button
                        type="button"
                        className="secondary-button text-xs py-1.5 px-4"
                        onClick={() => setIsEditing(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="secondary-button text-xs py-1.5 px-4"
                    onClick={handleStartEdit}
                  >
                    Adjust plan targets
                  </button>
                )}
              </div>
            )}

            <div className="mt-6 border-t border-(--line) pt-6">
              <p className="label mb-3">Close today</p>
              <div className="close-actions">
                <button
                  type="button"
                  className={`primary-button transition-all duration-300 ${
                    hasCheckedIn && checkinStatus.type === "ok" && checkinStatus.message.startsWith("Great work")
                      ? "scale-102 bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse"
                      : ""
                  }`}
                  disabled={!canSubmitCheckin}
                  onClick={() => {
                    // Tactile micro haptic vibration if available
                    if (typeof navigator !== "undefined" && navigator.vibrate) {
                      navigator.vibrate([40, 20, 40]);
                    }
                    void submitCheckin("done");
                  }}
                >
                  {hasCheckedIn && checkinStatus.type === "ok" ? "✓ Logged complete" : "Mark complete"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!canSubmitCheckin}
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) {
                      navigator.vibrate(30);
                    }
                    void submitCheckin("skipped");
                  }}
                >
                  Skip today
                </button>
              </div>

              <div className="mt-3">
                <label htmlFor="skip-reason" className="label">Skip reason (required only if skipping)</label>
                <input
                  id="skip-reason"
                  className="field"
                  disabled={!canSubmitCheckin}
                  value={skipReason}
                  onChange={(event) => setSkipReason(event.target.value)}
                  maxLength={180}
                />
              </div>

              <StatusMessage
                tone="success"
                className="status-banner mt-2"
                celebrate={checkinStatus.type === "ok" && checkinStatus.message.startsWith("Great work")}
                message={checkinStatus.type === "ok" ? checkinStatus.message : null}
              />

              <StatusMessage
                tone="notice"
                className="status-banner mt-2"
                message={checkinAdvice ? `Coach suggestion: ${checkinAdvice}` : null}
              />

              <StatusMessage
                tone="error"
                className="status-banner mt-2"
                message={checkinStatus.type === "error" ? checkinStatus.message : null}
              />

              {hasCheckedIn ? (
                <div className="flow-route-links mt-3">
                  <Link className="primary-button" href="/review">Continue to Review</Link>
                  <button className="secondary-button" type="button" onClick={startNextDay}>
                    Start next day
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        )}
        </SwipeStepCard>
      </div>
    </div>
  );
}
