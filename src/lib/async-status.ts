/**
 * The transient page-level status a surface reports after an async step.
 *
 * `notice` (v0.28, docs/design/MIGRATION_DESTINATION.md D4) is the calm middle
 * the migration copy needed: nothing failed, so `error` would shout, and
 * nothing reached the account, so `ok` would lie. It renders through
 * `StatusMessage` with `tone="notice"`, which is `aria-live="polite"` and no
 * alert role - only an error claims the alert role.
 */
export type AsyncStatus =
  | { type: "idle" }
  | { type: "ok"; message: string }
  | { type: "notice"; message: string }
  | { type: "error"; message: string };
