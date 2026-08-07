/**
 * The one way this app shows a person that something just happened.
 *
 * Page-level transient status - a migration ran, a check-in saved, sign-in
 * failed, a feature is unconfigured - was spelled inline on every surface that
 * needed it, and the copies had already drifted apart in three separate ways
 * (`docs/design/STATUS_VOCABULARY.md` section 1, re-read at source 2026-08-07):
 *
 * - `/`'s "Google login is not configured yet" notice had no `role` and no
 *   `aria-live` at all, so it was shown and never announced;
 * - `/execute` had grown a second tone system on the `.status-banner` class,
 *   every shade one step darker than the rest of the app (`-800` against
 *   `-700`), plus a neutral `text-slate-800` advice line that belonged to no
 *   vocabulary;
 * - `/now` and `/trends` render only the success branch of the same
 *   `AsyncStatus`, so a failed migration there is silent (v0.21 PR2's fix).
 *
 * Politeness is DERIVED from `tone` rather than passed in. That is the whole
 * point of having a vocabulary: two call sites cannot disagree about how urgent
 * an error is, and a new surface cannot ship an error that whispers politely.
 *
 * The tone classes are a contract with `globals.css`, not decoration. Each of
 * `text-rose-700`, `text-emerald-700` and `text-amber-700` is a selector the
 * stylesheet hangs an `html[data-theme="dark"]` override on (`globals.css:110`,
 * `:116`, `:120`), so swapping one for a neighbouring shade silently drops the
 * dark-theme override on every consumer at once.
 *
 * `src/app/__tests__/status-message-guard.test.ts` fails when a page file
 * spells `role="alert"` inline again, which is how the vocabulary stays closed
 * rather than staying closed by memory.
 */

export type StatusTone = "success" | "error" | "notice";

type ToneSemantics = {
  /** The class `globals.css` hangs this tone's dark-theme override on. */
  className: string;
  /** Only an error claims the alert role; the rest are announced quietly. */
  role?: "alert";
  politeness: "assertive" | "polite";
};

const TONE_SEMANTICS: Record<StatusTone, ToneSemantics> = {
  error: { className: "text-rose-700", role: "alert", politeness: "assertive" },
  success: { className: "text-emerald-700", politeness: "polite" },
  notice: { className: "text-amber-700", politeness: "polite" },
};

type StatusMessageProps = {
  tone: StatusTone;
  /** Empty, null or undefined means there is nothing to say, and nothing renders. */
  message: string | null | undefined;
  /** `/execute`'s celebratory variant, layered on the shared `.status-banner`. */
  celebrate?: boolean;
  /** Spacing and layout only (`mt-3`, `status-banner mt-2`). Never a tone. */
  className?: string;
};

export function StatusMessage({ tone, message, celebrate = false, className }: StatusMessageProps) {
  if (!message) {
    return null;
  }

  const { className: toneClass, role, politeness } = TONE_SEMANTICS[tone];

  return (
    <p
      className={[className, "text-sm", toneClass, celebrate ? "status-celebrate" : null]
        .filter(Boolean)
        .join(" ")}
      role={role}
      aria-live={politeness}
    >
      {message}
    </p>
  );
}
