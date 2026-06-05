import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { scoreMatch, TIER_META } from "@/lib/match";
import { computeReadiness } from "@/lib/readiness";
import {
  classifyOpportunity,
  isOpportunityMatch,
  opportunityRank,
  OPPORTUNITY_META,
  type OpportunityState,
} from "@/lib/opportunities";
import type { MatchResult } from "@/lib/match";
import type { ReadinessResult } from "@/lib/readiness";
import type { CredentialingItem } from "@/lib/credentialing";

export const metadata: Metadata = { title: "Placement opportunities" };
export const dynamic = "force-dynamic";

// Maps a TIER_META / OPPORTUNITY_META tone onto the project's badge classes.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

// Opportunities surfaced per job card — this is an action list, not an archive.
const TOP_OPPS = 5;

// The provider columns the match + readiness engines need.
interface ProviderLite {
  id: string;
  full_name: string;
  clinician_role: string | null;
  specialty: string | null;
  years_experience: number | null;
  telehealth_ok: boolean | null;
}

// A provider_credentials row, scoped to what match + readiness consume. Every
// field is required here so the same row feeds both engines without a re-shape.
interface CredRow {
  type: string;
  state: string | null;
  is_compact: boolean | null;
  expires_on: string | null;
}

interface Opportunity {
  provider: ProviderLite;
  match: MatchResult;
  readiness: ReadinessResult;
  state: OpportunityState;
}

interface JobOpportunities {
  jobId: string;
  title: string;
  specialty: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityState: string | null;
  opps: Opportunity[];
  submitNow: number;
  inProgress: number;
  blocked: number;
}

// A thin credentialing-packet bar — same visual language as the /readiness and
// /reports progress bars.
function PacketBar({ percent }: { percent: number }) {
  return (
    <div
      style={{
        height: 7,
        width: 84,
        borderRadius: 100,
        background: "var(--line-2)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          height: "100%",
          background: "var(--teal)",
          borderRadius: 100,
        }}
      />
    </div>
  );
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const supabase = createClient();

  const filterParam =
    searchParams.filter === "ready" || searchParams.filter === "blocked"
      ? searchParams.filter
      : null;

  // Open jobs, the active roster, every credential, the credentialing packet
  // rows and existing submissions. credentialing_items (migration 0011) may not
  // be applied yet — that query is allowed to error and every clinician simply
  // reads as "credentialing underway", exactly like the /readiness board.
  const [jobsRes, providersRes, credsRes, itemsRes, subsRes] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, title, specialty, setting, facility:facilities(id, name, state)",
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
      supabase.from("submissions").select("job_id, provider_id"),
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

  // (job, provider) pairs already submitted — never re-surface them as leads.
  const submittedPairs = new Set<string>();
  for (const s of (subsRes.data as
    | { job_id: string; provider_id: string }[]
    | null) ?? []) {
    submittedPairs.add(`${s.job_id}::${s.provider_id}`);
  }

  // Score every clinician against every open job, then keep only the real
  // matches and classify each by credentialing readiness.
  const jobRows: JobOpportunities[] = jobs.map((job) => {
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

    const opps: Opportunity[] = [];
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
      opps.push({
        provider: p,
        match,
        readiness,
        state: classifyOpportunity(readiness),
      });
    }

    // Most actionable first: ready leads, then in-progress, then blocked;
    // within a band, the strongest match and the fullest packet first.
    opps.sort((a, b) => {
      const byState = opportunityRank(a.state) - opportunityRank(b.state);
      if (byState !== 0) return byState;
      const byScore = b.match.score - a.match.score;
      if (byScore !== 0) return byScore;
      const byPacket = b.readiness.packetPercent - a.readiness.packetPercent;
      if (byPacket !== 0) return byPacket;
      return a.provider.full_name.localeCompare(b.provider.full_name);
    });

    return {
      jobId: job.id,
      title: job.title,
      specialty: job.specialty ?? null,
      facilityId: facility?.id ?? null,
      facilityName: facility?.name ?? null,
      facilityState: facility?.state ?? null,
      opps,
      submitNow: opps.filter((o) => o.state === "submit_now").length,
      inProgress: opps.filter((o) => o.state === "in_progress").length,
      blocked: opps.filter((o) => o.state === "blocked").length,
    };
  });

  // Only jobs with at least one real match are leads worth listing.
  const withMatches = jobRows.filter((j) => j.opps.length > 0);
  const noMatchCount = jobs.length - withMatches.length;

  // Roster-wide counts (stable — computed before the filter is applied).
  const jobsReady = withMatches.filter((j) => j.submitNow > 0).length;
  const jobsBlockedOnly = withMatches.filter(
    (j) => j.blocked > 0 && j.submitNow === 0,
  ).length;
  const submitNowTotal = withMatches.reduce((n, j) => n + j.submitNow, 0);
  const blockedTotal = withMatches.reduce((n, j) => n + j.blocked, 0);

  // Ready-to-fill jobs first, then the most leads, then by title.
  const sorted = [...withMatches].sort((a, b) => {
    const aReady = a.submitNow > 0 ? 1 : 0;
    const bReady = b.submitNow > 0 ? 1 : 0;
    if (aReady !== bReady) return bReady - aReady;
    if (b.submitNow !== a.submitNow) return b.submitNow - a.submitNow;
    if (b.opps.length !== a.opps.length) return b.opps.length - a.opps.length;
    return a.title.localeCompare(b.title);
  });

  const visible =
    filterParam === "ready"
      ? sorted.filter((j) => j.submitNow > 0)
      : filterParam === "blocked"
        ? sorted.filter((j) => j.blocked > 0 && j.submitNow === 0)
        : sorted;

  const kpis = [
    { label: "Open jobs", value: jobs.length, sub: "roles still to fill" },
    {
      label: "Ready to fill",
      value: jobsReady,
      sub: "a placeable clinician is matched",
    },
    {
      label: "Submit-ready leads",
      value: submitNowTotal,
      sub: "match + packet complete",
    },
    {
      label: "Blocked on credentialing",
      value: blockedTotal,
      sub: "matches held back by the packet",
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Placement opportunities</h2>
          <p>
            Every open job crossed against your roster — which roles you can
            fill today, and which placements are stuck behind a credentialing
            gap.
          </p>
        </div>
      </div>

      {!credentialingReady && (
        <div className="alert alert-info">
          Credentialing-packet tracking is not set up yet — apply migration{" "}
          <code>0011_credentialing.sql</code> to record packet progress. Until
          then matched clinicians all read as &quot;credentialing
          underway&quot;; the match ranking below is still live.
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
        <Link
          href="/opportunities"
          className={`btn btn-sm${!filterParam ? " btn-primary" : ""}`}
        >
          All leads ({withMatches.length})
        </Link>
        <Link
          href="/opportunities?filter=ready"
          className={`btn btn-sm${filterParam === "ready" ? " btn-primary" : ""}`}
        >
          Ready to fill ({jobsReady})
        </Link>
        <Link
          href="/opportunities?filter=blocked"
          className={`btn btn-sm${
            filterParam === "blocked" ? " btn-primary" : ""
          }`}
        >
          Blocked on credentialing ({jobsBlockedOnly})
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No open jobs"
            hint="Post a job and AlignMD will rank your roster against it here, flagging who is ready to place and who is blocked."
            action={
              <Link href="/jobs/new" className="btn btn-primary btn-sm">
                <IconPlus width={15} height={15} /> Post a job
              </Link>
            }
          />
        </div>
      ) : withMatches.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No match-ready opportunities yet"
            hint="None of your open jobs has a fair-or-better match on the roster. Add clinicians, or refine each job's match requirements."
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Nothing in that band"
            hint={
              filterParam === "ready"
                ? "No open job has a submit-ready clinician right now. Clear the credentialing gaps on the blocked leads to change that."
                : "No open job is blocked solely on credentialing. The leads you have are either ready or already in progress."
            }
          />
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {visible.map((job) => (
            <div className="card" key={job.jobId}>
              <div className="card-head">
                <div>
                  <h3 style={{ fontSize: 14 }}>
                    <Link href={`/jobs/${job.jobId}`}>{job.title}</Link>
                  </h3>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                    {job.facilityName ? (
                      job.facilityId ? (
                        <Link href={`/facilities/${job.facilityId}`}>
                          {job.facilityName}
                        </Link>
                      ) : (
                        job.facilityName
                      )
                    ) : (
                      "Facility not set"
                    )}
                    {job.facilityState ? ` · ${job.facilityState}` : ""}
                    {job.specialty ? ` · ${job.specialty}` : ""}
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {job.submitNow > 0 && (
                    <span className="badge badge-ok">
                      {job.submitNow} ready
                    </span>
                  )}
                  {job.inProgress > 0 && (
                    <span className="badge badge-warn">
                      {job.inProgress} in progress
                    </span>
                  )}
                  {job.blocked > 0 && (
                    <span className="badge badge-danger">
                      {job.blocked} blocked
                    </span>
                  )}
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Clinician</th>
                      <th>Match</th>
                      <th>Credentialing packet</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.opps.slice(0, TOP_OPPS).map((o) => {
                      const tier = TIER_META[o.match.tier];
                      const opp = OPPORTUNITY_META[o.state];
                      return (
                        <tr key={o.provider.id}>
                          <td>
                            <Link
                              href={`/providers/${o.provider.id}?tab=credentialing`}
                              style={{ fontWeight: 700 }}
                            >
                              {o.provider.full_name}
                            </Link>
                            {o.provider.clinician_role && (
                              <span className="muted" style={{ fontSize: 11 }}>
                                {" · "}
                                {o.provider.clinician_role}
                              </span>
                            )}
                            {o.provider.specialty && (
                              <div className="muted" style={{ fontSize: 11 }}>
                                {o.provider.specialty}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="row" style={{ gap: 6 }}>
                              <span className="badge badge-muted">
                                {o.match.score}
                              </span>
                              <span
                                className={`badge ${
                                  badgeTone[tier.tone] ?? "badge-muted"
                                }`}
                              >
                                {tier.label}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 8 }}>
                              <PacketBar percent={o.readiness.packetPercent} />
                              <span style={{ fontSize: 12, fontWeight: 700 }}>
                                {o.readiness.packetPercent}%
                              </span>
                              {o.readiness.expiredCredentials > 0 && (
                                <span className="badge badge-danger">
                                  {o.readiness.expiredCredentials} expired
                                </span>
                              )}
                              {o.readiness.expiredCredentials === 0 &&
                                o.readiness.majorGaps > 0 && (
                                  <span className="badge badge-danger">
                                    {o.readiness.majorGaps} major gap
                                    {o.readiness.majorGaps === 1 ? "" : "s"}
                                  </span>
                                )}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                badgeTone[opp.tone] ?? "badge-muted"
                              }`}
                              title={o.readiness.summary}
                            >
                              {opp.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {job.opps.length > TOP_OPPS && (
                <div className="card-pad">
                  <Link
                    href={`/jobs/${job.jobId}`}
                    className="muted"
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    {job.opps.length - TOP_OPPS} more matched clinician
                    {job.opps.length - TOP_OPPS === 1 ? "" : "s"} on the job →
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {jobs.length > 0 && noMatchCount > 0 && !filterParam && (
        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          {noMatchCount} open job{noMatchCount === 1 ? "" : "s"} ha
          {noMatchCount === 1 ? "s" : "ve"} no fair-or-better match on the
          roster yet and {noMatchCount === 1 ? "is" : "are"} not listed above.
        </p>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Opportunities cross the match score for every open job with each
        clinician&apos;s credentialing readiness. A blocked lead is a placement
        waiting only on the packet — open the clinician to work their
        Credentialing tab, or review the whole roster on{" "}
        <Link href="/readiness">Readiness</Link>.
      </p>
    </>
  );
}
