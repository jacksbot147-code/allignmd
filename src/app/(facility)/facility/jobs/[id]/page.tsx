import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireFacilityContact } from "@/lib/auth";
import { EmptyState, StageBadge } from "@/components/ui";
import { changeFacilityJobStatus } from "../../../actions";
import {
  CREDENTIAL_LABELS,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_TONE,
} from "@/lib/constants";
import { TIER_META, type MatchTier } from "@/lib/match";
import { fmtDate, fmtMoney } from "@/lib/format";
import type {
  Job,
  Facility,
  JobRequirement,
  CredentialType,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  teal: "badge-teal",
  muted: "badge-muted",
  danger: "badge-danger",
};

/** Derive a match tier from a stored numeric match score (mirrors match.ts). */
function tierForScore(score: number | null): MatchTier | null {
  if (score == null) return null;
  if (score >= 80) return "strong";
  if (score >= 60) return "fair";
  if (score >= 40) return "stretch";
  return "ineligible";
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", params.id)
    .maybeSingle();
  return { title: data?.title ?? "Job" };
}

export default async function FacilityJobPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; saved?: string };
}) {
  const user = await requireFacilityContact();
  if (!user.facility_id) notFound();

  const supabase = createClient();
  // RLS (jobs_facility_contact_read) confines this to the contact's own
  // facility — a job at any other facility simply returns no row.
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("*, facility:facilities(id, name, city, state)")
    .eq("id", params.id)
    .maybeSingle();
  if (!jobRow) notFound();
  const job = jobRow as Job & { facility: Facility | null };

  const [reqRes, subRes] = await Promise.all([
    supabase
      .from("job_requirements")
      .select("*")
      .eq("job_id", job.id)
      .limit(1),
    supabase
      .from("submissions")
      .select(
        "*, provider:providers(id, full_name, clinician_role, specialty, years_experience)",
      )
      .eq("job_id", job.id)
      .order("match_score", { ascending: false, nullsFirst: false }),
  ]);

  const requirement = (reqRes.data?.[0] ?? null) as JobRequirement | null;
  const submissions = subRes.data ?? [];

  const jobStates =
    requirement?.required_license_states &&
    requirement.required_license_states.length
      ? requirement.required_license_states
      : job.facility?.state
        ? [job.facility.state]
        : [];
  const requiredCerts = (requirement?.required_certs ?? []) as string[];

  const rates: { label: string; value: number | null }[] = [
    { label: "Hourly", value: job.rate_hourly },
    { label: "Callback", value: job.rate_callback },
    { label: "Overtime", value: job.rate_ot },
    { label: "Weekend", value: job.rate_weekend },
    { label: "Holiday", value: job.rate_holiday },
  ];

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/facility/jobs">Jobs</Link> / {job.title}
      </p>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}
      {searchParams.saved && (
        <div className="alert alert-ok">Job saved.</div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div
          className="row-between"
          style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 21 }}>{job.title}</h2>
            <div
              className="row"
              style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}
            >
              <span className="badge badge-teal">
                {job.is_permanent ? "Permanent" : "Locum / temp"}
              </span>
              <span
                className={`badge ${
                  toneClass[JOB_STATUS_TONE[job.status] ?? "muted"]
                }`}
              >
                {JOB_STATUS_LABELS[job.status] ?? job.status}
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                {job.facility?.name ?? "—"}
                {job.facility?.state ? ` · ${job.facility.state}` : ""}
              </span>
            </div>
          </div>
          <Link
            href={`/facility/jobs/${job.id}/edit`}
            className="btn btn-primary"
          >
            Edit role
          </Link>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>Role detail</h3>
          </div>
          <div className="card-pad">
            <dl className="def-list">
              <dt>Specialty</dt>
              <dd>{job.specialty || "—"}</dd>
              <dt>Setting</dt>
              <dd>{job.setting || "—"}</dd>
              <dt>Schedule</dt>
              <dd>{job.schedule || "—"}</dd>
              <dt>Call</dt>
              <dd>{job.call_requirement || "—"}</dd>
              <dt>Rates</dt>
              <dd>
                {rates.filter((r) => r.value != null).length === 0
                  ? "—"
                  : rates
                      .filter((r) => r.value != null)
                      .map((r) => `${r.label} ${fmtMoney(r.value)}`)
                      .join(" · ")}
              </dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Requirements</h3>
          </div>
          <div className="card-pad">
            <dl className="def-list">
              <dt>License states</dt>
              <dd>{jobStates.length ? jobStates.join(", ") : "Any"}</dd>
              <dt>Required certs</dt>
              <dd>
                {requiredCerts.length
                  ? requiredCerts
                      .map(
                        (c) => CREDENTIAL_LABELS[c as CredentialType] ?? c,
                      )
                      .join(", ")
                  : "None specified"}
              </dd>
              <dt>Min. experience</dt>
              <dd>
                {requirement?.min_years_experience != null
                  ? `${requirement.min_years_experience} years`
                  : "—"}
              </dd>
            </dl>
          </div>
        </div>
      </div>

      {/* ── Quick status change ────────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <form
          action={changeFacilityJobStatus}
          className="row"
          style={{ gap: 10, flexWrap: "wrap" }}
        >
          <input type="hidden" name="id" value={job.id} />
          <label
            htmlFor="status"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            Role status
          </label>
          <select
            className="select"
            id="status"
            name="status"
            defaultValue={job.status}
            style={{ width: "auto" }}
          >
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-sm btn-primary">
            Update status
          </button>
        </form>
      </div>

      {/* ── Submitted clinicians ───────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <h3>Submitted clinicians ({submissions.length})</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            Ranked by match score
          </span>
        </div>
        {submissions.length === 0 ? (
          <EmptyState
            title="No clinicians submitted yet"
            hint="AlignMD recruiters submit matched clinicians here. You'll see each candidate's match score and pipeline stage as they progress."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Clinician</th>
                  <th>Experience</th>
                  <th>Match</th>
                  <th>Submitted</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s: any) => {
                  const tier = tierForScore(s.match_score);
                  const meta = tier ? TIER_META[tier] : null;
                  return (
                    <tr key={s.id}>
                      <td>
                        <b>{s.provider?.full_name ?? "Clinician"}</b>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {s.provider?.clinician_role
                            ? `${s.provider.clinician_role}`
                            : ""}
                          {s.provider?.specialty
                            ? `${s.provider?.clinician_role ? " · " : ""}${
                                s.provider.specialty
                              }`
                            : ""}
                        </div>
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
                      <td className="muted">{fmtDate(s.submitted_on)}</td>
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

      <p className="muted" style={{ fontSize: 11, marginTop: 18 }}>
        You can edit this role and its requirements any time. Submissions are
        managed by AlignMD recruiters — reach out if you have questions about a
        candidate.
      </p>
    </>
  );
}
