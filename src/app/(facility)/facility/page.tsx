import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireFacilityContact } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import {
  PipelineByStageCard,
  FacilityQuickActionsCard,
  RecentActivityCard,
  type RecentSubmission,
} from "@/components/facility-dashboard";
import { IconPlus } from "@/components/icons";
import { PIPELINE_STAGES } from "@/lib/constants";
import { daysUntil } from "@/lib/credentials";
import type { Facility, PipelineStage } from "@/lib/types";

export const metadata: Metadata = { title: "Facility dashboard" };
export const dynamic = "force-dynamic";

/** A friendly time-of-day greeting. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function FacilityHomePage() {
  const user = await requireFacilityContact();

  if (!user.facility_id) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Facility portal</h2>
            <p>Your jobs and the clinicians submitted to them.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your account isn't linked to a facility yet"
            hint="An AlignMD administrator still needs to connect your account to your facility. Once they do, your open roles and their submissions will appear here automatically."
          />
        </div>
      </>
    );
  }

  const supabase = createClient();
  const [facRes, jobsRes] = await Promise.all([
    supabase
      .from("facilities")
      .select("*")
      .eq("id", user.facility_id)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select(
        "id, title, specialty, status, is_permanent, rate_hourly, setting, created_at",
      )
      .eq("facility_id", user.facility_id)
      .order("created_at", { ascending: false }),
  ]);

  const facility = (facRes.data ?? null) as Facility | null;
  const jobs = jobsRes.data ?? [];
  const jobIds = jobs.map((j: any) => j.id);
  const jobTitle = new Map<string, string>(
    jobs.map((j: any) => [j.id, j.title]),
  );

  // Submissions across the facility's roles — for the pipeline strip and the
  // recent-activity feed.
  let submissions: any[] = [];
  if (jobIds.length) {
    const { data } = await supabase
      .from("submissions")
      .select(
        "*, provider:providers(full_name, clinician_role)",
      )
      .in("job_id", jobIds)
      .order("created_at", { ascending: false });
    submissions = data ?? [];
  }

  // ── Headline metrics ──────────────────────────────────────────────
  const openJobs = jobs.filter((j: any) => j.status === "open").length;
  const filledJobs = jobs.filter((j: any) => j.status === "filled").length;
  const awaitingReview = submissions.filter(
    (s: any) => s.stage === "submitted" || s.stage === "new",
  ).length;
  const placed = submissions.filter((s: any) => s.stage === "placed");

  // Average time-to-fill across placed submissions where both dates exist.
  const fillDays: number[] = placed
    .map((s: any) => {
      if (!s.submitted_on || !s.placed_on) return null;
      const sub = daysUntil(s.submitted_on);
      const plc = daysUntil(s.placed_on);
      if (sub == null || plc == null) return null;
      return plc - sub;
    })
    .filter((n: number | null): n is number => n != null && n >= 0);
  const avgTimeToFill =
    fillDays.length > 0
      ? Math.round(fillDays.reduce((a, b) => a + b, 0) / fillDays.length)
      : null;

  // ── Pipeline by stage ─────────────────────────────────────────────
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: submissions.filter((s: any) => s.stage === stage).length,
  }));

  // ── Recent activity feed (latest five) ────────────────────────────
  const recent: RecentSubmission[] = submissions.slice(0, 6).map((s: any) => ({
    id: s.id,
    jobId: s.job_id,
    jobTitle: jobTitle.get(s.job_id) ?? "Role",
    clinicianName: s.provider?.full_name ?? "Clinician",
    clinicianRole: s.provider?.clinician_role ?? null,
    stage: s.stage as PipelineStage,
    submittedOn: s.submitted_on,
    matchScore: s.match_score,
  }));

  const locationLine =
    [facility?.city, facility?.state].filter(Boolean).join(", ") || null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>
            {greeting()} — {facility?.name ?? "your facility"}
          </h2>
          <p>
            {locationLine
              ? `${locationLine}${
                  facility?.setting ? ` · ${facility.setting}` : ""
                }`
              : "Your open roles, candidates and pipeline at a glance."}
          </p>
        </div>
        <Link href="/facility/jobs/new" className="btn btn-primary">
          <IconPlus width={15} height={15} /> Post a role
        </Link>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Open roles</div>
          <div className="kpi-value">{openJobs}</div>
          <div className="kpi-sub">actively filling</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Awaiting review</div>
          <div className="kpi-value">{awaitingReview}</div>
          <div className="kpi-sub">candidates to look at</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Roles filled</div>
          <div className="kpi-value">{filledJobs + placed.length}</div>
          <div className="kpi-sub">placements to date</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avg. time to fill</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>
            {avgTimeToFill != null ? `${avgTimeToFill}d` : "—"}
          </div>
          <div className="kpi-sub">
            {avgTimeToFill != null
              ? "submission to placement"
              : "no placements yet"}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <PipelineByStageCard counts={stageCounts} />
        <FacilityQuickActionsCard />
      </div>

      {/* ── Recent candidate activity ───────────────────────────────── */}
      <RecentActivityCard submissions={recent} />

      {/* ── Open roles snapshot ─────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>Your roles</h3>
          <Link
            href="/facility/jobs"
            className="muted"
            style={{ fontSize: 12, fontWeight: 600 }}
          >
            Manage all →
          </Link>
        </div>
        {jobs.length === 0 ? (
          <EmptyState
            title="No roles posted yet"
            hint="Post your first role and AlignMD will start matching clinicians to it."
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
                  <th>Submissions</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.slice(0, 6).map((j: any) => {
                  const subCount = submissions.filter(
                    (s: any) => s.job_id === j.id,
                  ).length;
                  const tone =
                    j.status === "open"
                      ? "badge-ok"
                      : j.status === "filled"
                        ? "badge-teal"
                        : j.status === "on_hold"
                          ? "badge-warn"
                          : "badge-muted";
                  return (
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
                      <td>
                        <span className="badge badge-muted">{subCount}</span>
                      </td>
                      <td>
                        <span className={`badge ${tone}`}>
                          {j.status === "on_hold"
                            ? "On hold"
                            : j.status.charAt(0).toUpperCase() +
                              j.status.slice(1)}
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
    </>
  );
}
