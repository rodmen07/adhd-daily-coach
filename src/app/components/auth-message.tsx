/**
 * The one way this app tells a person that signing in failed.
 *
 * `useCoachAuth` is a plain hook, not a context, so every component that calls
 * it owns a private copy of `authMessage`. Until v0.15 exactly one of the three
 * routes that call `signInWithGoogle` rendered that copy: `/` did, while
 * `/focus` and `/pricing` destructured the hook without it and dropped the
 * message on the floor. A sign-in failure that does not self-recover through
 * the redirect fallback therefore produced, on those two pages, nothing at all
 * - no text, and nothing announced.
 *
 * The markup below is `/`'s paragraph moved verbatim, class string included:
 * `text-rose-700` is not decorative, it is the class `globals.css` hangs the
 * dark-theme override `html[data-theme="dark"] .text-rose-700` on, so changing
 * it here would silently drop that override on every consumer at once.
 *
 * `role="alert"` plus `aria-live="assertive"` is the accessibility contract,
 * not a detail: the two pages that gain this paragraph gain the announcement
 * with it. `src/__tests__/auth-message-contract.test.ts` fails when a `.tsx`
 * under `src/app` calls `signInWithGoogle` without rendering this component, so
 * a fourth sign-in surface cannot repeat the original defect quietly.
 */

type AuthMessageProps = {
  /** The hook's `authMessage`. Empty means there is nothing to announce. */
  message: string | null | undefined;
};

export function AuthMessage({ message }: AuthMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <p className="mt-3 text-sm text-rose-700" role="alert" aria-live="assertive">
      {message}
    </p>
  );
}
