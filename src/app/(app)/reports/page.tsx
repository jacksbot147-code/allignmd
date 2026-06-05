import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { STAGE_LABELS } from "@/lib/constants";
import { buildReport, formatPercent } from "@/lib/reports";
import type { ReportSubmission, GroupStat } from "@/lib/reports";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = createClient();

  const [subsRes, usersRes, facilitiesRes, openJobsRes] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        "id, stage, placed_on, created_at, updated_at, provider:providers(owner_id), job:jobs(created_at, facility_id)",
      ),
    supabase.from("app_users").select("id, full_name, email"),
    supabase.from("facilities").select("id, name"),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  const rawSubs = (subsRes.data ?? []) as any[];
  const users = (usersRes.data ?? []) as any[];
  const facilities = (facilitiesRes.data ?? []) as any[];
  const openJobs = openJobsRes.count ?? 0;

  const subs: ReportSubmission[] = rawSubs.map((s) => ({
    id: s.id,
    stage: s.stage,
    placed_on: s.placed_on,
    created_at: s.created_at,
    updated_at: s.updated_at,
    owner_id: s.provider?.owner_id ?? null,
    facility_id: s.job?.facility_id ?? null,
    job_created_at: s.job?.created_at ?? null,
  }));

  const userName = new Map<string, string>(
    users.map((u) => [u.id, u.full_name || u.email || "Unknown"]),
  );
  const facilityName = new Map<string, string>(
    facilities.map((f) => [f.id, f.name]),
  );

  const report = buildReport(
    subs,
    (id) => userName.get(id) ?? "Unknown recruiter",
    (id) => facilityName.get(id) ?? "Unknown facility",
  );

  const maxStage = Math.max(1, ...report.byStage.map((s) => s.count));
  const empty = report.totalSubmissions === 0;

  const kpis = [
    {
      label: "Total submissions",
      value: String(report.totalSubmissions),
      sub: "clinicians put forward",
    },
    {
      label: "Placements",
      value: String(report.placed),
      sub: "reached the placed stage",
    },
    {
      label: "Fill rate",
      value: empty ? "—" : formatPercent(report.fillRate),
      sub: "placed ÷ submitted",
    },
    {
      label: "Avg time to fill",
      value:
        report.avgTimeToFillDays != null
          ? `${report.avgTimeToFillDays} days`
          : "—",
      sub: report.placedWithTiming
        ? `across ${report.placedWithTiming} placement${
            report.placedWithTiming === 1 ? "" : "s"
          }`
        : "no placements yet",
    },
    { label: "Open jobs", value: String(openJobs), sub: "roles still to fill" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Reports</h2>
          <p>
            Pipeline throughput, fill rate and time-to-fill across the whole
            desk — and broken down by recruiter and by facility.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Submissions by pipeline stage ──────────────────────────── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3>Submissions by pipeline stage</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {report.totalSubmissions} total
          </span>
        </div>
        {empty ? (
          <EmptyState
            title="No submissions yet"
            hint="Submit clinicians to jobs and the funnel will build out here."
          />
        ) : (
          <div
            className="card-pad"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            {report.byStage.map(({ stage, count }) => (
              <div key={stage}>
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {STAGE_LABELS[stage]}
                  </span>
                  <span
                    className="muted"
                    style={{ fontSize: 12, fontWeight: 700 }}
                  >
                    {count}
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 100,
                    background: "var(--line-2)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(count / maxStage) * 100}%`,
                      height: "100%",
                      background: "var(--teal)",
                      borderRadius: 100,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Breakdown tables ───────────────────────────────────────── */}
      <div className="grid-2">
        <BreakdownCard
          title="By recruiter"
          firstColumn="Recruiter"
          rows={report.byRecruiter}
          emptyHint="Submissions are attributed to the recruiter who owns each clinician."
        />
        <BreakdownCard
          title="By facility"
          firstColumn="Facility"
          rows={report.byFacility}
          emptyHint="Submissions are attributed to the facility behind each job."
        />
      </div>
    </>
  );
}

function BreakdownCard({
  title,
  firstColumn,
  rows,
  emptyHint,
}: {
  title: string;
  firstColumn: string;
  rows: GroupStat[];
  emptyHint: string;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          {rows.length} {rows.length === 1 ? "group" : "groups"}
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to break down yet" hint={emptyHint} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{firstColumn}</th>
                <th>Submissions</th>
                <th>Placed</th>
                <th>Fill rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.key}>
                  <td style={{ fontWeight: 600 }}>{g.label}</td>
                  <td className="muted">{g.submissions}</td>
                  <td className="muted">{g.placed}</td>
                  <td>
                    <span className="badge badge-muted">
                      {formatPercent(g.fillRate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
