import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/format";
import { scoreMatch, TIER_META, type MatchCredential } from "@/lib/match";
import { PROVIDER_ROLES } from "@/lib/constants";
import { refreshScannedJobs } from "./actions";
import type { CredentialType, ProviderRole } from "@/lib/types";

export const metadata: Metadata = { title: "Scanned jobs" };
export const dynamic = "force-dynamic";

// Maps a TIER_META tone onto the project's badge class.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

// Most recent postings shown per page load — this is a scanning view, not a
// full archive; older rows still feed the clinician portal.
const DISPLAY_LIMIT = 60;
// Clinician matches surfaced per job card.
const TOP_MATCHES = 4;

// One active row from external_jobs (migration 0010).
interface ExternalJobRow {
  id: string;
  source: string;
  title: string;
  org_name: string | null;
  location: string | null;
  state: string | null;
  is_remote: boolean | null;
  clinician_role: string | null;
  specialty: string | null;
  employment_type: string | null;
  url: string;
  posted_at: string | null;
  salary_min: number | null;
  salary_max: number | null;
}

// Just the provider columns scoreMatch needs.
interface ProviderLite {
  id: string;
  full_name: string;
  clinician_role: string | null;
  specialty: string | null;
  years_experience: number | null;
  telehealth_ok: boolean | null;
}

// A provider_credentials row, scoped to the match-relevant columns.
interface CredentialRow {
  provider_id: string;
  type: CredentialType;
  state: string | null;
  is_compact: boolean | null;
  expires_on: string | null;
}

function salaryText(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${fmtMoney(min)}–${fmtMoney(max)}`;
  if (min != null) return `From ${fmtMoney(min)}`;
  if (max != null) return `Up to ${fmtMoney(max)}`;
  return null;
}

export default async function ScannedJobsPage({
  searchParams,
}: {
  searchParams: {
    role?: string;
    error?: string;
    refreshed?: string;
    deactivated?: string;
  };
}) {
  const supabase = createClient();

  const roleParam =
    searchParams.role &&
    (PROVIDER_ROLES as string[]).includes(searchParams.role)
      ? (searchParams.role as ProviderRole)
      : null;

  // Active scanned postings, most recent first. Defensive — if external_jobs
  // is missing, the query errors and we render an empty state, never crash.
  let jobsQuery = supabase
    .from("external_jobs")
    .select(
      "id, source, title, org_name, location, state, is_remote, clinician_role, specialty, employment_type, url, posted_at, salary_min, salary_max",
    )
    .eq("active", true);
  if (roleParam) jobsQuery = jobsQuery.eq("clinician_role", roleParam);

  const [jobsRes, runRes, providersRes, credsRes] = await Promise.all([
    jobsQuery
      .order("posted_at", { ascending: false })
      .limit(DISPLAY_LIMIT),
    supabase
      .from("job_feed_runs")
      .select("finished_at, sources")
      .eq("ok", true)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("providers")
      .select(
        "id, full_name, clinician_role, specialty, years_experience, telehealth_ok",
      )
      .is("archived_at", null),
    supabase
      .from("provider_credentials")
      .select("provider_id, type, state, is_compact, expires_on"),
  ]);

  const tableReady = !jobsRes.error;
  const jobs = (jobsRes.data as ExternalJobRow[]) ?? [];
  const providers = (providersRes.data as ProviderLite[]) ?? [];
  const lastRun =
    (runRes.data as {
      finished_at: string | null;
      sources: string[] | null;
    } | null) ?? null;

  // Group credentials by provider so each clinician is scored once.
  const credsByProvider = new Map<string, MatchCredential[]>();
  for (const c of (credsRes.data as CredentialRow[]) ?? []) {
    const list = credsByProvider.get(c.provider_id) ?? [];
    list.push({
      type: c.type,
      state: c.state,
      is_compact: c.is_compact,
      expires_on: c.expires_on,
    });
    credsByProvider.set(c.provider_id, list);
  }

  // Score each scanned posting against the relevant clinicians. When a posting
  // carries a clinician role we only score clinicians in that role — matching
  // an OT against an MD opening would just be noise.
  const scored = jobs.map((job) => {
    const candidates = job.clinician_role
      ? providers.filter((p) => p.clinician_role === job.clinician_role)
      : providers;
    const matches = candidates
      .map((p) => ({
        provider: p,
        result: scoreMatch({
          provider: {
            clinician_role: p.clinician_role,
            specialty: p.specialty,
            years_experience: p.years_experience,
            telehealth_ok: p.telehealth_ok,
          },
          credentials: credsByProvider.get(p.id) ?? [],
          jobSpecialty: job.specialty,
          jobStates: job.state ? [job.state] : [],
          jobIsTelehealth: Boolean(job.is_remote),
          requiredCerts: [],
          minYears: null,
        }),
      }))
      .sort((a, b) => b.result.score - a.result.score);
    const strong = matches.filter((m) => m.result.tier === "strong").length;
    return {
      job,
      top: matches.slice(0, TOP_MATCHES),
      strong,
      candidateCount: candidates.length,
    };
  });

  const jobsWithStrong = scored.filter((s) => s.strong > 0).length;
  const sources = lastRun?.sources ?? [];

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/jobs">Jobs</Link> / Scanned market jobs
      </p>

      <div className="page-head">
        <div>
          <h2>Scanned jobs</h2>
          <p>
            Live external openings scanned from public job boards, each ranked
            against the clinicians on your roster.
          </p>
        </div>
        <form action={refreshScannedJobs}>
          <button type="submit" className="btn btn-primary">
            Refresh now
          </button>
        </form>
      </div>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}
      {searchParams.refreshed != null && !searchParams.error && (
        <div className="alert alert-ok">
          Refresh complete — {searchParams.refreshed} posting
          {searchParams.refreshed === "1" ? "" : "s"} added or updated
          {searchParams.deactivated && searchParams.deactivated !== "0"
            ? `, ${searchParams.deactivated} closed out`
            : ""}
          .
        </div>
      )}

      {!tableReady ? (
        <div className="card">
          <EmptyState
            title="Job scanning isn't set up yet"
            hint="Once migration 0010_external_jobs.sql is applied, scanned postings appear here. Use Refresh now to pull the latest public listings."
          />
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Scanned jobs</div>
              <div className="kpi-value">{jobs.length}</div>
              <div className="kpi-sub">
                {roleParam ? `${roleParam} roles shown` : "most recent shown"}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">With a strong match</div>
              <div className="kpi-value">{jobsWithStrong}</div>
              <div className="kpi-sub">
                job{jobsWithStrong === 1 ? "" : "s"} a clinician fits
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Clinicians scored</div>
              <div className="kpi-value">{providers.length}</div>
              <div className="kpi-sub">active on your roster</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Last refreshed</div>
              <div className="kpi-value" style={{ fontSize: 20 }}>
                {lastRun?.finished_at ? fmtDate(lastRun.finished_at) : "—"}
              </div>
              <div className="kpi-sub">
                {sources.length ? sources.join(", ") : "no runs yet"}
              </div>
            </div>
          </div>

          <div className="toolbar">
            <Link
              href="/jobs/scanned"
              className={`btn btn-sm${!roleParam ? " btn-primary" : ""}`}
            >
              All roles
            </Link>
            {PROVIDER_ROLES.map((r) => (
              <Link
                key={r}
                href={`/jobs/scanned?role=${r}`}
                className={`btn btn-sm${roleParam === r ? " btn-primary" : ""}`}
              >
                {r}
              </Link>
            ))}
          </div>

          {jobs.length === 0 ? (
            <div className="card">
              <EmptyState
                title={
                  roleParam
                    ? "No scanned jobs for that role"
                    : "No scanned jobs yet"
                }
                hint={
                  roleParam
                    ? "Try another role filter, or refresh the feed."
                    : "Use Refresh now to pull the latest public clinical postings."
                }
              />
            </div>
          ) : (
            <div className="stack" style={{ gap: 14 }}>
              {scored.map(({ job, top, strong, candidateCount }) => {
                const pay = salaryText(job.salary_min, job.salary_max);
                const locationText = job.is_remote
                  ? "Remote"
                  : job.location ?? job.state ?? "Location not listed";
                return (
                  <div className="card" key={job.id}>
                    <div className="card-head">
                      <div>
                        <h3 style={{ fontSize: 14 }}>{job.title}</h3>
                        <div
                          className="row"
                          style={{
                            gap: 6,
                            marginTop: 5,
                            flexWrap: "wrap",
                          }}
                        >
                          {job.clinician_role && (
                            <span className="badge badge-teal">
                              {job.clinician_role}
                            </span>
                          )}
                          {job.specialty && (
                            <span className="badge badge-muted">
                              {job.specialty}
                            </span>
                          )}
                          {job.employment_type && (
                            <span className="badge badge-muted">
                              {job.employment_type}
                            </span>
                          )}
                          {job.is_remote ? (
                            <span className="badge badge-muted">Remote</span>
                          ) : (
                            job.state && (
                              <span className="badge badge-muted">
                                {job.state}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                      <span
                        className="muted"
                        style={{ fontSize: 12, whiteSpace: "nowrap" }}
                      >
                        {job.source} · {fmtDate(job.posted_at)}
                      </span>
                    </div>

                    <div className="card-pad">
                      <div
                        className="row-between"
                        style={{ flexWrap: "wrap", gap: 10 }}
                      >
                        <span className="muted" style={{ fontSize: 13 }}>
                          {job.org_name ?? "Organization not listed"} ·{" "}
                          {locationText}
                          {pay ? ` · ${pay}` : ""}
                        </span>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                        >
                          View posting ↗
                        </a>
                      </div>
                    </div>

                    <div className="card-head">
                      <h3>Clinician matches</h3>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {candidateCount === 0
                          ? "none on roster"
                          : `${strong} strong of ${candidateCount} scored`}
                      </span>
                    </div>

                    {candidateCount === 0 ? (
                      <div className="card-pad">
                        <p className="muted" style={{ fontSize: 12 }}>
                          No active clinicians
                          {job.clinician_role
                            ? ` in the ${job.clinician_role} role`
                            : ""}{" "}
                          on your roster to match yet.
                        </p>
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Clinician</th>
                              <th>Specialty</th>
                              <th>Score</th>
                              <th>Match</th>
                            </tr>
                          </thead>
                          <tbody>
                            {top.map(({ provider, result }) => {
                              const meta = TIER_META[result.tier];
                              return (
                                <tr key={provider.id}>
                                  <td>
                                    <Link
                                      href={`/providers/${provider.id}`}
                                      style={{ fontWeight: 700 }}
                                    >
                                      {provider.full_name}
                                    </Link>
                                    {provider.clinician_role && (
                                      <span
                                        className="muted"
                                        style={{ fontSize: 11 }}
                                      >
                                        {" "}
                                        · {provider.clinician_role}
                                      </span>
                                    )}
                                  </td>
                                  <td className="muted">
                                    {provider.specialty ?? "—"}
                                  </td>
                                  <td>
                                    <span className="badge badge-muted">
                                      {result.score}
                                    </span>
                                  </td>
                                  <td>
                                    <span
                                      className={`badge ${
                                        badgeTone[meta.tone] ?? "badge-muted"
                                      }`}
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
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
