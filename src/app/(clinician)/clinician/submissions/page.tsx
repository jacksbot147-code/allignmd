import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { EmptyState, StageBadge } from "@/components/ui";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import type { Provider } from "@/lib/types";

export const metadata: Metadata = { title: "My submissions" };
export const dynamic = "force-dynamic";

export default async function ClinicianSubmissionsPage() {
  await requireProvider();
  const provider = await getMyProvider();

  if (!provider) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>My submissions</h2>
            <p>Roles you&apos;ve been put forward for.</p>
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
  const { data } = await supabase
    .from("submissions")
    .select(
      "*, job:jobs(id, title, specialty, setting, facility:facilities(name, city, state))",
    )
    .eq("provider_id", p.id)
    .order("created_at", { ascending: false });
  const submissions = data ?? [];

  // Count submissions per stage for the snapshot strip.
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: submissions.filter((s: any) => s.stage === stage).length,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h2>My submissions</h2>
          <p>Every role a recruiter has put you forward for, and where it stands.</p>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No submissions yet"
            hint="When a recruiter submits you to a job, it appears here with its live stage. Keeping your profile and availability current makes that happen sooner."
          />
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            {stageCounts
              .filter((s) => s.count > 0)
              .map((s) => (
                <div className="kpi" key={s.stage}>
                  <div className="kpi-label">{STAGE_LABELS[s.stage]}</div>
                  <div className="kpi-value">{s.count}</div>
                  <div className="kpi-sub">
                    submission{s.count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>All submissions ({submissions.length})</h3>
            </div>
            <div className="table-wrap">
              <table className="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Facility</th>
                  <th>Match</th>
                  <th>Submitted</th>
                  <th>Last milestone</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s: any) => {
                  const milestone =
                    s.placed_on
                      ? `Placed ${fmtDate(s.placed_on)}`
                      : s.offer_on
                        ? `Offer ${fmtDate(s.offer_on)}`
                        : s.interview_on
                          ? `Interview ${fmtDate(s.interview_on)}`
                          : "—";
                  return (
                    <tr key={s.id}>
                      <td>
                        <b>{s.job?.title ?? "Role"}</b>
                        {s.job?.specialty && (
                          <span className="muted" style={{ fontSize: 11 }}>
                            {" "}
                            · {s.job.specialty}
                          </span>
                        )}
                      </td>
                      <td className="muted">
                        {s.job?.facility?.name ?? "—"}
                        {s.job?.facility?.state
                          ? ` · ${s.job.facility.state}`
                          : ""}
                      </td>
                      <td>
                        {s.match_score != null ? (
                          <span className="badge badge-muted">
                            {s.match_score}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="muted">{fmtDate(s.submitted_on)}</td>
                      <td className="muted">{milestone}</td>
                      <td>
                        <StageBadge stage={s.stage} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
