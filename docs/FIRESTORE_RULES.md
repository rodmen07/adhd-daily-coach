# Firestore Security Rules for Focus (Calm Daily Coach)

Status: rules documented for the v0.4 sync-by-default flip (2026-07-19).
Extended in v0.9 (2026-07-20) with a `users/{uid}/journal/{entryId}` match
block ahead of the gratitude journal's Firestore sync adapter. Extended again
in v0.12 (2026-07-25) with a `users/{uid}/focusSessions/{sessionId}` match
block ahead of the focus-session sync adapter. Each of those sync features
shipped its code in the same PR as its rules block; the currently-live console
rules have neither a `journal` nor a `focusSessions` match block, so until
this ruleset is published, every such write the client attempts is denied by
Firestore's own deny-by-default posture and the adapters' fallback-on-error
paths (see [src/lib/journal-store.ts](../src/lib/journal-store.ts) and
[src/lib/focus-session-store.ts](../src/lib/focus-session-store.ts)) quietly
keep the entry or session on localStorage instead. No data loss, no visible
breakage, and no change in behavior until the user publishes the rules below.

> USER-ONLY: an agent cannot and must not deploy these rules. Publishing rules
> happens in the Firebase console (paid-account/console action):
> Firebase console -> Firestore Database -> Rules -> paste the ruleset below ->
> Publish. Until the user publishes them, whatever rules are currently live in
> the console apply, not this file.
>
> Related USER-ONLY step from docs/ROADMAP.md: confirm Firebase project quotas
> and billing before the v0.4 default flip goes live.

## What the client actually does

The static app touches exactly four paths, all keyed by the signed-in user's
Firebase Auth uid:

- `users/{uid}`: account document written by `upsertUserAccount` in
  [src/lib/firestore-user.ts](../src/lib/firestore-user.ts) (fields: `uid`,
  `email`, `displayName`, `createdAt`, `subscriptionStatus`) and read for the
  trial/membership panel.
- `users/{uid}/checkins/{checkinId}`: check-in documents created by
  `addFirestoreCheckin` and range-read by `getFirestoreWeeklySummary` in
  [src/lib/firestore-checkins.ts](../src/lib/firestore-checkins.ts) (fields:
  `date`, `focus`, `dose`, `minutes`, `status`, optional `skipReason`,
  `createdAt`). The app never updates or deletes a check-in.
- `users/{uid}/journal/{entryId}`: gratitude journal entries written by
  `addFirestoreJournalEntry` and listed by `listFirestoreJournalEntries` in
  [src/lib/firestore-journal.ts](../src/lib/firestore-journal.ts) (fields:
  `date`, `text`, `createdAt`, `updatedAt`). Unlike check-ins, the journal is
  one entry per calendar day, edited in place: the document id IS the local
  date key, so the app both creates new entries and updates existing ones,
  but never deletes one (no delete flow exists client-side).
- `users/{uid}/focusSessions/{sessionId}`: "one thing now" focus sessions
  written by `addFirestoreFocusSession` and listed by
  `listFirestoreFocusSessions` in
  [src/lib/firestore-focus-sessions.ts](../src/lib/firestore-focus-sessions.ts)
  (fields: `id`, `task`, `plannedMinutes`, `focusedSeconds`, `outcome`,
  `date`, `createdAt`). Append-only like check-ins: `/now` records a session
  only when the person deliberately closes it out, and no client flow ever
  edits or deletes one. The locally generated session id is the document id.

Everything else should be denied.

### v0.13 guest-to-account migration adds no path and no permission

The "bring your data with you" milestone
([docs/design/GUEST_DATA_MIGRATION.md](design/GUEST_DATA_MIGRATION.md)) copies
records a person created while signed out into their account on first
signed-in load. It writes through the two paths already listed above and
nothing else:

- Journal entries go through `addFirestoreJournalEntry`, the same function
  `/journal` already uses, so the copy is a `create` (or, for a date the
  account already holds, no write at all - the conflict guard skips it).
- Focus sessions go through `putFirestoreFocusSession`, which is the write
  half of `addFirestoreFocusSession` split out so an existing record keeps its
  own id, date, and creation time instead of being restamped. The document id
  is still the session id, and ids are minted per browser, so the account has
  never held the id being copied and the write is a `create`.

So **this milestone needs no rules change and no new console publish.** The
still-pending publish of the v0.9 `journal` block and the v0.12
`focusSessions` block is unchanged by it: until that happens, the migration
writes are denied exactly like every other Firestore write, the adapters fall
back to local storage, and the copy is retried on the next load because the
idempotency marker is only set after a clean run.

The field list above is not prose to be trusted: it is checked against the
`FocusSession` type in code by a drift guard
([src/lib/\_\_tests\_\_/firestore-focus-sessions.test.ts](../src/lib/__tests__/firestore-focus-sessions.test.ts)),
so adding a field to the type without documenting it here fails CI.

## Recommended ruleset (deny by default, per-uid isolation)

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    match /users/{uid} {
      allow read: if isOwner(uid);

      // A user may create their own account doc, but only in the free trial
      // state; entitlement cannot be self-granted from the client.
      allow create: if isOwner(uid)
        && request.resource.data.get("subscriptionStatus", "free_trial") == "free_trial";

      // Profile fields may change, but subscriptionStatus must stay whatever
      // it already is. Console/Admin writes bypass rules, so the manual
      // entitlement flip described in the roadmap keeps working.
      allow update: if isOwner(uid)
        && request.resource.data.get("subscriptionStatus", "free_trial")
           == resource.data.get("subscriptionStatus", "free_trial");

      allow delete: if false;

      match /checkins/{checkinId} {
        // Owner-only, append-only: the app creates and reads check-ins but
        // never edits or deletes them.
        allow read, create: if isOwner(uid);
        allow update, delete: if false;
      }

      match /journal/{entryId} {
        // Owner-only, edit-in-place: unlike check-ins, the journal is one
        // entry per day and the app edits today's entry in place (v0.7
        // product design), so both create and update are allowed. Deletion
        // stays denied: no delete flow exists client-side.
        allow read, create, update: if isOwner(uid);
        allow delete: if false;
      }

      match /focusSessions/{sessionId} {
        // Owner-only, append-only: /now records a closed-out session and
        // /trends reads them back, but no client flow edits or deletes one
        // (v0.12). Same posture as checkins, for the same reason.
        allow read, create: if isOwner(uid);
        allow update, delete: if false;
      }
    }

    // No other match blocks: every other path is denied by default.
  }
}
```

## Why these choices

- Deny by default: Firestore denies any path no rule matches, and this ruleset
  adds no catch-all allows. Only `users/{uid}` and its `checkins`, `journal`,
  and `focusSessions` subcollections are reachable, and only by that uid.
- Per-uid isolation: `request.auth.uid == uid` means signed-in users can only
  ever see and write their own data. Guests (no auth) get nothing; the app
  keeps them on local storage anyway per the resolution matrix in
  [src/lib/checkin-store.ts](../src/lib/checkin-store.ts).
- Append-only check-ins: the client has no edit/delete flows, so the rules do
  not grant them. This also limits blast radius if a session token leaks.
- Edit-in-place journal, still owner-only: `request.auth.uid == uid` gates
  `journal/{entryId}` exactly like `checkins/{checkinId}`, so one signed-in
  user can never read or write another user's private journal. `update` is
  granted (unlike check-ins) because the journal is deliberately one entry
  per day, edited in place, not append-only; `delete` stays denied because
  no delete flow exists client-side.
- Append-only focus sessions: `update` and `delete` are both denied because
  `/now` only ever creates a session and `/trends` only ever reads them
  (verified by grep across `src/`, not assumed: no edit or delete function
  for sessions exists anywhere in the client). A session record is also the
  one thing the product promises never to turn into a judgement, so the rules
  make it un-rewritable rather than merely un-rewritten.
- `subscriptionStatus` pinning: `Map.get("subscriptionStatus", "free_trial")`
  tolerates older account docs that predate the field while still preventing a
  client from flipping itself to `active`. Real entitlement flips stay a
  console/Admin action (USER-ONLY), which bypasses rules by design.

## Verifying after publish

1. In the console Rules Playground: simulate `get` and `create` on
   `users/UID_A/checkins/any` as `UID_A` (allow) and as `UID_B` (deny).
2. Simulate `update` on `users/UID_A` changing `subscriptionStatus` from
   `free_trial` to `active` as `UID_A` (deny).
3. Simulate `get`, `create`, and `update` on `users/UID_A/journal/any` as
   `UID_A` (allow) and as `UID_B` (deny); simulate `delete` on the same
   document as `UID_A` (deny - no delete flow exists client-side).
4. Simulate `get` and `create` on `users/UID_A/focusSessions/any` as `UID_A`
   (allow) and as `UID_B` (deny); simulate `update` and `delete` on the same
   document as `UID_A` (both deny - focus sessions are append-only).
5. In the app, sign in on the deployed site: the header badge should read
   `CLOUD SYNCED`, and a submitted check-in should appear under
   `users/{uid}/checkins` in the console Data tab.
6. Rollback lever if anything misbehaves: set the repository variable
   `NEXT_PUBLIC_CHECKIN_BACKEND` to `local` and re-run the Pages deploy; the
   app returns to local-only persistence without a code change.
