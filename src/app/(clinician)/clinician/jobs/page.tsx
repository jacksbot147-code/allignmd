import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { IconBookmark } from "@/components/icons";
import { fmtDate } from "@/lib/format";
import { scoreMatch, TIER_META, type MatchCredential } from "@/lib/match";
import { toggleSavedJob } from "../../actions";
import type { Provider, ProviderCredential } from "@/lib/types";

export const metadata: Metadata = { title: "Open jobs" };
export const dynamic = "force-dynamic";

// Maps a TIER_META tone onto the project's badge class.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

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
}

export default async function ClinicianJobsPage({
  searchParams,
}: {
  searchParams: { view?: string; error?: string };
}) {
  await requireProvider();
  const provider = await getMyProvider();

  if (!provider) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Open jobs</h2>
            <p>Live clinical roles, matched to your credentials.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your profile isn't linked yet"
            hint="An administrator still needs to connect your account to your clinician profile. Reach out to your AlignMD recruiter."
          />
        </div>
      </>
    );
  }

  const p = provider as Provider;
  const supabase = createClient();
  const savedView = searchParams.view === "saved";

  // Pull the provider's credentials, the active scanned postings, the latest
  // completed feed run, and this clinician's saved postings. The saved_jobs
  // query is defensive — if the 0012 migration has not run it errors cleanly
  // and the page falls back to a no-toggle state.
  const [credsRes, jobsRes, runRes, savedRes] = await Promise.all([
    supabase
      .from("provider_credentials")
      .select("type, state, is_compact, expires_on")
      .eq("provider_id", p.id),
    supabase
      .from("external_jobs")
      .select(
        "id, source, title, org_name, location, state, is_remote, clinician_role, specialty, employment_type, url, posted_at",
      )
      .eq("active", true)
      .order("posted_at", { ascending: false })
      .limit(100),
    supabase
      .from("job_feed_runs")
      .select("finished_at")
      .eq("ok", true)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("saved_jobs")
      .select("external_job_id")
      .eq("provider_id", p.id),
  ]);

  const credentials: MatchCredential[] = (
    (credsRes.data as Pick<
      ProviderCredential,
      "type" | "state" | "is_compact" | "expires_on"
    >[]) ?? []
  ).map((c) => ({
    type: c.type,
    state: c.state,
    is_compact: c.is_compact,
    expires_on: c.expires_on,
  }));

  const jobs = (jobsRes.data as ExternalJobRow[]) ?? [];
  const lastRefreshed =
    (runRes.data as { finished_at: string | null } | null)?.finished_at ?? null;

  // Saved postings — defensive: a missing saved_jobs table just disables the
  // toggle UI rather than crashing the page.
  const savedReady = !savedRes.error;
  const savedIds = new Set(
    ((savedRes.data as { external_job_id: string }[]) ?? []).map(
      (r) => r.external_job_id,
    ),
  );

  // Score every posting against the signed-in clinician, then rank by score.
  const scored = jobs
    .map((job) => {
      const match = scoreMatch({
        provider: {
          clinician_role: p.clinician_role,
          specialty: p.specialty,
          years_experience: p.years_experience,
          telehealth_ok: p.telehealth_ok,
        },
        credentials,
        jobSpecialty: job.specialty,
        jobStates: job.state ? [job.state] : [],
        jobIsTelehealth: Boolean(job.is_remote),
        requiredCerts: [],
        minYears: null,
      });
      return { job, match };
    })
    .sort((a, b) => b.match.score - a.match.score);

  const strongCount = scored.filter((s) => s.match.tier === "strong").length;
  const visible = savedView
    ? scored.filter((s) => savedIds.has(s.job.id))
    : scored;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Open jobs</h2>
          <p>
            Live clinical roles scanned daily from public job boards, ranked
            against your credentials.
          </p>
        </div>
      </div>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}

      {!savedReady && (
        <div className="alert alert-info">
          Saving jobs isn&apos;t available yet — once migration{" "}
          <span className="mono">0012_saved_jobs.sql</span> is applied you can
          keep a shortlist of roles here.
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No open jobs scanned yet"
            hint="The daily scan will populate this, or an admin can run a refresh."
          />
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Open jobs</div>
              <div className="kpi-value">{jobs.length}</div>
              <div className="kpi-sub">currently listed</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Strong matches</div>
              <div className="kpi-value">{strongCount}</div>
              <div className="kpi-sub">
                role{strongCount === 1 ? "" : "s"} that fit your profile
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Saved</div>
              <div className="kpi-value">
                {savedReady ? savedIds.size : "—"}
              </div>
              <div className="kpi-sub">roles you&apos;re interested in</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Last refreshed</div>
              <div className="kpi-value" style={{ fontSize: 20 }}>
                {lastRefreshed ? fmtDate(lastRefreshed) : "—"}
              </div>
              <div className="kpi-sub">updated daily</div>
            </div>
          </div>

          {savedReady && (
            <div className="toolbar">
              <Link
                href="/clinician/jobs"
                className={`btn btn-sm${!savedView ? " btn-primary" : ""}`}
              >
                All open jobs
              </Link>
              <Link
                href="/clinician/jobs?view=saved"
                className={`btn btn-sm${savedView ? " btn-primary" : ""}`}
              >
                Saved ({savedIds.size})
              </Link>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="card">
              <EmptyState
                title="No saved jobs yet"
                hint="Tap Save on any role to keep it on your shortlist here."
                action={
                  <Link href="/clinician/jobs" className="btn btn-primary">
                    Browse open jobs
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="card">
              <div className="card-head">
                <h3>
                  {savedView ? "Saved roles" : "Matched roles"} (
                  {visible.length})
                </h3>
              </div>
              <div className="table-wrap">
                <table className="table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Organization</th>
                    <th>Location</th>
                    <th>Match</th>
                    <th>Posted</th>
                    {savedReady && <th>Save</th>}
                    <th>Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ job, match }) => {
                    const meta = TIER_META[match.tier];
                    const locationText = job.is_remote
                      ? "Remote"
                      : job.location ?? job.state ?? "—";
                    const isSaved = savedIds.has(job.id);
                    return (
                      <tr key={job.id}>
                        <td>
                          <b>{job.title}</b>
                          {job.specialty && (
                            <span
                              className="muted"
                              style={{ fontSize: 11 }}
                            >
                              {" "}
                              · {job.specialty}
                            </span>
                          )}
                          {job.employment_type && (
                            <span
                              className="muted"
                              style={{ fontSize: 11 }}
                            >
                              {" "}
                              · {job.employment_type}
                            </span>
                          )}
                        </td>
                        <td className="muted">{job.org_name ?? "—"}</td>
                        <td className="muted">{locationText}</td>
                        <td>
                          <span
                            className={`badge ${
                              badgeTone[meta.tone] ?? "badge-muted"
                            }`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="muted">{fmtDate(job.posted_at)}</td>
                        {savedReady && (
                          <td>
                            <form action={toggleSavedJob}>
                              <input
                                type="hidden"
                                name="external_job_id"
                                value={job.id}
                              />
                              <input
                                type="hidden"
                                name="view"
                                value={savedView ? "saved" : "all"}
                              />
                              <button
                                type="submit"
                                className={`btn btn-sm${
                                  isSaved ? " btn-primary" : ""
                                }`}
                                aria-label={
                                  isSaved
                                    ? `Remove ${job.title} from saved`
                                    : `Save ${job.title}`
                                }
                              >
                                <IconBookmark
                                  width={13}
                                  height={13}
                                  fill={isSaved ? "currentColor" : "none"}
                                />
                                {isSaved ? "Saved" : "Save"}
                              </button>
                            </form>
                          </td>
                        )}
                        <td>
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm"
                          >
                            Apply ↗
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
