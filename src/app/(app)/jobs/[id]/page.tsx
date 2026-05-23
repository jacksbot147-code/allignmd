import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { JobForm } from "@/components/job-form";
import {
  CREDENTIAL_LABELS,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  PIPELINE_STAGES,
  STAGE_LABELS,
} from "@/lib/constants";
import { fmtMoney, fmtDate } from "@/lib/format";
import { scoreMatch, TIER_META } from "@/lib/match";
import type {
  Job,
  Facility,
  JobRequirement,
  CredentialType,
} from "@/lib/types";
import {
  changeJobStatus,
  updateJob,
  addSubmission,
  changeSubmissionStage,
  removeSubmission,
} from "../actions";

export const dynamic = "force-dynamic";

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

const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; edit?: string };
}) {
  const id = params.id;
  const supabase = createClient();

  const { data: jobRow } = await supabase
    .from("jobs")
    .select("*, facility:facilities(id, name, city, state)")
    .eq("id", id)
    .maybeSingle();
  if (!jobRow) notFound();
  const job = jobRow as Job & { facility: Facility | null };
  const facility = job.facility;

  const [reqRes, provRes, credRes, subRes, facListRes] = await Promise.all([
    supabase.from("job_requirements").select("*").eq("job_id", id).limit(1),
    supabase
      .from("providers")
      .select(
        "id, full_name, clinician_role, specialty, years_experience, telehealth_ok, pipeline_stage",
      )
      .is("archived_at", null),
    supabase
      .from("provider_credentials")
      .select("provider_id, type, state, is_compact, expires_on"),
    supabase
      .from("submissions")
      .select("*, provider:providers(id, full_name, clinician_role, specialty)")
      .eq("job_id", id)
      .order("match_score", { ascending: false, nullsFirst: false }),
    supabase.from("facilities").select("id, name").order("name"),
  ]);

  const requirement = (reqRes.data?.[0] ?? null) as JobRequirement | null;
  const providers = provRes.data ?? [];
  const credentials = credRes.data ?? [];
  const submissions = subRes.data ?? [];
  const facilities = facListRes.data ?? [];

  // Credentials grouped by provider.
  const credsByProvider = new Map<string, any[]>();
  for (const c of credentials as any[]) {
    const list = credsByProvider.get(c.provider_id) ?? [];
    list.push(c);
    credsByProvider.set(c.provider_id, list);
  }

  // Inputs the match engine needs from the job side.
  const jobStates =
    requirement?.required_license_states &&
    requirement.required_license_states.length
      ? requirement.required_license_states
      : facility?.state
        ? [facility.state]
        : [];
  const jobIsTelehealth =
    /telehealth/i.test(job.setting || "") ||
    /telehealth/i.test(job.specialty || "");
  const requiredCerts = (requirement?.required_certs ?? []) as string[];

  // Score every active clinician, best first.
  const submittedIds = new Set(submissions.map((s: any) => s.provider_id));
  const ranked = providers
    .map((p: any) => ({
      provider: p,
      result: scoreMatch({
        provider: p,
        credentials: credsByProvider.get(p.id) ?? [],
        jobSpecialty: job.specialty,
        jobStates,
        jobIsTelehealth,
        requiredCerts,
        minYears: requirement?.min_years_experience ?? null,
      }),
    }))
    .sort((a, b) => b.result.score - a.result.score);
  const candidates = ranked.filter((r) => !submittedIds.has(r.provider.id));

  const rates: { label: string; value: number | null }[] = [
    { label: "Hourly", value: job.rate_hourly },
    { label: "Callback", value: job.rate_callback },
    { label: "Overtime", value: job.rate_ot },
    { label: "Weekend", value: job.rate_weekend },
    { label: "Holiday", value: job.rate_holiday },
  ];
  const editing = searchParams.edit === "1";

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/jobs">Jobs</Link> / {job.title}
      </p>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row-between" style={{ alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 21 }}>{job.title}</h2>
            <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <span className="badge badge-teal">
                {job.is_permanent ? "Permanent" : "Locum / temp"}
              </span>
              {facility && (
                <Link
                  href={`/facilities/${facility.id}`}
                  className="muted"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {facility.name}
                  {facility.state ? ` · ${facility.state}` : ""}
                </Link>
              )}
            </div>
          </div>
          <form action={changeJobStatus} className="row" style={{ gap: 6 }}>
            <input type="hidden" name="id" value={job.id} />
            <select className="select" name="status" defaultValue={job.status}>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-sm">
              Update
            </button>
          </form>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* ── Job detail ───────────────────────────────────────── */}
        <div className="card">
          <div className="card-head"><h3>Role detail</h3></div>
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

        {/* ── Match requirements ───────────────────────────────── */}
        <div className="card">
          <div className="card-head"><h3>Match requirements</h3></div>
          <div className="card-pad">
            <dl className="def-list">
              <dt>License states</dt>
              <dd>{jobStates.length ? jobStates.join(", ") : "Any"}</dd>
              <dt>Required certs</dt>
              <dd>
                {requiredCerts.length
                  ? requiredCerts
                      .map(
                        (c) =>
                          CREDENTIAL_LABELS[c as CredentialType] ?? c,
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
              <dt>Telehealth</dt>
              <dd>{jobIsTelehealth ? "Yes" : "No"}</dd>
            </dl>
          </div>
        </div>
      </div>

      {/* ── Submissions ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3>Submitted clinicians ({submissions.length})</h3>
        </div>
        {submissions.length === 0 ? (
          <EmptyState
            title="No submissions yet"
            hint="Submit a matched clinician below to start this job's pipeline."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Clinician</th>
                <th>Match</th>
                <th>Submitted</th>
                <th>Stage</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s: any) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      href={`/providers/${s.provider?.id}`}
                      style={{ fontWeight: 700 }}
                    >
                      {s.provider?.full_name ?? "—"}
                    </Link>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {s.provider?.clinician_role
                        ? ` · ${s.provider.clinician_role}`
                        : ""}
                    </span>
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
                  <td>
                    <form
                      action={changeSubmissionStage}
                      className="row"
                      style={{ gap: 6 }}
                    >
                      <input type="hidden" name="submission_id" value={s.id} />
                      <input type="hidden" name="job_id" value={job.id} />
                      <select
                        className="select"
                        name="stage"
                        defaultValue={s.stage}
                        style={{ padding: "4px 8px", fontSize: 12 }}
                      >
                        {PIPELINE_STAGES.map((st) => (
                          <option key={st} value={st}>
                            {STAGE_LABELS[st]}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="btn btn-sm">
                        Save
                      </button>
                    </form>
                  </td>
                  <td>
                    <form action={removeSubmission}>
                      <input type="hidden" name="submission_id" value={s.id} />
                      <input type="hidden" name="job_id" value={job.id} />
                      <button type="submit" className="btn btn-sm btn-danger">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Ranked candidates ──────────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <h3>Suggested clinicians</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {candidates.length} ranked by match score
          </span>
        </div>
        {candidates.length === 0 ? (
          <EmptyState
            title="No clinicians to rank"
            hint="Add clinicians to the CRM — they'll be scored against this job automatically."
          />
        ) : (
          <div className="stack" style={{ padding: 14, gap: 10 }}>
            {candidates.map(({ provider, result }) => {
              const meta = TIER_META[result.tier];
              return (
                <div
                  key={provider.id}
                  className="card card-pad"
                  style={{ margin: 0 }}
                >
                  <div
                    className="row-between"
                    style={{ alignItems: "flex-start", gap: 12 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <Link
                          href={`/providers/${provider.id}`}
                          style={{ fontWeight: 700, fontSize: 14 }}
                        >
                          {provider.full_name}
                        </Link>
                        {provider.clinician_role && (
                          <span className="badge badge-teal">
                            {provider.clinician_role}
                          </span>
                        )}
                        <span className="muted" style={{ fontSize: 12 }}>
                          {provider.specialty || "Specialty not set"}
                        </span>
                      </div>
                      <div
                        className="row"
                        style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}
                      >
                        {result.reasons.map((r, i) => (
                          <span
                            key={i}
                            className={`badge ${
                              r.ok
                                ? "badge-ok"
                                : r.severity === "major"
                                  ? "badge-danger"
                                  : "badge-warn"
                            }`}
                            style={{ fontWeight: 500 }}
                          >
                            {r.text}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        className="kpi-value"
                        style={{ fontSize: 26, lineHeight: 1 }}
                      >
                        {result.score}
                      </div>
                      <span
                        className={`badge ${badgeTone[meta.tone]}`}
                        style={{ marginTop: 4 }}
                      >
                        {meta.label}
                      </span>
                      <form action={addSubmission} style={{ marginTop: 8 }}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input
                          type="hidden"
                          name="provider_id"
                          value={provider.id}
                        />
                        <input
                          type="hidden"
                          name="match_score"
                          value={result.score}
                        />
                        <button type="submit" className="btn btn-sm btn-primary">
                          Submit
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Edit job ───────────────────────────────────────────── */}
      <details className="card card-pad" style={{ marginTop: 18 }} open={editing}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          Edit job &amp; requirements
        </summary>
        <div style={{ marginTop: 16 }}>
          <JobForm
            action={updateJob}
            facilities={facilities}
            job={job}
            requirement={requirement}
            mode="edit"
          />
        </div>
      </details>
    </>
  );
}
