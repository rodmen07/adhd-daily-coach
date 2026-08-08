"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalmAudioSynthesizer, CalmSoundType } from "@/lib/audio-synthesizer";

export default function CalmPage() {
  const synthRef = useRef<CalmAudioSynthesizer | null>(null);
  const [active, setActive] = useState<CalmSoundType | null>(null);
  const [volume, setVolume] = useState<number>(0.4);

  useEffect(() => {
    // Instantiate ONLY on the client to avoid Next.js server pre-rendering issues
    synthRef.current = new CalmAudioSynthesizer();
    return () => {
      if (synthRef.current) {
        synthRef.current.stop();
      }
    };
  }, []);

  const handleToggle = (type: CalmSoundType) => {
    const synth = synthRef.current;
    if (!synth) return;

    if (active === type) {
      synth.stop();
      setActive(null);
    } else {
      synth.play(type, volume);
      setActive(type);
    }
  };

  const handleStop = () => {
    if (synthRef.current) {
      synthRef.current.stop();
    }
    setActive(null);
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    if (synthRef.current) {
      synthRef.current.setVolume(val);
    }
  };

  const sounds: { id: CalmSoundType; name: string; description: string; emoji: string }[] = [
    {
      id: "brown",
      name: "Brown Noise",
      description: "Low-frequency rumble. Blocks distraction. Ideal for reading & typing.",
      emoji: "🟫",
    },
    {
      id: "pink",
      name: "Voss Pink Noise",
      description: "Steady natural frequency resembling rain. Encourages focus flow.",
      emoji: "🌧️",
    },
    {
      id: "binaural",
      name: "Alpha Beats (10Hz)",
      description: "Headphone-ready binaural beats designed for deep concentration.",
      emoji: "🎧",
    },
    {
      id: "drone",
      name: "Celestial Pad",
      description: "Grounding root harmonics pulsing with slow breathing cycles.",
      emoji: "✨",
    },
  ];

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {/* Header section */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ambient Noise</h1>
          <p className="mt-1.5 text-xs text-(--muted)">
            Procedural, local-made focus noise to block out nearby clutter.
          </p>
        </div>
        <Link 
          href="/" 
          className="rounded-full border border-(--line) bg-(--surface-strong) px-3.5 py-1.5 text-xs font-semibold text-(--foreground) hover:bg-(--panel) transition-colors"
        >
          Back Dashboard
        </Link>
      </div>

      {/* Main player controls custom card */}
      <div className="mb-8 rounded-2xl border border-(--line) bg-(--panel) p-5 shadow-xl">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-(--muted)">
          Player Controls
        </h2>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleStop}
              disabled={active === null}
              className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all ${
                active !== null
                  ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer"
                  : "border-(--line) bg-transparent text-(--muted) cursor-not-allowed opacity-40"
              }`}
              title="Stop playback"
              aria-label="Stop ambient music"
            >
              ■
            </button>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-(--foreground)">
                Status: {active ? `Playing ${sounds.find((s) => s.id === active)?.name}` : "Muted"}
              </span>
              <span className="text-[11px] text-(--muted)">
                {active ? "Focus backdrop on" : "Click any card underneath to play"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1 sm:w-1/2">
            <div className="flex items-center justify-between text-xs font-mono text-(--muted)">
              <label htmlFor="volume-slider">Volume</label>
              <span>{Math.round(volume * 100)}%</span>
            </div>
            <input
              id="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              className="h-1.5 w-full cursor-pointer rounded-full accent-(--accent) bg-(--line)"
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Sync breathing animation circle */}
        {active && (
          <div className="mt-6 flex flex-col items-center justify-center border-t border-(--line) pt-6">
            <div 
              className={`flex h-14 w-14 items-center justify-center rounded-full bg-(--accent)/20 text-(--accent) ${
                active === "drone" ? "animate-pulse" : "animate-bounce"
              }`}
              style={{
                animationDuration: active === "drone" ? "8s" : "4s",
              }}
            >
              🧘
            </div>
            <p className="mt-2 text-[11px] text-(--muted) font-mono tracking-wide">
              {active === "drone" ? "Inhale... Exhale (8s breath cycle)" : "Steady focal frequency"}
            </p>
          </div>
        )}
      </div>

      {/* Grid of calming choices */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {sounds.map((sound) => {
          const isSelected = active === sound.id;
          return (
            <button
              key={sound.id}
              onClick={() => handleToggle(sound.id)}
              className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? "border-(--accent) bg-(--accent)/10 text-(--foreground)"
                  : "border-(--line) bg-(--field) text-(--muted) hover:border-(--muted) cursor-pointer"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none">{sound.emoji}</span>
                <span className="font-semibold text-sm text-(--foreground)">{sound.name}</span>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-(--muted-strong)">
                {sound.description}
              </p>
              <span className={`mt-3 self-end rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
                isSelected
                  ? "bg-(--accent)/20 text-(--accent) border-(--accent)/30"
                  : "bg-transparent text-(--muted) border-(--line)"
              }`}>
                {isSelected ? "Active" : "Play"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
