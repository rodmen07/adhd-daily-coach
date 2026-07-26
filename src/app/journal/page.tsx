"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { CalmEmptyState } from "@/app/components/empty-state";
import {
  JOURNAL_ENTRY_MAX_LENGTH,
  formatJournalDate,
  getJournalPrompt,
  localDateKey,
  type JournalEntry,
} from "@/lib/journal";
import { createJournalStore } from "@/lib/journal-store";

// Earlier entries surface in small, finite steps: never an endless feed.
const HISTORY_CHUNK = 7;

export default function JournalPage() {
  const { authUser } = useCoachAuth();
  const scope = authUser?.uid ?? "guest";

  // Mirrors the check-in store (v0.4): re-created on sign-in/out so the
  // unset-env default can resolve to Firestore for signed-in users. See
  // src/lib/journal-store.ts for the full resolution policy and its safe
  // local fallback.
  const signedIn = scope !== "guest";
  const journalStore = useMemo(
    () => createJournalStore(undefined, { signedIn }),
    [signedIn],
  );

  // Capture the day once at mount, like the daily affirmation, so the page
  // never swaps its date underneath a writer mid-session. A visit after
  // midnight simply starts the new day's blank page, and the previous entry
  // settles into the earlier-entries list. Nothing marks the days between.
  const [todayKey] = useState(() => localDateKey());

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(HISTORY_CHUNK);

  // Load (or reload) persisted entries whenever the auth scope (and so the
  // resolved store) changes. The store is async now that Firestore may be in
  // the mix, so this can no longer run synchronously in the render phase the
  // way the pre-sync version did; it follows the same effect + "active" guard
  // shape as use-coach-planner's hydration effect.
  useEffect(() => {
    let active = true;

    async function loadEntries() {
      // v0.13: bring a signed-out person's entries with them, before the
      // first read, so signing in never shows an empty journal while the
      // real entries sit in guest-scoped storage. Sequenced ahead of the
      // read exactly as planner-session.ts sequences the check-in migration
      // ahead of the weekly summary. A no-op for the guest scope, for an
      // empty guest journal, and after the first successful run.
      await journalStore.migrateGuestJournalEntries(scope);

      const loaded = await journalStore.listJournalEntries(scope);
      if (!active) {
        return;
      }
      setEntries(loaded);
      setDraft(loaded.find((entry) => entry.date === todayKey)?.text ?? "");
      setIsEditing(false);
      setVisibleCount(HISTORY_CHUNK);
    }

    void loadEntries();

    return () => {
      active = false;
    };
  }, [scope, todayKey, journalStore]);

  const todayEntry = entries.find((entry) => entry.date === todayKey) ?? null;
  const earlierEntries = entries.filter((entry) => entry.date !== todayKey);
  const visibleEarlierEntries = earlierEntries.slice(0, visibleCount);
  const prompt = getJournalPrompt(todayKey);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await journalStore.saveJournalEntry(todayKey, draft, scope);
    if (!saved) {
      return;
    }
    setEntries(await journalStore.listJournalEntries(scope));
    setDraft(saved.text);
    setIsEditing(false);
  };

  const handleStartEditing = () => {
    setDraft(todayEntry?.text ?? "");
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setDraft(todayEntry?.text ?? "");
    setIsEditing(false);
  };

  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="panel mb-5">
          <p className="eyebrow">Gratitude journal</p>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            A quiet page for today
          </h1>
          <p className="mb-4 text-sm leading-6 text-slate-700 sm:text-base">
            One small entry a day, only if you feel like it. Nothing here counts
            days, keeps score, or asks you to catch up.
          </p>

          {!todayEntry || isEditing ? (
            <form onSubmit={handleSave} aria-label="Today's journal entry">
              <label htmlFor="journal-entry" className="label">
                {prompt}
              </label>
              <textarea
                id="journal-entry"
                className="field min-h-28 text-sm"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={JOURNAL_ENTRY_MAX_LENGTH}
                placeholder="A few words are plenty."
              />
              <p className="field-hint mt-2">
                Write as little or as much as feels right. You can edit today&apos;s
                entry any time.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={draft.trim().length === 0}
                >
                  Save today&apos;s entry
                </button>
                {todayEntry ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleCancelEditing}
                  >
                    Keep it as it was
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <div aria-label="Today's saved entry">
              <p
                className="journal-saved-note"
                data-testid="journal-saved-note"
                aria-live="polite"
              >
                Saved for today. One grateful thought is plenty.
              </p>
              <div className="journal-entry-card mt-3">
                <p className="journal-entry-date">{formatJournalDate(todayEntry.date)}</p>
                <p className="journal-entry-text">{todayEntry.text}</p>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleStartEditing}
                >
                  Edit today&apos;s entry
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="panel" aria-label="Earlier entries">
          <h2 className="mb-3 text-xl font-semibold">Earlier entries</h2>
          {earlierEntries.length === 0 ? (
            <CalmEmptyState
              variant="journal"
              title="No earlier entries, and that is fine"
              message="Anything you save will rest here quietly. There is no order to keep and nothing to catch up on."
            />
          ) : (
            <>
              <ul className="journal-history">
                {visibleEarlierEntries.map((entry) => (
                  <li key={entry.date} className="journal-entry-card">
                    <p className="journal-entry-date">{formatJournalDate(entry.date)}</p>
                    <p className="journal-entry-text">{entry.text}</p>
                  </li>
                ))}
              </ul>
              {earlierEntries.length > visibleCount ? (
                <div className="mt-3">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setVisibleCount((count) => count + HISTORY_CHUNK)}
                  >
                    Show earlier entries
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
