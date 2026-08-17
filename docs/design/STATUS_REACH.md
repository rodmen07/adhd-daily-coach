# v0.31 - The last inline voice: the status vocabulary reaches the components

**Status:** DEFINED 2026-08-17 on `8ad1a1b` (role=product, wave). Not started.
Every decision below is an overridable default; section 6 is empty until the
owner writes in it.

**Product rules this milestone is held to:** no streaks, no infinite feeds, no
pressure mechanics; calm, ADHD-friendly tone. Nothing here changes what any
sentence says or adds a surface - it changes who renders three existing
sentences and how far the guard that keeps errors audible can see.

---

## 1. The finding, read at the source (not inherited)

v0.21 put every *page-level* transient status behind one `StatusMessage`
primitive whose politeness is derived from its tone, and
`status-message-guard.test.ts` is what keeps that vocabulary closed. But the
guard's corpus is `page.tsx` files ONLY, by its own declared intent
(`src/app/__tests__/status-message-guard.test.ts:35-37`, quoted verbatim
because this milestone reverses it):

> `role="alert"` stays legal inside `src/app/components/`, where
> `reminder-settings.tsx`'s field-level validation lives (out of scope by D5,
> and out of this scan by construction).

PR #184 proved the consequence rather than arguing it: with `role="alert"`
spelled inline in a component, the guard came back green, 4 passed. The
backlog item filed then (2026-08-12) says widening is "a re-decision against a
written intent, not a repair of an oversight" and needs its own increment with
its own answer per site. This milestone is that increment.

**The census, run this pass** (`grep -n 'aria-live\|role="alert"\|role="status"'
src/app/components/*.tsx`, comments excluded by reading each hit):

| Site | What it is | Verdict |
| --- | --- | --- |
| `reminder-settings.tsx:248` | `draftStatus.type === "ok"` -> hand-spelled `text-sm text-emerald-700` + `aria-live="polite"` | **delegate (D1)** - this is an `AsyncStatus`, the exact type `StatusMessage` was built for |
| `reminder-settings.tsx:253` | `draftStatus.type === "error"` -> hand-spelled `text-sm text-rose-700` + `role="alert"` + `aria-live="assertive"` | **delegate (D1)** - the LAST inline alert in the shipped tree |
| `reminder-settings.tsx:277` | `calendarSaved` -> hand-spelled `text-sm text-emerald-700` + polite | **delegate (D2)** - same success voice, hand-copied a third time |
| `reminder-settings.tsx:200,207` | notification-permission explainers, `field-hint` + polite | keep (D3) - hint vocabulary, explanatory prose, no tone pair |
| `reminder-settings.tsx:289` | the reminder nudge, a bordered box with a Dismiss button | keep (D3) - an interactive surface, not a status line |
| `theme-toggle.tsx:83` | `role="status"` confirmation, `.theme-toggle-confirmation` | keep (D3) - its own deliberate pattern; the alert scan cannot fire on it |
| `swipe-step-card.tsx:116` | swipe hint, polite | keep (D3) - instruction, not an outcome |
| `AffirmationCard.tsx:36` | the affirmation text, polite | keep (D3) - content, not status |
| `workspace-export-panel.tsx:112` | `<StatusMessage tone="notice">` | already correct - **the existence proof that components can consume the vocabulary** (v0.29 PR2) |
| `auth-message.tsx:34` | thin delegate fixing `tone="error"` | already correct since v0.21 PR1 |

**Two premises of the filing item have drifted, and the corrections narrow the
milestone (re-derived at source, receipts inline):**

1. The item says `auth-message.tsx` "spell[s] `role="alert"` inline today".
   False on this tree: `grep -n 'role="alert"' src/app/components/auth-message.tsx`
   hits only line 16, a comment, and the component has been a thin
   `StatusMessage` delegate since v0.21 PR1 (#152). Nothing to answer there
   beyond recording the drift.
2. The item warns of a "two-guard contradiction" with `auth-message-contract`,
   said to grep that file for the alert literal. Also stale:
   `auth-message-contract.test.ts:117` now asserts the file *delegates to the
   shared status primitive* - the contract follows the delegation, so widening
   this guard contradicts nothing.

**Why the widened scan needs no allowlist at all** (the fact that makes this
milestone small): the guard's matcher is `withoutComments(source).includes('role="alert"')`.
On this tree the literal appears in components only in comments
(`status-message.tsx:29`, `workspace-export-panel.tsx:43`, `auth-message.tsx:16`)
plus the ONE live site at `reminder-settings.tsx:253`. Even the primitive
itself does not match: it writes `role: "alert"` in a semantics table
(`status-message.tsx:44`) and renders `role={role}` (`:84`). After PR1
delegates the live site, the widened corpus is clean with an empty exception
list - except for the one named exemption D4 keeps as a shield, below.

## 2. Decisions (each an overridable default)

**D1. `reminder-settings.tsx`'s `draftStatus` pair delegates to
`StatusMessage`.** The ok branch becomes `tone="success"`, the error branch
`tone="error"`, each with a `data-testid` (`reminder-draft-ok`,
`reminder-draft-error`). This is byte-compatible on every rendered attribute,
proven from the primitive's own tone table (`status-message.tsx:43-47`):
success renders `text-sm text-emerald-700` + `aria-live="polite"`; error
renders `text-sm text-rose-700` + `role="alert"` + `aria-live="assertive"` -
exactly the classes and semantics the inline copies hand-spell today. No copy
changes; no shade changes; the calm tone is preserved by construction.

**D2. The `calendarSaved` line delegates too** (`tone="success"`,
`data-testid="reminder-calendar-saved"`). It is a boolean today, so the call
site passes the existing sentence as the message when saved and `null`
otherwise - `StatusMessage` renders nothing for an empty message, which is the
primitive's own contract. Alternative if overridden: leave it inline and D4's
scan still passes (it carries no alert role), but then the success voice keeps
two spellings and the next editor copies the wrong one.

**D3. Everything else in the census stays as it is, by name.** The two
permission explainers and the swipe hint are the *hint* vocabulary
(`field-hint`), the nudge is an interactive surface with a Dismiss button, the
theme confirmation is a deliberate `role="status"` pattern with its own
class, and the affirmation is content. None of them carries a tone pair, none
can trip the alert scan, and forcing them through `StatusMessage` would trade
real vocabularies for a false uniformity. They are listed here so the next
reader knows they were surveyed and kept rather than missed.

**D4. The guard corpus widens from `page.tsx`-only to pages PLUS
`src/app/components/*.tsx`, with `status-message.tsx` exempted BY NAME.** The
filter gains the component form beside the page form, and the exemption list
holds exactly one entry - the primitive itself, with the reason in the code:
it is the vocabulary, and the one file allowed to say `role="alert"` (today it
happens not to match the literal because it renders through a semantics table,
but the exemption is a shield against the day that indirection is refactored
away, not a description of the present). The exemption asserts the file still
exists, the same anti-rot shape `route-door-census` uses for its exclusions.

**D5. The guard's header clause is rewritten in the SAME commit that widens
the corpus.** The sentence quoted in section 1 is the recorded intent this
milestone reverses; leaving it beside a widened scan would make the file
disagree with itself. The old sentence stays grep-recoverable here (section 1
quotes it verbatim), which is the tombstone convention for a system-facing
document - the code comment itself is rewritten clean per L-070's
audience-scoping.

**D6. Order: delegation (PR1) before widening (PR2), and the widened scan's
red is proven against the PRE-PR1 tree.** The widened corpus is red on
today's tree - `reminder-settings.tsx:253` is a live match - so shipping the
guard first would introduce a red gate on its own PR. PR2 instead lands the
widened scan green and proves it CAN fire by running it against the pre-PR1
tree (or equivalently a control that restores the inline pair), quoting the
red naming exactly `src/app/components/reminder-settings.tsx`. Same
green-on-arrival, red-on-the-past shape v0.30 D7 used for the voice guard.

**D7. Blindness anchors for the widened scan, named as files.**
`reminder-settings.tsx` joins the anchor list (it is the file this widening
was written for), alongside the existing page anchors; the corpus floor
assertion extends so a walker gone blind to the components directory reddens
the anchor test rather than passing on a shorter list.

**D8. No PR in this milestone adds or removes a `.test.ts` under
`src/__tests__` or `src/app/__tests__`, so the roadmap's guard-suite word
stays Twenty-five in both PRs and no count obligation is schedulable in
either direction** (the L-042 check, made at definition time). PR1 extends
`src/app/components/__tests__/reminder-settings.test.tsx` - a `.tsx` suite in
a directory `roadmap-guard-count`'s census does not scan, and its name does
not even end in `.test.ts`. PR2 edits the existing
`status-message-guard.test.ts` in place.

## 3. What each PR ships

**PR1 (dev): the delegation.** `reminder-settings.tsx` loses all three
hand-spelled status lines to `StatusMessage` (D1, D2). The existing
`reminder-settings.test.tsx` gains rendered-DOM assertions in BOTH directions
per surface: the error branch renders `role="alert"` with assertive politeness
and the exact message; the ok branches render politely with NO alert role; and
the stays-silent direction (no status, no calendar save) renders none of the
testids. A consumer-perturbing control (L-054): with the implementation
committed, flipping the call site's `tone="error"` to `tone="notice"` reds the
rendered-DOM error assertions while everything still paints - proving the
politeness assertions bind behaviour rather than decoration.

**PR2 (dev): the widened guard, then the close.** `status-message-guard.test.ts`
gains the component corpus (D4), the named exemption, the anchor (D7), and the
rewritten header (D5), all in one commit; controls per done-when 4-6. Then the
close in the same PR: `### v0.31` heading to DONE, `package.json` to `0.31.0`
with both `package-lock.json` copies, and the Current-state version sentence,
all in one commit.

## 4. Chosen over (each reason re-read at its source this pass)

- **The theme key's three spellings** (filed 2026-08-11 by PR #182): a real
  one-home-rule candidate, but a *storage-key* contract, not a status voice -
  a different subject with its own open item and close condition, sized like
  the onboarding fix. Bundling it here would put two unrelated guards in one
  milestone. Still open, unchanged.
- **`/focus`'s two controls for one value** (filed 2026-08-10 by PR #180): the
  `sr-only` `<select>` is still beside the announcing chips - re-verified
  `grep -n 'setFocus' src/app/focus/page.tsx` still returns both the chip
  `onClick` and the select `onChange`. An owner taste call by the item's own
  words; not decidable inside a milestone definition.
- **The C10-flagged `route-registry-guard.test.ts` split**: re-measured this
  pass, `wc -l` = 1036, unchanged. A refactor-trigger increment with the
  stricter behaviour-preserving bar; its first slice is a commit-share
  measurement, not a milestone.
- **Import/restore**: `WORKSPACE_EXPORT.md` section 5's condition quoted
  verbatim rather than summarised (the 2026-08-12 inversion is the standing
  warning): "reopen when an owner asks for restore, or when a support question
  arrives that only restore answers - not merely because the exporter exists."
  No owner has asked; no support question exists. Stays deferred.
- **FCM push**: the VAPID key is minted in the Firebase console and console
  actions are USER-ONLY; structural, unchanged.
- **A PR template**: `ls .github/PULL_REQUEST_TEMPLATE*` still errors; one
  file of repo hygiene, not a milestone.

## 5. What this milestone deliberately does not do

No copy changes anywhere. No new route, no new panel, no new setting. The D3
sites are not delegated and not re-decided. The `/` planner sentence stays
untouched behind its own owner-gated item. The success/notice half of the
vocabulary stays unguarded in pages exactly as the original guard header
argues (a calm note without a live region is a smaller defect than an
unheard error), and this milestone takes no position on it.

## 6. Owner decisions

(Empty. Every D above is the default unless overridden here.)
