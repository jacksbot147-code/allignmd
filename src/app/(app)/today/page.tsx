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
  OPPORTUNITY_META,
} from "@/lib/opportunities";
import { buildTodayDigest, type OpportunityEntry } from "@/lib/today";
import type { CredentialingItem } from "@/lib/credentialing";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

// Maps a TIER_META / OPPORTUNITY_META tone onto the project's badge classes —
// same convention as /opportunities and /readiness.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

// The provider columns the match + readiness engines need. Mirrors the shape
// /opportunities uses so the cross-product runs identically on both pages.
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

// A thin credentialing-packet bar — same visual language as /opportunities and
// /readiness.
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

export default async function TodayPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const supabase = createClient();

  const filterParam =
    searchParams.filter === "chase" ? "chase" : "picks";

  // Same fetch shape as /opportunities — open jobs, the active roster, every
  // credential, the credentialing packet rows and existing submissions.
  // credentialing_items (migration 0011) may not be applied yet — that query
  // is allowed to error and every clinician simply reads as "credentialing
  // underway", exactly like /opportunities and /readiness do.
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

  // Credentials grouped by provider.
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

  // Cross every open job with every active clinician and keep only the real
  // matches — identical scoring path to /opportunities so this view can never
  // drift from the per-job board.
  const entries: OpportunityEntry[] = [];
  for (const job of jobs) {
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
      entries.push({
        providerId: p.id,
        providerName: p.full_name,
        providerRole: p.clinician_role,
        providerSpecialty: p.specialty,
        jobId: job.id,
        jobTitle: job.title,
        facilityName: facility?.name ?? null,
        facilityState: facility?.state ?? null,
        match,
        readiness,
        state: classifyOpportunity(readiness),
      });
    }
  }

  const digest = buildTodayDigest(entries);

  const kpis = [
    {
      label: "Submit-ready leads",
      value: digest.totals.submitReadyPairs,
      sub: "match + packet complete",
    },
    {
      label: "Strong submit-ready",
      value: digest.totals.strongSubmitReady,
      sub: "strongest-tier picks",
    },
    {
      label: "Clinicians to submit",
      value: digest.totals.cliniciansWithSubmitReady,
      sub: "unique people ready today",
    },
    {
      label: "Clinicians to chase",
      value: digest.totals.cliniciansBlocked,
      sub: "matches blocked on credentialing",
    },
  ];

  const rows = filterParam === "chase" ? digest.chaseList : digest.topPicks;
  const isChase = filterParam === "chase";

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Today</h2>
          <p>
            Your prioritised work for the morning — every clinician submission
            ready to send across every open job, ranked highest-impact first.
          </p>
        </div>
      </div>

      {!credentialingReady && (
        <div className="alert alert-info">
          Credentialing-packet tracking is not set up yet — apply migration{" "}
          <code>0011_credentialing.sql</code> to record packet progress. Until
          then matched clinicians all read as &quot;credentialing
          underway&quot;, so the top-picks list below will be empty; the chase
          list will also be empty because nothing can be classified as
          blocked. The match ranking on{" "}
          <Link href="/opportunities">Opportunities</Link> is still live.
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
          href="/today"
          className={`btn btn-sm${!isChase ? " btn-primary" : ""}`}
        >
          Top picks ({digest.topPicks.length})
        </Link>
        <Link
          href="/today?filter=chase"
          className={`btn btn-sm${isChase ? " btn-primary" : ""}`}
        >
          Chase list ({digest.chaseList.length})
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No open jobs"
            hint="Post a job and the desk's daily picks will land here, ranked across the whole roster."
            action={
              <Link href="/jobs/new" className="btn btn-primary btn-sm">
                <IconPlus width={15} height={15} /> Post a job
              </Link>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title={isChase ? "Nothing to chase" : "No submit-ready picks today"}
            hint={
              isChase
                ? "Every real match on the desk right now is either ready to submit or already in progress — nothing is blocked solely on credentialing."
                : "No clinician is both a real match AND credential-complete for an open role today. Clear gaps on the chase list to change that, or browse the per-job view on Opportunities."
            }
            action={
              isChase ? (
                <Link href="/today" className="btn btn-sm">
                  See top picks
                </Link>
              ) : (
                <Link href="/today?filter=chase" className="btn btn-sm">
                  See chase list
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>
              {isChase ? "Clinicians to chase" : "Submissions to send"} (
              {rows.length})
            </h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {isChase
                ? "closest-to-ready first — work the cheapest unblocks today"
                : "strongest match first — submit these now"}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Clinician</th>
                  <th>{isChase ? "Best blocked role" : "Top role"}</th>
                  <th>Match</th>
                  <th>Credentialing packet</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const tier = TIER_META[row.top.match.tier];
                  const opp = OPPORTUNITY_META[row.top.state];
                  const moreCount = row.others.length;
                  return (
                    <tr key={row.providerId}>
                      <td>
                        <Link
                          href={`/providers/${row.providerId}?tab=credentialing`}
                          style={{ fontWeight: 700 }}
                        >
                          {row.providerName}
                        </Link>
                        {row.providerRole && (
                          <span className="muted" style={{ fontSize: 11 }}>
                            {" · "}
                            {row.providerRole}
                          </span>
                        )}
                        {row.providerSpecialty && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {row.providerSpecialty}
                          </div>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/jobs/${row.top.jobId}`}
                          style={{ fontWeight: 600 }}
                        >
                          {row.top.jobTitle}
                        </Link>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {row.top.facilityName ?? "Facility not set"}
                          {row.top.facilityState
                            ? ` · ${row.top.facilityState}`
                            : ""}
                        </div>
                        {moreCount > 0 && (
                          <Link
                            href={`/providers/${row.providerId}`}
                            className="muted"
                            style={{ fontSize: 11, fontWeight: 600 }}
                          >
                            +{moreCount} more open role
                            {moreCount === 1 ? "" : "s"} they fit →
                          </Link>
                        )}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="badge badge-muted">
                            {row.top.match.score}
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
                          <PacketBar percent={row.top.readiness.packetPercent} />
                          <span style={{ fontSize: 12, fontWeight: 700 }}>
                            {row.top.readiness.packetPercent}%
                          </span>
                          {row.top.readiness.expiredCredentials > 0 && (
                            <span className="badge badge-danger">
                              {row.top.readiness.expiredCredentials} expired
                            </span>
                          )}
                          {row.top.readiness.expiredCredentials === 0 &&
                            row.top.readiness.majorGaps > 0 && (
                              <span className="badge badge-danger">
                                {row.top.readiness.majorGaps} major gap
                                {row.top.readiness.majorGaps === 1 ? "" : "s"}
                              </span>
                            )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            badgeTone[opp.tone] ?? "badge-muted"
                          }`}
                          title={row.top.readiness.summary}
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
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Today flattens every match × readiness pair from{" "}
        <Link href="/opportunities">Opportunities</Link> into one ranked
        recruiter to-do list — one row per clinician, strongest fit first.
        Open a clinician to work their{" "}
        <Link href="/readiness">credentialing packet</Link> and clear a
        blocked submission.
      </p>
    </>
  );
}
