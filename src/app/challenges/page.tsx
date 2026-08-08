"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  MICRO_CHALLENGES,
  loadChallengeProgress,
  saveChallengeProgress,
  recordChallengeCompletion,
  getTodayStr,
  ChallengeProgress,
  ChallengeCategory,
} from "@/lib/challenges";

export default function ChallengesPage(): React.JSX.Element {
  // Use lazy state initialization to load local storage status directly on construction.
  // This bypasses triggers for the 'react-hooks/set-state-in-effect' ESLint checks.
  const [progress, setProgress] = useState<ChallengeProgress>(() => loadChallengeProgress());

  const [activeCategory, setActiveCategory] = useState<ChallengeCategory | "all">("all");
  // Use lazy state initialization to initialize offset directly without an effect.
  const [dailySeedOffset] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return new Date().getDate();
  });

  useEffect(() => {
    // Sync the loaded (and potentially decay-corrected) initial state to store once
    saveChallengeProgress(progress);
  }, [progress]);

  const today = getTodayStr();
  const practicedToday = progress.lastCompletedDate === today;

  // Filter tasks
  const filtered = MICRO_CHALLENGES.filter((c) => {
    if (activeCategory === "all") return true;
    return c.category === activeCategory;
  });

  // Calculate today's special recommendation
  // Deterministic index rolling so it only changes once per day
  const dailyFocusIndex = dailySeedOffset % MICRO_CHALLENGES.length;
  const recommendedChallenge = MICRO_CHALLENGES[dailyFocusIndex] || MICRO_CHALLENGES[0];

  const handleComplete = (id: string) => {
    const updated = recordChallengeCompletion(progress, id, today);
    setProgress(updated);
    saveChallengeProgress(updated);
  };

  const handleResetProgress = () => {
    const fresh: ChallengeProgress = {
      completedIds: [],
      lastCompletedDate: null,
    };
    setProgress(fresh);
    saveChallengeProgress(fresh);
  };

  const categories: { id: ChallengeCategory | "all"; label: string; emoji: string }[] = [
    { id: "all", label: "All Tasks", emoji: "📋" },
    { id: "mindfulness", label: "Mindful", emoji: "🧘" },
    { id: "productivity", label: "Focus", emoji: "⚡" },
    { id: "wellness", label: "Wellness", emoji: "🌱" },
    { id: "connection", label: "Connect", emoji: "🤝" },
  ];

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Micro-Challenges</h1>
          <p className="mt-1.5 text-xs text-(--muted)">
            Build self-improvement momentum in under 5 minutes daily.
          </p>
        </div>
        <Link 
          href="/" 
          className="rounded-full border border-(--line) bg-(--surface-strong) px-3.5 py-1.5 text-xs font-semibold text-(--foreground) hover:bg-(--panel) transition-colors"
        >
          Back Dashboard
        </Link>
      </div>

      {/* Calm Progress Stats Section - deliberately streak-free */}
      <div className="mb-8 grid grid-cols-2 gap-4 rounded-2xl border border-(--line) bg-(--panel) p-5 shadow-xl">
        <div className="flex flex-col items-center justify-center p-3 text-center border-r border-(--line)">
          <span className="text-3xl">✅</span>
          <span className="mt-2 text-2xl font-black text-(--accent)">
            {progress.completedIds.length}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-(--muted)">
            Challenges Completed
          </span>
        </div>
        <div className="flex flex-col items-center justify-center p-3 text-center">
          <span className="text-3xl">🌱</span>
          <span className="mt-2 text-2xl font-black text-(--foreground)">
            {practicedToday ? "Done" : "Open"}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-(--muted)">
            Today&apos;s Practice
          </span>
        </div>
      </div>

      {/* Daily Recommendation Spot Light */}
      {recommendedChallenge && (
        <div className="mb-8 rounded-2xl border border-(--accent)/30 bg-(--accent)/5 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 rounded-bl-xl bg-(--accent)/20 px-3.5 py-1 text-[10px] font-semibold uppercase text-(--accent) tracking-wider">
            Today&apos;s Pick
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {recommendedChallenge.category === "mindfulness" ? "🧘" : recommendedChallenge.category === "productivity" ? "⚡" : recommendedChallenge.category === "wellness" ? "🌱" : "🤝"}
            </span>
            <span className="font-extrabold text-sm capitalize text-(--accent)">
              {recommendedChallenge.category} Recommended
            </span>
          </div>

          <h3 className="mt-3 text-base font-bold text-(--foreground)">
            {recommendedChallenge.title}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-(--muted-strong)">
            {recommendedChallenge.description}
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="font-mono text-[10px] text-(--muted)">
              ⏳ {recommendedChallenge.durationMinutes} min
            </span>

            {progress.completedIds.includes(recommendedChallenge.id) ? (
              <span className="rounded-full bg-(--accent)/20 border border-(--accent)/30 px-3 py-1 text-xs font-bold text-(--accent)">
                ✓ Completed
              </span>
            ) : (
              <button
                onClick={() => handleComplete(recommendedChallenge.id)}
                className="rounded-full bg-(--accent) text-(--background) hover:bg-(--accent-strong) px-4 py-1.5 text-xs font-bold transition-all cursor-pointer"
              >
                Complete Pick
              </button>
            )}
          </div>
        </div>
      )}

      {/* Categorized Filter Select Rails */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-(--muted) mb-3">
        Discover Habits Card
      </h2>
      <div className="mb-6 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all cursor-pointer ${
              activeCategory === cat.id
                ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                : "border-(--line) bg-(--field) text-(--muted) hover:border-(--muted)"
            }`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Filtered Habits Grid List */}
      <div className="grid grid-cols-1 gap-4">
        {filtered.map((item) => {
          const isCompleted = progress.completedIds.includes(item.id);
          return (
            <div
              key={item.id}
              className={`rounded-xl border p-4.5 transition-all flex flex-col justify-between ${
                isCompleted
                  ? "border-(--accent)/20 bg-(--accent)/5 opacity-80"
                  : "border-(--line) bg-(--field)"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-(--accent)/85 bg-(--accent)/5 border border-(--accent)/20 px-2 py-0.5 rounded">
                    {item.category}
                  </span>
                  <span className="text-[11px] font-mono text-(--muted)">
                    ⏳ {item.durationMinutes}m
                  </span>
                </div>
                <h3 className={`mt-2.5 text-sm font-bold text-(--foreground) ${isCompleted ? "line-through text-(--muted)" : ""}`}>
                  {item.title}
                </h3>
                <p className="mt-2 text-[11px] leading-relaxed text-(--muted-strong)">
                  {item.description}
                </p>
              </div>

              <div className="mt-4 flex justify-end">
                {isCompleted ? (
                  <span className="text-xs text-(--accent) font-semibold">Done ✓</span>
                ) : (
                  <button
                    onClick={() => handleComplete(item.id)}
                    className="rounded-lg bg-(--line) text-(--foreground) hover:border-(--muted) border border-transparent px-3 py-1 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Log Complete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dangerous Reset Options Link */}
      {progress.completedIds.length > 0 && (
        <div className="mt-8 flex justify-center border-t border-(--line) pt-6">
          <button
            onClick={handleResetProgress}
            className="text-[10px] uppercase tracking-wider font-mono text-red-500/60 hover:text-red-400 hover:underline transition-colors cursor-pointer"
          >
            Reset Progress Records
          </button>
        </div>
      )}
    </div>
  );
}
