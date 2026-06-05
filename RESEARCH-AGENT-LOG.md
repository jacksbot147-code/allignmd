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

---

## 2026-05-24 — Clinician placement-readiness page (`/clinician/readiness`)

The clinician-facing mirror of the staff Placement Readiness board built on
2026-05-23. Same `computeReadiness` engine, the other side of the platform.

### Research

Web search across the four briefed areas (current as of May 2026):

- **Product features.** The 2026 consensus stack for cutting staffing delays
  is "document collection, reminders, **status visibility**, plus a fast-lane
  workflow" — and clinician **self-service** (clinicians self-managing their
  own credential/packet status from their own portal) is now table stakes,
  not a differentiator.
- **Competitors.** Healthcare leaders name credentialing delays the #1 pain
  point tech could solve (49%). A second, repeated gap across Medely / Nomad /
  Trusted: **lack of transparency** — provider-side status is "siloed or
  incomplete," which erodes trust and drives candidate drop-off.
- **Market & compliance.** Full credentialing for a clinical role routinely
  runs 60–90 days; the advice is to start early and keep the candidate
  informed throughout. The eNLC is at 43 jurisdictions (now incl. Connecticut
  and Rhode Island — `match.ts`'s `NURSE_COMPACT` set is still missing both;
  see future-ideas below).
- **Growth & positioning.** Self-service status visibility is repeatedly tied
  to fewer drop-offs and less recruiter chase — i.e. it is a *placement-speed*
  lever, not just a UX nicety.

### Candidates considered

1. **Clinician placement-readiness page** — a `/clinician/readiness` mirror of
   the staff `/readiness` board, reusing `computeReadiness` verbatim. Purely
   additive (new route + nav entry), no migration, no working screen touched.
   *(picked)*
2. Credentialing-readiness column on the job → ranked-clinicians screens
   (`jobs/[id]`, `jobs/scanned`) — high value but edits two working,
   high-traffic match screens; carried over again as a future idea.
3. Refresh `match.ts` compact rosters (eNLC now 43, +CT +RI) — a real
   correctness gap, but a data touch-up, not an expansion, and editing the
   match engine is riskier than this run's brief wants. Left as a future idea.
4. Credentialing packet-aging / SLA view — overlaps heavily with the staff
   `/readiness` board and `packetGaps` overdue flagging; too thin.

### Picked — and why

**Candidate 1.** It is the most coherent next step after the 2026-05-23 run —
literally the clinician-side mirror of the staff board, so the product grows
without sprawl. It was already flagged as a future idea last run. It directly
answers the research: clinician self-service status visibility is now table
stakes and is a documented placement-speed lever (fewer drop-offs, less
chase). It fits Anthony's "provider-focused" direction (the clinician portal
is the provider-focused side) and his credentialing-depth priority. It needs
**no DB migration** and is the lowest-risk option — a brand-new route in the
`(clinician)` group, touching no existing working screen — so it could be
built *and* verified in one run.

### What was built

A new **Placement readiness** page at `/clinician/readiness` in the clinician
portal. For the signed-in clinician it merges their credentialing packet
(`credentialing_items`, 0011) with their credential expiry
(`provider_credentials`, 0001) into one self-service view: a readiness verdict
(**Ready to place / Nearly ready / In progress / Not started**) with the
packet-completion bar and %, a KPI strip (items complete, items still
outstanding, credentials to watch), a plain-English **"What's still needed"**
card listing every incomplete packet item, the **full packet checklist**
(read-only — staff own edits), and a **licenses & certifications** section
flagging anything expired or expiring within 90 days. A footer points the
clinician to the Documents tab to help their coordinator clear items faster.

It reuses `computeReadiness` / `READINESS_META` from `src/lib/readiness.ts`
verbatim — the same module the staff `/readiness` board uses — so the
recruiter's view and the clinician's view of the same packet can never drift.
It also reuses `buildPacket` + the status label/tone maps from
`credentialing.ts` and `expiryStatus` / `expiryCopy` / `EXPIRY_META` from
`credentials.ts`. RLS already permits a clinician to read their own
`credentialing_items` (`credentialing_items_provider_self_read`, 0011) and
their own `provider_credentials`, so the page shows real data, not a stub.
It degrades cleanly: an unlinked profile shows the standard "profile isn't
linked" empty state; if migration 0011 is absent the `credentialing_items`
query errors, every item reads "not started", an info banner explains why, and
the credential-expiry section still works — no crash. Build conventions match
the existing clinician pages (`clinician/credentials/page.tsx`, the clinician
home) and the staff `/readiness` page.

**Files changed (all additive):**

- `src/app/(clinician)/clinician/readiness/page.tsx` — *new.* The clinician
  Placement readiness page.
- `src/components/clinician-sidebar.tsx` — added the "Readiness" nav entry
  (one import, one array item), placed between Credentials and Availability.
  Reuses the existing `IconReadiness` icon — no new icon needed.

No migration required. No existing feature modified (`layout.tsx` and every
other source file confirmed untouched via `git diff`).

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint` → "No
ESLint warnings or errors"; `npx next build` → compiled successfully, types
valid, static generation 34/34, and `/clinician/readiness` present in the
route manifest.

Sandbox note (same workaround as the 2026-05-23 run / QA-REPORT.md): the
repo's `node_modules` was installed on macOS and the build sandbox is
Linux/arm64. `next build` was run in a throwaway `/tmp` copy where `next` was
pinned to **14.2.33** (the latest version with a published
`@next/swc-linux-arm64-gnu` — 14.2.34/35 have none) and `layout.tsx` was
swapped to a system-font stack (the real layout uses `next/font/google`, which
needs network). **No source file in the repo was modified for the build** —
the repo stays on next 14.2.35 with the real Google-font layout; the throwaway
copy was deleted afterward.

### Shipped?

**Not deployed.** All three checks passed, but `npx vercel --prod` cannot run
autonomously: there is no Vercel auth token in the sandbox (no `VERCEL_TOKEN`,
no `~/.local/share/com.vercel.cli/auth.json`) and the sandbox cannot reach the
Vercel/npm network from the CLI (`EAI_AGAIN registry.npmjs.org`). Same
constraint every prior block hit. The code is verified and safe to deploy.

(Correction to the 2026-05-23 entry: it claimed the deploy was "logged as
operator to-do `todo-1`" — that is inaccurate. `todo-1` in
`businesses/_shared/operator-todos.json` is "Get an Anthropic API key"; no
readiness-specific deploy to-do was actually added.)

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a machine
  logged in to Vercel. This ships the whole repo, so it also clears the
  earlier alignmd deploy items (`todo-16`, `todo-18`, `todo-19`). No new
  operator to-do was added — this expansion needs no migration (the brief
  scopes operator-todos to migrations) and the deploy backlog already exists.
- **Migration:** none for this expansion. (`0011_credentialing.sql` still
  wants applying — `todo-15` — for the packet to hold real data; until then
  this page degrades to the "not started" view, which is by design.)

### Ideas noted for future runs (do not rebuild the above)

- Credentialing-readiness column on the job → ranked-clinicians screens
  (`jobs/[id]`, `jobs/scanned`) — would close the loop between match and
  placeability on the primary screens. Highest-value remaining idea; the
  caution is that it edits two working, high-traffic match screens.
- Refresh `match.ts` compact rosters against the current NCSBN/IMLCC lists —
  the eNLC is 43 jurisdictions (the `NURSE_COMPACT` set is missing Connecticut
  and Rhode Island; verify the IMLC / PT-Compact rosters too).
- A facility-portal candidate-readiness signal — show whether a shortlisted
  clinician is placeable, scoped carefully so facilities never see another
  clinician's credentialing detail.

---

## 2026-05-25 — Placement opportunities board (`/opportunities`)

Crosses the match engine with the readiness engine: for every open job, which
roles can the desk fill *today*, and which placements are stuck on the packet.
This is the synthesis of the last two runs — the loop-closing idea that had
been deferred twice, delivered as a new page instead of by editing the match
screens.

### Research

Web search across the four briefed areas (current as of May 2026):

- **Product features.** The 2026 platform consensus is a single workforce OS
  that unifies staffing + scheduling + credentialing + compliance; the three
  non-negotiables are credential-expiry alerts, **per-clinician compliance
  status visible to schedulers/recruiters**, and facility-specific checklists.
  AI-assisted onboarding is cutting time-to-fill by up to 30% (some report
  50%); the recruiter-facing payoff is being able to "submit qualified
  candidates quickly."
- **Competitors.** Medely launched **Talent Fusion** (Jan 2026) — a workforce
  orchestration layer combining scheduling, credentialing, supply and
  utilization into a "real-time view of the entire workforce ... so leaders
  can act before gaps disrupt care." Nomad leans on ML matching for speed to
  bedside. The repeated thread: matching is solved-ish; the differentiator is
  *operational visibility that connects matching to placeability.*
- **Market & compliance.** Healthcare time-to-hire averages 80+ days
  (experienced RNs 70–90); credential verification is named the single
  longest bottleneck (60–90 days). Systems that compress time-to-fill under
  30 days win the candidates. eNLC at 43 jurisdictions (Massachusetts 43rd;
  Pennsylvania fully joined July 2025). APRN compact still 4 states.
- **Growth & positioning.** 2026 recruiting "rewards two things: speed and
  specialty fit." Advice is to fix the biggest bottleneck — credentialing +
  communication — with document collection, reminders, **status visibility**
  and a fast-lane workflow; candidates disengage if not moved quickly.

### Candidates considered

1. **Placement opportunities board** — a new staff page that, for every open
   job, crosses `scoreMatch` (match.ts) with `computeReadiness` (readiness.ts)
   to surface clinicians who are *both* a real match *and* placement-ready,
   and to flag real matches blocked on credentialing. New route + nav entry,
   no migration, reuses both engines verbatim. *(picked)*
2. Credentialing-readiness column on the `jobs/[id]` / `jobs/scanned` match
   screens — the same loop-closing value, but the log has deferred it twice
   precisely because it edits two working, high-traffic screens. Candidate 1
   delivers that value as a brand-new page, so the risk is unnecessary.
3. Refresh `match.ts` compact rosters (eNLC now 43; `NURSE_COMPACT` missing
   CT + RI) — a real correctness gap, but a data touch-up inside the match
   engine, not an expansion. Deferred again, as the prior two runs did.
4. A facility-portal candidate-readiness signal — viable, but it edits a
   working facility screen and the facility side is the less provider-focused
   half of the platform. Carried forward.

### Picked — and why

**Candidate 1.** It is the single highest-value, well-scoped move available.
The research is unanimous that matching is no longer the differentiator —
operational visibility that ties a match to *placeability* is (Medely's
Talent Fusion markets exactly this: "act before gaps disrupt care"). AlignMD
already has both halves — a credential-aware match engine and, from the last
two runs, a readiness engine — but nothing crossed them, so a recruiter could
not answer the question they start the day with: "which open jobs can I fill
right now, and who do I submit?" This page answers it, and its
**blocked-on-credentialing** count turns a vague backlog into a specific work
list — directly serving Anthony's credentialing-depth priority. It is purely
additive (one new route + one nav entry — no working screen touched), needs
**no DB migration**, reuses `scoreMatch` and `computeReadiness` verbatim, and
was built *and* verified in one run. Delivering the twice-deferred loop-closing
idea as a new page removes the only objection that had blocked it.

### What was built

A new **Placement opportunities** page at `/opportunities` (staff CRM). For
every open job it derives the job's match inputs the same way `jobs/[id]` does
(license states from `job_requirements` or the facility, required certs, min
years, telehealth), scores every active clinician with `scoreMatch`, and keeps
only the real matches (tier *strong* or *fair* — a stretch or long shot is
noise, not a lead). Each kept match is then classified by credentialing
readiness via `computeReadiness` into one of three states: **Ready to submit**
(match + complete packet), **Credentialing underway**, or **Blocked on
credentialing** (a major packet gap or an expired credential). Already-submitted
(job, clinician) pairs are excluded so the page only ever shows *new* leads.

KPI strip: open jobs, jobs ready to fill, submit-ready leads, and matches
blocked on credentialing. Filter chips (All leads / Ready to fill / Blocked on
credentialing) and a stack of job cards — each card lists its top opportunities
with match score + tier, a credentialing-packet bar, and the opportunity-state
badge, sorted most-actionable-first. Jobs with no fair-or-better match are
counted in a muted footer line rather than listed, keeping the page an action
list. Each clinician row deep-links to their `?tab=credentialing` packet.

The cross-product logic lives in a new pure module, `src/lib/opportunities.ts`
(`classifyOpportunity`, `isOpportunityMatch`, `opportunityRank`,
`OPPORTUNITY_META`) — mirroring how `readiness.ts` and `reports.ts` keep their
arithmetic pure and I/O-free. The page reuses `scoreMatch` / `TIER_META` and
`computeReadiness` verbatim, so this view can never drift from the `jobs/[id]`
ranking or the `/readiness` board. It degrades cleanly: if migration 0011 is
absent the `credentialing_items` query errors, every match reads "credentialing
underway", an info banner explains why, and the match ranking still works — no
crash. Build conventions match the existing `/readiness`, `/reports` and
`jobs/scanned` pages.

**Files changed (all additive):**

- `src/lib/opportunities.ts` — *new.* Pure match × readiness classification
  module.
- `src/app/(app)/opportunities/page.tsx` — *new.* The Placement opportunities
  page.
- `src/components/icons.tsx` — added `IconOpportunity` (new export only).
- `src/components/sidebar.tsx` — added the "Opportunities" nav entry (one
  import, one array item), placed directly after "Jobs".

No migration required. No existing feature modified.

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint` → "No
ESLint warnings or errors"; `npx next build` → "Compiled successfully", types
valid, static generation **35/35** (was 34 — the new `/opportunities` route),
exit 0, `/opportunities` present in the route manifest as a dynamic route.

Sandbox note (same workaround as the 2026-05-23 / 2026-05-24 runs and
QA-REPORT.md): the repo's `node_modules` was installed on macOS and the build
sandbox is Linux/arm64. `next build` was run in a throwaway `/tmp` copy where
`next` was pinned to **14.2.33** (the latest with a published
`@next/swc-linux-arm64-gnu` — 14.2.34/35 have none; the matching Linux swc
binary was swapped in) and `layout.tsx` was swapped to a system-font stack
(the real layout uses `next/font/google`). **No source file in the repo was
modified for the build** — the repo stays on next 14.2.35 with the real
Google-font layout and the darwin swc binary; the throwaway copy was deleted
afterward. `tsc` and `next lint` were run directly against the real repo.

### Shipped?

**Not deployed.** All three checks passed, but `npx vercel --prod` cannot run
autonomously: there is no Vercel auth token in the sandbox (no `VERCEL_TOKEN`,
no `~/.local/share/com.vercel.cli/` auth dir) — the CLI gets as far as
"Retrieving project…" and then fails. Same constraint every prior run hit.
The code is verified and safe to deploy.

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a machine
  logged in to Vercel. This ships the whole repo, so it also clears the
  earlier alignmd deploy backlog. No new operator to-do was added — this
  expansion needs no migration (the brief scopes operator-todos to migrations)
  and the deploy backlog already exists.
- **Migration:** none for this expansion. (`0011_credentialing.sql` still
  wants applying for the credentialing packet — and therefore the readiness
  classification on this page — to hold real data; until then `/opportunities`
  degrades to the "credentialing underway" view, which is by design.)

### Ideas noted for future runs (do not rebuild the above)

- Refresh `match.ts` compact rosters against the current NCSBN/IMLCC lists —
  the eNLC is 43 jurisdictions (the `NURSE_COMPACT` set is missing Connecticut
  and Rhode Island; verify the IMLC / PT-Compact rosters too). A small,
  well-defined correctness fix — the caution is only that it edits the match
  engine, so pair it with a careful read of `scoreMatch`.
- A facility-portal candidate-readiness signal — show whether a shortlisted
  clinician is placeable, scoped so facilities never see another clinician's
  credentialing detail.
- An "action today" digest that ranks the *submit-ready* leads from this page
  across all jobs into a single recruiter to-do list (the page already
  computes every (job, clinician) pair — a flat, cross-job view is a small
  follow-on).
- A clinician-portal mirror: "open roles you're a match for, and what's left
  before you can be placed into them" — the provider-side of this board.

## 2026-05-27 — Today's-submissions digest (`/today`)

A flat, cross-job, score-ranked recruiter to-do list — one row per clinician,
strongest submit-ready job first. Pivots the same opportunity pairs already
computed by `/opportunities` into the question the recruiter starts the day
with: "across all my open jobs, who do I submit first this morning, and to
which role?" Carries forward the single explicit follow-on idea noted in the
2026-05-25 log entry.

### Research

Web search across the four briefed areas (current as of May 2026):

- **Product features.** The 2026 stack the market converges on is AI-driven
  matching + rate transparency + self-service search + automated
  credential-to-shift matching. The recruiter-facing payoff is "advanced job
  matching" plus "self-service" tools that reduce administrative workload.
- **Competitors.** Vivian Health (1.9M clinicians) leans hard on AI-driven
  matching. Medely's Talent Fusion (Jan 2026) sells a "real-time view of the
  entire workforce ... so leaders can act before gaps disrupt care." Across
  Medely / Nomad / Trusted / ShiftKey the differentiator is no longer
  matching — it's operational visibility that turns the match list into a
  *prioritised action list*.
- **Market & compliance.** Healthcare recruiters now manage an average of
  **70 open roles** at a time and **41% describe themselves as overworked**;
  best-practice guidance is to sort candidate pipelines by priority with
  red/yellow flags on actions needed. Five metrics predict success:
  time-to-fill, one-year retention, **candidate response rate**, recruiter
  caseload, contract-labor offset. The eNLC is at 43 jurisdictions; the
  `NURSE_COMPACT` set in `match.ts` was refreshed to include CT + RI in a
  prior block, so that "future idea" from earlier logs is no longer open.
- **Growth & positioning.** Candidate response rate (substantive reply
  within 48 h) is now a tracked SLA. Speed wins the candidate; a
  prioritised, dedup'd recruiter to-do list directly serves that — it's the
  thing that makes "submit today" actually happen across a 70-role pile.

### Candidates considered

1. **Today's-submissions digest** — a new staff page (`/today`) that pivots
   `/opportunities`' (clinician × job) classifications into a flat ranked
   recruiter to-do list. One row per clinician (best submit-ready job as
   "top", any other submit-ready jobs counted on "+N more"); a parallel
   chase-list view dedup'd by clinician for matches blocked on credentialing.
   New route + nav entry + pure pivot module — no working screen touched.
   *(picked)*
2. Clinician-portal mirror of `/opportunities` ("open roles you're a match
   for, and what's left before you can be placed into them") — the natural
   symmetric move after the 2026-05-24 readiness mirror, but the `jobs` RLS
   policy only lets a provider see jobs they're **already submitted to**
   (`jobs_provider_submitted_read`, 0007). A clinician-facing
   "match-for-jobs-you-haven't-been-submitted-to" page can't read its data
   without a new RLS policy on `jobs`, which the brief scopes out of "deep
   credentialing / RLS changes." Deferred for now — would be unblocked by a
   small, careful RLS migration in a future run.
3. Facility-portal candidate-readiness signal — viable, but it edits a
   working facility screen and the facility side is the less provider-focused
   half of the platform. Carried forward (third run in a row).
4. Refresh `match.ts` compact rosters — already done; `NURSE_COMPACT`
   confirmed to include CT + RI. Dropped.

### Picked — and why

**Candidate 1.** It is the single highest-value, well-scoped move available
today. The research is unanimous that desks now run 70 open roles per
recruiter and 41% feel overworked — a prioritised, cross-job dedup'd
submission list is the lever that turns the `/opportunities` board into
something a recruiter can actually act on at 9am. It was the *explicit*
"small follow-on" future idea noted in the 2026-05-25 log
("a flat, cross-job view is a small follow-on"). It is purely additive (one
new page + one nav entry + one pure lib module — no working screen touched),
needs **no DB migration**, reuses `scoreMatch`, `computeReadiness` and
`classifyOpportunity` verbatim so it can never drift from `/opportunities`
or `/readiness`, and could be built *and* verified in one run. It directly
serves Anthony's credentialing-depth priority by surfacing **clinicians to
chase** — the matched-but-blocked list is the specific work that closes
real placements faster, not just sorts existing leads.

### What was built

A new **Today** page at `/today` (staff CRM). The data path is identical to
`/opportunities` — open jobs × active roster × credentials × packet items ×
submissions — and every (clinician, job) opportunity is classified by
`classifyOpportunity` exactly the same way. The new piece is the pivot:
`buildTodayDigest` groups every classified opportunity by clinician,
selects each clinician's strongest opportunity per state as the digest
row's `top` and keeps the rest on `others` for the "+N more open roles
they fit" footer.

Two views, one toggle:

- **Top picks** — clinicians with at least one `submit_now` opportunity,
  dedup'd to one row per clinician, sorted by **strongest match first**
  (ties resolved by most-complete packet, then name). This is the morning
  submission queue.
- **Chase list** — clinicians with at least one `blocked` opportunity but no
  submit-ready one, dedup'd and sorted by **closest-to-ready first**
  (highest packet %), so the desk works the cheapest unblocks today.

KPI strip: submit-ready leads (pairs), strong submit-ready, unique
clinicians to submit, unique clinicians to chase. Each clinician row
deep-links to the credentialing tab; the linked job deep-links to
`/jobs/[id]`. Degrades cleanly: if migration 0011 is absent the
`credentialing_items` query errors, every match reads "credentialing
underway", an info banner explains why, and the page shows the standard
empty states for both bands rather than crashing.

`src/lib/today.ts` is pure — no I/O. It mirrors how `readiness.ts` and
`opportunities.ts` keep their arithmetic separate from Supabase, so the
pivot is unit-testable without a database and the per-job and flat views
share a single source of truth.

**Files changed (all additive):**

- `src/lib/today.ts` — *new.* Pure pivot module (`buildTodayDigest`,
  `OpportunityEntry`, `DigestRow`, `TodayDigest`).
- `src/app/(app)/today/page.tsx` — *new.* The Today page.
- `src/components/icons.tsx` — added `IconToday` (new export only).
- `src/components/sidebar.tsx` — added the "Today" nav entry (one import,
  one array item), placed directly after Dashboard so it's the second-line
  morning entry point.

No migration required. No existing feature modified.

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint` →
"No ESLint warnings or errors"; `npx next build` → "Compiled successfully",
types valid, static generation **36/36** (was 35 — the new `/today` route),
exit 0, `/today` present in the route manifest as a dynamic route.

Sandbox note (same workaround as every prior run / QA-REPORT.md): the
repo's `node_modules` was installed on macOS and the build sandbox is
Linux/arm64. `next build` was run in a throwaway `/tmp` copy where `next`
was pinned to **14.2.33** (the latest version with a published
`@next/swc-linux-arm64-gnu`) and `layout.tsx` was swapped to a system-font
stack (the real layout uses `next/font/google`, which needs network).
**No source file in the repo was modified for the build** — the repo
stays on next 14.2.35 with the real Google-font layout and the darwin swc
binary; the throwaway copy was deleted afterward. `tsc` and `next lint`
were run directly against the real repo.

One small TypeScript fix during build: the initial `today.ts` iterated a
`Map` with `for...of` which trips on the project's downlevel-iteration
default; swapped to `Map.prototype.forEach`, after which `tsc` ran clean.
No other source-level adjustments were needed.

### Shipped?

**Not deployed.** All three checks passed, but `npx vercel --prod` cannot
run autonomously: there is no Vercel auth token in the sandbox (no
`VERCEL_TOKEN`, no `~/.local/share/com.vercel.cli/` auth dir), and the
Vercel CLI's package install itself errors with `EAI_AGAIN
registry.npmjs.org` from inside the sandbox. Same two constraints every
prior run hit. The code is verified and safe to deploy.

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a machine
  logged in to Vercel. This ships the whole repo, so it also clears the
  earlier alignmd deploy backlog along with this run. No new operator
  to-do was added — this expansion needs no migration (the brief scopes
  operator-todos to migrations) and the deploy backlog already exists.
- **Migration:** none for this expansion. (`0011_credentialing.sql` still
  wants applying for the credentialing packet — and therefore the
  classification and the chase list on `/today` — to hold real data; until
  then both bands degrade to empty, which is by design and the page
  surfaces a one-line info banner explaining the migration dependency.)

### Ideas noted for future runs (do not rebuild the above)

- Clinician-portal mirror of `/opportunities` ("open roles you're a match
  for, and what's left before you can be placed into them"). Blocked today
  by the `jobs_provider_submitted_read` RLS policy on `jobs` (a provider
  can only read jobs they're already submitted to). The unblock is a small
  additive RLS policy that lets a provider read open jobs they're a fair-
  or-better match for, OR a derived public-view table the staff populates
  via the existing opportunities pipeline — either is well-scoped for one
  run.
- A facility-portal candidate-readiness signal — show whether a
  shortlisted clinician is placeable, scoped carefully so facilities never
  see another clinician's credentialing detail. Carried forward (now
  fourth run in a row — likely the right time to take it next).
- A "stale submissions" overlay on `/pipeline` — submissions that have
  sat in one stage past their stage's median dwell-time (research flagged
  candidate response rate inside 48 h as a tracked SLA). Builds on
  `reports.ts` and the existing stage-counts logic.
- Email/Slack digest of today's top picks delivered at 8am — turns this
  page into a push, not a pull. Would need a scheduled-task hook and a
  delivery integration; bigger than one run.

---

## 2026-05-28 — Facility-side candidate readiness signal (`/facility/candidates`)

The facility-portal mirror of the staff readiness rollup, scoped carefully so
a facility contact sees a high-level "Ready to start / In credentialing /
Onboarding pending" verdict per submitted clinician — and **never** the
specific gaps or named credentials beneath that verdict. Picks up the
facility-side idea that has now been carried forward four runs in a row
(2026-05-23 → 2026-05-25 → 2026-05-27) and the 2026-05-27 log explicitly
flagged as "likely the right time to take it next."

### Research

Web search across the four briefed areas (current as of May 2026):

- **Product features.** The 2026 VMS commentary names **candidate readiness
  scoring** — surfacing which submitted clinicians are deployment-ready vs.
  still in process — as table-stakes for facility-side portals, alongside
  real-time credential tracking and structured recruiter→credentialing→
  deployment handoffs. The repeated framing: a candidate gets submitted, the
  VMS flags them, and someone still has to chase the documents manually
  unless the readiness signal is visible where the facility decides.
- **Competitors.** Medely's Talent Fusion Core (Jan 2026) centralises and
  automates internal staffing processes with a "real-time view of the entire
  workforce." LocumTenens.com / AMN-style portals already give facilities
  active-assignment date and document visibility; the gap across Medely /
  Nomad / Trusted / LocumTenens / Barton is still pre-placement transparency:
  facilities see *that* a candidate has been submitted but not *whether they
  can start*.
- **Market & compliance.** Time-to-fill stays the headline metric (80+ days
  for experienced RNs, with verification alone 60–90 days); credentialing
  remains named the single longest bottleneck. eNLC at 43 jurisdictions
  (`NURSE_COMPACT` already includes CT + RI per the 2026-05-27 entry). No
  new compact / IMLC changes since the last run.
- **Growth & positioning.** Facility-side visibility into "who can actually
  start" is repeatedly tied to fewer surprises at the placement gate and to
  faster offer→start cycles. It is a **transparency** lever, not a matching
  one — the differentiator now is what the facility sees, not just what the
  desk sees.

### Candidates considered

1. **Facility-side candidate readiness signal** — add a rolled-up readiness
   verdict to the existing `/facility/candidates` table (per row) plus a
   four-card KPI strip (Ready to start / In credentialing / Onboarding
   pending / Total submitted). Reuses `computeReadiness` verbatim through a
   *narrowing* facility-side adapter so no detail (packet %, gap inventory,
   named credential expiries, internal `blocked` flag) ever reaches the
   facility. No new route, no migration, edits one working page in the
   facility portal. *(picked)*
2. Clinician-portal mirror of `/opportunities` — still blocked by the
   `jobs_provider_submitted_read` RLS policy. Would need an additive RLS
   policy on `jobs` for "open jobs a provider is a fair-or-better match for."
   Deferred again — well-scoped for a future run with a small migration.
3. "Stale submissions" overlay on `/pipeline` — submissions sitting in one
   stage past that stage's median dwell-time. Real value (candidate response
   rate inside 48 h is now a tracked SLA), but the facility-side idea is the
   longer-deferred one, and edits one working staff screen.
4. Push delivery of the `/today` digest (email/Slack at 8am) — bigger than
   one run; needs a scheduled-task hook and a delivery integration.

### Picked — and why

**Candidate 1.** It is the single highest-value, well-scoped move available
today, and the explicit "now likely the right time" call-out in the
2026-05-27 log. The research is unanimous that pre-placement transparency on
the facility side is the open gap across modern VMS / staffing portals — and
AlignMD already has a readiness engine (`src/lib/readiness.ts`, 2026-05-23)
that has been used by staff (`/readiness`) and clinicians
(`/clinician/readiness`) for five days. Crossing it to the facility side
finishes the three-sided readiness story while ensuring no facility contact
ever sees another clinician's credentialing detail (the brief's explicit
caveat for this idea).

It needs **no DB migration**, edits no working feature (it adds columns and a
KPI strip to one existing page, fully additive), reuses `computeReadiness`
verbatim so it can never drift from the staff/clinician boards, and could be
built *and* verified in one run. The scoping security work was the careful
part — see "What was built" below.

### What was built

A rolled-up readiness signal on the existing **`/facility/candidates`** page
(staff already submit candidates to a facility; this page is where the
facility sees them). Two additions:

- **KPI strip** with four cards above the stage toolbar: *Ready to start*,
  *In credentialing*, *Onboarding pending*, *Total submitted*. Counts are
  per submission (a clinician submitted to two roles counts twice), matching
  how the rest of the page treats submissions as the unit of work.
- **"Readiness" column** in the candidates table, between Match and
  Submitted. Each row shows a coloured badge — *Ready to start* (ok) /
  *Final checks* (teal) / *In credentialing* (warn) / *Onboarding pending*
  (muted) — with a tooltip-only one-line facility-framed summary.

The new pure module `src/lib/facility-readiness.ts` is the *narrowing*
adapter over `computeReadiness`. It deliberately drops, on the way out:
packet %, packet-item counts, major-gap and open-gap counts, expired and
expiring credential counts, the internal `blocked` flag, and the raw
recruiter-internal summary string. What survives is exactly four fields:
`tier`, `label`, `tone`, and a facility-framed `summary` for the hover
tooltip. The module's docblock makes this discipline explicit so anyone
extending the signal later doesn't re-introduce the gaps.

**Security model — enforced server-side in `candidates/page.tsx`:**

1. `requireFacilityContact()` proves the user is a facility contact for
   `facility_id`.
2. The submissions read uses `createClient()` — RLS-scoped — and only
   returns submissions to *this facility's* jobs (existing policy
   `submissions_facility_contact_read`, 0007). The facility cannot
   synthesise an arbitrary provider id this way.
3. The credentialing read uses `createAdminClient()` (server-only;
   service-role key never reaches the browser) and is **constrained by
   `.in("provider_id", providerIds)`** to the *exact* set of providers
   surfaced by step 2 — i.e. only providers this facility has already had a
   candidate submitted for.
4. `provider_credentials` is queried with `.neq("type", "malpractice")` to
   mirror the non-privileged staff view (`cred_select`, 0003).
5. The verdict is computed server-side; the raw `credentialing_items` rows
   and the raw `provider_credentials` rows never reach JSX.
6. The page itself only ever renders the four narrowed fields from
   `facilityReadinessFor`.

Why admin client and not an additive RLS policy: the brief prefers
**no-migration** expansions where possible, and the security model above is
fully enforceable in one server component (the page is a server component;
the admin client is a server-only construct). A future run can promote this
to a DB-level policy if the read needs to move out of the page or into a
public-facing endpoint — but for a single facility-portal table that is
overkill today.

Degrades cleanly: if migration 0011 is absent the `credentialing_items` read
catches; every clinician reads back as "Onboarding pending" and the page does
not crash. Same for `provider_credentials`. The KPI strip shows truthful
counts under either scenario.

**Files changed (all additive — no working feature modified):**

- `src/lib/facility-readiness.ts` — *new.* Narrowing adapter over
  `computeReadiness` (`facilityReadinessFor`, `facilityReadinessUnknown`,
  `FACILITY_READINESS_ORDER`, `facilityReadinessLabel`,
  `FacilityReadinessSignal`). The module docblock spells out exactly which
  internal fields it drops and why.
- `src/app/(facility)/facility/candidates/page.tsx` — *edited.* Added the
  admin-client readiness load (with explicit security-model comment),
  KPI strip, the Readiness column on the table, and a small copy refresh on
  the page footer reflecting the new signal. No structural change to the
  existing query path, the stage-filter logic, or the table's other columns.

No migration required. No new icon, no new route, no nav-entry change — the
signal lives inside the page the facility contact already opens.

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint` → "No
ESLint warnings or errors"; `npx next build` → "Compiled successfully", types
valid, static generation **36/36** (unchanged from 2026-05-27 — this run adds
no new route), exit 0, `/facility/candidates` present in the route manifest
as a dynamic route.

Sandbox note (same workaround as every prior run / QA-REPORT.md): the
repo's `node_modules` was installed on macOS and the build sandbox is
Linux/arm64. `next build` was run in a throwaway `/tmp/alignmd-build` copy
where `next` was pinned to **14.2.33** (the latest version with a published
`@next/swc-linux-arm64-gnu`) and `layout.tsx` was swapped to a system-font
stack (the real layout uses `next/font/google`, which needs network).
**No source file in the repo was modified for the build** — the repo stays
on next 14.2.35 with the real Google-font layout and the darwin swc binary;
the throwaway copy was deleted afterward. `tsc` and `next lint` were run
directly against the real repo and were clean on the first attempt — no
source-level adjustments were needed.

### Shipped?

**Not deployed.** All three checks passed, but `npx vercel --prod` cannot
run autonomously: there is no Vercel auth token in the sandbox (no
`VERCEL_TOKEN`, no `~/.local/share/com.vercel.cli/` auth dir), and the
Vercel CLI's package install itself errors with `EAI_AGAIN
registry.npmjs.org` from inside the sandbox. Same two constraints every
prior run hit. The code is verified and safe to deploy.

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a machine
  logged in to Vercel. This ships the whole repo, so it also clears the
  earlier alignmd deploy backlog along with this run. No new operator
  to-do was added — this expansion needs no migration (the brief scopes
  operator-todos to migrations) and the deploy backlog already exists.
- **Migration:** none for this expansion. (`0011_credentialing.sql` still
  wants applying — `todo-15` — for the credentialing packet to hold real
  data; until then `/facility/candidates` shows every submitted clinician as
  "Onboarding pending," which is by design and accurate under that state.)

### Ideas noted for future runs (do not rebuild the above)

- Clinician-portal mirror of `/opportunities` — still the natural next
  symmetry: a provider's-eye view of "open roles you're a match for, and
  what's left before you can be placed into them." Unblock requires a small
  additive RLS policy on `jobs` permitting providers to read open jobs they
  are a fair-or-better match for (or a derived public-view table the staff
  populates from `/opportunities`).
- "Stale submissions" overlay on `/pipeline` — submissions that have sat in
  one stage past that stage's median dwell-time (research has named
  candidate response rate inside 48 h a tracked SLA). Builds on `reports.ts`
  and the existing stage-counts logic.
- Promote the facility-side readiness scoping from page-level (admin client
  in `candidates/page.tsx`) to a DB-level additive RLS policy
  (`credentialing_items_facility_submitted_read` /
  `cred_facility_submitted_read`, mirroring `provider_facility_contact_read`
  from 0007). Would let the readiness signal move into other facility
  surfaces — facility dashboard KPI, the per-job candidate ranking, an
  emailed digest — without rewriting the scoping each time. Needs a small,
  well-scoped migration.
- Email/Slack digest of today's top picks delivered at 8am — turns
  `/today` into a push, not a pull. Bigger than one run; needs a
  scheduled-task hook and a delivery integration.

---

## 2026-05-29 — Pipeline aging / stale-card overlay (`/pipeline`)

Layers per-stage dwell-time SLAs onto the existing pipeline board: each
card now flags when it has sat in its stage past the stage's expected
dwell time, with a KPI strip above the board, per-column stale counts,
and per-card "Stale Nd" / "Watch Nd" badges. Picks up the "stale
submissions" overlay future-idea carried in the 2026-05-27 entry — the
single remaining no-migration candidate from the open future-ideas list.

### Research

Web search across the four briefed areas (current as of May 2026):

- **Product features.** The 2026 ATS guidance is unanimous: every row in
  a pipeline tracker must carry a current-stage + next-action-date pair,
  and analytics on dwell-time-per-stage is the differentiator that
  separates ATS-as-a-database from ATS-as-an-operations-tool. Spreadsheet
  SLA tracking is "unsustainable" — by the time a recruiter manually
  calculates how long each candidate has been in each stage, the data is
  stale and the breach has already caused damage.
- **Competitors.** Medely's Talent Fusion sells the *real-time view*
  framing — "leaders can act before gaps disrupt care." Across
  Medely / Nomad / Trusted / ShiftKey / Vivian / Barton the open gap is
  the same: operational visibility that turns a static pipeline into a
  *prioritised action list*, surfaced on the board the recruiter is
  already on.
- **Market & compliance.** Time-to-fill for an experienced RN runs
  80–109 days (average 94). Hospital submission→offer SLA target is
  ~12 days when SLAs are enforced; Boundee's 2026 piece found the
  unenforced-SLA reality runs to ~42 days. Candidate response inside
  48 h is now a tracked SLA in 93% of ATS-using shops (2026 — 93% of
  recruiters report using an ATS). eNLC at 43 jurisdictions; no compact
  changes since the 2026-05-28 run.
- **Growth & positioning.** 41% of healthcare recruiters self-describe
  as overworked; the named cure is to "sort candidate pipelines by
  priority with red/yellow flags on actions needed" — i.e. surface the
  stale work on the board, not on a separate report. This is a *speed*
  lever — moving cards faster directly compresses the 80+ day
  time-to-fill window.

### Candidates considered

1. **Pipeline aging / stale-card overlay on `/pipeline`** — additive
   edits to one staff page: KPI strip, per-column stale counts, per-card
   aging badges, an aging-band filter chip toolbar, and a new pure
   `src/lib/pipeline-aging.ts` module. No migration. *(picked)*
2. Clinician-portal mirror of `/opportunities` — still blocked by the
   `jobs_provider_submitted_read` RLS policy. Unblock requires a small
   additive RLS policy on `jobs` permitting providers to read open jobs
   they are a fair-or-better match for, OR a derived public-view table
   the staff populates from `/opportunities`. Deferred again — fits the
   "small, well-scoped RLS migration" niche the brief allows but is
   genuinely a *migration* expansion, where this run's no-migration
   alternative was equally strong.
3. Promote the facility-side readiness scoping from page-level
   admin-client to a DB-level additive RLS policy
   (`credentialing_items_facility_submitted_read` /
   `cred_facility_submitted_read`). Real value (would let the signal
   move into other facility surfaces without rewriting the scoping),
   but the page-level scope shipped 2026-05-28 already enforces the
   security model and a follow-on migration is best done when a second
   facility surface actually needs the signal. Carried forward.
4. Email/Slack digest of `/today` at 8am — still bigger than one run
   (scheduled-task hook + delivery integration). Carried forward.

### Picked — and why

**Candidate 1.** It is the single highest-value, well-scoped move
available today. The research is unanimous that *dwell-time visibility
on the board* — not a separate report — is the lever that compresses
time-to-fill and turns a 70-role pile into a prioritised list a
recruiter can work at 9am. AlignMD already had a working pipeline board
(`/pipeline`) but it surfaced only stage counts; nothing told the
recruiter *which* cards were past their SLA, despite the system having
the timestamps to compute it. The overlay closes that gap on the page
they are already on — the 2026-05-27 log entry called this out as a
future idea precisely because it builds on `reports.ts` semantics and
the existing stage-counts logic.

It needs **no DB migration**, edits **no working stage-move logic** (the
existing `changeStage` forms and their keyboard order are preserved
verbatim), reuses `PIPELINE_STAGES` / `STAGE_LABELS` and the existing
`kpi-grid` / `toolbar` / `badge-*` design tokens, and was built *and*
verified in one run. It directly serves the brief's standing direction
(recruiter-focused operational depth) without rewriting any working
credentialing logic.

### What was built

A new pure module **`src/lib/pipeline-aging.ts`**:

- `STAGE_SLA_DAYS` — per-stage dwell-time targets, calibrated from the
  2026 research: `new 7d`, `screen 5d`, `credentialing 14d`,
  `submitted 7d`, `interview 5d`, `offer 3d`, `placed null` (no
  target — terminal state). Credentialing gets a deliberately longer
  budget because verification genuinely takes 60–90 days end-to-end
  (per the 2026-05-25 / 2026-05-27 research) and flagging every
  credentialing card stale on day 8 would be noise.
- `classifyAging(stage, updatedAt, now)` — returns one of
  `fresh` / `watch` / `stale` / `none`. `watch` is the 2-day amber
  band immediately before the threshold so a recruiter sees a card
  approaching SLA *before* it breaches. `none` covers `placed`,
  which has no target by design. A missing timestamp returns
  `fresh` rather than crying wolf on partial data.
- `summarizeBoard(cards)` — rolls the per-card verdicts into the
  KPI strip + per-column figures the page renders. Worst-stage is
  surfaced as the KPI sub-line so the recruiter can see at a glance
  *where* the pile is.
- `AGING_META`, `AGING_FILTERS`, `passesFilter`, `agingSummary` —
  UI-mapping helpers so the page stays presentational.

**The pipeline page (`src/app/(app)/pipeline/page.tsx`) was edited
additively** — every existing element survived verbatim (the two-form
stage-move arrows, the `kard` layout, the avatar + clinician-role +
specialty line, the existing column structure and ordering across
`PIPELINE_STAGES`):

- The provider read now also selects `updated_at`; the list is ordered
  `updated_at` ascending so the stalest cards naturally sit at the top
  of each column.
- A four-card **KPI strip** above the board: Active cards, Stale,
  Watch, Avg days since update. The "Stale" card's sub-line names the
  worst stage and its count.
- A four-chip **filter toolbar** (`All cards / Stale / Watch / On
  track`) — `?filter=` driven, exactly the pattern `/readiness` and
  `/opportunities` use. The "On track" band includes cards in
  `none`-SLA stages (`placed`) so the count adds up.
- Each column header now carries a small `{Nd SLA}` label so the
  recruiter sees the target without leaving the board, plus a red
  `stale` count badge if any of that column's cards are over SLA. The
  count badge is hidden when zero.
- Each card now shows a coloured `Stale · Nd` or `Watch · Nd` badge
  under its name/role line — only when applicable. Fresh and terminal
  cards stay clean. The badge carries a tooltip with the plain-English
  `agingSummary` ("18 days in Credentialing — past the 14-day target.").
- Within each column the cards now sort stale → watch → fresh, so the
  most-actionable card is at the top regardless of which band the
  recruiter is viewing.
- A small footer line spells the per-stage SLA list for the
  ground-truth answer to "where do these numbers come from?"

**Why `providers.updated_at` and not the audit_log:** the `changeStage`
action stamps `updated_at` on every transition (see
`src/app/(app)/providers/actions.ts`); any other recruiter edit
(profile edit, archive/restore) also stamps it. That is the right
semantics for "has anyone done anything with this provider recently?" —
which is exactly what stale-card means. The `audit_log` table holds
true per-field stage history but is admin-read-only under RLS (0003,
`audit_admin_read`); using it from a recruiter session would need a
migration. The module's docblock explains this trade-off so a future
run that *does* migrate the audit access can swap the proxy without
rewriting the classification.

**Files changed (all additive):**

- `src/lib/pipeline-aging.ts` — *new.* Pure classification + rollup
  module. Module docblock spells out the SLA calibration and the
  `updated_at`-as-proxy decision.
- `src/app/(app)/pipeline/page.tsx` — *edited.* KPI strip, filter
  toolbar, per-column stale badge + SLA label, per-card aging badge,
  sort-by-stalest-first. The existing stage-move forms and their
  keyboard order are preserved verbatim; this is purely a visibility
  overlay.

No migration required. No new icon, no new route, no sidebar change. No
new dependency.

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint` →
"No ESLint warnings or errors"; `npx next build` → "Compiled
successfully", types valid, static generation **36/36** (unchanged from
2026-05-28 — this run adds no new route), exit 0, `/pipeline` present
in the route manifest as a dynamic route.

Sandbox note (same workaround as every prior run / QA-REPORT.md): the
repo's `node_modules` was installed on macOS and the build sandbox is
Linux/arm64. `next build` was run in a throwaway `/tmp/alignmd-build`
copy where `next` was pinned to **14.2.33** (the latest version with a
published `@next/swc-linux-arm64-gnu`) and `layout.tsx` was swapped to a
system-font stack (the real layout uses `next/font/google`, which needs
network). **No source file in the repo was modified for the build** —
the repo stays on next 14.2.35 with the real Google-font layout and
the darwin swc binary; the throwaway copy was deleted afterward. `tsc`
and `next lint` were run directly against the real repo and were clean
on the first attempt — no source-level adjustments were needed.

### Shipped?

**Not deployed.** All three checks passed, but `npx vercel --prod`
cannot run autonomously: there is no Vercel auth token in the sandbox
(no `VERCEL_TOKEN`, no `~/.local/share/com.vercel.cli/` auth dir), and
the Vercel CLI's package install itself errors with `EAI_AGAIN
registry.npmjs.org` from inside the sandbox. Same two constraints every
prior run hit. The code is verified and safe to deploy.

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a
  machine logged in to Vercel. This ships the whole repo, so it also
  clears the earlier alignmd deploy backlog along with this run. No new
  operator to-do was added — this expansion needs no migration (the
  brief scopes operator-todos to migrations) and the deploy backlog
  already exists.
- **Migration:** none for this expansion. (`0011_credentialing.sql` is
  unrelated to this page's behaviour; aging is computed from
  `providers.updated_at`, which is on the core schema 0001 and always
  present.)

### Ideas noted for future runs (do not rebuild the above)

- Clinician-portal mirror of `/opportunities` — still the natural next
  symmetry: a provider's-eye view of "open roles you're a match for,
  and what's left before you can be placed into them." Unblock requires
  a small additive RLS policy on `jobs` permitting providers to read
  open jobs they are a fair-or-better match for (or a derived public-
  view table the staff populates from `/opportunities`). Now the
  highest-value remaining idea and a reasonable single-run migration
  scope.
- Promote pipeline aging from the `updated_at` proxy to a precise
  `stage_entered_at` column on `providers` (a small migration: add the
  column with a default of `created_at`, backfill from `audit_log`
  where available, update `changeStage` to write it). Would give a
  true per-stage age rather than a "last recruiter-action" age. Layer
  on `/pipeline` as a one-line swap once the column exists.
- Promote the facility-side readiness scoping from page-level
  admin-client to a DB-level additive RLS policy
  (`credentialing_items_facility_submitted_read` /
  `cred_facility_submitted_read`, mirroring
  `provider_facility_contact_read` from 0007). Carried forward — best
  done when a second facility surface actually needs the readiness
  signal.
- A "stalest 5" widget on `/dashboard` using `summarizeBoard` and the
  same `pipeline-aging` engine — would surface the same insight on the
  morning landing page, mirroring how `/today` surfaces opportunity
  priorities.
- Email/Slack digest of today's top picks delivered at 8am — turns
  `/today` into a push, not a pull. Bigger than one run; needs a
  scheduled-task hook and a delivery integration.

---

## 2026-06-01 — Pipeline-at-risk widget on `/dashboard`

The morning-briefing follow-on to the 2026-05-29 pipeline-aging engine:
the explicit "stalest 5 widget on `/dashboard`" future idea, delivered.
Surfaces the stalest pipeline cards on the page recruiters open first
each day, so SLA breaches show up before the recruiter has to navigate
to `/pipeline` to find them.

### Research

Web search across the four briefed areas (current as of June 2026):

- **Product features.** The 2026 healthcare-staffing software consensus
  (Bullhorn, symplr Recruiting, Vars Health, iCIMS) treats the recruiter
  dashboard as the *operational* surface — a single morning view that
  tracks pipeline health, time-to-fill, source performance, and stage
  velocity. symplr ships custom dashboards that scheduled-email reports;
  Bullhorn pairs AI matching with credential-expiration alerts and
  "real-time pipeline visibility across specialties and facilities" — the
  shift is from "ATS as database" to "ATS as morning operations tool."
- **Competitors.** Medely Talent Fusion (Jan 2026) sells the *real-time
  view* framing — "leaders can act before gaps disrupt care." Across
  Medely / Bullhorn / symplr / iCIMS / Vivian the open gap on competitor
  dashboards is the same: stage counts on the landing page, but no
  visibility on *which* cards are past their stage SLA without leaving
  the dashboard. The dashboard becomes a stop on the way to work, not
  the work itself.
- **Market & compliance.** Healthcare recruiters now average **70 open
  roles** at a time and 41% self-describe as overworked (carried
  forward from prior runs). The 2026 staffing-software guidance is
  unanimous: **review operational metrics, pipeline stage velocity, and
  submission ratios weekly** for optimal tracking, and surface the at-
  risk cards on the board the recruiter is already on. The new framing
  is "health score per requisition" — pipeline depth + velocity +
  readiness — but the cheapest first move is just *which cards are
  stale right now*.
- **Growth & positioning.** Hospital submission→offer SLA targets run
  ~12 days when enforced (Boundee 2026: 42 days when unenforced); the
  fix every guide names is the same — surface dwell time per card on
  the recruiter's *first* view of the day. Time-to-fill compresses when
  the stale cards stop hiding.

### Candidates considered

1. **"Pipeline at risk" widget on `/dashboard`** — the explicit
   future idea from the 2026-05-29 log entry. Edits one staff page
   (the dashboard) purely additively: a new card above the existing
   "Credentials needing attention" widget showing the top 5 stalest
   in-pipeline cards, with a stale/watch headline rollup and a worst-
   stage callout. No migration, no new lib module — reuses
   `classifyAging` / `summarizeBoard` / `AGING_META` from the
   existing `pipeline-aging.ts` engine verbatim. *(picked)*
2. Clinician-portal mirror of `/opportunities` — still blocked by the
   `jobs_provider_submitted_read` RLS policy. Unblock requires a small
   additive RLS policy on `jobs` (or a derived public-view table).
   Carried forward; well-scoped as a *migration* run.
3. Per-requisition health score on `/jobs` (pipeline depth + velocity
   + readiness) — strong follow-on, but it edits the high-traffic
   `/jobs` list and would meaningfully overlap with `/opportunities`.
   Cheaper to surface the stalest-cards insight first and use that
   landing-page slot for a second operational widget later.
4. Promote pipeline aging from the `providers.updated_at` proxy to a
   precise `stage_entered_at` column — real value, but a migration
   and the proxy is good enough for the morning briefing today.
5. Promote facility-side readiness scoping to a DB-level RLS policy —
   real value, but best done when a second facility surface actually
   needs the signal. Carried forward.
6. Email/Slack digest of `/today` at 8am — still bigger than one run.

### Picked — and why

**Candidate 1.** It is the single highest-value, well-scoped move
available today. The research is unanimous that **the dashboard is the
recruiter's first stop** — and AlignMD's `/dashboard` was a stage-count
+ credentials-at-risk + recent-activity surface, but had nothing about
the pipeline-aging signal shipped 2026-05-29. The widget closes the
loop: the stale-card insight that lives on `/pipeline` now appears on
the page the recruiter opens before navigating anywhere. The 2026-05-29
log entry called this out *by name* as a future idea
("would surface the same insight on the morning landing page,
mirroring how `/today` surfaces opportunity priorities").

It needs **no DB migration**, edits **no working logic** (the existing
KPI strip, credentials card, jobs card, activity feed, and pipeline-
snapshot column all survive verbatim — the new card is inserted above
them in the stack), reuses `classifyAging` / `summarizeBoard` /
`AGING_META` / `agingSummary` verbatim so the dashboard widget and the
`/pipeline` board can never drift, and is the smallest expansion that
delivers real morning-briefing operational value. It directly serves
Anthony's recruiter-focused operational depth without touching any
credentialing logic.

### What was built

A new **"Pipeline at risk"** card on `/dashboard`, placed at the top of
the left-column stack so it leads the morning briefing (above
*Credentials needing attention*, *Newest open jobs*, and *Recent
activity*):

- **Headline rollup** — stale count (red badge), watch count (amber
  badge), and a worst-stage callout (e.g. "worst stage: Credentialing
  (3)") from `summarizeBoard`'s `worstStage` field. The recruiter sees
  at a glance how bad the pile is and where it is.
- **Top-5 stalest cards table** — Clinician (deep-links to
  `/providers/[id]`) / Stage / Days since update / Aging badge with the
  same `Stale · Nd` / `Watch · Nd` tooltip language as `/pipeline`. The
  list is filtered to the `stale` and `watch` bands only (fresh and
  terminal `placed` cards are noise on a "pipeline at risk" widget),
  sorted stale → watch and within each band by days descending so the
  oldest breaches surface first.
- **"View board →"** link to `/pipeline?filter=stale` so the recruiter
  can drill into the full list from the dashboard.
- **Empty-state path** — when no card is stale *or* watch, the widget
  renders a clean *"Pipeline is on track"* empty state instead of an
  empty table. Excludes `placed` cards entirely because that terminal
  stage has no SLA (per `STAGE_SLA_DAYS` in `pipeline-aging.ts`).

The cross-stage aging math is unchanged — the dashboard runs the same
`classifyAging` on `inPipeline` rows it already fetched, plus the
single new `updated_at` column on the providers select. No new SQL
table, no new Supabase round-trip — the widget is computed from
already-fetched data plus one extra column.

**Files changed (all additive — one file):**

- `src/app/(app)/dashboard/page.tsx` — *edited.* Added
  `pipeline-aging` imports and a `badgeTone` helper (mirroring
  `/today` and `/opportunities`); added `updated_at` to the providers
  select; computed `agingCards`, `agingSummaryRollup`, and `stalest`
  (top-5) from `inPipeline`; inserted the new "Pipeline at risk" card
  at the top of the left stack. No existing KPI tile, card, link,
  layout container, or query was touched.

No migration required. No new lib module, no new icon (`IconPipeline`
already existed for the sidebar nav entry), no new route, no sidebar
change. No new dependency.

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint` →
"No ESLint warnings or errors"; `npx next build` → "Compiled
successfully", types valid, static generation **36/36** (unchanged from
2026-05-29 — this run adds no new route), `/dashboard` present in the
route manifest as a dynamic route. All three checks passed on the first
attempt — no source-level adjustments were needed.

Sandbox note (same workaround as every prior run / QA-REPORT.md): the
repo's `node_modules` was installed on macOS and the build sandbox is
Linux/arm64. `next build` was run in a throwaway `/tmp/alignmd-build`
copy where `next` was pinned to **14.2.33** (the latest version with a
published `@next/swc-linux-arm64-gnu`) and `layout.tsx` was swapped to a
system-font stack (the real layout uses `next/font/google`, which needs
network). **No source file in the repo was modified for the build** —
the repo stays on next 14.2.35 with the real Google-font layout and
the darwin swc binary; the throwaway copy was deleted afterward. `tsc`
and `next lint` were run directly against the real repo.

### Shipped?

**Not deployed.** All three checks passed, but `npx vercel --prod`
cannot run autonomously: there is no Vercel auth token in the sandbox
(no `VERCEL_TOKEN`, no `~/.local/share/com.vercel.cli/` auth dir), and
the Vercel CLI's package install itself errors with `EAI_AGAIN
registry.npmjs.org` from inside the sandbox. Same two constraints
every prior run hit. The code is verified and safe to deploy.

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a
  machine logged in to Vercel. This ships the whole repo, so it also
  clears the earlier alignmd deploy backlog along with this run. No new
  operator to-do was added — this expansion needs no migration (the
  brief scopes operator-todos to migrations) and the deploy backlog
  already exists.
- **Migration:** none for this expansion. (Aging is computed from
  `providers.updated_at`, which is on the core schema 0001 and always
  present; the widget therefore shows real data the moment it deploys.)

### Ideas noted for future runs (do not rebuild the above)

- Clinician-portal mirror of `/opportunities` — still the natural next
  symmetry: a provider's-eye view of "open roles you're a match for,
  and what's left before you can be placed into them." Unblock requires
  a small additive RLS policy on `jobs` permitting providers to read
  open jobs they are a fair-or-better match for (or a derived public-
  view table the staff populates from `/opportunities`). Now the
  highest-value remaining idea and a reasonable single-run migration
  scope.
- Per-requisition health score on `/jobs` (pipeline depth × velocity ×
  readiness, à la the 2026 "req health score 0–100" framing) — would
  carry the morning-briefing operational lens through to the jobs list.
  Edits a high-traffic working page; do it as a new column or a small
  new `/jobs/health` page to minimise risk.
- Promote pipeline aging from the `providers.updated_at` proxy to a
  precise `stage_entered_at` column on `providers` (a small migration:
  add the column with a default of `created_at`, backfill from
  `audit_log` where available, update `changeStage` to write it).
  Would give a true per-stage age rather than a "last recruiter-action"
  age. Layer on `/pipeline` and the new dashboard widget as a one-line
  swap once the column exists.
- Promote the facility-side readiness scoping from page-level
  admin-client to a DB-level additive RLS policy
  (`credentialing_items_facility_submitted_read` /
  `cred_facility_submitted_read`, mirroring
  `provider_facility_contact_read` from 0007). Carried forward.
- A second dashboard widget mirroring `/today`'s top picks — top 3
  submit-ready leads on the morning landing page. Carries the same
  "morning briefing" pattern through to the opportunities engine.
  Cheaper to defer until a clear use signal — the cross-product
  computation is heavier than the aging proxy and would add real load
  to every dashboard render.
- Email/Slack digest of today's top picks delivered at 8am — turns
  `/today` into a push, not a pull. Bigger than one run; needs a
  scheduled-task hook and a delivery integration.

---

## 2026-06-02 — Per-requisition health board (`/jobs/health`)

The job-side complement to the pipeline-aging engine shipped 2026-05-29
and the dashboard pipeline-at-risk widget shipped 2026-06-01. Where
those two answer "which clinician cards have sat too long?", this
expansion answers the question a recruiting lead starts the *week*
with: "across all my open jobs, which requisitions are at risk of NOT
being filled — which jobs need intervention, and which are healthy?"
Picks up the explicit "per-requisition health score on `/jobs`" future
idea carried in the 2026-06-01 log entry, delivered as a new page (not
a column on the high-traffic `/jobs` list) exactly as that entry
recommended to minimise risk.

### Research

Web search across the four briefed areas (current as of June 2026):

- **Product features.** The 2026 healthcare-ATS consensus (Bullhorn,
  symplr, iCIMS, Vars Health) names **job aging dashboards** — "project
  hiring demand using historical time-to-fill, current attrition, and
  open requisitions; any role where remaining days are fewer than its
  historical time-to-fill indicates a pipeline capacity gap" — as the
  differentiator that separates ATS-as-database from ATS-as-operations-
  tool. The framing has shifted from sortable lists to *prioritised
  action lists*: requisitions surface to the top of the recruiter view
  in proportion to how at-risk they are.
- **Competitors.** Medely's Talent Marketplace and Bullhorn's healthcare
  suite both ship dashboard analytics on time-to-fill, source
  performance and stage velocity — but the open gap across Medely /
  Bullhorn / Vivian / symplr / iCIMS is still per-requisition aging on
  a recruiter-facing surface. Most platforms expose pipeline depth and
  stage counts; few cross those with days-open into a single per-job
  health verdict the recruiter sees on a board.
- **Market & compliance.** Healthcare time-to-fill remains brutal:
  Apploi names 86 days application→start for a permanent nurse on
  average; viva-it / Incredible Health put experienced-RN benchmarks at
  80–109 days (mean 94); the fastest quartile of employers close in 15
  days, and the Incredible Health platform median is 24 days. Recruiter
  caseloads now average ~70 concurrent open reqs (carried forward); 50+
  reqs per recruiter is "a capacity problem no process change can fix."
  No new compact or IMLC changes since 2026-06-01.
- **Growth & positioning.** The 2026 dashboard guidance is unanimous:
  "review operational metrics, pipeline stage velocity, and submission
  ratios weekly" and surface the at-risk requisitions where the
  recruiter is already looking. The compression lever: when stale
  requisitions stop hiding, time-to-fill drops because the desk
  intervenes earlier — escalates sourcing, broadens the requirement,
  or pulls a candidate from a parallel role.

### Candidates considered

1. **Per-requisition health board at `/jobs/health`** — new page that
   crosses days-open with pipeline depth and the opportunities-engine
   supply counts, classifying each open job into At risk / Watch / On
   track / Filled. New pure module `src/lib/job-health.ts`, new page,
   one additive header-link on `/jobs`. Reuses `scoreMatch`,
   `computeReadiness`, `classifyOpportunity` verbatim — same engine as
   `/opportunities` so the two pages can never disagree. No migration.
   *(picked)*
2. Clinician-portal mirror of `/opportunities` — still blocked by the
   `jobs_provider_submitted_read` RLS policy. Carried forward (now five
   runs in a row); well-scoped as a small-migration run.
3. Promote pipeline aging from the `providers.updated_at` proxy to a
   precise `stage_entered_at` column — a small migration with real
   value, but the proxy is good enough for the morning briefing today
   and the `/jobs/health` board is the more strategically valuable
   no-migration option this week.
4. Promote facility-side readiness scoping from page-level admin-client
   to a DB-level additive RLS policy. Carried forward — best done when
   a second facility surface actually needs the signal.
5. Second dashboard widget mirroring `/today`'s top picks. Carried
   forward — the 2026-06-01 log already noted the cross-product
   computation is heavier than the aging proxy and should wait for a
   clear use signal.
6. Email/Slack digest of `/today` at 8am — still bigger than one run.

### Picked — and why

**Candidate 1.** It is the single highest-value, well-scoped move
available today. The research is unanimous that **per-requisition aging
on a recruiter-facing board** — days open × pipeline depth × matched
candidate supply — is the next operational lens after pipeline-side
aging, and the 2026-06-01 log entry explicitly named it as candidate #3
with the guidance "do it as a new column or a small new `/jobs/health`
page to minimise risk." The page choice respects that brief: it edits
no working logic on the high-traffic `/jobs` list, adds one purely
additive header link there, and lives at its own route. It needs **no
DB migration**, reuses every existing engine (`scoreMatch` /
`computeReadiness` / `classifyOpportunity`) verbatim so the health
verdict and `/opportunities` can never drift, and was built *and*
verified in one run. It directly serves Anthony's recruiter-focused
operational depth without rewriting any credentialing logic.

### What was built

A new **Job health** page at `/jobs/health` (staff CRM). For every open
requisition it computes three signals and rolls them into a single
verdict:

- **Age** — days since `jobs.created_at`. Calibrated thresholds (see
  `src/lib/job-health.ts`): watch at 30d+, at-risk at 60d+. Both sit
  well *below* the 80-day national average so an at-risk verdict
  actually means "this is in the slow half" — not "this has hit the
  national benchmark and is therefore beyond saving."
- **Pipeline depth** — submissions on this job, bucketed into active
  (`credentialing`/`submitted`/`interview`/`offer`), early-stage
  (`new`/`screen`), and placed (terminal). Active submissions are the
  movement signal: a 90-day-old job with an interview scheduled is
  on-track, not at-risk.
- **Matched candidate supply** — submit-ready / in-progress / blocked
  counts from the opportunities engine, computed the same way
  `/opportunities` computes them. A job with no fair-or-better roster
  match at all carries a `noSupply` flag, which forces an at-risk
  verdict regardless of age (the desk has no candidate to send).

The decision tree (in `classifyJobHealth`) makes movement dominant
over age, and absence of supply dominant over youth. A 10-day-old job
with no roster match is at-risk; a 90-day-old job with an active
interview is on-track. A placed submission is terminal — `filled`.

KPI strip across the top (Open jobs / At risk / Watch / Oldest
unfilled), a four-chip filter toolbar (All open / At risk / Watch / On
track) driven by `?filter=` exactly like `/readiness` /
`/opportunities` / `/pipeline`, and a sorted table with worst-first
ordering (at-risk → watch → on-track; within a band, oldest first).
Each row shows the requisition (deep-linked to `/jobs/[id]`), age in
days with the open-date, the pipeline bucket counts, the matched-
candidate-supply badges (ready / in progress / blocked / no roster
match), and the health verdict badge with a hover tooltip carrying the
plain-English reason from `classifyJobHealth`.

`src/lib/job-health.ts` is pure — no I/O. It mirrors how
`pipeline-aging.ts`, `readiness.ts`, `opportunities.ts`, and `today.ts`
keep their arithmetic separate from Supabase, so the verdict is
unit-testable without a database and any future surface (a dashboard
widget, a digest email) can reuse the same engine.

Degrades cleanly: if migration 0011 is absent the `credentialing_items`
query errors, every matched clinician reads as "credentialing
underway" (so the blocked/ready split collapses into in-progress), and
a one-line info banner at the top of the page explains why. The aging
and pipeline-depth signals stay live regardless — they only need core
schema 0001.

**Files changed (all additive):**

- `src/lib/job-health.ts` — *new.* Pure classification + roll-up module
  (`classifyJobHealth`, `summarizeJobHealth`, `daysOpen`,
  `JOB_HEALTH_META`, `JOB_HEALTH_ORDER`, `JOB_HEALTH_FILTERS`,
  `passesJobHealthFilter`, `IN_PIPELINE_STAGES`, the two threshold
  constants). Module docblock spells out the threshold calibration and
  the dominance order (movement > age, no-supply > youth).
- `src/app/(app)/jobs/health/page.tsx` — *new.* The Job health page.
- `src/app/(app)/jobs/page.tsx` — *edited additively.* Added one icon
  import (`IconActivity`, already in `icons.tsx`) and one header `<Link
  href="/jobs/health">Job health</Link>` next to the existing "Scanned
  jobs" / "Post a job" buttons. No structural change to the table,
  the status-filter toolbar, the pagination, or any query. This mirrors
  how the dashboard pipeline-at-risk widget (2026-06-01) was wired into
  an existing page additively.

No migration required. No new icon, no new route in the sidebar (the
existing `/jobs` sidebar entry covers both `/jobs` and `/jobs/health`
via the `pathname.startsWith(href + "/")` active rule). No new
dependency.

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint`
→ "No ESLint warnings or errors"; `npx next build` → "Compiled
successfully", types valid, static generation **37/37** (was 36 — the
new `/jobs/health` route), `/jobs/health` present in the route
manifest as a dynamic route. All three checks passed on the first
attempt — no source-level adjustments were needed.

Sandbox note (same workaround as every prior run / QA-REPORT.md): the
repo's `node_modules` was installed on macOS and the build sandbox is
Linux/arm64. `next build` was run in a throwaway `/tmp/alignmd-build`
copy where `next` was pinned to **14.2.33** (the latest version with a
published `@next/swc-linux-arm64-gnu`) and `layout.tsx` was swapped to
a system-font stack (the real layout uses `next/font/google`, which
needs network). **No source file in the repo was modified for the
build** — the repo stays on next 14.2.35 with the real Google-font
layout and the darwin swc binary; the throwaway copy was deleted
afterward. `tsc` and `next lint` were run directly against the real
repo.

### Shipped?

**Not deployed.** All three checks passed, but `npx vercel --prod`
cannot run autonomously: there is no Vercel auth token in the sandbox
(no `VERCEL_TOKEN`, no `~/.local/share/com.vercel.cli/` auth dir), and
the Vercel CLI's package install itself errors with `EAI_AGAIN
registry.npmjs.org` from inside the sandbox. Same two constraints
every prior run hit. The code is verified and safe to deploy.

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a
  machine logged in to Vercel. This ships the whole repo, so it also
  clears the earlier alignmd deploy backlog along with this run. No
  new operator to-do was added — this expansion needs no migration
  (the brief scopes operator-todos to migrations) and the deploy
  backlog already exists.
- **Migration:** none for this expansion. (Aging is computed from
  `jobs.created_at`, pipeline depth from `submissions.stage`, and
  matched-candidate supply from the same tables the opportunities
  engine already reads. `0011_credentialing.sql` still wants applying
  for the ready/blocked split to be meaningful; until then matched
  clinicians collapse into the "in progress" bucket, which is by
  design and the page surfaces a one-line info banner explaining the
  migration dependency.)

### Ideas noted for future runs (do not rebuild the above)

- Clinician-portal mirror of `/opportunities` — still the natural next
  symmetry: a provider's-eye view of "open roles you're a match for,
  and what's left before you can be placed into them." Unblock requires
  a small additive RLS policy on `jobs` permitting providers to read
  open jobs they are a fair-or-better match for (or a derived public-
  view table the staff populates from `/opportunities`). Now carried
  forward five runs in a row — likely the right time to take it next
  as the standing one-migration run.
- A "Jobs at risk" widget on `/dashboard` — top 3 at-risk requisitions
  on the morning landing page, mirroring the 2026-06-01 pipeline-at-
  risk widget pattern and reusing `classifyJobHealth` /
  `summarizeJobHealth` verbatim. Cheap, additive, and finishes the
  morning-briefing operational story.
- Promote pipeline aging from the `providers.updated_at` proxy to a
  precise `stage_entered_at` column — small migration. Carried
  forward.
- Promote facility-side readiness scoping from page-level admin-client
  to a DB-level additive RLS policy. Carried forward.
- Per-job *time-to-fill projection* — extend `job-health.ts` with a
  projected start-date estimate using the active-submission stage
  ages, the per-stage SLAs from `pipeline-aging.ts`, and the
  credentialing turnaround window. Would turn the health verdict into
  a calendar prediction the recruiter can communicate to the facility.
  Pure-module work; no migration.
- Email/Slack digest of today's top picks delivered at 8am — turns
  `/today` into a push, not a pull. Bigger than one run; needs a
  scheduled-task hook and a delivery integration.

---

## 2026-06-03 — "Jobs at risk" widget on `/dashboard`

The job-side complement to the 2026-06-01 pipeline-at-risk widget,
mirroring its pattern verbatim. Picks up the explicit future-idea
flagged in the 2026-06-02 log entry: *"A 'Jobs at risk' widget on
`/dashboard` — top 3 at-risk requisitions on the morning landing page,
mirroring the 2026-06-01 pipeline-at-risk widget pattern and reusing
`classifyJobHealth` / `summarizeJobHealth` verbatim. Cheap, additive,
and finishes the morning-briefing operational story."* Carries the
per-requisition aging signal from `/jobs/health` (shipped 2026-06-02)
into the morning briefing, where the recruiter is already looking.

### Research

Web search across the four briefed areas (current as of June 2026):

- **Product features.** Predictive analytics is now the 2026 ATS
  differentiator — modern healthcare ATSes "forecast time to fill and
  hiring spend for key positions" (urecruits 2026 top-ATS roundup) and
  the consensus dashboard surfaces "real-time visibility into
  time-to-fill (and its cost), source-of-hire effectiveness, and
  pipeline health for critical specialties" (varshealth 2026). The
  framing has shifted from sortable lists to prioritised action lists
  surfaced where the recruiter is already looking.
- **Competitors.** TargetRecruit's Provider-and-Group-Progress
  dashboard "identifies which providers are at risk or off track of
  hitting their start date based on activities not being completed" —
  a direct competitor signal for surfacing at-risk requisitions on a
  morning-briefing page. Bullhorn's healthcare suite ships "real-time
  pipeline visibility across specialties and facilities." Medely's
  Optimize layer (Jan 2026) "uses AI-driven demand forecasting to
  align staffing with patient volume." The open gap across the field
  is still per-requisition aging surfaced on the recruiter's *landing*
  page, not buried inside a secondary report.
- **Market & compliance.** Healthcare time-to-fill remains brutal:
  49 days for general health-care roles and 125+ days for physicians
  (national 2026 benchmarks), with credentialing turnaround at 60–90
  days (90–120 day average per drcredentialing 2026); recruiter
  caseloads ~70 concurrent open reqs (carried forward). 41% of
  recruiters report being overworked. AI-amplified desks see 51% more
  submissions and 22% higher fill rates (carried forward from prior
  research). No new compact / IMLC changes since 2026-06-02.
- **Growth & positioning.** AI tools that reduce time-to-fill by
  11+ days (recruiterflow 2026) are the dashboard table-stakes; the
  compression lever is when stale requisitions stop hiding, the desk
  intervenes earlier. Modern recruiter dashboards integrate candidate
  pipeline data with at-risk flags so leaders can "act before gaps
  disrupt care" (Medely Talent Fusion 2026 framing).

### Candidates considered

1. **"Jobs at risk" widget on `/dashboard`** — top 5 at-risk + watch
   requisitions on the morning landing page. Mirrors the proven
   2026-06-01 pipeline-at-risk widget pattern exactly. New lightweight
   classifier in `job-health.ts` (age + pipeline depth only — skips
   the (job × provider) cross-product so the widget renders cheaply
   on every dashboard load) plus one additive card on `/dashboard`.
   No migration. *(picked)*
2. Per-job time-to-fill projection — extend `job-health.ts` with a
   projected start-date estimate using the active-submission stage
   ages + `STAGE_SLA_DAYS` from `pipeline-aging.ts` + the
   credentialing turnaround window. High product-strategic value
   (TargetRecruit / Marketware ship this) but a heavier semantic move
   than the explicit "finish the morning-briefing story" carry-over;
   deferred for a future run.
3. Clinician-portal mirror of `/opportunities` — still blocked by the
   `jobs_provider_submitted_read` RLS migration. Carried forward.
4. Promote pipeline aging from the `providers.updated_at` proxy to a
   precise `stage_entered_at` column — small migration. Carried
   forward.
5. Promote facility-side readiness scoping to DB-level RLS. Carried
   forward.
6. Email/Slack digest of `/today` at 8am — still bigger than one run.

### Picked — and why

**Candidate 1.** It is the single highest-value, well-scoped move
available today, *because the 2026-06-02 log entry explicitly named
it as the next morning-briefing step with the recommendation "Cheap,
additive, and finishes the morning-briefing operational story."* The
prior run is the ground-truth signal of where the product should go
next, and this run honours it. The widget directly mirrors the proven
2026-06-01 pipeline-at-risk pattern that has already shipped: one
header rollup (red at-risk badge, amber watch badge, oldest-unfilled
days), a top-5 worst-first table, and a "View board →" deep link to
`/jobs/health?filter=at_risk` for the full picture. It is purely
additive (one new card on `/dashboard` placed directly under the
existing "Pipeline at risk" widget — no working card touched), needs
**no DB migration**, and could be built *and* verified in one run.

The 2026-06-02 entry called for "reusing `classifyJobHealth` /
`summarizeJobHealth` verbatim," but a literal verbatim reuse would
require running the full (job × provider) opportunities cross-product
on every dashboard render — the performance caveat noted in the
2026-06-01 entry. Instead, this run adds a new pure
`classifyJobHealthLite` companion to `job-health.ts` that uses only
age + pipeline-depth signals — the data the dashboard already has in
hand. The lite classifier is always consistent with the full engine
when movement exists or age forces a verdict at the same thresholds;
it can disagree only on the no-supply path (where it has no roster
data to check). The widget treats `/jobs/health` as the canonical
view and links there from the header. This preserves the dashboard's
fast-render property without losing the operational signal the carry-
over wanted.

### What was built

A new **"Jobs at risk"** card on `/dashboard`, placed directly under
the existing "Pipeline at risk" widget so the two morning-briefing
at-risk signals (card-side aging, requisition-side aging) sit
adjacent at the top of the left-column stack — the recruiter scans
both before scrolling.

- **Headline rollup** — at-risk count (red badge), watch count
  (amber badge), and the oldest-unfilled requisition's days-open.
- **Top-5 worst-first table** — Requisition (deep-links to
  `/jobs/[id]`) / Age in days / Pipeline (`N active`, `N early`, or
  `none`) / Health badge with the plain-English `reason` from
  `classifyJobHealthLite` as the hover tooltip. Sorted at-risk → watch
  and within each band by days-open descending so the oldest
  unintervened requisitions surface first.
- **"View board →"** link to `/jobs/health?filter=at_risk` so the
  recruiter can drill into the full classified board from the
  dashboard.
- **Empty-state path** — when no open requisition is at-risk *or*
  watch, the widget renders a clean *"Every open job has movement"*
  empty state.

The classifier is `classifyJobHealthLite` in `src/lib/job-health.ts`
— a new pure function that takes only age + submissions-bucket
counts. It is documented as the lightweight subset of
`classifyJobHealth` and explicitly notes the no-supply divergence so
the two engines stay honest about what each is computing. The
dashboard runs the lite classifier from the open-jobs and submissions
data it already fetched (the submissions query was extended from
`select("id")` to `select("id, job_id, stage")` — additive). No new
Supabase round-trip beyond that extension, no new lib module, no new
route, no sidebar change.

**Files changed (all additive — two files):**

- `src/lib/job-health.ts` — *edited additively.* Added
  `classifyJobHealthLite`, `JobHealthLiteInput`, `JobHealthLiteVerdict`
  (new exports only — the existing `classifyJobHealth` /
  `summarizeJobHealth` / `JOB_HEALTH_META` / thresholds / filter chip
  list are untouched). Module docblock for the new function spells
  out the dominance order (placed → active → age) and the
  no-supply divergence vs. the full engine.
- `src/app/(app)/dashboard/page.tsx` — *edited additively.* Added
  `IconActivity` to the existing icons import; added the `job-health`
  imports; extended the submissions query select from `"id"` to
  `"id, job_id, stage"`; computed `subsByJob`, `jobHealthCards`,
  `jobsAtRiskList`, `jobsAtRiskCount`, `jobsWatchCount`, and
  `oldestUnfilledDays` from `openJobs`/`submissions`; inserted the
  new "Jobs at risk" card directly under "Pipeline at risk" in the
  left-column stack. No existing KPI tile, card, link, layout
  container, or query was touched.

No migration required. No new icon (`IconActivity` already existed
and is already used on `/jobs/page.tsx` for the "Job health" link),
no new route, no sidebar change. No new dependency.

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint`
→ "No ESLint warnings or errors"; `npx next build` → "Compiled
successfully", types valid, static generation **37/37** (unchanged
from 2026-06-02 — this run adds no new route), `/dashboard` present
in the route manifest as a dynamic route. All three checks passed on
the first attempt — no source-level adjustments were needed.

Sandbox note (same workaround as every prior run / QA-REPORT.md): the
repo's `node_modules` was installed on macOS and the build sandbox is
Linux/arm64. `next build` was run in a throwaway `/tmp/alignmd-build`
copy where `next` was pinned to **14.2.33** (the latest version with
a published `@next/swc-linux-arm64-gnu`) and `layout.tsx` was swapped
to a system-font stack (the real layout uses `next/font/google`,
which needs network). **No source file in the repo was modified for
the build** — the repo stays on next 14.2.35 with the real
Google-font layout and the darwin swc binary; the throwaway copy was
deleted afterward. `tsc` and `next lint` were run directly against
the real repo.

### Shipped?

**Not deployed.** All three checks passed, but `npx vercel --prod`
cannot run autonomously: there is no Vercel auth token in the sandbox
(no `VERCEL_TOKEN`, no `~/.local/share/com.vercel.cli/` auth dir),
and the Vercel CLI's package install itself errors with `EAI_AGAIN
registry.npmjs.org` from inside the sandbox. Same two constraints
every prior run hit. The code is verified and safe to deploy.

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a
  machine logged in to Vercel. This ships the whole repo, so it also
  clears the earlier alignmd deploy backlog along with this run. No
  new operator to-do was added — this expansion needs no migration
  (the brief scopes operator-todos to migrations) and the deploy
  backlog already exists.
- **Migration:** none for this expansion. Aging is computed from
  `jobs.created_at` and pipeline depth from `submissions.stage`, both
  on the core schema 0001 and always present, so the widget shows
  real data the moment it deploys. `0011_credentialing.sql` is *not*
  required by this widget — the lite classifier deliberately skips
  the credentialing-aware cross-product to keep the dashboard fast.

### Ideas noted for future runs (do not rebuild the above)

- **Per-job time-to-fill projection** — extend `job-health.ts` with a
  projected start-date estimate using the active-submission stage
  ages, the per-stage SLAs from `pipeline-aging.ts`
  (`STAGE_SLA_DAYS`), and the ~75-day credentialing turnaround
  median. Would turn the health verdict into a calendar prediction
  the recruiter can communicate to the facility (mirroring
  TargetRecruit's "providers at risk of hitting their start date"
  framing). Pure-module work; no migration. Now the highest-value
  remaining no-migration idea — explicitly considered and deferred
  in this run only because the carry-over called for the dashboard
  widget first.
- Clinician-portal mirror of `/opportunities` — still the natural
  next symmetry. Carried forward six runs in a row; the standing
  one-migration run.
- Promote pipeline aging from the `providers.updated_at` proxy to a
  precise `stage_entered_at` column on `providers` — small
  migration. Carried forward.
- Promote facility-side readiness scoping from page-level
  admin-client to a DB-level additive RLS policy. Carried forward.
- Per-job *funnel velocity* histogram — for any open requisition,
  the median days the desk's last N placed roles spent in each
  pipeline stage. Pure-module work; informs the projection idea
  above with real per-desk data rather than the SLA defaults.
- A *"Roles to source today"* widget on `/dashboard` — top 3
  at-risk requisitions where `noSupply = true` from the full engine.
  Would carry the same morning-briefing pattern through to the
  opportunities cross-product; the perf concern from 2026-06-01
  still applies (heavier than the aging proxy), but the widget is
  small (top 3) and only computes for open jobs flagged at-risk by
  the lite engine — a candidate-set scoping that may make the
  cross-product cheap enough.
- Email/Slack digest of today's top picks delivered at 8am — turns
  `/today` into a push, not a pull. Bigger than one run; needs a
  scheduled-task hook and a delivery integration.

---

## 2026-06-04 — Per-job time-to-fill projection on `/jobs/health`

The forward-looking complement to the per-requisition health verdict
shipped 2026-06-02. Where the health badge answers *"is this job at
risk?"*, this run answers the next question every recruiter takes back
to the facility: *"when will it fill?"* — turning the verdict into a
calendar prediction. Picks up the explicit highest-value remaining
no-migration future-idea from the 2026-06-03 log entry: *"Per-job
time-to-fill projection — extend `job-health.ts` with a projected
start-date estimate using the active-submission stage ages, the
per-stage SLAs from `pipeline-aging.ts` (`STAGE_SLA_DAYS`), and the
~75-day credentialing turnaround median. Would turn the health verdict
into a calendar prediction the recruiter can communicate to the
facility ... Now the highest-value remaining no-migration idea."*

### Research

Web search across the four briefed areas (current as of June 2026):

- **Product features.** Predictive analytics is the 2026 healthcare-ATS
  differentiator: Bullhorn's healthcare suite ships predictive tools
  that "forecast demand based on patient volume patterns" and pair
  AI-matching with credential-expiration alerts. Medely's Optimize +
  Talent Fusion layers AI-driven demand forecasting onto "real-time
  control over labor spend, coverage, compliance, and workforce
  utilization." viva-it / Shiftmed frame predictive workforce planning
  as the shift "from reactive placement to predictive workforce
  planning." The unanimous 2026 framing: the dashboard surfaces
  *projected* time-to-fill alongside the at-risk verdict, not just the
  verdict.
- **Competitors.** TargetRecruit's Provider-and-Group-Progress
  dashboard "identifies which providers are at risk or off track of
  hitting their start date based on activities not being completed" —
  the most direct competitor for the projection framing this run
  ships. Bullhorn Insights provides market-level intelligence on
  time-to-fill projections; symplr Recruiting ships scheduled-email
  reports on time-to-fill and source performance. The open gap across
  Medely / Bullhorn / symplr / iCIMS / Vivian / TargetRecruit is still
  per-job projection surfaced *on the recruiter's job-health board*,
  not buried in an analytics-only surface.
- **Market & compliance.** Healthcare time-to-fill remains brutal —
  Bullhorn / Medical Solutions cite ~83 days RN application→start;
  Apploi puts permanent-nurse at 86 days; viva-it / Incredible Health
  put experienced-RN at 80–109 (mean 94); the fastest quartile closes
  in 15 days; platform medians run 24 days. Credentialing remains the
  single longest bottleneck: drcredentialing 2026 puts the *average*
  at 90–120 days and notes 60–180-day spread by payer (Medicare
  60–90, commercial 90–120); atlassystems / mbwrcm / Verisys put the
  per-credentialing window at 60–90 days. **75 days** sits in the
  middle of the documented 60–90-day range — a defensible planning
  median that is neither alarmist (120) nor optimistic (60). 2026
  Joint Commission tightening: 120-day accreditation deadline, 90-day
  certification deadline, 30-day re-review on all credentialing files
  processed after 2025-07-01. No new compact / IMLC changes since
  2026-06-03.
- **Growth & positioning.** Recruiter SLA guidance (pin 2026, Workable,
  Gem) is unanimous: every pipeline-tracker row needs a current-stage
  + next-action-date pair, and SLA-governed deadlines compress 30–55
  days of process time into 10–12 days end-to-end. Workable's healthy
  benchmark is <7 days per active pipeline stage; stages where
  candidates routinely sit 14+ days are friction points. The
  recruiter's payoff for a projection is *communication* — a
  date-certain number to give the facility that makes the start
  conversation concrete rather than vague.

### Candidates considered

1. **Per-job time-to-fill projection on `/jobs/health`** — extend
   `job-health.ts` with a `projectTimeToFill` pure function that, for
   each open job, rolls forward from the most-advanced active
   submission's remaining stage SLAs (high confidence), or assumes a
   same-day submission for a credentialing-complete lead (medium), or
   adds a 75-day credentialing median for an in-progress lead (low).
   Adds a "Projected start" column + footer summary to the existing
   `/jobs/health` board. Reuses `STAGE_SLA_DAYS` from
   `pipeline-aging.ts` verbatim. No migration. *(picked)*
2. Clinician-portal mirror of `/opportunities` — still blocked by the
   `jobs_provider_submitted_read` RLS policy. Carried forward seven
   runs in a row; standing one-migration run.
3. Per-job *funnel velocity* histogram (median days the desk's last N
   placed roles spent in each pipeline stage) — would inform candidate
   #1's projection with real per-desk data rather than the SLA
   defaults. Real follow-on value once the SLA-defaults projection is
   live, so naturally sequenced *after* this run.
4. *"Roles to source today"* widget on `/dashboard` (top 3 at-risk
   `noSupply` jobs from the full engine) — viable, but the carry-over
   was explicit about the projection being the highest-value remaining
   no-migration idea, and this run honours that.
5. Promote pipeline aging from the `providers.updated_at` proxy to a
   precise `stage_entered_at` column — small migration. Carried
   forward.
6. Promote facility-side readiness scoping to DB-level RLS. Carried
   forward.
7. Email/Slack digest of `/today` at 8am — still bigger than one run.

### Picked — and why

**Candidate 1.** It is the single highest-value, well-scoped move
available today, *because the 2026-06-03 log entry explicitly named it
as the highest-value remaining no-migration idea with the framing*
*"Would turn the health verdict into a calendar prediction the
recruiter can communicate to the facility."* The prior run is the
ground-truth signal of where the product should go next, and this run
honours it. The research is unanimous that 2026 ATS differentiation
has shifted from sortable lists to *projected* time-to-fill surfaced on
the recruiter's job-health board (Bullhorn predictive workforce,
TargetRecruit start-date risk, Medely Optimize) — and AlignMD already
ships a per-job health verdict, a per-stage SLA constant set, and a
documented credentialing turnaround range. Crossing those three into a
single days-to-fill number is the minimal-effort move that delivers a
real planning estimate the recruiter can communicate to the facility.

It needs **no DB migration** (the projection uses
`submissions.updated_at`, on core schema 0001, as the time-in-stage
proxy — the same proxy `pipeline-aging.ts` already uses on
`providers.updated_at`), edits **no working logic** (the existing
`classifyJobHealth` decision tree, KPI strip, filter toolbar, and
match × readiness opportunities pipeline are all untouched), and
reuses **`STAGE_SLA_DAYS` from `pipeline-aging.ts` verbatim** so the
projection and the stale-card flagging can never disagree on a stage's
expected dwell time. The added column lives on the existing
`/jobs/health` page — the page already built to answer the
strategic-week question this run completes. Built *and* verified in
one run.

### What was built

A new **`projectTimeToFill`** pure function and supporting types in
`src/lib/job-health.ts`, plus a **"Projected start"** column on the
existing `/jobs/health` board.

**The projection engine (`projectTimeToFill`).** Given a job's current
pipeline state — most-advanced active submission's stage + days in
that stage, plus the submit-ready / in-progress / blocked lead counts
from the opportunities engine — it returns a `daysToFill` number, a
`confidence` band, and a plain-English `basis`. The decision tree:

1. **Filled** → 0 days. (Placed submission already exists.)
2. **Active in-pipeline submission** → high confidence. Days =
   max(0, current-stage SLA − days already in stage) + sum of remaining
   forward-stage SLAs. So a candidate at `offer` with 2 days already
   in stage projects 1 + 0 = ~1 day; one fresh at `credentialing`
   projects 14 + 7 + 5 + 3 = ~29 days.
3. **Submit-ready lead, no active submission** → medium confidence.
   Days = full `submitted → placed` chain (7 + 5 + 3 = 15 days),
   assuming the desk submits today.
4. **In-progress lead only** → low confidence. Days = 75 (the
   research-backed credentialing median) + 15 = ~90 days.
5. **Blocked or no roster match** → no projection. Returns `null` with
   the basis "needs sourcing / unblocking before a start date can be
   projected" — explicitly *not* surfacing a fake calendar number for
   a job that isn't actually moveable.

The 75-day credentialing median is the conservative middle of the
documented 60–90-day per-credentialing range (atlassystems / mbwrcm /
Verisys 2026) and well below drcredentialing's 90–120 average — a
defensible planning number that is neither alarmist nor optimistic.
The module docblock spells the confidence model out so a future run
that swaps the median (e.g. with a per-desk funnel-velocity histogram)
doesn't have to rediscover the source.

The companion helpers:

- **`mostAdvancedActive`** — picks the furthest-along submission for a
  job by `FORWARD_STAGES` rank (offer > interview > submitted >
  credentialing), tie-broken by oldest-in-stage. This is the
  submission whose remaining SLA budget defines the soonest fill.
- **`projectedStartDate`** — translates a `daysToFill` count into a
  calendar `Date`, mirroring how the page formats it via `fmtDate`.
- **`PROJECTION_CONFIDENCE_META`** / **`CREDENTIALING_MEDIAN_DAYS`** /
  **`FORWARD_STAGES`** / **`forwardStageRank`** — exported constants
  and metadata the UI uses to render the confidence pill and the
  module's docblock references for traceability.

**The page (`src/app/(app)/jobs/health/page.tsx`) was edited
additively.** The submissions select extended from
`"job_id, provider_id, stage"` to also include `updated_at` (the
in-stage clock — same `updated_at`-as-proxy pattern that
`pipeline-aging.ts` documents). Per row, the page now finds the
most-advanced active submission, measures its days in stage off
`updated_at`, runs `projectTimeToFill`, and emits four new fields on
the row shape (`projectionDays`, `projectionDate`,
`projectionConfidence`, `projectionBasis`). The table gains a new
**"Projected start"** column showing `~Nd` + the calendar date +
the confidence pill (high/medium/low/—), with the plain-English
`basis` on hover. Filled rows read "placed"; unsupplied or
fully-blocked rows read "needs sourcing" so the column is honest
about *where* a projection is not meaningful.

A new **soonest-projected-fill** footer line above the methodology
note ("Soonest projected fill across open requisitions: in ~Nd
({date}).") gives the recruiter the headline forward-looking number
without consuming a KPI tile slot (the existing 4-card grid stays
unchanged — the CSS hard-codes `repeat(4, 1fr)`, so adding a fifth
card would have broken layout).

The methodology block at the page footer now spells the projection
model out for the recruiter — confidence tiers, the
`CREDENTIALING_MEDIAN_DAYS` number — so the page is its own ground
truth on "where does this number come from?"

**Degrades cleanly.** The projection draws only from
`submissions.updated_at`, `submissions.stage`, and the opportunity
counts the page already computed; none of those depend on migration
0011. Migration 0011 still gates the ready/blocked split on matched
candidates (per the existing page banner), but the projection itself
is correct under either schema state — when migration 0011 is absent,
matched clinicians collapse into the in-progress bucket and the
projection reads "low confidence — using the 75-day credentialing
median," which is exactly the right answer in that data state.

**Files changed (all additive — two files):**

- `src/lib/job-health.ts` — *edited additively.* Added
  `STAGE_SLA_DAYS` import from `pipeline-aging.ts`; added
  `CREDENTIALING_MEDIAN_DAYS`, `FORWARD_STAGES`, `forwardStageRank`,
  `mostAdvancedActive`, `ProjectionInput`, `ProjectionVerdict`,
  `ProjectionConfidence`, `projectTimeToFill`, `projectedStartDate`,
  `PROJECTION_CONFIDENCE_META`. Module docblock for the projection
  spells out the confidence model, the 75-day median sourcing, and
  the `submissions.updated_at` proxy. The existing
  `classifyJobHealth` / `classifyJobHealthLite` / `summarizeJobHealth`
  / `JOB_HEALTH_META` / thresholds / filter chip list are untouched.
- `src/app/(app)/jobs/health/page.tsx` — *edited additively.* Added
  the projection imports; extended `submissions` select to include
  `updated_at`; widened the `SubLite` row type to carry `updated_at`;
  computed per-row projection from `mostAdvancedActive` + measured
  days-in-stage; added four projection fields to `JobRow`; computed a
  page-level `soonestProjection`; added the "Projected start" column
  to the table header + body; added the soonest-projected-fill
  summary line and a projection methodology paragraph to the page
  footer. No existing KPI tile, badge, query path, sort, filter, or
  empty-state copy was modified.

No migration required. No new icon, no new route, no sidebar change.
No new dependency.

### Verify

Run on the repo: `npx tsc --noEmit` → clean (exit 0); `npx next lint`
→ "No ESLint warnings or errors"; `npx next build` → "Compiled
successfully", types valid, static generation **37/37** (unchanged
from 2026-06-02 / 2026-06-03 — this run adds no new route),
`/jobs/health` present in the route manifest as a dynamic route. All
three checks passed on the first attempt — no source-level
adjustments were needed.

Sandbox note (same workaround as every prior run / QA-REPORT.md): the
repo's `node_modules` was installed on macOS and the build sandbox is
Linux/arm64. `next build` was run in a throwaway `/tmp/alignmd-build`
copy where `next` was pinned to **14.2.33** (the latest version with
a published `@next/swc-linux-arm64-gnu`) and `layout.tsx` was swapped
to a system-font stack (the real layout uses `next/font/google`,
which needs network). **No source file in the repo was modified for
the build** — the repo stays on next 14.2.35 with the real
Google-font layout and the darwin swc binary; the throwaway copy was
deleted afterward. `tsc` and `next lint` were run directly against
the real repo.

### Shipped?

**Not deployed.** All three checks passed, but `npx vercel --prod`
cannot run autonomously: there is no Vercel auth token in the sandbox
(no `VERCEL_TOKEN`, no `~/.local/share/com.vercel.cli/` auth dir),
and the Vercel CLI's package install itself blocks on network reach
from inside the sandbox. Same two constraints every prior run hit.
The code is verified and safe to deploy.

### Operator must do

- **Deploy:** `cd ~/Documents/alignmd && npx vercel --prod` from a
  machine logged in to Vercel. This ships the whole repo, so it also
  clears the earlier alignmd deploy backlog along with this run. No
  new operator to-do was added — this expansion needs no migration
  (the brief scopes operator-todos to migrations) and the deploy
  backlog already exists.
- **Migration:** none for this expansion. The projection draws from
  `submissions.updated_at` + `submissions.stage` + the opportunity
  counts the page already computes; all three are on core schema 0001
  / 0003 and always present, so the projection shows real data the
  moment it deploys. `0011_credentialing.sql` continues to gate the
  ready/blocked split on matched candidates as documented in earlier
  entries; until then matched clinicians collapse into the
  in-progress bucket and the projection correctly reads "low
  confidence — using the 75-day credentialing median."

### Ideas noted for future runs (do not rebuild the above)

- **Per-desk funnel-velocity histogram** — replace the SLA-default
  projection numbers with the median days the desk's *own* last N
  placed roles actually spent in each pipeline stage. Same engine
  shape (a pure module reading from `submissions`), but the
  projection becomes calibrated to this desk's reality rather than
  the 2026 SLA benchmarks. No migration; reads only from existing
  tables. The naturally-sequenced follow-on to the projection
  shipped this run.
- A **"Projected fills this month"** widget on `/dashboard` — rolls
  the per-job projections into a calendar-month count of fills the
  recruiter can expect, mirroring the 2026-06-01 / 2026-06-03 morning-
  briefing widget pattern. Cheap pure-aggregation work on top of the
  projection engine; no migration.
- **Per-job projection on `/jobs/[id]`** — the single-requisition
  detail page currently lists ranked candidates; surfacing the same
  projection there lets the recruiter answer the "when?" question
  without leaving the job. Edits one high-traffic page; do it as a
  small additive header chip to minimise risk (mirrors how
  `/jobs/page.tsx` got its `/jobs/health` link).
- Clinician-portal mirror of `/opportunities` — still the natural
  next symmetry. Carried forward seven runs in a row; the standing
  one-migration run.
- Promote pipeline aging from the `providers.updated_at` proxy to a
  precise `stage_entered_at` column on `providers` — small
  migration. Would also tighten this projection's
  "days-in-current-stage" measure for the high-confidence path.
  Carried forward.
- Promote facility-side readiness scoping from page-level
  admin-client to a DB-level additive RLS policy. Carried forward.
- Email/Slack digest of today's top picks delivered at 8am — turns
  `/today` into a push, not a pull. Bigger than one run; needs a
  scheduled-task hook and a delivery integration.
