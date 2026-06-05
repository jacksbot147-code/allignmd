import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, Pagination } from "@/components/ui";
import { IconPlus, IconSearch, IconActivity } from "@/components/icons";
import { JOB_STATUSES, JOB_STATUS_LABELS, JOB_STATUS_TONE } from "@/lib/constants";
import { fmtMoney } from "@/lib/format";
import { parsePageParam, pageInfo } from "@/lib/pagination";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  teal: "badge-teal",
  muted: "badge-muted",
};

// Only the columns the table renders — no `select("*")` at scale.
const JOB_COLS =
  "id, title, specialty, is_permanent, rate_hourly, status, created_at, facility:facilities(name, state)";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}) {
  const status = searchParams.status;
  const requestedPage = parsePageParam(searchParams.page);
  const supabase = createClient();

  const withStatus = (builder: any) =>
    status ? builder.eq("status", status) : builder;

  // 1) Count the filtered set, then 2) fetch only the requested page.
  const { count } = await withStatus(
    supabase.from("jobs").select("id", { count: "exact", head: true }),
  );
  const info = pageInfo(requestedPage, count ?? 0);

  const { data: jobsData } = await withStatus(
    supabase.from("jobs").select(JOB_COLS),
  )
    .order("created_at", { ascending: false })
    .range(info.from, info.to);
  const jobs = jobsData ?? [];

  // Submission counts only for the jobs on this page — not the whole table.
  const jobIds = jobs.map((j: any) => j.id);
  let subs: any[] = [];
  if (jobIds.length) {
    const { data } = await supabase
      .from("submissions")
      .select("job_id")
      .in("job_id", jobIds);
    subs = data ?? [];
  }
  const subCount = (id: string) =>
    subs.filter((s: any) => s.job_id === id).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Jobs</h2>
          <p>Open roles across every client facility.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link href="/jobs/health" className="btn">
            <IconActivity width={15} height={15} /> Job health
          </Link>
          <Link href="/jobs/scanned" className="btn">
            <IconSearch width={15} height={15} /> Scanned jobs
          </Link>
          <Link href="/jobs/new" className="btn btn-primary">
            <IconPlus width={15} height={15} /> Post a job
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <Link
          href="/jobs"
          className={`btn btn-sm${!status ? " btn-primary" : ""}`}
        >
          All
        </Link>
        {JOB_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/jobs?status=${s}`}
            className={`btn btn-sm${status === s ? " btn-primary" : ""}`}
          >
            {JOB_STATUS_LABELS[s]}
          </Link>
        ))}
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {info.total} job{info.total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="card">
        {jobs.length === 0 ? (
          <EmptyState
            title={status ? "No jobs with that status" : "No jobs yet"}
            hint={
              status
                ? "Try a different status filter."
                : "Post a job to start matching clinicians."
            }
            action={
              !status && (
                <Link href="/jobs/new" className="btn btn-primary">
                  <IconPlus width={15} height={15} /> Post a job
                </Link>
              )
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Facility</th>
                <th>Type</th>
                <th>Rate</th>
                <th>Submissions</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j: any) => (
                <tr key={j.id} className="table-row-link">
                  <td>
                    <Link href={`/jobs/${j.id}`} className="row" style={{ gap: 2 }}>
                      <span>
                        <b style={{ display: "block" }}>{j.title}</b>
                        <span className="muted" style={{ fontSize: 11 }}>
                          {j.specialty || "Specialty not set"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    {j.facility?.name ?? "—"}
                    {j.facility?.state && (
                      <span className="muted" style={{ fontSize: 11 }}>
                        {" "}· {j.facility.state}
                      </span>
                    )}
                  </td>
                  <td className="muted">
                    {j.is_permanent ? "Permanent" : "Locum / temp"}
                  </td>
                  <td className="muted">
                    {j.rate_hourly != null ? `${fmtMoney(j.rate_hourly)}/hr` : "—"}
                  </td>
                  <td>
                    <span className="badge badge-muted">{subCount(j.id)}</span>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination info={info} basePath="/jobs" params={{ status }} />
    </>
  );
}
