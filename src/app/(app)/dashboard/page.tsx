import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { ExpiryBadge, EmptyState } from "@/components/ui";
import { IconArrowRight, IconAlert } from "@/components/icons";
import { needsAttention } from "@/lib/credentials";
import { CREDENTIAL_LABELS, PIPELINE_STAGES, STAGE_LABELS, ACTIVITY_LABELS } from "@/lib/constants";
import { fmtDate, relativeTime, initials } from "@/lib/format";
import type { PipelineStage } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAppUser();
  const supabase = createClient();

  const [providersRes, credsRes, activitiesRes, tasksRes, jobsRes, subsRes] =
    await Promise.all([
      supabase
        .from("providers")
        .select("id, full_name, clinician_role, specialty, pipeline_stage")
        .is("archived_at", null),
      supabase
        .from("provider_credentials")
        .select("id, type, state, expires_on, provider:providers(id, full_name)")
        .not("expires_on", "is", null)
        .order("expires_on", { ascending: true }),
      supabase
        .from("activities")
        .select("id, type, body, occurred_at, provider:providers(id, full_name)")
        .order("occurred_at", { ascending: false })
        .limit(7),
      supabase.from("tasks_reminders").select("id").eq("status", "open"),
      supabase
        .from("jobs")
        .select(
          "id, title, specialty, created_at, facility:facilities(name, state)",
        )
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      supabase.from("submissions").select("id"),
    ]);

  const providers = providersRes.data ?? [];
  const creds = credsRes.data ?? [];
  const activities = activitiesRes.data ?? [];
  const openTasks = tasksRes.data ?? [];
  const openJobs = jobsRes.data ?? [];
  const submissions = subsRes.data ?? [];

  const inPipeline = providers.filter((p: any) => p.pipeline_stage !== "placed");
  const placed = providers.filter((p: any) => p.pipeline_stage === "placed");
  const expiring = creds
    .filter((c: any) => needsAttention(c.expires_on))
    .slice(0, 8);

  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: providers.filter((p: any) => p.pipeline_stage === stage).length,
  }));
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));

  const kpis = [
    { label: "Providers", value: providers.length, sub: "in the CRM" },
    { label: "Active pipeline", value: inPipeline.length, sub: "not yet placed" },
    { label: "Open jobs", value: openJobs.length, sub: "roles to fill" },
    {
      label: "Submissions",
      value: submissions.length,
      sub: "clinicians put forward",
    },
    {
      label: "Credentials at risk",
      value: creds.filter((c: any) => needsAttention(c.expires_on)).length,
      sub: "expired or ≤ 90 days",
    },
    { label: "Open tasks", value: openTasks.length, sub: "credentialing items" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p>
            Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""} —
            here&apos;s where your placements stand.
          </p>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-3">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-3">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>
                <span className="row" style={{ gap: 7 }}>
                  <IconAlert width={15} height={15} style={{ color: "var(--warn)" }} />
                  Credentials needing attention
                </span>
              </h3>
              <Link href="/credentials" className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                View all →
              </Link>
            </div>
            {expiring.length === 0 ? (
              <EmptyState title="All credentials current" hint="Nothing expires within 90 days." />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Credential</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/providers/${c.provider?.id}`}
                          style={{ fontWeight: 600 }}
                        >
                          {c.provider?.full_name ?? "—"}
                        </Link>
                      </td>
                      <td>
                        {CREDENTIAL_LABELS[c.type as keyof typeof CREDENTIAL_LABELS]}
                        {c.state ? ` · ${c.state}` : ""}
                      </td>
                      <td className="muted">{fmtDate(c.expires_on)}</td>
                      <td><ExpiryBadge expiresOn={c.expires_on} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Newest open jobs</h3>
              <Link href="/jobs" className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                View all →
              </Link>
            </div>
            {openJobs.length === 0 ? (
              <EmptyState
                title="No open jobs"
                hint="Post a job to start matching clinicians."
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Facility</th>
                    <th>Specialty</th>
                  </tr>
                </thead>
                <tbody>
                  {openJobs.slice(0, 6).map((j: any) => (
                    <tr key={j.id}>
                      <td>
                        <Link href={`/jobs/${j.id}`} style={{ fontWeight: 600 }}>
                          {j.title}
                        </Link>
                      </td>
                      <td className="muted">
                        {j.facility?.name ?? "—"}
                        {j.facility?.state ? ` · ${j.facility.state}` : ""}
                      </td>
                      <td className="muted">{j.specialty || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Recent activity</h3>
            </div>
            {activities.length === 0 ? (
              <EmptyState title="No activity yet" hint="Calls, emails and notes will appear here." />
            ) : (
              <div style={{ padding: "4px 18px" }}>
                <div className="timeline">
                  {activities.map((a: any) => (
                    <div className="timeline-item" key={a.id}>
                      <div className="timeline-ico">
                        {initials(a.provider?.full_name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row-between">
                          <b style={{ fontSize: 13 }}>
                            {a.provider?.full_name ?? "—"}
                          </b>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {relativeTime(a.occurred_at)}
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          <span className="badge badge-muted" style={{ marginRight: 6 }}>
                            {ACTIVITY_LABELS[a.type as keyof typeof ACTIVITY_LABELS]}
                          </span>
                          {a.body}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ alignSelf: "start" }}>
          <div className="card-head">
            <h3>Pipeline snapshot</h3>
            <Link href="/pipeline" className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
              Board →
            </Link>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {stageCounts.map(({ stage, count }) => (
              <div key={stage}>
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {STAGE_LABELS[stage as PipelineStage]}
                  </span>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                    {count}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 0,
                    background: "var(--surface-3)",
                    overflow: "hidden",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      width: `${(count / maxStage) * 100}%`,
                      height: "100%",
                      background: "var(--teal)",
                      borderRadius: 0,
                      transition: "width 0.5s var(--ease)",
                    }}
                  />
                </div>
              </div>
            ))}
            <Link
              href="/providers"
              className="btn btn-block"
              style={{ marginTop: 6 }}
            >
              Browse all providers <IconArrowRight width={14} height={14} />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
