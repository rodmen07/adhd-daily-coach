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
 * Since v0.21 the markup itself lives one level down, in `StatusMessage`: this
 * component is a thin delegate that fixes the tone at `error` and the spacing
 * at `mt-3`, so the auth surface keeps a name of its own (which is what the
 * contract guard scans for) while the paragraph, its `text-rose-700` dark-theme
 * contract and its `role="alert"` + `aria-live="assertive"` semantics are
 * shared with every other page-level status in the app.
 *
 * `src/__tests__/auth-message-contract.test.ts` fails when a `.tsx` under
 * `src/app` calls `signInWithGoogle` without rendering this component, so a
 * fourth sign-in surface cannot repeat the original defect quietly. Its
 * accessibility assertions now follow the delegation, reading this file for the
 * link and `status-message.tsx` for the semantics.
 */

import { StatusMessage } from "@/app/components/status-message";

type AuthMessageProps = {
  /** The hook's `authMessage`. Empty means there is nothing to announce. */
  message: string | null | undefined;
};

export function AuthMessage({ message }: AuthMessageProps) {
  return <StatusMessage tone="error" className="mt-3" message={message} />;
}
