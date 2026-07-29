# Repo rename runbook: `calm-daily-coach` -> `adhd-daily-coach`

Status: **the rename has NOT happened.** Verified 2026-07-29:
`gh api repos/rodmen07/calm-daily-coach --jq .full_name` -> `rodmen07/calm-daily-coach`,
`gh api repos/rodmen07/adhd-daily-coach` -> 404,
`https://rodmen07.github.io/calm-daily-coach/` -> 200,
`https://rodmen07.github.io/adhd-daily-coach/` -> 404.

Only the DISPLAY name has been rebranded. The repo slug, the Pages URL and the
`calm-daily-coach` localStorage namespace are all still the old value, and the
localStorage namespace is frozen forever on purpose (renaming it would orphan
every existing user's saved plans, journal entries and settings).

## The one thing that is easy to get wrong

`site-base-path.mjs` derives the slug from `GITHUB_REPOSITORY`, and
`next.config.ts` (`basePath`, `assetPrefix`, `NEXT_PUBLIC_APP_URL`),
`playwright.config.ts` and `e2e/serve.mjs` all import it, so no tracked file has
to be edited for a build to be correct under a new slug.

**That fixes the next build. It does not rebuild the artifact already deployed.**

A GitHub repo rename fires no workflow event.
`.github/workflows/deploy-pages.yml` triggers on exactly two things:

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:
```

So the instant the repo is renamed, GitHub Pages keeps serving the SAME,
un-rebuilt artifact at the new URL, and every asset reference inside it still
carries the old `/calm-daily-coach/` prefix. Every JS chunk, stylesheet and font
404s on all 13 routes: unstyled HTML, no hydration, no working nav. The site
stays broken until a rebuild is triggered **by hand**.

There is no ordering of the merge and the rename that avoids this window:

- rename first, then merge -> the live artifact is broken from the moment of the
  rename until the merge's deploy finishes.
- merge first, then rename -> the deploy correctly emits `/calm-daily-coach`
  (that is still `GITHUB_REPOSITORY` at build time), and the rename then orphans
  every one of those references.

The derivation removes the follow-up *code* change. It does not remove the
required *rebuild*. Budget for a short outage and keep it short.

## Procedure

1. **Rename the repo** on GitHub: Settings -> General -> Repository name ->
   `adhd-daily-coach`.
2. **Immediately trigger a rebuild** - this is the step that actually repairs
   the live site, and the outage lasts until it finishes:
   ```
   gh workflow run "Deploy to GitHub Pages" --repo rodmen07/adhd-daily-coach
   ```
   (or push an empty commit to `main`). Watch it with `gh run watch`.
3. **Verify the new URL serves a working site**, not just a 200:
   ```
   curl -sI  https://rodmen07.github.io/adhd-daily-coach/          # expect 200
   curl -sL  https://rodmen07.github.io/adhd-daily-coach/ | grep -c "/calm-daily-coach/"
   #                                                        expect 0
   ```
   A 200 alone proves nothing here: the stale artifact also returns 200. The
   grep for the old prefix is the assertion that matters.
4. **Update the local remote**: `git remote set-url origin
   https://github.com/rodmen07/adhd-daily-coach.git`. (GitHub redirects the old
   remote, so this is hygiene rather than a fix.)
5. **Flip the values below**, which are not derived.

## What is NOT derived and must be edited by hand

The build-time derivation covers `basePath`, `assetPrefix` and the `.ics`
`NEXT_PUBLIC_APP_URL`. Everything below is a literal.

| File | What it is |
| --- | --- |
| `site-base-path.mjs` | the ONE local/offline fallback slug (never used in Actions) |
| `src/lib/reminder-ics.ts` | `APP_URL` fallback, only reachable outside a Next build |
| `package.json` / `package-lock.json` | `"name": "calm-daily-coach"` |
| `README.md` | the `Live site:` URL |
| `docs/ROADMAP.md` | the live URL in "Current state" |
| `docs/design/REMINDER_SCHEDULING.md` | the live URL in section 1 |

The fallback in `site-base-path.mjs` is only reached when `GITHUB_REPOSITORY` is
unset, i.e. local builds and local e2e. It used to be copied into three files
(`next.config.ts`, `playwright.config.ts`, `e2e/serve.mjs`); editing one alone
built the export at one prefix and mounted the e2e server at another, so every
request 404d. There is now exactly one copy and all three import it. Its actual
value never affects a deployed artifact.

**Do not rewrite recorded probe evidence.** Design docs quote commands that were
really run against the URL live at the time (for example
`docs/design/FIRST_RUN.md`, `docs/design/GUEST_ACCESS_AND_PAYWALL.md`). Changing
the URL in a quoted result turns a measurement into a claim that was never
measured. Leave the old URL and note the rename beside it if needed.

## Downstream: the portfolio case study

`Portfolio/infraportal` carries a case study page that links here. It has to
change in the same pass, and it is a **separate repo with a separate deploy**:

- `src/pages/AdhdCoachCaseStudyPage.tsx` - the "Live site" and "GitHub" links
- `public/content/case_studies.json` - `githubUrl`

The GitHub link survives a rename on its own (GitHub permanently redirects
renamed repo URLs). **The Pages project URL does not redirect**, so
`rodmen07.github.io/<slug>/` has to be flipped there once step 3 above passes.
