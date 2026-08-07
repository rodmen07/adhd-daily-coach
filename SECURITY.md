# Security policy

## Supported versions

ADHD Daily Coach ships continuously from `main`. Every merge builds the static
export and deploys it to GitHub Pages, and no release or maintenance branches
are kept, so at any moment there is exactly **one** supported version: the build
currently served at <https://rodmen07.github.io/adhd-daily-coach/>, which is
whatever `package.json` reads on `main`.

Older builds are not patched and are not hosted anywhere, so there is no
back-porting policy: there is nothing to back-port to.

This document deliberately names no version number. The number lives in
`package.json`, and `src/__tests__/security-policy-truth.test.ts` runs inside
the quality gate and fails if this file ever claims a version that disagrees
with it.

## Reporting a vulnerability

Please report privately rather than in a public issue:

**<https://github.com/rodmen07/adhd-daily-coach/security/advisories/new>**

Private vulnerability reporting is enabled on this repository, so that form
opens a draft advisory visible only to you and the maintainer. GitHub secret
scanning with push protection and Dependabot security updates are enabled too,
so a plain dependency advisory is usually already in flight before it is worth
reporting by hand.

This is a single-maintainer project and there is no response-time guarantee.
Reports are triaged on a best-effort basis. If a report is accepted, the fix
ships through the normal pull request, quality gate, and deploy path, and the
advisory is published from the same draft. If it is declined, the reason goes
back in the same thread.

## Scope

In scope:

- The deployed site and the client-side application under `src/`.
- The GitHub Actions workflows under `.github/workflows/`.
- The Firestore security rules documented in `docs/FIRESTORE_RULES.md`.

Out of scope, because each is the product's design rather than a defect:

- **Local-first storage is not encrypted.** A signed-out person's check-ins,
  journal entries, focus sessions, and preferences live in that browser's
  `localStorage` under the `calm-daily-coach:*` keys. Anyone with access to the
  device or the browser profile can read them. Signing in adds sync and backup;
  it does not make the local copy a secret.
- **The Firebase web config is public by design.** The `NEXT_PUBLIC_FIREBASE_*`
  values are compiled into the static bundle, which is how Firebase intends web
  apps to ship. Access is enforced by the Firestore rules, not by hiding those
  identifiers. "The Firebase config is visible in the bundle" is therefore not a
  finding; "the rules let one account read another account's data" very much is.

There are no server routes to attack: the site is a static export with no
backend of its own beyond Firebase.
