import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireFacilityContact } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { JOB_STATUS_LABELS, JOB_STATUS_TONE } from "@/lib/constants";
import { fmtDate, fmtMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  teal: "badge-teal",
  muted: "badge-muted",
};

export default async function FacilityJobsPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const user = await requireFacilityContact();

  if (!user.facility_id) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Jobs</h2>
            <p>Post and manage the roles you want AlignMD to fill.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your account isn't linked to a facility yet"
            hint="An AlignMD administrator still needs to connect your account to your facility. Once they do, you can post and manage roles here."
          />
        </div>
      </>
    );
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("jobs")
    .select(
      "id, title, specialty, status, is_permanent, rate_hourly, setting, created_at",
    )
    .eq("facility_id", user.facility_id)
    .order("created_at", { ascending: false });
  const jobs = data ?? [];

  // Submission counts for the facility's jobs.
  const jobIds = jobs.map((j: any) => j.id);
  let subCount = (_id: string) => 0;
  if (jobIds.length) {
    const { data: subs } = await supabase
      .from("submissions")
      .select("job_id")
      .in("job_id", jobIds);
    const counts = new Map<string, number>();
    for (const s of subs ?? []) {
      counts.set(s.job_id, (counts.get(s.job_id) ?? 0) + 1);
    }
    subCount = (id: string) => counts.get(id) ?? 0;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Jobs</h2>
          <p>Post and manage the roles you want AlignMD to fill.</p>
        </div>
        <Link href="/facility/jobs/new" className="btn btn-primary">
          <IconPlus width={15} height={15} /> Post a role
        </Link>
      </div>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}
      {searchParams.saved && (
        <div className="alert alert-ok">Job saved.</div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Your roles ({jobs.length})</h3>
        </div>
        {jobs.length === 0 ? (
          <EmptyState
            title="No roles posted yet"
            hint="Post your first role and AlignMD will start matching clinicians to it. You can edit a role's details and requirements any time."
            action={
              <Link href="/facility/jobs/new" className="btn btn-primary">
                Post a role
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Specialty</th>
                  <th>Type</th>
                  <th>Rate</th>
                  <th>Posted</th>
                  <th>Submissions</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j: any) => (
                  <tr key={j.id} className="table-row-link">
                    <td>
                      <Link
                        href={`/facility/jobs/${j.id}`}
                        style={{ fontWeight: 700 }}
                      >
                        {j.title}
                      </Link>
                    </td>
                    <td>{j.specialty || "—"}</td>
                    <td className="muted">
                      {j.is_permanent ? "Permanent" : "Locum / temp"}
                    </td>
                    <td className="muted">
                      {j.rate_hourly != null
                        ? `${fmtMoney(j.rate_hourly)}/hr`
                        : "—"}
                    </td>
                    <td className="muted">{fmtDate(j.created_at)}</td>
                    <td>
                      <span className="badge badge-muted">
                        {subCount(j.id)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          toneClass[JOB_STATUS_TONE[j.status] ?? "muted"]
                        }`}
                      >
                        {JOB_STATUS_LABELS[j.status] ?? j.status}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/facility/jobs/${j.id}/edit`}
                        className="btn btn-sm"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
