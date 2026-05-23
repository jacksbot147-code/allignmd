import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireFacilityContact } from "@/lib/auth";
import { EmptyState, StageBadge } from "@/components/ui";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants";
import { TIER_META, type MatchTier } from "@/lib/match";
import { fmtDate } from "@/lib/format";
import type { PipelineStage } from "@/lib/types";

export const metadata: Metadata = { title: "Candidates" };
export const dynamic = "force-dynamic";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  teal: "badge-teal",
  muted: "badge-muted",
  danger: "badge-danger",
};

/** Derive a match tier from a stored numeric score (mirrors match.ts). */
function tierForScore(score: number | null): MatchTier | null {
  if (score == null) return null;
  if (score >= 80) return "strong";
  if (score >= 60) return "fair";
  if (score >= 40) return "stretch";
  return "ineligible";
}

export default async function FacilityCandidatesPage({
  searchParams,
}: {
  searchParams: { stage?: string };
}) {
  const user = await requireFacilityContact();

  if (!user.facility_id) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Candidates</h2>
            <p>Clinicians submitted across all of your roles.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your account isn't linked to a facility yet"
            hint="An AlignMD administrator still needs to connect your account to your facility. Once they do, submitted candidates will appear here."
          />
        </div>
      </>
    );
  }

  const supabase = createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("facility_id", user.facility_id);
  const jobIds = (jobs ?? []).map((j: any) => j.id);
  const jobTitle = new Map<string, string>(
    (jobs ?? []).map((j: any) => [j.id, j.title]),
  );

  let submissions: any[] = [];
  if (jobIds.length) {
    const { data } = await supabase
      .from("submissions")
      .select(
        "*, provider:providers(id, full_name, clinician_role, specialty, years_experience)",
      )
      .in("job_id", jobIds)
      .order("match_score", { ascending: false, nullsFirst: false });
    submissions = data ?? [];
  }

  const stageFilter =
    searchParams.stage && PIPELINE_STAGES.includes(searchParams.stage as PipelineStage)
      ? (searchParams.stage as PipelineStage)
      : null;
  const visible = stageFilter
    ? submissions.filter((s: any) => s.stage === stageFilter)
    : submissions;

  // Per-stage counts for the filter strip.
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: submissions.filter((s: any) => s.stage === stage).length,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Candidates</h2>
          <p>
            Every clinician AlignMD has submitted across your roles, ranked by
            match score.
          </p>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No candidates yet"
            hint="As AlignMD submits matched clinicians to your open roles, they'll appear here with their match score and pipeline stage."
            action={
              <Link href="/facility/jobs" className="btn btn-primary">
                View your roles
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="toolbar">
            <Link
              href="/facility/candidates"
              className={`btn btn-sm${!stageFilter ? " btn-primary" : ""}`}
            >
              All ({submissions.length})
            </Link>
            {stageCounts
              .filter((s) => s.count > 0)
              .map((s) => (
                <Link
                  key={s.stage}
                  href={`/facility/candidates?stage=${s.stage}`}
                  className={`btn btn-sm${
                    stageFilter === s.stage ? " btn-primary" : ""
                  }`}
                >
                  {STAGE_LABELS[s.stage]} ({s.count})
                </Link>
              ))}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>
                {stageFilter ? STAGE_LABELS[stageFilter] : "All candidates"} (
                {visible.length})
              </h3>
            </div>
            {visible.length === 0 ? (
              <EmptyState
                title="No candidates at this stage"
                hint="Try another stage, or clear the filter to see everyone."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Clinician</th>
                      <th>Role applied to</th>
                      <th>Experience</th>
                      <th>Match</th>
                      <th>Submitted</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s: any) => {
                      const tier = tierForScore(s.match_score);
                      const meta = tier ? TIER_META[tier] : null;
                      return (
                        <tr key={s.id} className="table-row-link">
                          <td>
                            <b>{s.provider?.full_name ?? "Clinician"}</b>
                            <div
                              className="muted"
                              style={{ fontSize: 11 }}
                            >
                              {s.provider?.clinician_role ?? ""}
                              {s.provider?.specialty
                                ? `${
                                    s.provider?.clinician_role ? " · " : ""
                                  }${s.provider.specialty}`
                                : ""}
                            </div>
                          </td>
                          <td>
                            <Link href={`/facility/jobs/${s.job_id}`}>
                              {jobTitle.get(s.job_id) ?? "Role"}
                            </Link>
                          </td>
                          <td className="muted">
                            {s.provider?.years_experience != null
                              ? `${s.provider.years_experience} yrs`
                              : "—"}
                          </td>
                          <td>
                            {s.match_score != null && meta ? (
                              <span
                                className={`badge ${
                                  toneClass[meta.tone] ?? "badge-muted"
                                }`}
                              >
                                {s.match_score} · {meta.label}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="muted">
                            {fmtDate(s.submitted_on)}
                          </td>
                          <td>
                            <StageBadge stage={s.stage} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 18 }}>
        Candidate submissions and pipeline stages are managed by AlignMD
        recruiters. Contact your recruiter with any questions about a candidate.
      </p>
    </>
  );
}
