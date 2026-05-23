# AlignMD — Build Log

_Last updated: 2026-05-21_

AlignMD is **feature-complete across Phases 1–6.** The codebase type-checks
(`tsc --noEmit`) and lints (`next lint`) clean. This log is the handoff: what
was built, what still needs you, and what's a fast-follow.

## What's built

**Phase 0 — Security foundation.** Nine Supabase migrations: `0001_schema`
(~18 tables), `0002_audit` (audit-trail triggers), `0003_rls` (row-level
security), `0004_app_bootstrap`, `0005_phase1_finish`, `0006_phase3`,
`0007_portals`, `0008_phase5`, `0009_phase6`.

**Phase 1 — Provider CRM.** Provider profiles, credential tracking with a
30/60/90-day expiry tracker and a daily alerter script, permissioned document
upload, activity log, pipeline board, dashboard, availability blocks,
archive/restore, server-side input validation, and SSN held in a
privileged-only `provider_private` table.

**Phase 2 — Jobs + Matching (the MVP).** Facilities and jobs, the rule-based
match engine (`src/lib/match.ts`) that ranks clinicians for a job with
advisory severity tiers and compact/IMLC-license awareness, the submissions
pipeline, and a bulk CSV importer for clinicians and facilities.

**Phase 3 — Intake & portals.** Self-service application/intake survey,
verified references, a printable CV view, and self-service portals for the
`provider` and `facility_contact` roles.

**Phase 4 — Verification & screening.** Background / malpractice / reference
verification workflow on a new Verification tab, a vendor-adapter scaffold
(`src/lib/verification.ts`) that runs in manual mode and auto-switches
background checks to a vendor when its API key is set, and a credentialing
timeline.

**Phase 5 — State license assistant.** Per-state license applications with
status tracking and pre-fill from the provider's profile and credentials.

**Phase 6 — Reporting, comms & scale.** Submissions/fills/time-to-fill
reporting, email + SMS outreach drafts (draft-only — nothing is sent), and
server-side pagination on the providers and jobs lists.

## Needs you before launch

1. **Run the migrations.** `0005`–`0009` have not been applied to Supabase
   yet. Run them in order in the Supabase SQL editor, or `supabase db push`.
   Nothing from Phases 1–6 works until this is done.
2. **Build & deploy.** `cd ~/Documents/alignmd && npm install && npm run
   build`, then deploy to Vercel.
3. **GitHub secret for the security review.** A `.github/workflows/security-review.yml`
   was added — add a `CLAUDE_API_KEY` repository secret so it runs on PRs.
4. **Load real data.** Use the bulk importer at `/import` for the existing
   clinicians and facilities.

## Decisions — all resolved

SSN: last-4 only, privileged-only table. Background checks: vendor
integration (manual fallback until a key is set). Malpractice: stored
in-platform behind privileged RLS. Everyone logs in (provider + facility
portals). Compact/IMLC licenses: count for every member state. Matching:
advisory, primary screen is job → ranked clinicians.

## Fast-follows (not blocking)

- **Automated license-board lookups.** Verification runs in manual mode now.
  When wanted, an ops script (like the credential alerter) can drive
  `studio/scripts/lib/browser.mjs` (agent-browser) against the vendor-adapter
  seam — no rebuild needed.
- **Background-check vendor key.** Set `ALIGNMD_CHECKR_API_KEY` in the server
  env once your friend signs with a vendor; the adapter picks it up
  automatically.
- A full production `next build` should be confirmed on first deploy
  (verified here via `tsc` + `next lint`).
