import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAppUser, isPrivileged } from "@/lib/auth";
import { StageSelect } from "@/components/stage-select";
import { ExpiryBadge, VerifiedBadge, EmptyState } from "@/components/ui";
import { ApplicationForm } from "@/components/application-form";
import { ReferencesPanel } from "@/components/references-panel";
import { LicensingPanel } from "@/components/licensing-panel";
import { VerificationPanel } from "@/components/verification-panel";
import { CredentialingPanel } from "@/components/credentialing-panel";
import { IconShield, IconDoc } from "@/components/icons";
import { parseApplicationPayload } from "@/lib/application";
import {
  CREDENTIAL_LABELS,
  CREDENTIAL_TYPES,
  ACTIVITY_TYPES,
  ACTIVITY_LABELS,
  AVAILABILITY_BLOCKS,
  AVAILABILITY_LABELS,
  DOC_TYPES,
} from "@/lib/constants";
import { expiryCopy, needsAttention } from "@/lib/credentials";
import { fmtDate, fmtDateTime, initials, titleCase } from "@/lib/format";
import { scoreMatch, TIER_META } from "@/lib/match";
import {
  addCredential,
  verifyCredential,
  deleteCredential,
  addActivity,
  addAvailability,
  deleteAvailability,
  uploadDocument,
  deleteDocument,
  archiveProvider,
  restoreProvider,
} from "../actions";
import type {
  Provider,
  ApplicationResponse,
  ProviderReference,
  LicenseApplication,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("providers")
    .select("full_name")
    .eq("id", params.id)
    .maybeSingle();
  return { title: data?.full_name ?? "Provider" };
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "application", label: "Application" },
  { key: "credentials", label: "Credentials" },
  { key: "credentialing", label: "Credentialing" },
  { key: "verification", label: "Verification" },
  { key: "references", label: "References" },
  { key: "licensing", label: "Licensing" },
  { key: "availability", label: "Availability" },
  { key: "documents", label: "Documents" },
  { key: "activity", label: "Activity" },
];

const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

export default async function ProviderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string; error?: string };
}) {
  const id = params.id;
  // Fall back to "overview" for a missing OR unrecognized ?tab= value, so an
  // unknown tab never renders an empty body.
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "overview";
  const me = await getAppUser();
  const privileged = isPrivileged(me?.role);
  const supabase = createClient();

  const { data: providerRow } = await supabase
    .from("providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!providerRow) notFound();
  const provider = providerRow as Provider;

  const [
    credsRes,
    docsRes,
    actsRes,
    availRes,
    jobsRes,
    reqsRes,
    appRes,
    refsRes,
    licenseRes,
  ] = await Promise.all([
      supabase
        .from("provider_credentials")
        .select("*")
        .eq("provider_id", id)
        .order("expires_on", { ascending: true, nullsFirst: false }),
      supabase
        .from("provider_documents")
        .select("*")
        .eq("provider_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("activities")
        .select("*, actor:app_users(full_name)")
        .eq("provider_id", id)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("provider_availability")
        .select("*")
        .eq("provider_id", id)
        .order("block_start", { ascending: true }),
      supabase
        .from("jobs")
        .select(
          "id, title, specialty, setting, facility:facilities(id, name, state)",
        )
        .eq("status", "open"),
      supabase.from("job_requirements").select("*"),
      supabase
        .from("application_responses")
        .select("*")
        .eq("provider_id", id)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("provider_references")
        .select("*")
        .eq("provider_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("license_applications")
        .select("*")
        .eq("provider_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const creds = credsRes.data ?? [];
  const docs = docsRes.data ?? [];
  const activities = actsRes.data ?? [];
  const availability = availRes.data ?? [];
  const openJobs = jobsRes.data ?? [];
  const jobRequirements = reqsRes.data ?? [];
  const application = (appRes.data?.[0] ?? null) as ApplicationResponse | null;
  const references = (refsRes.data ?? []) as ProviderReference[];
  const licenseApps = (licenseRes.data ?? []) as LicenseApplication[];

  // SSN lives in the privileged-only side table — only fetch it if allowed.
  let ssnLast4: string | null = null;
  if (privileged) {
    const { data: priv } = await supabase
      .from("provider_private")
      .select("ssn_last4")
      .eq("provider_id", id)
      .maybeSingle();
    ssnLast4 = priv?.ssn_last4 ?? null;
  }

  // Short-lived signed URLs for document download.
  const signedDocs = await Promise.all(
    docs.map(async (d: any) => {
      const { data } = await supabase.storage
        .from("provider-documents")
        .createSignedUrl(d.storage_path, 300);
      return { ...d, url: data?.signedUrl ?? null };
    }),
  );

  const credsAtRisk = creds.filter((c: any) => needsAttention(c.expires_on)).length;

  // ── Reverse match — score this clinician against every open job ────────
  const reqByJob = new Map<string, any>();
  for (const r of jobRequirements as any[]) reqByJob.set(r.job_id, r);
  const jobMatches = (openJobs as any[])
    .map((j: any) => {
      const req = reqByJob.get(j.id);
      const jobStates: string[] =
        req?.required_license_states && req.required_license_states.length
          ? req.required_license_states
          : j.facility?.state
            ? [j.facility.state]
            : [];
      const jobIsTelehealth =
        /telehealth/i.test(j.setting || "") ||
        /telehealth/i.test(j.specialty || "");
      return {
        job: j,
        result: scoreMatch({
          provider: {
            clinician_role: provider.clinician_role,
            specialty: provider.specialty,
            years_experience: provider.years_experience,
            telehealth_ok: provider.telehealth_ok,
          },
          credentials: creds,
          jobSpecialty: j.specialty,
          jobStates,
          jobIsTelehealth,
          requiredCerts: (req?.required_certs ?? []) as string[],
          minYears: req?.min_years_experience ?? null,
        }),
      };
    })
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, 8);

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/providers">Providers</Link> / {provider.full_name}
      </p>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}

      {provider.archived_at && (
        <div className="alert alert-info">
          This provider is archived — hidden from the main list and pipeline.
          Use Restore to bring them back.
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row-between" style={{ alignItems: "flex-start" }}>
          <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
            <span className="avatar avatar-lg">{initials(provider.full_name)}</span>
            <div>
              <h2 style={{ fontSize: 21 }}>{provider.full_name}</h2>
              <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {provider.clinician_role && (
                  <span className="badge badge-teal">{provider.clinician_role}</span>
                )}
                <span className="muted" style={{ fontSize: 13 }}>
                  {provider.specialty || "Specialty not set"}
                  {provider.subspecialty ? ` · ${provider.subspecialty}` : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <StageSelect providerId={provider.id} stage={provider.pipeline_stage} />
            <Link href={`/providers/${id}/cv`} className="btn">
              <IconDoc width={14} height={14} /> CV
            </Link>
            <Link href={`/providers/${id}/edit`} className="btn">
              Edit
            </Link>
            {provider.archived_at ? (
              <form action={restoreProvider}>
                <input type="hidden" name="id" value={provider.id} />
                <button type="submit" className="btn">
                  Restore
                </button>
              </form>
            ) : (
              <form action={archiveProvider}>
                <input type="hidden" name="id" value={provider.id} />
                <button type="submit" className="btn btn-danger">
                  Archive
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="tabs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/providers/${id}?tab=${t.key}`}
            className={`tab${tab === t.key ? " active" : ""}`}
          >
            {t.label}
            {t.key === "credentials" && credsAtRisk > 0 && (
              <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                {credsAtRisk}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* ── Overview ───────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="grid-2">
          <div className="card">
            <div className="card-head"><h3>Profile</h3></div>
            <div className="card-pad">
              <dl className="def-list">
                <dt>Clinician role</dt>
                <dd>{provider.clinician_role || "—"}</dd>
                <dt>Specialty</dt>
                <dd>{provider.specialty || "—"}</dd>
                <dt>Subspecialty</dt>
                <dd>{provider.subspecialty || "—"}</dd>
                <dt>Experience</dt>
                <dd>
                  {provider.years_experience != null
                    ? `${provider.years_experience} years`
                    : "—"}
                </dd>
                <dt>NPI</dt>
                <dd className="mono">{provider.npi || "—"}</dd>
                <dt>Languages</dt>
                <dd>{provider.languages?.join(", ") || "—"}</dd>
                <dt>Travel radius</dt>
                <dd>
                  {provider.travel_radius_miles != null
                    ? `${provider.travel_radius_miles} mi`
                    : "—"}
                </dd>
                <dt>Telehealth</dt>
                <dd>{provider.telehealth_ok ? "Yes" : "No"}</dd>
                <dt>Available from</dt>
                <dd>{fmtDate(provider.available_start)}</dd>
                <dt>SSN (last 4)</dt>
                <dd>
                  {privileged ? (
                    ssnLast4 ? (
                      <span className="mono">•••-••-{ssnLast4}</span>
                    ) : (
                      "—"
                    )
                  ) : (
                    <span className="badge badge-muted">
                      <IconShield width={11} height={11} /> Restricted
                    </span>
                  )}
                </dd>
                <dt>Added</dt>
                <dd>{fmtDate(provider.created_at)}</dd>
              </dl>
            </div>
          </div>

          <div className="stack">
            <div className="card card-pad">
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>At a glance</h3>
              <div className="row" style={{ gap: 18 }}>
                <div>
                  <div className="kpi-value" style={{ fontSize: 24 }}>
                    {creds.length}
                  </div>
                  <div className="kpi-label">Credentials</div>
                </div>
                <div>
                  <div
                    className="kpi-value"
                    style={{
                      fontSize: 24,
                      color: credsAtRisk > 0 ? "var(--danger)" : "var(--ink)",
                    }}
                  >
                    {credsAtRisk}
                  </div>
                  <div className="kpi-label">At risk</div>
                </div>
                <div>
                  <div className="kpi-value" style={{ fontSize: 24 }}>
                    {activities.length}
                  </div>
                  <div className="kpi-label">Activities</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>Availability</h3></div>
              <div className="card-pad">
                {availability.length === 0 ? (
                  <p className="muted" style={{ fontSize: 13 }}>
                    No availability blocks recorded.
                  </p>
                ) : (
                  <div className="stack">
                    {availability.map((a: any) => (
                      <div key={a.id} className="row-between">
                        <span className="badge badge-teal">
                          {titleCase(a.block_type)}
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {fmtDate(a.block_start)} – {fmtDate(a.block_end)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Matching jobs (reverse match) ──────────────────────── */}
      {tab === "overview" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h3>Matching jobs</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {jobMatches.length} open job{jobMatches.length === 1 ? "" : "s"}{" "}
              scored
            </span>
          </div>
          {jobMatches.length === 0 ? (
            <EmptyState
              title="No open jobs to match"
              hint="Open jobs are scored against this clinician here as facilities post them."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Facility</th>
                    <th>Match</th>
                    <th>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {jobMatches.map(({ job, result }) => {
                    const meta = TIER_META[result.tier];
                    return (
                      <tr key={job.id}>
                        <td>
                          <Link
                            href={`/jobs/${job.id}`}
                            style={{ fontWeight: 700 }}
                          >
                            {job.title}
                          </Link>
                          {job.specialty && (
                            <span className="muted" style={{ fontSize: 11 }}>
                              {" "}
                              · {job.specialty}
                            </span>
                          )}
                        </td>
                        <td className="muted">
                          {job.facility?.name ?? "—"}
                          {job.facility?.state ? ` · ${job.facility.state}` : ""}
                        </td>
                        <td>
                          <span className="badge badge-muted">
                            {result.score}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${badgeTone[meta.tone]}`}>
                            {meta.label}
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
      )}

      {/* ── Application ────────────────────────────────────────── */}
      {tab === "application" && (
        <ApplicationForm
          providerId={id}
          application={application}
          payload={parseApplicationPayload(application?.payload)}
        />
      )}

      {/* ── Credentials ────────────────────────────────────────── */}
      {tab === "credentials" && (
        <div className="stack">
          {!privileged && (
            <div className="alert alert-info">
              <IconShield width={13} height={13} /> Malpractice / claims records
              are visible to privileged staff only.
            </div>
          )}
          <div className="card">
            <div className="card-head"><h3>Credentials &amp; certifications</h3></div>
            {creds.length === 0 ? (
              <EmptyState
                title="No credentials yet"
                hint="Add licenses, DEA, board certs and life-support cards below."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>State</th>
                      <th>Number</th>
                      <th>Expires</th>
                      <th>Status</th>
                      <th>Verified</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {creds.map((c: any) => (
                      <tr key={c.id}>
                        <td>
                          <b>{CREDENTIAL_LABELS[c.type as keyof typeof CREDENTIAL_LABELS]}</b>
                          {c.is_compact && (
                            <span className="badge badge-teal" style={{ marginLeft: 6 }}>
                              Compact
                            </span>
                          )}
                        </td>
                        <td>{c.state || "—"}</td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {c.number || "—"}
                        </td>
                        <td className="muted">
                          {fmtDate(c.expires_on)}
                          <div style={{ fontSize: 11 }}>{expiryCopy(c.expires_on)}</div>
                        </td>
                        <td><ExpiryBadge expiresOn={c.expires_on} /></td>
                        <td><VerifiedBadge verified={c.verified} /></td>
                        <td>
                          <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                            {!c.verified && (
                              <form action={verifyCredential}>
                                <input type="hidden" name="credential_id" value={c.id} />
                                <input type="hidden" name="provider_id" value={id} />
                                <button className="btn btn-sm" type="submit">
                                  Verify
                                </button>
                              </form>
                            )}
                            <form action={deleteCredential}>
                              <input type="hidden" name="credential_id" value={c.id} />
                              <input type="hidden" name="provider_id" value={id} />
                              <button className="btn btn-sm btn-danger" type="submit">
                                Remove
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <details className="card card-pad">
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
              + Add a credential
            </summary>
            <form action={addCredential} style={{ marginTop: 16 }}>
              <input type="hidden" name="provider_id" value={id} />
              <div className="form-grid">
                <div className="field">
                  <label>Type *</label>
                  <select className="select" name="type" required defaultValue="state_license">
                    {CREDENTIAL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {CREDENTIAL_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>State</label>
                  <input className="input" name="state" placeholder="FL" maxLength={2} />
                </div>
                <div className="field">
                  <label>Credential number</label>
                  <input className="input mono" name="number" placeholder="ARNP-FL-000000" />
                </div>
                <div className="field">
                  <label>Verification source</label>
                  <input className="input" name="verification_source" placeholder="state board / NPDB / vendor" />
                </div>
                <div className="field">
                  <label>Issued on</label>
                  <input className="input" name="issued_on" type="date" />
                </div>
                <div className="field">
                  <label>Expires on</label>
                  <input className="input" name="expires_on" type="date" />
                </div>
                <div className="field full">
                  <label>Notes</label>
                  <textarea className="textarea" name="notes" placeholder="Optional notes" />
                </div>
                <div className="field">
                  <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" name="is_compact" style={{ width: 16, height: 16 }} />
                    Compact / IMLC license
                  </label>
                </div>
                <div className="field">
                  <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" name="verified" style={{ width: 16, height: 16 }} />
                    Mark as verified
                  </label>
                </div>
              </div>
              <button type="submit" className="btn btn-primary">
                Add credential
              </button>
            </form>
          </details>
        </div>
      )}

      {/* ── Credentialing packet ───────────────────────────────── */}
      {tab === "credentialing" && <CredentialingPanel providerId={id} />}

      {/* ── References ─────────────────────────────────────────── */}
      {tab === "references" && (
        <ReferencesPanel providerId={id} references={references} />
      )}

      {/* ── Licensing ──────────────────────────────────────────── */}
      {tab === "licensing" && (
        <LicensingPanel
          providerId={id}
          clinicianRole={provider.clinician_role}
          applications={licenseApps}
        />
      )}

      {/* ── Verification ───────────────────────────────────────── */}
      {tab === "verification" && (
        <VerificationPanel providerId={id} privileged={privileged} />
      )}

      {/* ── Documents ──────────────────────────────────────────── */}
      {tab === "documents" && (
        <div className="stack">
          <div className="alert alert-info">
            <IconShield width={13} height={13} /> Documents are stored privately
            and served via short-lived signed links. Restricted documents are
            visible to privileged staff only.
          </div>
          <div className="card">
            <div className="card-head"><h3>Documents</h3></div>
            {signedDocs.length === 0 ? (
              <EmptyState
                title="No documents uploaded"
                hint="Upload CVs, licenses, certification cards and IDs below."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Sensitivity</th>
                      <th>Uploaded</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {signedDocs.map((d: any) => (
                      <tr key={d.id}>
                        <td>
                          <span className="row" style={{ gap: 8 }}>
                            <IconDoc width={16} height={16} style={{ color: "var(--muted)" }} />
                            <b>{titleCase(d.doc_type)}</b>
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              d.sensitivity === "restricted"
                                ? "badge-danger"
                                : d.sensitivity === "sensitive"
                                  ? "badge-warn"
                                  : "badge-muted"
                            }`}
                          >
                            {titleCase(d.sensitivity)}
                          </span>
                        </td>
                        <td className="muted">{fmtDate(d.created_at)}</td>
                        <td>
                          <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                            {d.url ? (
                              <a
                                className="btn btn-sm"
                                href={d.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                              </a>
                            ) : (
                              <span className="muted" style={{ fontSize: 12 }}>
                                Unavailable
                              </span>
                            )}
                            <form action={deleteDocument}>
                              <input type="hidden" name="document_id" value={d.id} />
                              <input type="hidden" name="provider_id" value={id} />
                              <input type="hidden" name="storage_path" value={d.storage_path} />
                              <button className="btn btn-sm btn-danger" type="submit">
                                Remove
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <details className="card card-pad">
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
              + Upload a document
            </summary>
            <form action={uploadDocument} style={{ marginTop: 16 }}>
              <input type="hidden" name="provider_id" value={id} />
              <div className="form-grid">
                <div className="field">
                  <label>Document type</label>
                  <select className="select" name="doc_type" defaultValue="cv">
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {titleCase(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Sensitivity</label>
                  <select className="select" name="sensitivity" defaultValue="standard">
                    <option value="standard">Standard</option>
                    <option value="sensitive">Sensitive</option>
                    <option value="restricted">Restricted (privileged only)</option>
                  </select>
                </div>
                <div className="field full">
                  <label>File</label>
                  <input className="input" type="file" name="file" required />
                </div>
              </div>
              <button type="submit" className="btn btn-primary">
                Upload
              </button>
            </form>
          </details>
        </div>
      )}

      {/* ── Availability ───────────────────────────────────────── */}
      {tab === "availability" && (
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Availability blocks</h3></div>
            {availability.length === 0 ? (
              <EmptyState
                title="No availability recorded"
                hint="Add the shift types and date ranges this clinician is open to."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Note</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {availability.map((a: any) => (
                      <tr key={a.id}>
                        <td>
                          <span className="badge badge-teal">
                            {AVAILABILITY_LABELS[
                              a.block_type as keyof typeof AVAILABILITY_LABELS
                            ] ?? titleCase(a.block_type)}
                          </span>
                        </td>
                        <td className="muted">{fmtDate(a.block_start)}</td>
                        <td className="muted">{fmtDate(a.block_end)}</td>
                        <td>{a.note || "—"}</td>
                        <td>
                          <div
                            className="row"
                            style={{ gap: 4, justifyContent: "flex-end" }}
                          >
                            <form action={deleteAvailability}>
                              <input
                                type="hidden"
                                name="availability_id"
                                value={a.id}
                              />
                              <input type="hidden" name="provider_id" value={id} />
                              <button
                                className="btn btn-sm btn-danger"
                                type="submit"
                              >
                                Remove
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <details className="card card-pad">
            <summary
              style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}
            >
              + Add an availability block
            </summary>
            <form action={addAvailability} style={{ marginTop: 16 }}>
              <input type="hidden" name="provider_id" value={id} />
              <div className="form-grid">
                <div className="field">
                  <label>Type *</label>
                  <select
                    className="select"
                    name="block_type"
                    required
                    defaultValue="custom"
                  >
                    {AVAILABILITY_BLOCKS.map((b) => (
                      <option key={b} value={b}>
                        {AVAILABILITY_LABELS[b]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Start date</label>
                  <input className="input" name="block_start" type="date" />
                </div>
                <div className="field">
                  <label>End date</label>
                  <input className="input" name="block_end" type="date" />
                </div>
                <div className="field full">
                  <label>Note</label>
                  <input
                    className="input"
                    name="note"
                    placeholder="e.g. open to 13-week contracts"
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary">
                Add availability
              </button>
            </form>
          </details>
        </div>
      )}

      {/* ── Activity ───────────────────────────────────────────── */}
      {tab === "activity" && (
        <div className="stack">
          <div className="card card-pad">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Log an activity</h3>
            <form action={addActivity}>
              <input type="hidden" name="provider_id" value={id} />
              <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <select className="select" name="type" defaultValue="note" style={{ width: 130 }}>
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_LABELS[t]}
                    </option>
                  ))}
                </select>
                <textarea
                  className="textarea"
                  name="body"
                  required
                  placeholder="What happened? Call notes, email summary, next steps…"
                  style={{ flex: 1, minHeight: 56 }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: 10 }}>
                Add to log
              </button>
            </form>
          </div>

          <div className="card">
            <div className="card-head"><h3>Activity log</h3></div>
            {activities.length === 0 ? (
              <EmptyState title="No activity yet" hint="Logged calls, texts, emails and notes appear here." />
            ) : (
              <div style={{ padding: "4px 18px" }}>
                <div className="timeline">
                  {activities.map((a: any) => (
                    <div className="timeline-item" key={a.id}>
                      <div className="timeline-ico">
                        {ACTIVITY_LABELS[a.type as keyof typeof ACTIVITY_LABELS][0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row-between">
                          <b style={{ fontSize: 13 }}>
                            {ACTIVITY_LABELS[a.type as keyof typeof ACTIVITY_LABELS]}
                            <span className="muted" style={{ fontWeight: 400 }}>
                              {" "}· {a.actor?.full_name ?? "System"}
                            </span>
                          </b>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {fmtDateTime(a.occurred_at)}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, marginTop: 2 }}>{a.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
