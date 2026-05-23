// AlignMD — facility dashboard widgets.
//
// Presentational cards for the facility home (src/app/(facility)/facility/
// page.tsx). All data is fetched by the page and passed in as props.

import Link from "next/link";
import { EmptyState, StageBadge } from "./ui";
import { IconArrowRight } from "./icons";
import { STAGE_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import type { PipelineStage } from "@/lib/types";

// ── Pipeline-by-stage strip ─────────────────────────────────────────────────
/** A horizontal breakdown of every live submission by pipeline stage. */
export function PipelineByStageCard({
  counts,
}: {
  counts: { stage: PipelineStage; count: number }[];
}) {
  const total = counts.reduce((n, c) => n + c.count, 0);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Submissions by stage</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          {total} in your pipeline
        </span>
      </div>
      <div className="card-pad">
        {total === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No candidates in your pipeline yet. As AlignMD submits clinicians to
            your open roles, you&apos;ll see them move through the stages here.
          </p>
        ) : (
          <div
            className="row"
            style={{ gap: 0, flexWrap: "wrap" }}
          >
            {counts
              .filter((c) => c.count > 0)
              .map((c, i) => (
                <div
                  key={c.stage}
                  style={{
                    paddingRight: 24,
                    marginRight: 24,
                    borderRight:
                      i <
                      counts.filter((x) => x.count > 0).length - 1
                        ? "1px solid var(--line)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 760,
                      letterSpacing: "-0.04em",
                      color: "var(--ink)",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                      marginBottom: 8,
                    }}
                  >
                    {c.count}
                  </div>
                  <div className="kpi-label">{STAGE_LABELS[c.stage]}</div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick actions ───────────────────────────────────────────────────────────
/** The things a facility contact most often comes here to do. */
export function FacilityQuickActionsCard() {
  const actions: { href: string; label: string; hint: string }[] = [
    {
      href: "/facility/jobs/new",
      label: "Post a new role",
      hint: "Open a position for AlignMD to fill",
    },
    {
      href: "/facility/jobs",
      label: "Manage my jobs",
      hint: "Edit roles, requirements and status",
    },
    {
      href: "/facility/candidates",
      label: "Review candidates",
      hint: "Clinicians submitted to your roles",
    },
    {
      href: "/facility/profile",
      label: "Facility & team",
      hint: "Your facility details and contacts",
    },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <h3>Quick actions</h3>
      </div>
      <div
        className="card-pad"
        style={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="nudge-row row-between"
            style={{
              gap: 12,
              padding: "10px 8px",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span
                style={{ fontWeight: 650, fontSize: 13, display: "block" }}
              >
                {a.label}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {a.hint}
              </span>
            </span>
            <IconArrowRight
              width={14}
              height={14}
              style={{ color: "var(--muted)", flexShrink: 0 }}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Recent submission activity ──────────────────────────────────────────────
export interface RecentSubmission {
  id: string;
  jobId: string;
  jobTitle: string;
  clinicianName: string;
  clinicianRole: string | null;
  stage: PipelineStage;
  submittedOn: string | null;
  matchScore: number | null;
}

/** The most recent candidates submitted across the facility's roles. */
export function RecentActivityCard({
  submissions,
}: {
  submissions: RecentSubmission[];
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3>Recent candidate activity</h3>
        <Link
          href="/facility/candidates"
          className="muted"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          View all →
        </Link>
      </div>
      {submissions.length === 0 ? (
        <EmptyState
          title="No candidate activity yet"
          hint="When AlignMD submits clinicians to your open roles, the latest will appear here with their match score and pipeline stage."
        />
      ) : (
        <div
          className="card-pad"
          style={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {submissions.map((s) => (
            <Link
              key={s.id}
              href={`/facility/jobs/${s.jobId}`}
              className="nudge-row row-between"
              style={{
                gap: 12,
                padding: "10px 8px",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span
                  style={{ fontWeight: 650, fontSize: 13, display: "block" }}
                >
                  {s.clinicianName}
                  {s.clinicianRole ? (
                    <span className="muted" style={{ fontWeight: 400 }}>
                      {" "}
                      · {s.clinicianRole}
                    </span>
                  ) : null}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {s.jobTitle}
                  {s.submittedOn
                    ? ` · submitted ${fmtDate(s.submittedOn)}`
                    : ""}
                </span>
              </span>
              <span className="row" style={{ gap: 8, flexShrink: 0 }}>
                {s.matchScore != null && (
                  <span className="badge badge-muted">{s.matchScore}</span>
                )}
                <StageBadge stage={s.stage} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
