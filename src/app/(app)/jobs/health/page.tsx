import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { fmtDate } from "@/lib/format";
import { scoreMatch } from "@/lib/match";
import { computeReadiness } from "@/lib/readiness";
import { classifyOpportunity, isOpportunityMatch } from "@/lib/opportunities";
import {
  classifyJobHealth,
  CREDENTIALING_MEDIAN_DAYS,
  daysOpen,
  IN_PIPELINE_STAGES,
  JOB_AGING_AT_RISK_DAYS,
  JOB_AGING_WATCH_DAYS,
  JOB_HEALTH_FILTERS,
  JOB_HEALTH_META,
  jobHealthRank,
  mostAdvancedActive,
  passesJobHealthFilter,
  projectTimeToFill,
  projectedStartDate,
  PROJECTION_CONFIDENCE_META,
  summarizeJobHealth,
  type JobHealthFilter,
  type JobHealthState,
  type ProjectionConfidence,
} from "@/lib/job-health";
import type { CredentialingItem } from "@/lib/credentialing";
import type { PipelineStage } from "@/lib/types";

export const metadata: Metadata = { title: "Job health" };
export const dynamic = "force-dynamic";

// Maps a JOB_HEALTH_META tone onto the project's badge classes — same
// convention as /opportunities, /today, /readiness, /pipeline.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

// Provider columns the match + readiness engines need. Mirrors the shape
// /opportunities uses so the per-job opportunity computation runs identically.
interface ProviderLite {
  id: string;
  full_name: string;
  clinician_role: string | null;
  specialty: string | null;
  years_experience: number | null;
  telehealth_ok: boolean | null;
}

// A provider_credentials row, scoped to what match + readiness consume.
interface CredRow {
  type: string;
  state: string | null;
  is_compact: boolean | null;
  expires_on: string | null;
}

interface JobRow {
  id: string;
  title: string;
  specialty: string | null;
  facilityName: string | null;
  facilityState: string | null;
  createdAt: string | null;
  ageDays: number | null;
  submissionsTotal: number;
  submissionsActive: number;
  submissionsPlaced: number;
  submitReady: number;
  inProgress: number;
  blocked: number;
  state: JobHealthState;
  reason: string;
  noSupply: boolean;
  /** Days from today to projected placement. `null` if no projection. */
  projectionDays: number | null;
  /** ISO date string for the projected placement. `null` if no projection. */
  projectionDate: string | null;
  projectionConfidence: ProjectionConfidence;
  projectionBasis: string;
}

const VALID_FILTERS = new Set<JobHealthFilter>([
  "all",
  "at_risk",
  "watch",
  "on_track",
]);

function parseFilter(raw: string | undefined): JobHealthFilter {
  if (raw && VALID_FILTERS.has(raw as JobHealthFilter)) {
    return raw as JobHealthFilter;
  }
  return "all";
}

export default async function JobHealthPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const supabase = createClient();
  const filter = parseFilter(searchParams.filter);

  // Open jobs, the active roster, every credential, the credentialing packet
  // rows and existing submissions (with stage so we can tell active from
  // terminal). credentialing_items (migration 0011) may not be applied yet —
  // that query is allowed to error and every clinician simply reads as
  // "credentialing underway", exactly like /opportunities.
  const [jobsRes, providersRes, credsRes, itemsRes, subsRes] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, title, specialty, setting, created_at, facility:facilities(id, name, state)",
        )
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      supabase
        .from("providers")
        .select(
          "id, full_name, clinician_role, specialty, years_experience, telehealth_ok",
        )
        .is("archived_at", null),
      supabase
        .from("provider_credentials")
        .select("provider_id, type, state, is_compact, expires_on"),
      supabase.from("credentialing_items").select("*"),
      supabase
        .from("submissions")
        .select("job_id, provider_id, stage, updated_at"),
    ]);

  const jobs = (jobsRes.data as any[]) ?? [];
  const providers = (providersRes.data as ProviderLite[]) ?? [];
  const credentialingReady = !itemsRes.error;

  // Match requirements live in their own table — fetch only the open jobs'.
  const jobIds = jobs.map((j) => j.id as string);
  let requirements: any[] = [];
  if (jobIds.length) {
    const { data } = await supabase
      .from("job_requirements")
      .select(
        "job_id, required_license_states, required_certs, min_years_experience",
      )
      .in("job_id", jobIds);
    requirements = data ?? [];
  }
  const requirementByJob = new Map<string, any>();
  for (const r of requirements) requirementByJob.set(r.job_id, r);

  // Credentials grouped by provider — one row feeds both engines.
  const credsByProvider = new Map<string, CredRow[]>();
  for (const c of (credsRes.data as
    | (CredRow & { provider_id: string })[]
    | null) ?? []) {
    const list = credsByProvider.get(c.provider_id) ?? [];
    list.push({
      type: c.type,
      state: c.state,
      is_compact: c.is_compact,
      expires_on: c.expires_on,
    });
    credsByProvider.set(c.provider_id, list);
  }

  // Credentialing-packet rows grouped by provider.
  const itemsByProvider = new Map<string, CredentialingItem[]>();
  for (const it of (itemsRes.data as CredentialingItem[]) ?? []) {
    const list = itemsByProvider.get(it.provider_id) ?? [];
    list.push(it);
    itemsByProvider.set(it.provider_id, list);
  }

  // Submissions grouped by job — pre-bucket by stage so the per-job loop is
  // O(1) per job rather than re-scanning every submission row. `updated_at`
  // is the proxy for "days in current stage" used by the time-to-fill
  // projection — the same `updated_at`-as-stage-clock proxy
  // `pipeline-aging.ts` uses on `providers.updated_at`.
  type SubLite = {
    job_id: string;
    provider_id: string;
    stage: PipelineStage;
    updated_at: string | null;
  };
  const subsByJob = new Map<string, SubLite[]>();
  for (const s of (subsRes.data as SubLite[] | null) ?? []) {
    const list = subsByJob.get(s.job_id) ?? [];
    list.push(s);
    subsByJob.set(s.job_id, list);
  }

  // The (job, provider) pairs already submitted — never re-surface them as
  // fresh opportunities, exactly like /opportunities and /today.
  const submittedPairs = new Set<string>();
  for (const s of (subsRes.data as
    | { job_id: string; provider_id: string }[]
    | null) ?? []) {
    submittedPairs.add(`${s.job_id}::${s.provider_id}`);
  }

  // Per-job opportunity counts, computed exactly like /opportunities so the
  // two pages can never disagree on what counts as a real lead.
  const rows: JobRow[] = jobs.map((job): JobRow => {
    const facility = job.facility ?? null;
    const req = requirementByJob.get(job.id) ?? null;

    const jobStates: string[] =
      req?.required_license_states && req.required_license_states.length
        ? req.required_license_states
        : facility?.state
          ? [facility.state]
          : [];
    const jobIsTelehealth =
      /telehealth/i.test(job.setting || "") ||
      /telehealth/i.test(job.specialty || "");
    const requiredCerts = (req?.required_certs ?? []) as string[];
    const minYears = req?.min_years_experience ?? null;

    let submitReady = 0;
    let inProgress = 0;
    let blocked = 0;
    for (const p of providers) {
      if (submittedPairs.has(`${job.id}::${p.id}`)) continue;
      const creds = credsByProvider.get(p.id) ?? [];
      const match = scoreMatch({
        provider: {
          clinician_role: p.clinician_role,
          specialty: p.specialty,
          years_experience: p.years_experience,
          telehealth_ok: p.telehealth_ok,
        },
        credentials: creds,
        jobSpecialty: job.specialty,
        jobStates,
        jobIsTelehealth,
        requiredCerts,
        minYears,
      });
      if (!isOpportunityMatch(match.tier)) continue;
      const readiness = computeReadiness({
        items: itemsByProvider.get(p.id) ?? [],
        credentials: creds,
      });
      const state = classifyOpportunity(readiness);
      if (state === "submit_now") submitReady += 1;
      else if (state === "in_progress") inProgress += 1;
      else blocked += 1;
    }

    const jobSubs = subsByJob.get(job.id as string) ?? [];
    const submissionsTotal = jobSubs.length;
    const submissionsActive = jobSubs.filter((s) =>
      IN_PIPELINE_STAGES.includes(s.stage),
    ).length;
    const submissionsPlaced = jobSubs.filter((s) => s.stage === "placed").length;

    const ageDays = daysOpen(job.created_at as string | null);
    const verdict = classifyJobHealth({
      ageDays,
      submissionsTotal,
      submissionsActive,
      submissionsPlaced,
      submitReadyOpportunities: submitReady,
      inProgressOpportunities: inProgress,
      blockedOpportunities: blocked,
    });

    // Time-to-fill projection — pick the furthest-along active submission and
    // measure its time-in-stage off `submissions.updated_at`. Falls back to
    // submit-ready / in-progress lead counts when no active submission exists.
    const advanced = mostAdvancedActive(
      jobSubs
        .filter((s) => IN_PIPELINE_STAGES.includes(s.stage))
        .map((s) => ({ stage: s.stage, updatedAt: s.updated_at })),
    );
    const daysInStage = advanced?.updatedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(advanced.updatedAt).getTime()) / 86_400_000,
          ),
        )
      : null;
    const projection = projectTimeToFill({
      filled: submissionsPlaced > 0,
      mostAdvancedActiveStage: advanced?.stage ?? null,
      daysInCurrentStage: daysInStage,
      submitReadyCount: submitReady,
      inProgressCount: inProgress,
      blockedCount: blocked,
    });
    const projDate = projectedStartDate(projection.daysToFill);

    return {
      id: job.id as string,
      title: job.title as string,
      specialty: (job.specialty as string | null) ?? null,
      facilityName: facility?.name ?? null,
      facilityState: facility?.state ?? null,
      createdAt: (job.created_at as string | null) ?? null,
      ageDays,
      submissionsTotal,
      submissionsActive,
      submissionsPlaced,
      submitReady,
      inProgress,
      blocked,
      state: verdict.state,
      reason: verdict.reason,
      noSupply: verdict.noSupply,
      projectionDays: projection.daysToFill,
      projectionDate: projDate ? projDate.toISOString() : null,
      projectionConfidence: projection.confidence,
      projectionBasis: projection.basis,
    };
  });

  // Soonest projected fill across open (non-`filled`) requisitions — the
  // headline forward-looking number the recruiter is reaching for.
  const openOnly = rows.filter((r) => r.state !== "filled");
  const soonestProjection = openOnly.reduce<{
    days: number;
    date: string;
  } | null>((soonest, r) => {
    if (r.projectionDays === null || r.projectionDate === null) return soonest;
    if (!soonest || r.projectionDays < soonest.days) {
      return { days: r.projectionDays, date: r.projectionDate };
    }
    return soonest;
  }, null);

  // Roster-wide summary — computed before any filter is applied so the KPI
  // strip stays stable while the user toggles the filter chips.
  const summary = summarizeJobHealth(
    rows.map((r) => ({ state: r.state, noSupply: r.noSupply, ageDays: r.ageDays })),
  );
  const openCount = rows.filter((r) => r.state !== "filled").length;

  // At-risk first, then watch, then on-track; within a band, oldest first so
  // the most-actionable row is at the top regardless of the active filter.
  const sorted = [...rows].sort((a, b) => {
    const byState = jobHealthRank(a.state) - jobHealthRank(b.state);
    if (byState !== 0) return byState;
    const byAge = (b.ageDays ?? 0) - (a.ageDays ?? 0);
    if (byAge !== 0) return byAge;
    return a.title.localeCompare(b.title);
  });

  const visible = sorted.filter((r) => passesJobHealthFilter(r.state, filter));

  const filterCounts: Record<JobHealthFilter, number> = {
    all: openCount,
    at_risk: summary.atRisk,
    watch: summary.watch,
    on_track: summary.onTrack,
  };

  const kpis = [
    { label: "Open jobs", value: openCount, sub: "roles still to fill" },
    {
      label: "At risk",
      value: summary.atRisk,
      sub: summary.noSupply
        ? `${summary.noSupply} with no matched candidate`
        : "needs intervention",
    },
    {
      label: "Watch",
      value: summary.watch,
      sub: `aging past ${JOB_AGING_WATCH_DAYS} days`,
    },
    {
      label: "Oldest unfilled",
      value: summary.oldestUnfilledDays || "—",
      sub: summary.oldestUnfilledDays
        ? `${summary.oldestUnfilledDays} days open`
        : "no open requisitions",
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Job health</h2>
          <p>
            Every open requisition scored on age, pipeline depth, and matched
            candidate supply — at-risk roles surface first.
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link href="/jobs" className="btn">
            All jobs
          </Link>
          <Link href="/jobs/new" className="btn btn-primary">
            <IconPlus width={15} height={15} /> Post a job
          </Link>
        </div>
      </div>

      {!credentialingReady && (
        <div className="alert alert-info">
          Credentialing-packet tracking is not set up yet — apply migration{" "}
          <code>0011_credentialing.sql</code> to record packet progress. Until
          then matched clinicians all read as &quot;credentialing
          underway&quot;; the aging and pipeline-depth signals below are still
          live.
        </div>
      )}

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        {JOB_HEALTH_FILTERS.map((f) => {
          const isActive = filter === f.key;
          const href = f.key === "all" ? "/jobs/health" : `/jobs/health?filter=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={`btn btn-sm${isActive ? " btn-primary" : ""}`}
            >
              {f.label} ({filterCounts[f.key]})
            </Link>
          );
        })}
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          At-risk threshold: {JOB_AGING_AT_RISK_DAYS}d · Watch threshold:{" "}
          {JOB_AGING_WATCH_DAYS}d
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No open jobs"
            hint="Post a job and AlignMD will score it for aging, pipeline depth, and matched candidate supply here."
            action={
              <Link href="/jobs/new" className="btn btn-primary btn-sm">
                <IconPlus width={15} height={15} /> Post a job
              </Link>
            }
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Nothing in that band"
            hint={
              filter === "at_risk"
                ? "No open requisition is at risk right now — pipelines have movement and ages are within target."
                : filter === "watch"
                  ? "No open requisition is aging without movement. Anything fresh sits in 'On track'."
                  : "Every open requisition is either at risk or in the watch band — none are on track yet."
            }
          />
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Requisition</th>
                <th>Age</th>
                <th>Pipeline</th>
                <th>Matched candidates</th>
                <th>Projected start</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const meta = JOB_HEALTH_META[r.state];
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/jobs/${r.id}`} className="row" style={{ gap: 2 }}>
                        <span>
                          <b style={{ display: "block" }}>{r.title}</b>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {r.facilityName ?? "Facility not set"}
                            {r.facilityState ? ` · ${r.facilityState}` : ""}
                            {r.specialty ? ` · ${r.specialty}` : ""}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      {r.ageDays !== null ? (
                        <span>
                          <b>{r.ageDays}d</b>
                          {r.createdAt && (
                            <span
                              className="muted"
                              style={{ display: "block", fontSize: 11 }}
                            >
                              since {fmtDate(r.createdAt)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        {r.submissionsActive > 0 && (
                          <span className="badge badge-teal">
                            {r.submissionsActive} active
                          </span>
                        )}
                        {r.submissionsTotal === 0 && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            no submissions
                          </span>
                        )}
                        {r.submissionsTotal > 0 && r.submissionsActive === 0 && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            {r.submissionsTotal} early-stage
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        {r.submitReady > 0 && (
                          <span className="badge badge-ok">
                            {r.submitReady} ready
                          </span>
                        )}
                        {r.inProgress > 0 && (
                          <span className="badge badge-warn">
                            {r.inProgress} in progress
                          </span>
                        )}
                        {r.blocked > 0 && (
                          <span className="badge badge-danger">
                            {r.blocked} blocked
                          </span>
                        )}
                        {r.noSupply && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            no roster match
                          </span>
                        )}
                      </div>
                    </td>
                    <td title={r.projectionBasis}>
                      {r.projectionDays !== null && r.projectionDate ? (
                        <span>
                          <b style={{ display: "block" }}>
                            ~{r.projectionDays}d
                          </b>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {fmtDate(r.projectionDate)}
                          </span>
                          <span
                            className={`badge ${
                              badgeTone[
                                PROJECTION_CONFIDENCE_META[
                                  r.projectionConfidence
                                ].tone
                              ] ?? "badge-muted"
                            }`}
                            style={{ display: "inline-block", marginTop: 4, fontSize: 10 }}
                          >
                            {
                              PROJECTION_CONFIDENCE_META[r.projectionConfidence]
                                .label
                            }
                            {" confidence"}
                          </span>
                        </span>
                      ) : r.state === "filled" ? (
                        <span className="muted" style={{ fontSize: 12 }}>
                          placed
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          needs sourcing
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${badgeTone[meta.tone] ?? "badge-muted"}`}
                        title={r.reason}
                      >
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {soonestProjection && (
        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          Soonest projected fill across open requisitions: in ~
          {soonestProjection.days} days ({fmtDate(soonestProjection.date)}).
        </p>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Health is computed from days open, in-pipeline submission depth
        (credentialing / submitted / interview / offer), and matched
        candidate supply from the opportunities engine. Movement beats age:
        a job with an active in-pipeline candidate stays on track regardless
        of how long it&apos;s been open.
      </p>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Projected start rolls the remaining per-stage SLAs forward from the
        most-advanced active submission (high confidence), or assumes a
        same-day submission for a credentialing-complete lead (medium), or
        adds the {CREDENTIALING_MEDIAN_DAYS}-day credentialing turnaround
        median for an in-progress lead (low). It is a planning estimate, not
        a guarantee.
      </p>
    </>
  );
}
