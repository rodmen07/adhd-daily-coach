"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BREATHING_PATTERNS,
  BreathingPattern,
  getPacerScale,
  getPhaseLabel,
  getPhaseState,
  getSecondsRemainingInPhase,
} from "@/lib/breathing";

export default function BreathePage() {
  const [pattern, setPattern] = useState<BreathingPattern>(BREATHING_PATTERNS[0]);
  const [running, setRunning] = useState<boolean>(false);
  const [elapsed, setElapsed] = useState<number>(0);

  const startRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!running) {
      return;
    }

    startRef.current = performance.now() - elapsed * 1000;

    const tick = () => {
      const seconds = (performance.now() - startRef.current) / 1000;
      setElapsed(seconds);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // elapsed is intentionally excluded so the loop is not restarted every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const state = getPhaseState(pattern, elapsed);
  const scale = running ? getPacerScale(pattern, elapsed) : 0;
  const secondsRemaining = running ? getSecondsRemainingInPhase(pattern, elapsed) : 0;
  const cycles = running ? state.cyclesCompleted : 0;

  const handleSelectPattern = (next: BreathingPattern) => {
    setPattern(next);
    setElapsed(0);
    setRunning(false);
  };

  const handleToggle = () => {
    if (running) {
      setRunning(false);
    } else {
      setRunning(true);
    }
  };

  const handleReset = () => {
    setRunning(false);
    setElapsed(0);
  };

  const orbScale = 0.55 + scale * 0.45;

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Breathe</h1>
          <p className="mt-1.5 text-xs text-(--muted)">
            Guided breathwork pacing to slow down and reset in a couple of minutes.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-(--line) bg-(--surface-strong) px-3.5 py-1.5 text-xs font-semibold text-(--foreground) hover:bg-(--panel) transition-colors"
        >
          Back Dashboard
        </Link>
      </div>

      {/* Pacer card */}
      <div className="mb-8 rounded-2xl border border-(--line) bg-(--panel) p-6 shadow-xl">
        <div className="flex flex-col items-center justify-center">
          <div
            className="flex h-44 w-44 items-center justify-center rounded-full bg-(--accent)/15 transition-transform duration-100 ease-linear"
            style={{ transform: `scale(${orbScale})` }}
            aria-hidden="true"
          >
            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-(--accent)/25 text-center">
              <span className="text-sm font-semibold text-(--foreground)">
                {running ? getPhaseLabel(state.phase) : "Ready"}
              </span>
              {running && (
                <span className="mt-1 font-mono text-2xl text-(--accent)">{secondsRemaining}</span>
              )}
            </div>
          </div>

          <p className="mt-5 text-[11px] font-mono uppercase tracking-wider text-(--muted)">
            Cycles completed: {cycles}
          </p>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handleToggle}
              className={`rounded-full border px-5 py-2 text-sm font-semibold transition-all ${
                running
                  ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border-(--accent)/40 bg-(--accent)/15 text-(--accent) hover:bg-(--accent)/25"
              } cursor-pointer`}
            >
              {running ? "Pause" : "Start"}
            </button>
            <button
              onClick={handleReset}
              disabled={!running && elapsed === 0}
              className={`rounded-full border px-5 py-2 text-sm font-semibold transition-all ${
                running || elapsed > 0
                  ? "border-(--line) text-(--foreground) hover:bg-(--panel) cursor-pointer"
                  : "border-(--line) text-(--muted) cursor-not-allowed opacity-40"
              }`}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Pattern selection */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-(--muted)">
        Choose a rhythm
      </h2>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {BREATHING_PATTERNS.map((preset) => {
          const isSelected = preset.id === pattern.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelectPattern(preset)}
              className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? "border-(--accent) bg-(--accent)/10 text-(--foreground)"
                  : "border-(--line) bg-(--field) text-(--muted) hover:border-(--muted) cursor-pointer"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-semibold text-sm text-(--foreground)">{preset.name}</span>
                <span className="font-mono text-[10px] text-(--muted)">
                  {preset.inhale}-{preset.hold}-{preset.exhale}
                  {preset.rest > 0 ? `-${preset.rest}` : ""}
                </span>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-(--muted-strong)">
                {preset.description}
              </p>
              <span
                className={`mt-3 self-end rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
                  isSelected
                    ? "bg-(--accent)/20 text-(--accent) border-(--accent)/30"
                    : "bg-transparent text-(--muted) border-(--line)"
                }`}
              >
                {isSelected ? "Selected" : "Select"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
