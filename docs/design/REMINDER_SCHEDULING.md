# Reminder Scheduling Design (v0.2 PR2)

Status: DRAFT FOR USER REVIEW - docs only, no behavior change. Written 2026-07-19.

This document is the v0.2 deliverable that gates the
[v0.3 Reminder delivery v1 milestone](../ROADMAP.md#v03---reminder-delivery-v1-target-week-of-2026-08-01)
in [docs/ROADMAP.md](../ROADMAP.md). It enumerates every realistic way a static
GitHub Pages app can deliver a daily reminder, scores them honestly, recommends
one path, and slices the v0.3 implementation into PR-sized work.

## 1. Context and hard constraints

- The app is a Next.js static export on GitHub Pages, served under the repo-name
  subpath (`https://rodmen07.github.io/<repo-slug>/`, today
  https://rodmen07.github.io/calm-daily-coach/). There are **no server routes**
  and no place to run resident backend code. Anything "scheduled" must run in
  the user's browser, in someone else's cloud, or in the user's own tools
  (mail app, calendar app).
- Optional Firebase exists: Google auth plus a
  `NEXT_PUBLIC_CHECKIN_BACKEND=local|firestore` check-in store with automatic
  local fallback ([src/lib/checkin-store.ts](../../src/lib/checkin-store.ts)).
  The Firebase project is currently on the free Spark plan.
- Product rules (non-negotiable, from [docs/ROADMAP.md](../ROADMAP.md) and
  [README.md](../../README.md)): calm and ADHD friendly, **opt-in only**, no
  streak pressure, no guilt or escalation mechanics, no infinite feeds, daily
  dose cap enforced. For reminders this means at most **one** gentle nudge per
  day, easy to turn off, and copy that never overstates what the app does.
- Monetization is a single $5/month membership. Infra cost must stay near zero
  or be an explicit, user-approved decision.

## 2. What exists today (shipped in PR #71)

The settings surface is already built; only the delivery mechanism is open.

- [src/app/components/reminder-settings.tsx](../../src/app/components/reminder-settings.tsx)
  (`ReminderSettingsPanel`): opt-in checkbox, daily time picker, and a channel
  radio group (`browser` or `email`). Preferences persist per user scope in
  localStorage via
  [src/lib/reminder-preferences.ts](../../src/lib/reminder-preferences.ts)
  (`ReminderChannel = "browser" | "email"`, default off at 18:00).
- Browser channel: an **in-session nudge**. A `setTimeout` computed by
  [src/lib/reminder-schedule.ts](../../src/lib/reminder-schedule.ts)
  (`msUntilNextOccurrence`) shows an inline dismissible banner at the chosen
  time, but only while the tab is open.
- Email channel: opens a prefilled `mailto:` draft
  ([src/lib/reminder-draft.ts](../../src/lib/reminder-draft.ts)). The user
  presses send themselves.
- The panel copy promises: "ADHD Daily Coach never sends anything
  automatically." Whatever v0.3 ships, the copy must remain exactly true.
- Dead code note (RESOLVED 2026-07-26, PR #119): `src/lib/mailer.ts` was a
  leftover nodemailer SMTP helper from before the static-export decision.
  Nothing imported it and the static site could not run it, so it and the
  nodemailer dependency were deleted once this design settled the question it
  was waiting on (see the PR 3 rider in section 6).

## 3. Delivery options

### Option 1: Client-side only (in-session nudge plus Notification API)

How it works: keep the existing in-session banner and upgrade the browser
channel to request `Notification` permission and show an OS-level notification
at the chosen time whenever a tab with the app is open (foreground or
background). No service worker push, no server.

Strengths:

- Zero infrastructure, zero new accounts, zero cost.
- Best possible privacy: preferences never leave localStorage; no tokens, no
  addresses, nothing stored anywhere else.
- Perfect product-rules fit: quiet, opt-in, trivially reversible.
- Small implementation on top of code that already ships.

Honest limits:

- **No delivery when the browser or tab is closed.** True background push on
  the open web requires a push service subscription
  (`PushManager.subscribe`) and a server that sends to it; GitHub Pages has no
  such server, so this ceiling is structural, not an implementation gap.
- Background tabs are timer-throttled (Chromium clamps timers in hidden tabs,
  aggressively after long inactivity), so the nudge can land minutes late; the
  timer should re-check on `visibilitychange` to fire promptly when the user
  returns.
- Service worker scope: a project Pages site lives under the repo-name
  subpath (whatever the repo is called), so any service worker must be served from
  inside the exported subpath and can only control that scope. Fine for this
  app, but worth knowing before anyone reaches for SW-based tricks.
- iOS Safari: the Notification API is unavailable in ordinary Safari tabs.
  Notifications require iOS 16.4+ **and** the site installed to the Home
  Screen as a web app. In practice iPhone users get the inline banner only.

Cost and decisions: none.

### Option 2: Web Push via Firebase Cloud Messaging plus a scheduled Cloud Function

How it works: add a `firebase-messaging` service worker, obtain an FCM token
per opted-in browser, store token plus reminder time plus timezone in
Firestore, and run a Cloud Scheduler job triggering a Cloud Function every 10
to 15 minutes that queries users who are due and sends one push each.

Strengths:

- The only option that delivers a real notification with the site fully
  closed, on Android, Windows, macOS, and Linux browsers.
- Reuses the Firebase project and auth that already exist; per-user times and
  the single-daily-nudge rule are easy to enforce server-side.
- FCM message delivery itself is free at any plausible scale.

Honest limits:

- **Requires the Blaze (pay as you go) billing plan** because Cloud Functions
  and Cloud Scheduler are not available on Spark. Expected real cost at this
  scale rounds to $0/month, but it attaches a credit card to the project and
  creates an unbounded-cost surface that needs budget alerts. This is a user
  cost decision, not an agent decision.
- Reliability is good but not perfect: FCM tokens go stale and need refresh
  and pruning; OS battery optimizers can delay delivery; iOS again requires
  16.4+ plus Home Screen install, so iPhone coverage stays partial.
- Privacy posture is the weakest of the viable options: push tokens and
  reminder schedules live in Firestore, and every notification transits
  Google's push infrastructure. Payloads can be kept content-free ("time for
  today's plan"), but metadata (who gets nudged when) exists off-device.
- Largest implementation: SW plus token lifecycle plus Firestore schema and
  security rules plus Function plus Scheduler plus deploy tooling; realistic
  size is 3 or more PRs and a new deploy pipeline outside GitHub Pages.
- Calm-UX risk: OS push is the pushiest channel we could adopt. Acceptable
  only because it stays strictly opt-in and once daily, but it is the easiest
  channel to erode trust with.

Cost and decisions: user must approve Blaze billing and budget alerts before
any work starts.

### Option 3: GitHub Actions cron plus email delivery

How it works: a scheduled workflow (`on: schedule`) runs daily, reads a list
of opted-in recipients and their preferred times, and sends email through a
third-party provider using repo secrets. Echoes the dead `src/lib/mailer.ts`
nodemailer path (deleted 2026-07-26 in PR #119 once this option was rejected),
resurrected inside CI instead of a server.

Strengths:

- No new cloud project; Actions minutes are free for public repos.
- Email works on every device with no browser or OS caveats.

Honest limits:

- **Recipient storage is the killer.** Addresses must live somewhere the
  workflow can read:
  - In the repo: unacceptable. The repo is public and PII would sit in git
    history forever.
  - In repo secrets: does not scale past the single owner and has no per-user
    opt-out surface.
  - In Firestore: workable technically, but it puts a service-account secret
    in CI that can read every user's email address, a broad standing
    credential in a third-party CI runner. Send logs also leak recipient
    activity into workflow logs unless carefully masked.
- Needs an email provider account and its limits: for example Resend (about
  3,000/month free), SendGrid (about 100/day free), Postmark (about
  100/month free). Small senders also fight spam-folder deliverability.
- GitHub cron is honest-best-effort: UTC only, minimum 5-minute granularity,
  routinely delayed 3 to 30+ minutes under load, and scheduled workflows are
  auto-disabled after 60 days without repo activity. Per-user local times need
  timezone bookkeeping the current preferences do not store.
- Product-rules tension: an unattended system emailing users is the exact
  opposite of "ADHD Daily Coach never sends anything automatically." The copy
  would need a rewrite, and unsubscribe handling becomes a compliance obligation
  (CAN-SPAM/GDPR style), all for the least calm channel.

Cost and decisions: user must pick and provision an email provider, accept
PII-in-CI, and approve the copy change. Not recommended (see scoring).

### Option 4: Calendar-based (.ics file per user preferences)

How it works: when the user picks the calendar channel, the client generates
an iCalendar file entirely in the browser from the existing preferences: one
`VEVENT` with `RRULE:FREQ=DAILY` at the chosen time and a `VALARM` display
alarm, offered as a download (`adhd-daily-coach-reminder.ics`). The user imports it
once into Google Calendar, Apple Calendar, Outlook, or anything else, and
**their own calendar app does the reminding**, forever, on every device they
own, with the browser and site closed.

Strengths:

- Zero infrastructure, zero accounts, zero cost, works offline after import.
- No push service, no tokens, no stored addresses: nothing about the user
  leaves the device. Best privacy of any option, tied with Option 1.
- Respects calm and opt-in perfectly: the user explicitly imports the event,
  controls snooze/mute/delete natively in their calendar, and the app never
  contacts anyone. The "never sends anything automatically" copy stays true
  verbatim.
- Reliability is excellent: calendar alarms are first-class OS citizens on
  iOS, Android, and desktop, including the iPhones that Options 1 and 2
  cannot reach.
- Small implementation: a pure ics-generation lib plus one new channel in
  `ReminderSettingsPanel`. Highly unit-testable.

Honest limits:

- **No dynamic per-day content.** The event body is static ("Time for today's
  plan" plus a link back to the app); it cannot carry that day's generated
  plan. A live-updating feed would require a per-user `webcal://` URL
  rendered server-side, which a static Pages site cannot do. What we ship is
  a one-time import, not a true subscription; the "subscription feed" framing
  only becomes real if a backend ever exists.
- Changing the reminder time means downloading and importing a fresh file and
  deleting the old event (the file can reuse a stable `UID` so re-import
  updates in place in most clients, but "most" is doing work there; behavior
  varies).
- Floating local times (no `TZID`) ring at local wall-clock time in most
  clients, which is what we want, but Google Calendar pins floating times to
  the calendar's home timezone. Acceptable; document it.
- The app cannot see whether the import happened; settings copy must not
  claim a reminder "is set", only that a file was generated.

Cost and decisions: none. No billing, no provider, no console work.

### Option 5: Hybrids worth considering

- **Calendar plus client-side (Option 4 + Option 1):** the .ics covers
  out-of-app delivery on every platform; the upgraded Notification API covers
  in-app moments when a tab is open. Combined they cover the realistic daily
  loop with zero infra. This is the recommended shape (Section 5).
- **Actions cron plus FCM (a leaner Option 3/2 mix):** GitHub Actions calling
  the FCM HTTP v1 API directly avoids Blaze (no Cloud Function), but it still
  needs token storage readable from CI, inherits cron drift, and keeps the
  broad-credential problem. Noted for completeness; not pursued.
- **FCM later (Option 4 now, Option 2 behind a future decision):** nothing in
  the calendar path forecloses adding real push in v0.4+ if the user approves
  Blaze. The channels are additive behind the existing radio group.

## 4. Scoring

Scale: High is best for the product; Small is best for implementation size.

| Option | Product rules fit | Infra cost | Privacy | Reliability | Implementation size |
|---|---|---|---|---|---|
| 1 Client-side only | High | None | High | Low (tab must be open) | Small |
| 2 FCM push + Function | Medium | Blaze required (about $0 but card on file) | Medium | Medium-High (weak on iOS) | Large (3+ PRs) |
| 3 Actions cron + email | Low (breaks "never sends" promise; PII in CI) | None to low | Low | Medium (cron drift, spam) | Medium |
| 4 Calendar .ics | High | None | High | High (after one import) | Small |
| 5a Hybrid 4 + 1 | High | None | High | Medium-High | Small-Medium (2 PRs) |

## 5. Recommendation

**Ship Hybrid 5a for v0.3: the .ics calendar channel (Option 4) as the real
out-of-app delivery mechanism, plus upgrading the existing browser channel to
the OS Notification API while a tab is open (Option 1).** It is the only path
that gives every user, including iPhone users, a reliable daily nudge with
zero infrastructure, zero recurring cost, zero new privacy surface, and no
change to the "ADHD Daily Coach never sends anything automatically" promise.
Option 2
(FCM push) is explicitly deferred, not rejected: it stays on the table as a
future milestone if the user later approves Blaze billing. Option 3 (cron
email) is rejected outright: it stores PII in CI, fights spam filters, and
contradicts the product's core promise for the least calm channel available.

## 6. Phased v0.3 plan (PR-sized slices)

Matches the one-or-two-PR milestone sizing in
[docs/ROADMAP.md](../ROADMAP.md); PR 3 is an optional cleanup rider.

**PR 1: Calendar channel (the substance).**

- New pure lib `src/lib/reminder-ics.ts`: build a valid VCALENDAR string from
  `ReminderPreferences` (stable `UID`, `RRULE:FREQ=DAILY`, floating local
  `DTSTART` from the chosen `HH:MM`, `VALARM` display alarm, correct CRLF
  line endings, 75-octet line folding, text escaping) plus a small
  download-trigger helper.
- Extend `ReminderChannel` with `"calendar"` in
  [src/lib/reminder-preferences.ts](../../src/lib/reminder-preferences.ts).
  Note: `loadReminderPreferences` currently coerces unknown channels to
  `"browser"`, so old clients reading a new value degrade safely; keep that
  behavior.
- Add the third radio option and a "Download calendar reminder (.ics)" action
  to [ReminderSettingsPanel](../../src/app/components/reminder-settings.tsx),
  with honest copy: the file was generated, importing it is the user's step,
  and their calendar app does the reminding.
- Update README "Email reminders" section to a "Reminders" section covering
  all three channels truthfully.

**PR 2: Browser channel upgrade (Notification API).**

- On selecting the browser channel, offer (never auto-trigger) a permission
  request; when granted, fire an OS notification at the scheduled time while
  any app tab is open, falling back to the existing inline banner when
  permission is denied, undecided, or unsupported (iOS Safari tabs).
- Harden scheduling against background-tab throttling: re-evaluate
  `msUntilNextOccurrence` on `visibilitychange` and cap drift.
- One nudge per day maximum across banner and notification; dismissal is
  final for the day. No re-prompts for permission after a denial.
- Update copy and reminder tests so shipped behavior and words match exactly
  (the v0.3 "done when" condition).

**PR 3 (optional rider): dead-code removal. SHIPPED 2026-07-26 as PR #119**
(DevSecOps stream, not as a rider on v0.3).

- Delete `src/lib/mailer.ts` and the nodemailer dependency, per the existing
  "Later / candidates" item. This design settles the question it was waiting
  on: the email-cron path is rejected.

## 7. User decisions needed

- **To ship the recommendation: none.** No billing, no email provider, no
  console actions. The .ics and Notification API paths are entirely
  client-side. The only gate is sign-off on this document.
- **Explicitly deferred decision (only if push is wanted later):** approve
  Firebase Blaze billing plus budget alerts to unlock Option 2 in a future
  milestone.
- **Closed by this design (no decision required):** choosing an email
  provider and a recipient-storage location; Option 3 is rejected.

## 8. Testing strategy

- **Unit (Vitest, PR 1):** `reminder-ics.ts` output structure
  (BEGIN/END blocks, `RRULE:FREQ=DAILY`, `DTSTART` matching the chosen time,
  `VALARM` present, stable `UID` across regenerations, CRLF endings, line
  folding, escaping of commas/semicolons/newlines in summary text); channel
  round-trip in `reminder-preferences.ts` including legacy-value coercion.
- **Component (PR 1):** third radio renders, selecting it shows the download
  action, the generated blob/filename is correct, and no copy claims a
  reminder "is set".
- **Unit and component (PR 2):** mock the `Notification` global for
  granted/denied/default/unsupported paths; assert inline-banner fallback,
  single-nudge-per-day invariant, and `visibilitychange` re-arm behavior in
  `reminder-schedule` tests.
- **Manual import matrix (PR 1 checklist, one-time):** import the generated
  file into Google Calendar web, Apple Calendar (iOS), and Outlook; confirm
  the daily alarm fires and note the Google floating-time caveat in the PR.
- **Copy truth check (both PRs):** keep and extend the existing tests
  asserting the "never sends anything automatically" language so the promise
  and the code cannot drift apart.
- E2E stays out of scope until the Playwright smoke test lands (ROADMAP
  "Later / candidates").

## 9. References

- [docs/ROADMAP.md](../ROADMAP.md): v0.2 (this doc), v0.3 (implementation it
  gates), product rules, dead-mailer cleanup item.
- [src/app/components/reminder-settings.tsx](../../src/app/components/reminder-settings.tsx):
  `ReminderSettingsPanel`, the UI all channels hang off.
- [src/lib/reminder-preferences.ts](../../src/lib/reminder-preferences.ts),
  [src/lib/reminder-schedule.ts](../../src/lib/reminder-schedule.ts),
  [src/lib/reminder-draft.ts](../../src/lib/reminder-draft.ts): current
  reminder logic.
- [src/lib/checkin-store.ts](../../src/lib/checkin-store.ts): the
  local/Firestore backend pattern any future FCM work would follow.
- `src/lib/mailer.ts`: dead nodemailer path, removed 2026-07-26 in PR #119.
- [README.md](../../README.md): product rules and current reminder copy.
