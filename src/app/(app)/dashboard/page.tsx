import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { ExpiryBadge, EmptyState } from "@/components/ui";
import {
  IconArrowRight,
  IconAlert,
  IconPipeline,
  IconActivity,
} from "@/components/icons";
import { needsAttention } from "@/lib/credentials";
import { CREDENTIAL_LABELS, PIPELINE_STAGES, STAGE_LABELS, ACTIVITY_LABELS } from "@/lib/constants";
import { fmtDate, relativeTime, initials } from "@/lib/format";
import {
  AGING_META,
  agingSummary,
  classifyAging,
  summarizeBoard,
  type AgingResult,
} from "@/lib/pipeline-aging";
import {
  classifyJobHealthLite,
  daysOpen,
  IN_PIPELINE_STAGES,
  JOB_HEALTH_META,
  type JobHealthState,
} from "@/lib/job-health";
import type { PipelineStage } from "@/lib/types";

// Maps a pipeline-aging tone onto the project's badge classes — same convention
// as /pipeline, /opportunities and /today.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAppUser();
  const supabase = createClient();

  const [providersRes, credsRes, activitiesRes, tasksRes, jobsRes, subsRes] =
    await Promise.all([
      supabase
        .from("providers")
        .select(
          "id, full_name, clinician_role, specialty, pipeline_stage, updated_at",
        )
        .is("archived_at", null),
      supabase
        .from("provider_credentials")
        .select("id, type, state, expires_on, provider:providers(id, full_name)")
        .not("expires_on", "is", null)
        .order("expires_on", { ascending: true }),
      supabase
        .from("activities")
        .select("id, type, body, occurred_at, provider:providers(id, full_name)")
        .order("occurred_at", { ascending: false })
        .limit(7),
      supabase.from("tasks_reminders").select("id").eq("status", "open"),
      supabase
        .from("jobs")
        .select(
          "id, title, specialty, created_at, facility:facilities(name, state)",
        )
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      supabase.from("submissions").select("id, job_id, stage"),
    ]);

  const providers = providersRes.data ?? [];
  const creds = credsRes.data ?? [];
  const activities = activitiesRes.data ?? [];
  const openTasks = tasksRes.data ?? [];
  const openJobs = jobsRes.data ?? [];
  const submissions = subsRes.data ?? [];

  const inPipeline = providers.filter((p: any) => p.pipeline_stage !== "placed");
  const placed = providers.filter((p: any) => p.pipeline_stage === "placed");
  const expiring = creds
    .filter((c: any) => needsAttention(c.expires_on))
    .slice(0, 8);

  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: providers.filter((p: any) => p.pipeline_stage === stage).length,
  }));
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));

  // ── Pipeline-at-risk morning briefing ────────────────────────────
  //
  // Cheapest insight to surface on the landing page: the stalest in-pipeline
  // cards already classified by `classifyAging`. Reuses the same engine as
  // `/pipeline`, so the dashboard's "Pipeline at risk" widget and the board's
  // stale badges can never drift. Excludes `placed` because that terminal
  // stage carries no SLA (see STAGE_SLA_DAYS in pipeline-aging.ts).
  const now = new Date();
  type AgingCard = {
    id: string;
    full_name: string;
    clinician_role: string | null;
    specialty: string | null;
    pipeline_stage: PipelineStage;
    aging: AgingResult;
  };
  const agingCards: AgingCard[] = inPipeline.map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    clinician_role: p.clinician_role,
    specialty: p.specialty,
    pipeline_stage: p.pipeline_stage,
    aging: classifyAging(p.pipeline_stage, p.updated_at ?? null, now),
  }));
  const agingSummaryRollup = summarizeBoard(
    agingCards.map((c) => ({ stage: c.pipeline_stage, aging: c.aging })),
  );
  const STATE_ORDER: Record<string, number> = {
    stale: 0,
    watch: 1,
    fresh: 2,
    none: 3,
  };
  const stalest = [...agingCards]
    .filter((c) => c.aging.state === "stale" || c.aging.state === "watch")
    .sort((a, b) => {
      const byState = STATE_ORDER[a.aging.state] - STATE_ORDER[b.aging.state];
      if (byState !== 0) return byState;
      return (b.aging.days ?? 0) - (a.aging.days ?? 0);
    })
    .slice(0, 5);

  // ── Jobs-at-risk morning briefing ────────────────────────────────
  //
  // Per-requisition complement of the pipeline-at-risk widget above. Reuses
  // `classifyJobHealthLite` from src/lib/job-health.ts — the lightweight
  // age + pipeline-depth classifier that deliberately omits the
  // (job × provider) opportunities cross-product so it can render cheaply
  // on every dashboard load. The /jobs/health board runs the full engine
  // and is the canonical view — the "View board →" link points there.
  type JobAtRiskCard = {
    id: string;
    title: string;
    facilityName: string | null;
    facilityState: string | null;
    ageDays: number | null;
    submissionsTotal: number;
    submissionsActive: number;
    state: JobHealthState;
    reason: string;
  };
  const subsByJob = new Map<string, PipelineStage[]>();
  for (const s of submissions as { job_id: string; stage: PipelineStage }[]) {
    const list = subsByJob.get(s.job_id) ?? [];
    list.push(s.stage);
    subsByJob.set(s.job_id, list);
  }
  const jobHealthCards: JobAtRiskCard[] = openJobs.map((j: any) => {
    const stages = subsByJob.get(j.id) ?? [];
    const submissionsTotal = stages.length;
    const submissionsActive = stages.filter((st) =>
      IN_PIPELINE_STAGES.includes(st),
    ).length;
    const submissionsPlaced = stages.filter((st) => st === "placed").length;
    const ageDays = daysOpen(j.created_at as string | null, now);
    const verdict = classifyJobHealthLite({
      ageDays,
      submissionsTotal,
      submissionsActive,
      submissionsPlaced,
    });
    return {
      id: j.id as string,
      title: j.title as string,
      facilityName: j.facility?.name ?? null,
      facilityState: j.facility?.state ?? null,
      ageDays,
      submissionsTotal,
      submissionsActive,
      state: verdict.state,
      reason: verdict.reason,
    };
  });
  const JOB_STATE_ORDER: Record<JobHealthState, number> = {
    at_risk: 0,
    watch: 1,
    on_track: 2,
    filled: 3,
  };
  const jobsAtRiskList = [...jobHealthCards]
    .filter((j) => j.state === "at_risk" || j.state === "watch")
    .sort((a, b) => {
      const byState = JOB_STATE_ORDER[a.state] - JOB_STATE_ORDER[b.state];
      if (byState !== 0) return byState;
      return (b.ageDays ?? 0) - (a.ageDays ?? 0);
    })
    .slice(0, 5);
  const jobsAtRiskCount = jobHealthCards.filter(
    (j) => j.state === "at_risk",
  ).length;
  const jobsWatchCount = jobHealthCards.filter(
    (j) => j.state === "watch",
  ).length;
  const oldestUnfilledDays = jobHealthCards.reduce(
    (max, j) =>
      j.state !== "filled" && j.ageDays !== null && j.ageDays > max
        ? j.ageDays
        : max,
    0,
  );

  const kpis = [
    { label: "Providers", value: providers.length, sub: "in the CRM" },
    { label: "Active pipeline", value: inPipeline.length, sub: "not yet placed" },
    { label: "Open jobs", value: openJobs.length, sub: "roles to fill" },
    {
      label: "Submissions",
      value: submissions.length,
      sub: "clinicians put forward",
    },
    {
      label: "Credentials at risk",
      value: creds.filter((c: any) => needsAttention(c.expires_on)).length,
      sub: "expired or ≤ 90 days",
    },
    { label: "Open tasks", value: openTasks.length, sub: "credentialing items" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p>
            Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""} —
            here&apos;s where your placements stand.
          </p>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-3">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-3">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>
                <span className="row" style={{ gap: 7 }}>
                  <IconPipeline
                    width={15}
                    height={15}
                    style={{ color: "var(--warn)" }}
                  />
                  Pipeline at risk
                </span>
              </h3>
              <Link
                href="/pipeline?filter=stale"
                className="muted"
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                View board →
              </Link>
            </div>
            {agingSummaryRollup.staleTotal === 0 &&
            agingSummaryRollup.watchTotal === 0 ? (
              <EmptyState
                title="Pipeline is on track"
                hint="No cards are past or approaching their stage SLA."
              />
            ) : (
              <>
                <div
                  className="card-pad"
                  style={{
                    paddingTop: 0,
                    paddingBottom: 6,
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    <span
                      className="badge badge-danger"
                      style={{ marginRight: 6 }}
                    >
                      {agingSummaryRollup.staleTotal}
                    </span>
                    stale
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    <span
                      className="badge badge-warn"
                      style={{ marginRight: 6 }}
                    >
                      {agingSummaryRollup.watchTotal}
                    </span>
                    watch
                  </span>
                  {agingSummaryRollup.worstStage && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      worst stage:{" "}
                      <b style={{ color: "var(--text)" }}>
                        {STAGE_LABELS[agingSummaryRollup.worstStage.stage]}
                      </b>{" "}
                      ({agingSummaryRollup.worstStage.staleCount})
                    </span>
                  )}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Clinician</th>
                      <th>Stage</th>
                      <th>Days</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stalest.map((c) => {
                      const meta = AGING_META[c.aging.state];
                      const stageLabel = STAGE_LABELS[c.pipeline_stage];
                      return (
                        <tr key={c.id}>
                          <td>
                            <Link
                              href={`/providers/${c.id}`}
                              style={{ fontWeight: 600 }}
                            >
                              {c.full_name}
                            </Link>
                            {c.clinician_role && (
                              <div className="muted" style={{ fontSize: 11 }}>
                                {c.clinician_role}
                                {c.specialty ? ` · ${c.specialty}` : ""}
                              </div>
                            )}
                          </td>
                          <td className="muted">{stageLabel}</td>
                          <td className="muted">
                            {c.aging.days != null ? `${c.aging.days}d` : "—"}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                badgeTone[meta.tone] ?? "badge-muted"
                              }`}
                              title={agingSummary(c.aging, stageLabel)}
                            >
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>
                <span className="row" style={{ gap: 7 }}>
                  <IconActivity
                    width={15}
                    height={15}
                    style={{ color: "var(--warn)" }}
                  />
                  Jobs at risk
                </span>
              </h3>
              <Link
                href="/jobs/health?filter=at_risk"
                className="muted"
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                View board →
              </Link>
            </div>
            {jobsAtRiskCount === 0 && jobsWatchCount === 0 ? (
              <EmptyState
                title="Every open job has movement"
                hint="No open requisition is past or approaching the aging threshold without an in-pipeline candidate."
              />
            ) : (
              <>
                <div
                  className="card-pad"
                  style={{
                    paddingTop: 0,
                    paddingBottom: 6,
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    <span
                      className="badge badge-danger"
                      style={{ marginRight: 6 }}
                    >
                      {jobsAtRiskCount}
                    </span>
                    at risk
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    <span
                      className="badge badge-warn"
                      style={{ marginRight: 6 }}
                    >
                      {jobsWatchCount}
                    </span>
                    watch
                  </span>
                  {oldestUnfilledDays > 0 && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      oldest unfilled:{" "}
                      <b style={{ color: "var(--text)" }}>
                        {oldestUnfilledDays}d
                      </b>
                    </span>
                  )}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Requisition</th>
                      <th>Age</th>
                      <th>Pipeline</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsAtRiskList.map((j) => {
                      const meta = JOB_HEALTH_META[j.state];
                      return (
                        <tr key={j.id}>
                          <td>
                            <Link
                              href={`/jobs/${j.id}`}
                              style={{ fontWeight: 600 }}
                            >
                              {j.title}
                            </Link>
                            {(j.facilityName || j.facilityState) && (
                              <div className="muted" style={{ fontSize: 11 }}>
                                {j.facilityName ?? "—"}
                                {j.facilityState ? ` · ${j.facilityState}` : ""}
                              </div>
                            )}
                          </td>
                          <td className="muted">
                            {j.ageDays != null ? `${j.ageDays}d` : "—"}
                          </td>
                          <td className="muted">
                            {j.submissionsActive > 0
                              ? `${j.submissionsActive} active`
                              : j.submissionsTotal > 0
                                ? `${j.submissionsTotal} early`
                                : "none"}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                badgeTone[meta.tone] ?? "badge-muted"
                              }`}
                              title={j.reason}
                            >
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>
                <span className="row" style={{ gap: 7 }}>
                  <IconAlert width={15} height={15} style={{ color: "var(--warn)" }} />
                  Credentials needing attention
                </span>
              </h3>
              <Link href="/credentials" className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                View all →
              </Link>
            </div>
            {expiring.length === 0 ? (
              <EmptyState title="All credentials current" hint="Nothing expires within 90 days." />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Credential</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/providers/${c.provider?.id}`}
                          style={{ fontWeight: 600 }}
                        >
                          {c.provider?.full_name ?? "—"}
                        </Link>
                      </td>
                      <td>
                        {CREDENTIAL_LABELS[c.type as keyof typeof CREDENTIAL_LABELS]}
                        {c.state ? ` · ${c.state}` : ""}
                      </td>
                      <td className="muted">{fmtDate(c.expires_on)}</td>
                      <td><ExpiryBadge expiresOn={c.expires_on} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Newest open jobs</h3>
              <Link href="/jobs" className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                View all →
              </Link>
            </div>
            {openJobs.length === 0 ? (
              <EmptyState
                title="No open jobs"
                hint="Post a job to start matching clinicians."
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Facility</th>
                    <th>Specialty</th>
                  </tr>
                </thead>
                <tbody>
                  {openJobs.slice(0, 6).map((j: any) => (
                    <tr key={j.id}>
                      <td>
                        <Link href={`/jobs/${j.id}`} style={{ fontWeight: 600 }}>
                          {j.title}
                        </Link>
                      </td>
                      <td className="muted">
                        {j.facility?.name ?? "—"}
                        {j.facility?.state ? ` · ${j.facility.state}` : ""}
                      </td>
                      <td className="muted">{j.specialty || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Recent activity</h3>
            </div>
            {activities.length === 0 ? (
              <EmptyState title="No activity yet" hint="Calls, emails and notes will appear here." />
            ) : (
              <div style={{ padding: "4px 18px" }}>
                <div className="timeline">
                  {activities.map((a: any) => (
                    <div className="timeline-item" key={a.id}>
                      <div className="timeline-ico">
                        {initials(a.provider?.full_name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row-between">
                          <b style={{ fontSize: 13 }}>
                            {a.provider?.full_name ?? "—"}
                          </b>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {relativeTime(a.occurred_at)}
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          <span className="badge badge-muted" style={{ marginRight: 6 }}>
                            {ACTIVITY_LABELS[a.type as keyof typeof ACTIVITY_LABELS]}
                          </span>
                          {a.body}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ alignSelf: "start" }}>
          <div className="card-head">
            <h3>Pipeline snapshot</h3>
            <Link href="/pipeline" className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
              Board →
            </Link>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {stageCounts.map(({ stage, count }) => (
              <div key={stage}>
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {STAGE_LABELS[stage as PipelineStage]}
                  </span>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                    {count}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 0,
                    background: "var(--surface-3)",
                    overflow: "hidden",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      width: `${(count / maxStage) * 100}%`,
                      height: "100%",
                      background: "var(--teal)",
                      borderRadius: 0,
                      transition: "width 0.5s var(--ease)",
                    }}
                  />
                </div>
              </div>
            ))}
            <Link
              href="/providers"
              className="btn btn-block"
              style={{ marginTop: 6 }}
            >
              Browse all providers <IconArrowRight width={14} height={14} />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
