"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { CalmEmptyState } from "@/app/components/empty-state";
import {
  SlicingDomain,
  IntimidationLevel,
  SlicedTask,
  SLICING_DOMAINS,
  procedurallySliceTask,
  loadSlicedTasks,
  migrateGuestSlicedTasks,
  saveSlicedTasks,
} from "@/lib/slicer";

export default function SlicerPage() {
  const { authUser } = useCoachAuth();
  const scope = authUser?.uid ?? "guest";

  // Form states
  const [taskTitle, setTaskTitle] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<SlicingDomain>("general");
  const [selectedIntimidation, setSelectedIntimidation] = useState<IntimidationLevel>("medium");

  // App states
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [tasks, setTasks] = useState<SlicedTask[]>([]);
  const [activeTask, setActiveTask] = useState<SlicedTask | null>(null);
  const [focusMode, setFocusMode] = useState(true);

  // Timer states
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Confetti/success state
  const [showConfetti, setShowConfetti] = useState(false);

  // Load (or reload) persisted slices when the auth scope resolves or changes.
  // Done during render (React's "adjust state when a prop changes" pattern) rather
  // than in an effect, so it never triggers cascading set-state-in-effect renders.
  if (scope !== loadedScope) {
    const loaded = loadSlicedTasks(scope);
    setLoadedScope(scope);
    setTasks(loaded);
    const incomplete = loaded.find((t) => !t.completedAt);
    setActiveTask(incomplete ?? (loaded.length > 0 ? loaded[0] : null));
  }

  // v0.17 PR1: bring a guest's sliced-task history along when sign-in
  // resolves (docs/design/GUEST_WORKSPACE_MIGRATION.md). The migration is
  // async (the shared primitive's contract), so it cannot run inside the
  // synchronous render-phase load above; it runs here on scope change, and
  // when the copy actually moved tasks the list is re-read so they appear in
  // the same load rather than after a manual refresh - the /journal
  // sequencing (PR #113) in the form this page's load pattern allows. The
  // quiet outcomes (skipped / already-migrated / error / migrated-nothing)
  // change no state at all, matching how /journal stays silent.
  useEffect(() => {
    let cancelled = false;

    async function bringGuestTasksAlong() {
      const result = await migrateGuestSlicedTasks(scope);
      if (cancelled || result.status !== "migrated" || result.migratedCount === 0) {
        return;
      }
      const merged = loadSlicedTasks(scope);
      setTasks(merged);
      const incomplete = merged.find((t) => !t.completedAt);
      setActiveTask(incomplete ?? (merged.length > 0 ? merged[0] : null));
    }

    void bringGuestTasksAlong();

    return () => {
      cancelled = true;
    };
  }, [scope]);

  // Sync tasks
  const handleSaveTasks = (newTasks: SlicedTask[]) => {
    setTasks(newTasks);
    saveSlicedTasks(newTasks, scope);
  };

  // Timer Tick System
  useEffect(() => {
    if (timerRunning && timerSeconds !== null && timerSeconds > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev !== null && prev <= 1) {
            setTimerRunning(false);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            // Non-blocking trigger click or check in browser
            try {
              if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate([100, 100, 100]);
              }
            } catch {
              // Vibration API is optional; ignore unsupported environments.
            }
            return 0;
          }
          return prev !== null ? prev - 1 : null;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [timerRunning, timerSeconds]);

  // Slicing Action
  const handleGenerateSlice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    const generatedSteps = procedurallySliceTask(
      taskTitle.trim(),
      selectedDomain,
      selectedIntimidation
    );

    const newTask: SlicedTask = {
      id: `task-${Date.now()}`,
      title: taskTitle.trim(),
      domain: selectedDomain,
      intimidation: selectedIntimidation,
      steps: generatedSteps,
      createdAt: new Date().toISOString(),
    };

    const updatedTasks = [newTask, ...tasks];
    handleSaveTasks(updatedTasks);
    setActiveTask(newTask);
    setTaskTitle("");
    
    // Set initial timer to first step
    if (newTask.steps.length > 0) {
      setTimerSeconds(newTask.steps[0].minutes * 60);
      setTimerRunning(false);
    }
  };

  // Step Toggle Completion
  const handleToggleStep = (taskId: string, stepId: string) => {
    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        const nextSteps = t.steps.map((s) => {
          if (s.id === stepId) {
            const nextVal = !s.completed;
            // If the completed step is the active one, pause timer
            if (nextVal) {
              setTimerRunning(false);
            }
            return { ...s, completed: nextVal };
          }
          return s;
        });

        const allDone = nextSteps.every((s) => s.completed);
        return {
          ...t,
          steps: nextSteps,
          completedAt: allDone ? new Date().toISOString() : undefined,
        };
      }
      return t;
    });

    handleSaveTasks(updated);

    // Update active task structure in memory
    const nextActive = updated.find((t) => t.id === taskId);
    if (nextActive) {
      setActiveTask(nextActive);
      // Trigger confetti if recently complete
      const previouslyUnfinished = activeTask ? !activeTask.completedAt : false;
      if (nextActive.completedAt && previouslyUnfinished) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }
    }
  };

  // Skip/Swap Step Alternative
  const handleSwapStepText = (taskId: string, stepId: string) => {
    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        const nextSteps = t.steps.map((s) => {
          if (s.id === stepId && s.alternativeText) {
            const currentText = s.text;
            return {
              ...s,
              text: s.alternativeText,
              alternativeText: currentText, // swap them so they can swap back
              isAlternative: !s.isAlternative,
            };
          }
          return s;
        });
        return { ...t, steps: nextSteps };
      }
      return t;
    });

    handleSaveTasks(updated);

    const nextActive = updated.find((t) => t.id === taskId);
    if (nextActive) {
      setActiveTask(nextActive);
    }
  };

  const handleDeleteTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = tasks.filter((t) => t.id !== taskId);
    handleSaveTasks(updated);
    if (activeTask?.id === taskId) {
      setActiveTask(updated.length > 0 ? updated[0] : null);
      setTimerSeconds(null);
      setTimerRunning(false);
    }
  };

  // Timer Control Helpers
  const startTimer = (minutes: number) => {
    setTimerSeconds(minutes * 60);
    setTimerRunning(true);
  };

  const toggleTimerState = () => {
    setTimerRunning((prev) => !prev);
  };

  const resetActiveTimer = (minutes: number) => {
    setTimerSeconds(minutes * 60);
    setTimerRunning(false);
  };

  const formatTimerTime = (seconds: number | null): string => {
    if (seconds === null) return "05:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Active step calculation (first uncompleted step)
  const activeStep = activeTask?.steps.find((s) => !s.completed);
  const activeStepIndex = activeTask?.steps.findIndex((s) => !s.completed) ?? -1;

  // Progress metrics
  const completedCount = activeTask?.steps.filter((s) => s.completed).length ?? 0;
  const totalCount = activeTask?.steps.length ?? 0;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative">
      {/* Visual Confetti Notification Overlay */}
      {showConfetti && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fade-in text-center">
          <div className="rounded-2xl border-2 border-[var(--accent)] bg-[var(--panel)] p-8 shadow-2xl scale-up relative overflow-hidden max-w-sm mx-4">
            <span className="text-5xl animate-bounce inline-block">🎉</span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-[var(--foreground)]">Paralysis Smashed!</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              You completely rolled through every micro-step of this task. Outstanding ADHD executive momentum!
            </p>
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setShowConfetti(false)}
                className="pointer-events-auto primary-button text-xs py-1.5 px-4"
              >
                Heck Yes!
              </button>
            </div>
            {/* Simple CSS simulated micro-confetti particles */}
            <div className="absolute top-2 left-6 h-2 w-2 rounded-full bg-amber-400 animate-ping"></div>
            <div className="absolute bottom-6 right-8 h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping delay-200"></div>
            <div className="absolute top-12 right-12 h-2 w-2 rounded-full bg-blue-400 animate-ping delay-500"></div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">ADHD Task Slicer</h1>
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            Overcome executive paralysis. Chop daunting, vaguely defined tasks into sub-5-minute physical actions.
          </p>
        </div>
        <Link
          href="/"
          className="self-start rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--field)] transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Creator Form & Task History */}
        <div className="lg:col-span-4 space-y-6">
          
          <section className="panel p-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-md">
            <h2 className="text-md font-bold mb-4 flex items-center gap-1.5">
              <span>Slice a Task</span>
              <span className="text-xs font-normal text-[var(--muted)]">(Procrastination Buster)</span>
            </h2>
            
            <form onSubmit={handleGenerateSlice} className="space-y-4">
              <div>
                <label htmlFor="task-name" className="label text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  The Intimidating Task
                </label>
                <input
                  id="task-name"
                  type="text"
                  placeholder="e.g., Clean off my chaotic desk"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="field text-sm p-2.5 mt-1 bg-[var(--field)] outline-hidden focus:border-[var(--accent)] font-medium"
                  required
                />
              </div>

              <div>
                <span className="label text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  Primary Domain
                </span>
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  {SLICING_DOMAINS.map((dom) => (
                    <button
                      key={dom.id}
                      type="button"
                      onClick={() => setSelectedDomain(dom.id)}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all ${
                        selectedDomain === dom.id
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] scale-102 shadow-xs"
                          : "border-[var(--line)] bg-[var(--field)] hover:bg-slate-800 text-slate-500"
                      }`}
                    >
                      <span className="text-lg mb-0.5">{dom.emoji}</span>
                      <span className="text-[9px] font-bold tracking-tight truncate w-full">{dom.label.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  Intimidation Level (Paralysis Index)
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  {(["low", "medium", "high"] as IntimidationLevel[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setSelectedIntimidation(level)}
                      className={`py-1.5 px-3 rounded-lg border text-xs font-bold capitalize transition-all ${
                        selectedIntimidation === level
                          ? level === "high"
                            ? "border-red-500 bg-red-500/10 text-red-500"
                            : level === "medium"
                            ? "border-amber-500 bg-amber-500/10 text-amber-500"
                            : "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                          : "border-[var(--line)] bg-[var(--field)] text-slate-500 hover:text-slate-200"
                      }`}
                    >
                      {level === "high" ? "💥 Frozen" : level === "medium" ? "🚧 Dragging" : "🌱 Avoiding"}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--muted)] mt-2">
                  {selectedIntimidation === "high" && "Adds body-grounding microsteps and alternative choices first to break severe scrolling loops."}
                  {selectedIntimidation === "medium" && "Generates quick focus-commit triggers before diving into physical actions."}
                  {selectedIntimidation === "low" && "Delivers straightforward, highly-tactical sub-5 minute action steps immediately."}
                </p>
              </div>

              <button
                type="submit"
                disabled={!taskTitle.trim()}
                className="primary-button w-full flex items-center justify-center gap-1.5 py-2 mt-2 font-bold tracking-wide"
              >
                <span>🚀 Slice It!</span>
              </button>
            </form>
          </section>

          {/* Sliced List History */}
          <section className="panel p-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
            <h2 className="text-md font-bold mb-3">Active Slices ({tasks.length})</h2>
            {tasks.length === 0 ? (
              <CalmEmptyState
                variant="slices"
                compact
                title="No slices yet"
                message="Slice a task above and its small, doable steps will wait for you here."
              />
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {tasks.map((t) => {
                  const doneCount = t.steps.filter((s) => s.completed).length;
                  const isDone = t.completedAt;
                  const domInfo = SLICING_DOMAINS.find((d) => d.id === t.domain);
                  
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setActiveTask(t);
                        // Reset timer to first uncompleted step or first step
                        const firstIncomplete = t.steps.find((s) => !s.completed) || t.steps[0];
                        if (firstIncomplete) {
                          setTimerSeconds(firstIncomplete.minutes * 60);
                          setTimerRunning(false);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveTask(t);
                          const firstIncomplete = t.steps.find((s) => !s.completed) || t.steps[0];
                          if (firstIncomplete) {
                            setTimerSeconds(firstIncomplete.minutes * 60);
                            setTimerRunning(false);
                          }
                        }
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left cursor-pointer transition-all focus:outline-hidden focus:ring-1 focus:ring-[var(--accent)] ${
                        activeTask?.id === t.id
                          ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--foreground)]"
                          : "border-[var(--line)] bg-[var(--field)] hover:bg-slate-800 text-slate-400"
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold font-sans">
                          <span>{domInfo?.emoji ?? "📌"}</span>
                          <span className={`${isDone ? "line-through text-slate-500" : ""}`}>{t.title}</span>
                        </div>
                        <div className="text-[10px] text-[var(--muted)] mt-1">
                          {doneCount}/{t.steps.length} steps completed
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteTask(t.id, e)}
                        className="rounded-md p-1 hover:bg-red-500/10 hover:text-red-500 text-slate-400 shrink-0"
                        title="Delete task"
                        type="button"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>

        {/* Right Column: Interactive Checklist & Focus Mode */}
        <div className="lg:col-span-8">
          {!activeTask ? (
            <div className="panel flex flex-col items-center justify-center p-12 text-center border border-[var(--line)] bg-[var(--panel)] rounded-2xl min-h-80">
              <span className="text-5xl animate-pulse">🧘‍♀️</span>
              <h3 className="mt-4 text-lg font-bold">Waiting for an intimidating task</h3>
              <p className="mt-2 text-sm text-[var(--muted)] max-w-sm leading-relaxed">
                When you slice an issue, we will extract micro-actions here, hide intimidating bulk details, and gamify the activation loop for you.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Active Header Panel */}
              <div className="panel p-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[var(--line)]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="bg-[var(--accent)]/10 text-[var(--accent)] font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md">
                        {SLICING_DOMAINS.find((d) => d.id === activeTask.domain)?.label}
                      </span>
                      {activeTask.completedAt && (
                        <span className="bg-emerald-500/10 text-emerald-500 font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1">
                          ✓ Smashed
                        </span>
                      )}
                    </div>
                    <h2 className={`text-xl font-bold tracking-tight mt-1.5 ${activeTask.completedAt ? "line-through text-slate-500" : ""}`}>
                      {activeTask.title}
                    </h2>
                  </div>
                  
                  {/* Focus Mode Custom Toggle */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-[var(--muted)]">Focus Mode</span>
                    <button
                      onClick={() => setFocusMode((p) => !p)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        focusMode ? "bg-[var(--accent)]" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-900 shadow-lg ring-0 transition duration-200 ease-in-out ${
                          focusMode ? "translate-x-5 bg-slate-950" : "translate-x-0 bg-slate-300"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Progress bar visualizer */}
                <div className="mt-4 flex items-center justify-between gap-4 text-xs font-bold">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Activation Momentum</span>
                      <span className="text-[10px] text-[var(--accent)]">{progressPercent}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--line)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Focus Module / Countdown Deck (Visible in both, elevated in Focus Mode) */}
              {!activeTask.completedAt && activeStep && (
                <div className="panel p-6 rounded-2xl border-2 border-[var(--accent)] bg-[var(--panel)] shadow-lg relative overflow-hidden">
                  
                  <div className="absolute top-0 right-0 bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-extrabold px-3 py-1 uppercase rounded-bl-lg tracking-wider font-mono">
                    Current Focus Task
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2.5 flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest font-mono">
                        Micro-Step {activeStepIndex + 1} of {totalCount} ({activeStep.minutes} min)
                      </p>
                      <h3 className="text-lg font-bold leading-normal text-[var(--foreground)] pr-6 break-words">
                        {activeStep.text}
                      </h3>
                      {activeStep.alternativeText && (
                        <button
                          onClick={() => handleSwapStepText(activeTask.id, activeStep.id)}
                          className="text-[11px] font-bold text-[var(--accent)] flex items-center gap-1 hover:text-[var(--accent)]/80 transition-colors"
                          title="Click if this step triggers too much resistance"
                        >
                          <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
                          </svg>
                          <span>This step feels too hard. Give me an easier choice!</span>
                        </button>
                      )}
                    </div>

                    {/* Integrated Micro Countdown Timer */}
                    <div className="flex flex-row md:flex-col items-center justify-center gap-3 bg-[var(--field)] p-4 rounded-xl border border-[var(--line)] shrink-0 min-w-40">
                      <div className="text-center">
                        <div className="text-3xl font-extrabold font-mono text-[var(--foreground)] tracking-tight">
                          {formatTimerTime(timerSeconds)}
                        </div>
                        <p className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-wider font-mono mt-0.5">Countdown Race</p>
                      </div>

                      <div className="flex gap-1.5 shrink-0">
                        {timerSeconds === null || timerSeconds <= 0 ? (
                          <button
                            onClick={() => startTimer(activeStep.minutes)}
                            className="bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-slate-950 text-[10px] font-bold py-1 px-3 rounded-md"
                          >
                            ▶ Start timer
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={toggleTimerState}
                              className={`${
                                timerRunning ? "bg-amber-500 text-slate-950" : "bg-emerald-500 text-slate-900"
                              } text-[10px] font-bold py-1 px-2.5 rounded-md`}
                            >
                              {timerRunning ? "⏸ Pause" : "▶ Resume"}
                            </button>
                            <button
                              onClick={() => resetActiveTimer(activeStep.minutes)}
                              className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold py-1 px-2.5 rounded-md"
                            >
                              🔄 Reset
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => handleToggleStep(activeTask.id, activeStep.id)}
                      className="primary-button flex items-center gap-1.5 text-xs font-bold py-2 px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-md border-0"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Completed! Next Step</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Steps Deck Checklist (Hides non-actives if Focus Mode is ON so ADHD minds stay un-intimidated) */}
              <div className="panel p-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    {focusMode ? "Other Hidden Steps" : "Slices Checklist"}
                  </h3>
                  {focusMode && activeStep && (
                    <span className="text-[10px] text-[var(--muted)] italic">
                      Hiding {totalCount - 1} steps to keep your short-term cognitive load clean.
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {activeTask.steps.map((s, idx) => {
                    const isFocusTarget = activeStep?.id === s.id;
                    const displayThisStep = !focusMode || isFocusTarget;

                    if (!displayThisStep) return null;

                    return (
                      <div
                        key={s.id}
                        className={`flex items-start justify-between p-3 rounded-xl border transition-all ${
                          isFocusTarget
                            ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-xs"
                            : s.completed
                            ? "border-[var(--line)] bg-slate-800/20 opacity-50"
                            : "border-[var(--line)] bg-[var(--field)]"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1 pr-4">
                          <button
                            type="button"
                            aria-pressed={s.completed}
                            aria-label={
                              s.completed
                                ? `Mark step ${idx + 1} not done`
                                : `Mark step ${idx + 1} done`
                            }
                            onClick={() => handleToggleStep(activeTask.id, s.id)}
                            className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                              s.completed
                                ? "bg-emerald-500 border-emerald-500 text-slate-900"
                                : isFocusTarget
                                ? "border-[var(--accent)] hover:bg-[var(--accent)]/10"
                                : "border-slate-500 hover:border-slate-400"
                            }`}
                          >
                            {s.completed && (
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>

                          <div className="min-w-0">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono block">
                              Step {idx + 1} ({s.minutes} min)
                            </span>
                            <p
                              className={`text-sm mt-0.5 leading-relaxed font-semibold ${
                                s.completed ? "line-through text-slate-400" : "text-[var(--foreground)]"
                              }`}
                            >
                              {s.text}
                            </p>
                          </div>
                        </div>

                        {s.alternativeText && !s.completed && (
                          <button
                            onClick={() => handleSwapStepText(activeTask.id, s.id)}
                            className="text-[10px] font-bold text-[var(--accent)] shrink-0 hover:underline"
                            title="Swap step"
                          >
                            🔄 Easy Option
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {activeTask.completedAt && (
                    <div className="text-center py-6">
                      <span className="text-4xl inline-block mb-3">🏅</span>
                      <h4 className="text-lg font-bold text-emerald-500">Task fully processed!</h4>
                      <p className="text-xs text-[var(--muted)] max-w-sm mx-auto leading-relaxed mt-1">
                        Outstanding! You solved each micro-step of this task, keeping executive friction to zero. Go ahead and start a fresh slice!
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
