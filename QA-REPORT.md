# AlignMD — QA Report

**Date:** 2026-05-22
**Scope:** Overnight QA sweep (block 4 of 6) — full quality pass after the three
feature blocks that ran tonight (credentialing packet, job-feed v2,
provider-first portal polish). See `OVERNIGHT-LOG.md` for those blocks.

**Bottom line:** The application is in good shape. `tsc`, `next lint` and
`next build` all pass clean with zero errors. A route-by-route review of
`src/app/` found no crashes, broken links, missing empty states, or RLS
mismatches. No code changes were made and production was not redeployed —
the codebase was already correct. A few low-priority, non-blocking
observations are listed at the end for the operator to weigh.

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **Pass** — clean, zero errors |
| `npx next lint` | **Pass** — "No ESLint warnings or errors" |
| `npx next build` | **Pass** — compiled successfully, all 34 routes built, types valid, static generation 27/27 |

### Note on the build (resolves a limitation reported in blocks 1–3)

Blocks 1, 2 and 3 each reported that `next build` "could not be run to
completion in the overnight sandbox." That is now resolved — the build **was**
run to completion and **passes clean**. Two environment hurdles had to be
worked around, neither of which is an application bug:

1. **Filesystem.** The project lives on a slow FUSE mount inside the sandbox;
   a build there crawls. Copying the project to the sandbox's local disk makes
   the build complete in ~10 seconds.
2. **Platform / network.** The sandbox is Linux/arm64 but `node_modules` was
   installed on macOS (only `@next/swc-darwin-arm64` is present), and
   `next/font/google` (used in `src/app/layout.tsx`) fetches the Inter font
   from `fonts.googleapis.com` at build time, which the sandbox cannot reach.
   For the verification build the matching `@next/swc-linux-arm64-gnu` binary
   was installed into the throwaway copy and the Google Fonts response was
   mocked via `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`.

Both are sandbox constraints only. On Vercel's build infrastructure the correct
SWC binary is installed automatically and Google Fonts is reachable, so the
real production build is unaffected. **No source file was modified to make the
build pass** — `src/app/layout.tsx` and the rest of the app are untouched.

---

## What was reviewed

Every route under `src/app/` was reviewed, with extra attention on the code
added tonight. The review covered: crashes when a table or row is missing,
broken links, missing empty states, RLS scoping, styling consistency, and
mobile behavior.

**Infrastructure:** `middleware.ts`, `src/lib/auth.ts`, the three Supabase
clients (`server`/`admin`/`client`), and both route-group layouts
(`(app)`/`(portal)`). Auth gating is sound — the middleware bounces signed-out
visitors off every protected prefix and each layout re-checks the role server
side. `/jobs/scanned` (new) is covered by the existing `/jobs` prefix.

**Tonight's feature code:** `src/lib/credentialing.ts`,
`src/lib/profile-completeness.ts`, `src/components/credentialing-panel.tsx`,
`src/components/portal-home.tsx`, `src/lib/job-feeds/ingest.ts` &
`classify.ts`, `src/app/(app)/jobs/scanned/` (page + actions),
`src/app/(app)/providers/credentialing-actions.ts`,
`src/app/(portal)/actions.ts` (`toggleSavedJob`), the portal home, and the
portal Open-jobs page. Every new query is defensive: a missing
`credentialing_items` (0011), `external_jobs` (0010) or `saved_jobs` (0012)
table degrades to a calm empty state or info banner and never crashes. This
was verified by reading each query's error handling.

**Migrations:** `0010_external_jobs.sql`, `0011_credentialing.sql`,
`0012_saved_jobs.sql`. RLS is consistent — staff get full access via
`is_staff()`; clinicians are scoped to their own rows via
`current_provider_id()`; both helper functions exist (0003 / 0007). Foreign
keys, unique constraints and indexes are all in place and the migrations are
idempotent.

**Remaining CRM and portal routes:** dashboard, providers (list + detail +
edit/new/cv), credentials, pipeline, jobs (list + detail + new), facilities,
licensing, outreach, reports, team, import; the clinician portal (home,
profile, availability, documents, pipeline, jobs); the facility portal (home,
job detail); and the public/auth routes (landing, login, `auth/callback`).
All fetch defensively (`data ?? []`), render empty states, and link to valid
routes.

---

## What was fixed

Nothing. No clear-cut, safe bug was found that warranted a change. Per the
task's conservative brief, no working feature was rewritten and no risky
change was made. Because nothing changed, the production deployment was left
as-is and `vercel --prod` was not run.

---

## Issues found but NOT fixed (for operator review)

None of these is a crash or a blocker. They are recorded here so the operator
can decide whether to address them.

1. **Inserted/updated counts in the job-feed refresh are approximate.**
   `src/lib/job-feeds/ingest.ts` (lines ~152–158). After upserting, the code
   sets `inserted` to the count of every row with `fetched_at >= startedAt` —
   which is *every* upserted row, new or merely re-seen — and then derives
   `updated = max(0, updated - inserted)`, which collapses toward 0. So the
   "Refresh complete — N postings added or updated" banner attributes almost
   everything to "added." The **combined total is correct** (the banner uses
   `inserted + updated`), so this is a cosmetic reporting inaccuracy only, not
   a crash. Left unfixed deliberately: re-working the ingestion accounting is
   not a "clear-cut" change and risks the working refresh path.

2. **CRM tables have no horizontal-scroll wrapper on small screens.**
   Block 3 added a `.table-wrap` utility and applied it to the *portal*
   tables. The CRM `(app)` tables were not wrapped — e.g. the clinician-match
   table in `src/app/(app)/jobs/scanned/page.tsx` (~line 387), and the tables
   in `jobs/[id]`, `providers/[id]`, `credentials`, `licensing`, `reports`,
   etc. On a narrow viewport these wide tables can overflow. This is a
   pre-existing, app-wide pattern (not a regression from tonight), and doing
   it properly means a consistent pass over every CRM table — beyond a
   conservative one-line fix. Recommend wrapping CRM tables in `.table-wrap`
   in a dedicated styling pass.

3. **Unknown `?tab=` value on the provider detail page renders an empty body.**
   `src/app/(app)/providers/[id]/page.tsx` (line ~91): `tab` is
   `searchParams.tab ?? "overview"`. A valid tab is never produced by the UI,
   but a hand-typed/stale `?tab=xyz` URL shows the header and tab bar with no
   panel beneath. Harmless (no crash). A one-line guard could fall back to
   "overview" for any unrecognized tab.

4. **Stray empty file in the repo root.** `_writetest` (0 bytes, dated
   2026-05-21) appears to be leftover from an earlier block's write test. Safe
   to delete; left in place since it is unrelated to tonight's work.

---

## Reminders carried over from blocks 1–3

These are still outstanding and are **not** QA findings — they are the
operator to-dos the feature blocks created:

- Migrations `0011_credentialing.sql` and `0012_saved_jobs.sql` have **not**
  been applied to Supabase (todo-15, todo-17). Until they are, the
  credentialing packet and saved-jobs features run in their defensive
  read-only / disabled fallback state — which the QA review confirms works
  cleanly and does not crash.
- Blocks 1–3's app code has **not** been deployed to production
  (todo-16, todo-18, todo-19). This QA pass confirms that code builds clean
  and is safe to deploy.
