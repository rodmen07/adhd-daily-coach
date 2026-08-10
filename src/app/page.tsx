"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { useCoachPlanner } from "@/app/hooks/use-coach-planner";
import { loadFirebaseFirestore } from "@/lib/firebase";
import { getUserAccount } from "@/lib/firestore-user";
import { resolveEntitlement } from "@/lib/entitlement";
import { getMonetizationEvents, summarizeMonetizationEvents, trackMonetizationEvent } from "@/lib/monetization";
import { getOnboardingPreferences, saveOnboardingPreferences } from "@/lib/onboarding";
import { deriveTodayLoopPercent } from "@/lib/planner-derivations";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import { Onboarding } from "@/app/components/onboarding";
import { AuthMessage } from "@/app/components/auth-message";
import { StatusMessage } from "@/app/components/status-message";
import { AffirmationCard } from "@/app/components/AffirmationCard";
import ProgressRing from "@/app/components/ProgressRing";
import { ReminderSettingsPanel } from "@/app/components/reminder-settings";

function subscribeMonetization(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", callback);
  window.addEventListener("monetizationchange", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("monetizationchange", callback);
  };
}

// The counters tick up on a timer, so no CSS media query can stop them. They
// stand still for anyone who asked for reduced motion, and for the test escape
// hatch that keeps assertions off a moving target.
function skipCounterAnimation(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const win = window as unknown as { __ANIMATE_COUNTERS__?: boolean };
  return win.__ANIMATE_COUNTERS__ === false || prefersReducedMotion();
}

function AnimatedCounter({
  value,
  suffix = "",
  className,
  testId,
}: {
  value: number;
  suffix?: string;
  className?: string;
  testId?: string;
}) {
  // The initial value stays hydration-safe: only the test escape hatch, which
  // is never set during a server render, can pre-fill it. Reduced motion is a
  // client-only preference, so the effect below settles it after hydration.
  const [displayValue, setDisplayValue] = useState(() => {
    const win =
      typeof window !== "undefined"
        ? (window as unknown as { __ANIMATE_COUNTERS__?: boolean })
        : undefined;
    return win && win.__ANIMATE_COUNTERS__ === false ? value : 0;
  });

  useEffect(() => {
    if (skipCounterAnimation()) {
      // Settle on the final value without a cascading synchronous render, the
      // same deferred approach the progress ring uses under reduced motion.
      const settle = window.setTimeout(() => setDisplayValue(value), 0);
      return () => window.clearTimeout(settle);
    }

    const duration = 650;
    const startTime = Date.now();

    const intervalId = window.setInterval(() => {
      const progress = Math.min((Date.now() - startTime) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * easedProgress));

      if (progress >= 1) {
        if (typeof window !== "undefined") {
          window.clearInterval(intervalId);
        }
      }
    }, 16);

    return () => {
      if (typeof window !== "undefined") {
        window.clearInterval(intervalId);
      }
    };
  }, [value]);

  return (
    <span className={className} data-testid={testId}>
      {displayValue}
      {suffix}
    </span>
  );
}

export default function Home() {
  const { authUser, authMessage, authConfigured, signInWithGoogle, signOutUser } =
    useCoachAuth();
  const storageScope = authUser?.uid ?? "guest";

  const {
    plan,
    checkinStatus,
    weeklySummary,
    migrationStatus,
    topFocus,
    setFocus,
    setDose,
    email,
    setEmail,
    sendReminder,
    reminderStatus,
  } = useCoachPlanner({
    storageScope,
    authEmail: authUser?.email,
  });

  const [membershipLookup, setMembershipLookup] = useState<{
    uid: string;
    account: import("@/lib/firestore-user").UserAccount | null;
    fallbackTrial: boolean;
  } | null>(null);

  // Where a keyboard or screen-reader visitor lands once the first-run dialog
  // closes. Onboarding has no trigger element to restore focus to (unlike
  // KeyboardHelp) - it is raised by a deferred effect on a first visit, so the
  // previously focused element is `document.body`. Without this, the panel's
  // unmount drops focus back to the body: a keyboard visitor loses their place
  // and nothing is announced. The dashboard heading is always in the DOM
  // (Onboarding renders as a sibling overlay, not a wrapper), so focusing it
  // here is safe regardless of render order.
  const dashboardHeadingRef = useRef<HTMLHeadingElement>(null);

  // "Have they been through onboarding?" is asked of the validated reader, not
  // of the raw string. A bare truthiness check counted any leftover value as a
  // finished onboarding, so a corrupt record hid the flow forever while the
  // planner silently fell back to its own defaults, and nothing in the app can
  // reopen onboarding once it is skipped.
  //
  // The answer lives in localStorage, which this static export's prerender
  // cannot read, so it is settled in an effect rather than in a `useState`
  // initializer - the hydration-safe shape `AnimatedCounter` already uses in
  // this file. Starting at `false` makes the first client render agree with the
  // prerendered HTML (neither carries the overlay); a first-time visitor sees
  // one frame of dashboard before it appears, exactly as the counters start
  // at 0.
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Raised by the two close handlers and consumed by the effect below, so the
  // focus move happens in a passive effect AFTER the overlay has left the DOM
  // rather than inline in the click handler.
  //
  // Doing it inline looked equivalent and was not. Onboarding focuses its own
  // panel from a mount effect, and passive effects are only guaranteed to have
  // flushed before the NEXT render - so a close that arrives in the window
  // between the overlay's commit and that effect ran in the order
  // `focus(heading)` -> `focus(overlay panel)` -> overlay unmounts -> focus
  // falls to `document.body`, which is exactly the state this restore exists
  // to prevent, and it never recovered. That window is unreachable by a human
  // (it is one macrotask wide) but a loaded test runner hits it, which is how
  // it reached `main`: the post-merge Quality Gate on `e11271d` went red on a
  // docs-only commit. Restoring from an effect makes the order total - React
  // flushes the overlay's pending mount effect before rendering its removal,
  // so this always runs last.
  const restoreFocusAfterOnboarding = useRef(false);

  useEffect(() => {
    if (showOnboarding || !restoreFocusAfterOnboarding.current) {
      return;
    }
    restoreFocusAfterOnboarding.current = false;
    dashboardHeadingRef.current?.focus();
  }, [showOnboarding]);

  useEffect(() => {
    // Settled in a deferred callback rather than synchronously in the effect
    // body - the same settle AnimatedCounter's reduced-motion branch uses
    // above - so hydration completes against the prerendered HTML first and
    // the lint rule against cascading synchronous renders holds.
    const settle = window.setTimeout(() => {
      setShowOnboarding(getOnboardingPreferences() === null);
    }, 0);
    return () => window.clearTimeout(settle);
  }, []);

  const handleOnboardingComplete = (prefs: {
    defaultFocus: import("@/lib/plan").FocusArea;
    defaultDose: import("@/lib/plan").DailyDose;
    defaultTheme: "light" | "dark";
  }) => {
    setShowOnboarding(false);
    setFocus(prefs.defaultFocus);
    setDose(prefs.defaultDose);
    if (typeof window !== "undefined") {
      document.documentElement.dataset.theme = prefs.defaultTheme;
      localStorage.setItem("calm-daily-coach:theme", prefs.defaultTheme);
    }
    restoreFocusAfterOnboarding.current = true;
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
    // Skipping still records a complete preference record, through the same
    // writer the finished flow uses, so the two can never store different
    // shapes under the same key.
    saveOnboardingPreferences({
      defaultFocus: "Deep Work",
      defaultDose: "light",
      defaultTheme: "dark",
    });
    restoreFocusAfterOnboarding.current = true;
  };

  useEffect(() => {
    let active = true;

    if (!authConfigured || !authUser) {
      return () => {
        active = false;
      };
    }

    // The SDK loads lazily (v0.19 PR3, D4): the client resolves inside the
    // effect's async chain, so the entry chunk never carries Firestore. A null
    // client (unconfigured deploy) leaves the lookup unset, exactly as the old
    // synchronous probe's early return did.
    loadFirebaseFirestore()
      .then((db) => {
        if (!db || !active) {
          return;
        }

        return getUserAccount(db, authUser.uid).then((account) => {
          if (!active) {
            return;
          }
          setMembershipLookup({
            uid: authUser.uid,
            account,
            fallbackTrial: false,
          });
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setMembershipLookup({
          uid: authUser.uid,
          account: null,
          fallbackTrial: true,
        });
      });

    return () => {
      active = false;
    };
  }, [authConfigured, authUser]);

  const membershipView = useMemo(() => {
    if (!authConfigured || !authUser) {
      return {
        status: "signed_out" as const,
        trialDaysRemaining: null as number | null,
      };
    }

    if (!membershipLookup || membershipLookup.uid !== authUser.uid) {
      return {
        status: "checking" as const,
        trialDaysRemaining: null as number | null,
      };
    }

    if (membershipLookup.fallbackTrial || !membershipLookup.account) {
      return {
        status: "trial" as const,
        trialDaysRemaining: 30,
      };
    }

    // One shared decision rather than a second copy of the gate's arithmetic:
    // this card and `subscription-guard.tsx` used to compute entitlement
    // separately and could disagree about the same record.
    const entitlement = resolveEntitlement(membershipLookup.account);

    if (entitlement.status === "trial") {
      return {
        status: "trial" as const,
        trialDaysRemaining: entitlement.daysRemaining,
      };
    }

    return {
      status: entitlement.status,
      trialDaysRemaining: null as number | null,
    };
  }, [authConfigured, authUser, membershipLookup]);

  const hasCheckedIn = checkinStatus.type === "ok";
  const hasPlan = Boolean(plan);

  const nextCycleHref = !hasPlan ? "/focus" : hasCheckedIn ? "/review" : "/execute";
  const nextCycleLabel = !hasPlan
    ? "Start today\'s session"
    : hasCheckedIn
      ? "Open today\'s reflection"
      : "Continue today\'s session";
  const todayStatus = !hasPlan
    ? "No plan yet"
    : hasCheckedIn
      ? "Session complete"
      : "Plan in progress";
  const todayStatusDetail = !hasPlan
    ? "Pick a focus and a dose, then start your first deliberate step."
    : hasCheckedIn
      ? "Your check-in is done. Use reflection to close the loop with intent."
      : "You already have a plan. Execute the session and check in when done.";

  // Today only, presented gently: no history, no streaks, no pressure.
  const todayProgressPercent = deriveTodayLoopPercent(hasPlan, hasCheckedIn);
  const todayProgressCaption = !hasPlan
    ? "A calm start is ready whenever you are."
    : hasCheckedIn
      ? "Today's loop is complete. Nothing more is asked of you."
      : "Plan in motion. Move at your own pace.";

  const actionRail = [
    {
      label: "Focus",
      state: hasPlan ? "Plan ready" : "Ready to start",
      description: hasPlan
        ? "Adjust today's focus or regenerate the deliberate plan."
        : "Choose a focus area and dose to generate today's plan.",
      href: "/focus",
      buttonLabel: hasPlan ? "Tune focus" : "Start focus",
      primary: !hasPlan,
    },
    {
      label: "Execute",
      state: hasPlan ? (hasCheckedIn ? "Done for today" : "Plan ready") : "Locked",
      description: hasPlan
        ? hasCheckedIn
          ? "Your check-in is complete. Reopen execution if you want to review the work."
          : "Run your active plan, then mark the day done or skipped."
        : "Generate a plan before the execution step becomes active.",
      href: hasPlan ? "/execute" : "/focus",
      buttonLabel: hasPlan ? (hasCheckedIn ? "See check-in" : "Open execute") : "Generate plan",
      primary: hasPlan && !hasCheckedIn,
      locked: !hasPlan,
    },
    {
      label: "Review",
      state: hasCheckedIn ? "Ready to reflect" : "Unlocked after check-in",
      description: hasCheckedIn
        ? "Read weekly progress and decide what to carry into the next cycle."
        : "Complete today's check-in to unlock weekly reflection.",
      href: "/review",
      buttonLabel: hasCheckedIn ? "Open reflection" : "Preview reflection",
      primary: hasCheckedIn,
    },
    {
      label: "One thing now",
      state: "Always open",
      description: "A calm, single-task timer for right now. No pressure, stop whenever you need to.",
      href: "/now",
      buttonLabel: "Focus on one thing",
      primary: false,
    },
  ];

  /**
   * The second door for every route the header was the only way into.
   *
   * Before v0.23, six of the twelve primary-nav routes were linked from nowhere
   * else in the product, and four of those six had no keyboard chord either, so
   * a pill in a header that wraps to four rows on a phone was their entire
   * affordance (`docs/design/NAV_SHAPE.md` section 1c, measured at `776ab2b`).
   * `src/app/__tests__/route-door-census.test.ts` fails from now on if any
   * primary-nav route goes back to having one door.
   *
   * The hrefs are written as literals rather than read from `src/lib/routes.ts`
   * on purpose: a link generated from the registry is the navigation by another
   * name, and this section exists precisely to be an independent second source.
   * The census does not count derived hrefs for the same reason.
   *
   * Deliberately below the action rail and deliberately not a rail itself: the
   * rail is the day's deliberate sequence and these are standing places to go.
   */
  const moreWaysIn = [
    {
      group: "Calm tools",
      caption: "Open whenever you need them. Nothing here expires.",
      links: [
        { label: "Task slicer", href: "/slicer", hint: "Break one overwhelming task down" },
        { label: "Ambient", href: "/ambient", hint: "Quiet sound for working" },
        { label: "Breathe", href: "/breathe", hint: "A guided minute" },
        { label: "Challenges", href: "/challenges", hint: "Small optional nudges" },
      ],
    },
    {
      group: "Looking back",
      caption: "Only when you want it. Nothing is counted against you.",
      links: [
        { label: "Trends", href: "/trends", hint: "How the weeks have gone" },
        { label: "Journal", href: "/journal", hint: "What you wrote down" },
      ],
    },
  ];

  const completionPercent = weeklySummary ? Math.round(weeklySummary.completionRate * 100) : 0;
  const hasWeeklyProgress = completionPercent > 0;
  const weeklyMomentum =
    completionPercent >= 70
      ? "Strong week"
      : completionPercent >= 40
        ? "Steady progress"
        : "Early momentum";

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

  const monetizationEvents = useSyncExternalStore(subscribeMonetization, getMonetizationEvents, () => []);

  const onboardingFunnelSummary = useMemo(() => {
    const summary = summarizeMonetizationEvents(monetizationEvents);
    const starts = summary.onboardingStarted;
    const completions = summary.onboardingCompleted;
    const skips = summary.onboardingSkipped;
    const conversionRate = starts > 0 ? Math.round((completions / starts) * 100) : 0;

    const statusLabel =
      starts === 0
        ? "No onboarding runs yet"
        : conversionRate >= 70
          ? "Strong completion"
          : conversionRate >= 40
            ? "Moderate conversion"
            : "Needs iteration";

    return {
      starts,
      completions,
      skips,
      conversionRate,
      statusLabel,
    };
  }, [monetizationEvents]);

  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        {/* No `typeof window` guard here any more: `showOnboarding` starts
            false and is only ever raised by the client-only effect above, so a
            render without a browser cannot reach this branch. That guard used
            to be what kept the overlay out of the static HTML, and it was also
            what hid the mismatch, since the initializer had already disagreed
            with the prerender by the time this line ran.

            The `<div className="mb-6">` that used to wrap this is gone with
            v0.19 PR1: Onboarding now renders its own fixed, full-viewport
            overlay (`.first-run-overlay`), so it occupies no space in this
            column and its post-hydration arrival cannot push `section.panel`
            down. That push was the entry route's whole 0.752 CLS. A margin on
            an out-of-flow element would do nothing anyway. */}
        {showOnboarding && (
          <Onboarding
            onComplete={handleOnboardingComplete}
            onSkip={handleOnboardingSkip}
          />
        )}

        <section className="panel mb-5">
          <p className="eyebrow">Dashboard</p>
          <h1
            ref={dashboardHeadingRef}
            tabIndex={-1}
            className="mb-2 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Today-first coaching
          </h1>
          <p className="mb-3 text-sm leading-6 text-slate-700 sm:text-base">
            Start with one clear action, then move through Focus, Execute, and Review at your own pace.
          </p>
          <div className="today-spotlight mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Today status</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{todayStatus}</h2>
              <p className="mt-1 text-sm text-slate-700">{todayStatusDetail}</p>
            </div>
            <div className="today-ring" data-testid="today-progress">
              <div className="today-ring-visual">
                <ProgressRing
                  percentage={todayProgressPercent}
                  radius={30}
                  strokeWidth={6}
                  ariaLabel={`Today's progress: ${todayProgressPercent} percent`}
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Today&apos;s progress
                </p>
                <p className="mt-1 text-sm text-slate-700">{todayProgressCaption}</p>
              </div>
            </div>
            <div className="flow-route-links text-sm">
              <Link className="primary-button" href={nextCycleHref}>
                {nextCycleLabel}
              </Link>
              <Link className="secondary-button" href="/focus">
                Start a fresh plan
              </Link>
            </div>
          </div>

          <AffirmationCard />

          <p className="flow-detail text-xs sm:text-sm sr-only">
            Dashboard - Focus - Execute - Review - Dashboard
          </p>

          {/* Visual Loop Stepper Pipeline */}
          <div className="my-6 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 rounded-2xl p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 text-center sm:text-left flex items-center justify-center sm:justify-start gap-1.5">
              <svg className="h-4 w-4 text-(--accent)" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Continuous Growth Loop
            </h3>
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0 justify-between relative pl-3 pr-3">
              {/* Step 1: Focus */}
              <div className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 flex-1 w-full sm:w-auto">
                <Link
                  href="/focus"
                  className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all duration-300 group ${
                    !hasPlan
                      ? "border-(--accent) bg-(--accent)/10 text-(--accent) shadow-[0_0_12px_rgba(122,214,183,0.25)] font-bold scale-105"
                      : "border-emerald-500 bg-emerald-500/10 text-emerald-500 hover:border-emerald-400"
                  }`}
                  aria-label="Step 1: Focus"
                >
                  <svg className="h-5 w-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </Link>
                <div className="text-left sm:text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${!hasPlan ? "text-(--accent)" : "text-slate-400"}`}>
                    01. Focus
                  </p>
                  <p className="text-[10px] text-slate-500 hidden sm:block mt-0.5">Set daily routine & depth</p>
                </div>
              </div>

              {/* Connecting Line 1 */}
              <div className="hidden sm:block h-0.5 flex-1 mx-2 bg-gradient-to-r transition-all duration-500" style={{ backgroundImage: hasPlan ? 'linear-gradient(to right, var(--success-strong), var(--success-strong))' : 'linear-gradient(to right, var(--line), var(--line))' }} />

              {/* Step 2: Execute */}
              <div className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 flex-1 w-full sm:w-auto">
                <Link
                  href={hasPlan ? "/execute" : "/focus"}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all duration-300 group ${
                    hasPlan && !hasCheckedIn
                      ? "border-(--accent) bg-(--accent)/10 text-(--accent) shadow-[0_0_12px_rgba(122,214,183,0.25)] font-bold scale-105"
                      : hasCheckedIn
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-500 hover:border-emerald-400"
                      : "border-(--line) bg-(--field) text-(--muted)"
                  }`}
                  aria-label="Step 2: Execute"
                >
                  <svg className="h-5 w-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </Link>
                <div className="text-left sm:text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${hasPlan && !hasCheckedIn ? "text-(--accent)" : "text-slate-400"}`}>
                    02. Execute
                  </p>
                  <p className="text-[10px] text-slate-500 hidden sm:block mt-0.5">Run active sprint dose</p>
                </div>
              </div>

              {/* Connecting Line 2 */}
              <div className="hidden sm:block h-0.5 flex-1 mx-2 bg-gradient-to-r transition-all duration-500" style={{ backgroundImage: hasCheckedIn ? 'linear-gradient(to right, var(--success-strong), var(--success-strong))' : 'linear-gradient(to right, var(--line), var(--line))' }} />

              {/* Step 3: Review */}
              <div className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 flex-1 w-full sm:w-auto">
                <Link
                  href="/review"
                  className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all duration-300 group ${
                    hasCheckedIn
                      ? "border-(--accent) bg-(--accent)/10 text-(--accent) shadow-[0_0_12px_rgba(122,214,183,0.25)] font-bold scale-105"
                      : "border-(--line) bg-(--field) text-(--muted)"
                  }`}
                  aria-label="Step 3: Review"
                >
                  <svg className="h-5 w-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v14" />
                  </svg>
                </Link>
                <div className="text-left sm:text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${hasCheckedIn ? "text-(--accent)" : "text-slate-400"}`}>
                    03. Review
                  </p>
                  <p className="text-[10px] text-slate-500 hidden sm:block mt-0.5">Analyze and optimize</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Action rail
              </p>
              <p className="text-xs text-slate-600">
                Pick the next deliberate step.
              </p>
            </div>
            <div className="action-rail grid gap-3 md:grid-cols-3">
              {actionRail.map((action) => (
                <article
                  key={action.label}
                  className={`action-card ${action.primary ? "is-primary" : ""} ${action.locked ? "is-locked" : ""}`}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        {action.label === "Focus" && (
                          <svg className="h-4 w-4 text-(--accent)" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="4" />
                          </svg>
                        )}
                        {action.label === "Execute" && (
                          <svg className="h-4 w-4 text-(--accent)" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        )}
                        {action.label === "Review" && (
                          <svg className="h-4 w-4 text-(--accent)" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v14" />
                          </svg>
                        )}
                        <p className="eyebrow !mb-0">{action.label}</p>
                      </div>
                      <h2 className="text-base font-semibold tracking-tight">{action.state}</h2>
                    </div>
                    <span className="action-card-index">0{action.label === "Focus" ? 1 : action.label === "Execute" ? 2 : 3}</span>
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{action.description}</p>
                  <div className="mt-4">
                    <Link className={action.primary ? "primary-button" : "secondary-button"} href={action.href}>
                      {action.buttonLabel}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <section className="mt-4" aria-labelledby="more-ways-in-heading">
            <div className="mb-2 flex items-center justify-between gap-2">
              {/* A real heading, not the styled <p> the Action rail label uses:
                  this section is a list of destinations, so a screen-reader
                  user needs to be able to jump to it and to its two groups. */}
              <h2
                className="text-xs font-semibold uppercase tracking-wide text-slate-600"
                id="more-ways-in-heading"
              >
                More ways in
              </h2>
              <p className="text-xs text-slate-600">Everything else the app can do, from here.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {moreWaysIn.map((section) => (
                <article className="action-card" key={section.group}>
                  <h3 className="eyebrow !mb-0">{section.group}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{section.caption}</p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {section.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          className="secondary-button flex items-baseline justify-between gap-3 !px-3 !py-2 text-sm"
                          href={link.href}
                        >
                          <span className="font-semibold">{link.label}</span>
                          <span className="text-xs text-slate-600">{link.hint}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <ReminderSettingsPanel
            storageScope={storageScope}
            email={email}
            onEmailChange={setEmail}
            onSendEmailDraft={() => {
              void sendReminder();
            }}
            draftStatus={reminderStatus}
            canSendDraft={hasPlan}
          />

          <div className="monetization-panel mt-4" aria-label="Membership status">
            <div className="monetization-copy">
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="h-4 w-4 text-amber-500 fill-amber-500 animate-pulse" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.87L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <p className="eyebrow !mb-0">Membership</p>
              </div>
              <h2 className="text-lg font-semibold tracking-tight">Your coach plan</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                ADHD Daily Coach includes every feature in one membership after a 30-day free trial at $5/month.
              </p>
              <p className="monetization-status mt-2 text-xs font-semibold uppercase tracking-wide">
                {membershipView.status === "signed_out" && "Sign in to start your 30-day trial"}
                {membershipView.status === "checking" && "Checking membership status..."}
                {membershipView.status === "active" && "Membership active"}
                {membershipView.status === "expired" && "Trial ended - membership required"}
                {membershipView.status === "unknown" && "Membership status unavailable - access is unchanged"}
                {membershipView.status === "trial" &&
                  `${membershipView.trialDaysRemaining ?? 30} day${
                    (membershipView.trialDaysRemaining ?? 30) === 1 ? "" : "s"
                  } left in trial`}
              </p>
            </div>
            <div className="monetization-actions">
              <Link
                className="primary-button"
                href="/pricing"
                onClick={() => trackMonetizationEvent("dashboard_pricing_clicked", "pro", "dashboard")}
              >
                Manage plan
              </Link>
              {authUser ? (
                <a
                  className="secondary-button"
                  href={`mailto:hello@calmdailycoach.com?subject=Calm%20Daily%20Coach%20Membership%20support&body=Hi%2CCoach!%20My%20account%20uid%20is%20${authUser.uid}.%20I%20need%20help%20with%20membership.`}
                  onClick={() => trackMonetizationEvent("dashboard_early_access_clicked", "pro", "dashboard")}
                >
                  Contact support
                </a>
              ) : (
                <button className="secondary-button" type="button" onClick={signInWithGoogle}>
                  Sign in with Google
                </button>
              )}
            </div>
          </div>

          <details className="insights-collapsible mt-4">
            <summary>Workspace insights</summary>
            <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--field)] px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Onboarding health</p>
                <p className="text-xs font-semibold text-(--accent)">{onboardingFunnelSummary.statusLabel}</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2">
                  <p className="text-slate-500">Starts</p>
                  <p className="text-sm font-semibold text-slate-800">{onboardingFunnelSummary.starts}</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2">
                  <p className="text-slate-500">Completions</p>
                  <p className="text-sm font-semibold text-slate-800">{onboardingFunnelSummary.completions}</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2">
                  <p className="text-slate-500">Skips</p>
                  <p className="text-sm font-semibold text-slate-800">{onboardingFunnelSummary.skips}</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-2">
                  <p className="text-slate-500">Conversion</p>
                  <p className="text-sm font-semibold text-slate-800">{onboardingFunnelSummary.conversionRate}%</p>
                </div>
              </div>
              <div className="mt-2">
                <Link className="secondary-button" href="/monetization">
                  View analytics
                </Link>
              </div>
            </div>
          </details>

          <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">
              {authUser ? `Signed in as ${authUser.displayName ?? authUser.email}` : "Account Mode"}
            </p>
            {authUser ? (
              <button className="secondary-button" type="button" onClick={signOutUser}>
                Sign out
              </button>
            ) : (
              <button className="secondary-button" type="button" onClick={signInWithGoogle}>
                Continue with Google
              </button>
            )}
          </div>

          <StatusMessage
            tone="notice"
            className="mt-3"
            message={
              authConfigured
                ? null
                : "Google login is not configured yet. Add Firebase environment variables to enable it."
            }
          />
          <AuthMessage message={authMessage} />
          <StatusMessage
            tone="success"
            className="mt-3"
            data-testid="checkin-migration-note"
            message={migrationStatus.type === "ok" ? migrationStatus.message : null}
          />
          {/* v0.28 (MIGRATION_DESTINATION.md D3/D4): the copy completed in this
              browser rather than in the account. A notice, not an error -
              nothing failed and nothing is asked of the person. */}
          <StatusMessage
            tone="notice"
            className="mt-3"
            data-testid="checkin-migration-local"
            message={migrationStatus.type === "notice" ? migrationStatus.message : null}
          />
          <StatusMessage
            tone="error"
            className="mt-3"
            data-testid="checkin-migration-error"
            message={migrationStatus.type === "error" ? migrationStatus.message : null}
          />
        </section>

        {weeklySummary ? (
          <section className="panel">
            <h2 className="mb-3 text-xl font-semibold">Weekly summary</h2>
            <div className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--field)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Weekly completion trend
                </p>
                <p className={`progress-badge text-sm font-semibold ${hasWeeklyProgress ? "is-animated" : ""}`}>
                  {weeklyMomentum}
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
              <p className={`progress-caption mt-2 text-xs ${hasWeeklyProgress ? "is-animated" : ""}`}>
                {completionPercent}% completed in this 7-day window.
              </p>
            </div>

            <div className="summary-grid grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 sm:text-base">
              <div className="summary-card">
                <p className="summary-label">Check-ins</p>
                <p className="summary-value">
                  <AnimatedCounter key={weeklySummary.total} value={weeklySummary.total} testId="weekly-total-count" />
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Completed</p>
                <p className="summary-value">
                  <AnimatedCounter key={weeklySummary.done} value={weeklySummary.done} testId="weekly-done-count" />
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Skipped</p>
                <p className="summary-value">
                  <AnimatedCounter
                    key={weeklySummary.skipped}
                    value={weeklySummary.skipped}
                    testId="weekly-skipped-count"
                  />
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Completion</p>
                <p className="summary-value">
                  <AnimatedCounter
                    key={completionPercent}
                    value={Math.round(weeklySummary.completionRate * 100)}
                    suffix="%"
                    testId="weekly-completion-percent"
                  />
                </p>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-700">
              Window: {weeklySummary.windowStart} to {weeklySummary.windowEnd}
              {topFocus ? ` | Top focus: ${topFocus}` : ""}
            </p>

            {focusBreakdown.length > 0 ? (
              <div className="focus-breakdown-list mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Focus breakdown
                </p>
                {focusBreakdown.map((item) => (
                  <div key={item.focusArea} className={`focus-row ${item.done > 0 ? "has-progress" : ""}`}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs sm:text-sm">
                      <span className="font-medium text-slate-700">{item.focusArea}</span>
                      <span className="text-slate-600">
                        <AnimatedCounter
                          key={`${item.focusArea}-${item.done}`}
                          value={item.done}
                          testId={`focus-done-${item.focusArea}`}
                        />
                        /{item.total} complete
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
            ) : (
              <p className="mt-4 text-sm text-slate-600">
                No check-ins yet this week. Start today&apos;s cycle to build your trendline.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
