# AlignMD — Research & Build Agent Log

The continuity record for the autonomous daily research-and-build agent. Each
run: research the market, pick the single highest-value expansion, build it,
verify it, ship it, log it here. Never rebuild something already listed below.

---

## 2026-05-23 — Placement Readiness board (`/readiness`)

**This is the first logged run.** No prior RESEARCH-AGENT-LOG.md existed; the
agent established this file. Context was loaded from README.md, BUILD-LOG.md,
QA-REPORT.md, the codebase (`src/app`, `src/lib`, `supabase/migrations`) and the
parent `OVERNIGHT-LOG.md` (which records three earlier feature blocks not run by
this agent: the per-provider credentialing packet, job-feed v2 / saved jobs, and
provider-first portal polish — plus migrations 0010–0013).

### Research

Web search across the four briefed areas (current as of May 2026):

- **Product features.** Modern clinician-staffing platforms converge staffing,
  scheduling, credentialing and compliance in one system; credential expiry
  alerts, per-clinician compliance status, and mobile self-service are now
  table stakes. AI is being applied to cut credentialing/enrolment time.
- **Competitors.** Nomad Health is winding down its own staffing desk to sell
  its operating system to other firms; Medely / Trusted / AMN compete on
  credentialing speed, transparent pay and tech-enabled matching. The common
  thread: matching is solved-ish; credentialing throughput is not.
- **Market & compliance.** The eNLC is at 43 jurisdictions (April 2026); the
  IMLC added North Carolina in January 2026; the APRN Compact still has only 4
  enacting states. Credentialing turnaround is repeatedly named the headline
  bottleneck — it slows hiring and worsens shortages.
- **Growth & positioning.** Buyers (agency operators, facilities) feel the pain
  as *placement speed*: a clinician can be sourced and matched but still not be
  placeable for weeks because the credentialing packet is not done.

### Candidates considered

1. **Placement Readiness board** — roll the per-provider credentialing packet
   up across the whole roster so a recruiter can see who is actually placeable
   now. No migration. *(picked)*
2. Credentialing-readiness column on the job → ranked-clinicians screens —
   valuable but edits two working, high-traffic match screens.
3. Refresh the compact-license rosters in `match.ts` (eNLC now 43) — useful but
   a data touch-up, not an expansion.
4. OIG/SAM exclusion-monitoring check — real credentialing need, but needs a
   data source and deep verification-logic changes Anthony still owes answers
   on; out of scope per the guardrails.
5. Dashboard credentialing widget — thin; subsumed by candidate 1.

### Picked — and why

**Candidate 1.** It is the single highest-value, well-scoped move: it directly
attacks the #1 market pain point (placement speed gated by credentialing), it
matches Anthony's standing priority (credentialing depth), it is purely
additive (one new page + one nav entry — no working feature touched), it needs
**no DB migration**, and it could be built *and* verified in one run. The
credentialing packet already exists per-provider (the Credentialing tab from an
earlier block) but there was no roster-wide rollup — no way to answer "who can
I place right now?" without opening every provider one at a time.

### What was built

A new **Placement Readiness** page at `/readiness` (staff CRM). For every
active clinician it merges their credentialing packet (`credentialing_items`,
0011) with their credential expiry (`provider_credentials`, 0001) into a single
readiness verdict — **Ready to place / Nearly ready / In progress / Not
started** — plus packet completion %, open-gap count (majors flagged), and an
expired/expiring credential indicator. KPI cards, tier filter chips, and a
roster table sorted best-prepared-first. Each clinician row deep-links to their
`?tab=credentialing` packet.

It reuses `src/lib/credentialing.ts` (`buildPacket`, `packetProgress`,
`packetGaps`, `isPacketReady`) and `src/lib/credentials.ts` (`expiryStatus`)
verbatim, so the per-provider tab and the roster view can never drift. Build
conventions match the existing `/reports` and `/jobs/scanned` pages. It
degrades cleanly: if migration 0011 has not been applied the
`credentialing_items` query errors, every clinician simply reads "not started",
an info banner explains why, and the credential-expiry column still works — no
crash.

**Files changed (all additive):**

- `src/lib/readiness.ts` — *new.* Pure readiness-rollup module
  (`computeReadiness`, `READINESS_META`, `READINESS_TIERS`).
- `src/app/(app)/readiness/page.tsx` — *new.* The Placement Readiness page.
- `src/components/icons.tsx` — added `IconReadiness` (new export only).
- `src/components/sidebar.tsx` — added the "Readiness" nav entry (one import,
  one array item), placed between Credentials and Licensing.

No migration required. No existing feature modified.

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint` → "No
ESLint warnings or errors". `npx next build` → succeeded (exit 0), `/readiness`
present in the route manifest.

Sandbox note: `next build` was run in a throwaway `/tmp` copy because the repo's
`node_modules` was installed on macOS and the sandbox is Linux/arm64, and
`next/font/google` needs network. In the throwaway copy only, `next` was pinned
to 14.2.33 with its matching `@next/swc-linux-arm64-gnu` (the registry has no
`@next/swc-linux-arm64-*` for 14.2.34/35) and `layout.tsx` was swapped to a
system font stack. **No source file in the repo was modified for the build** —
the repo stays on next 14.2.35 with the real Google-font layout. This mirrors
the workaround documented in QA-REPORT.md.

### Shipped?

**Not deployed.** All checks passed, but `npx vercel --prod` cannot run
autonomously — the Vercel CLI has no auth token in the sandbox (`~/.local/share
/com.vercel.cli/auth.json` carries no token; no `VERCEL_TOKEN`). Same constraint
the earlier overnight blocks hit. The code is verified and safe to deploy.

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a machine
  logged in to Vercel. Logged as operator to-do **`todo-1`** (tenant `alignmd`).
- **Migration:** none for this expansion.

### Ideas noted for future runs (do not rebuild the above)

- Credentialing-readiness column on the job → ranked-clinicians screens
  (`jobs/[id]`, `jobs/scanned`) — would close the loop between match and
  placeability on the primary screens.
- Refresh `match.ts` compact rosters against the current NCSBN/IMLCC lists
  (eNLC is 43 jurisdictions as of April 2026).
- A clinician-portal mirror of readiness ("what is left before I can be
  placed?").
