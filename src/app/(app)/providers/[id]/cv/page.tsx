import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, ExpiryBadge, VerifiedBadge } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { fmtDate } from "@/lib/format";
import { CREDENTIAL_LABELS, ASSIGNMENT_TYPE_LABELS } from "@/lib/constants";
import { parseApplicationPayload } from "@/lib/application";
import type {
  Provider,
  ProviderCredential,
  ProviderReference,
  ApplicationResponse,
  CredentialType,
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
  return { title: data?.full_name ? `${data.full_name} — CV` : "CV" };
}

/** A label/value row that prints cleanly; skipped when empty. */
function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value || value.trim() === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

export default async function ProviderCvPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;
  const supabase = createClient();

  const { data: providerRow } = await supabase
    .from("providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!providerRow) notFound();
  const provider = providerRow as Provider;

  const [credsRes, refsRes, appRes] = await Promise.all([
    supabase
      .from("provider_credentials")
      .select("*")
      .eq("provider_id", id)
      .order("expires_on", { ascending: true, nullsFirst: false }),
    supabase
      .from("provider_references")
      .select("*")
      .eq("provider_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("application_responses")
      .select("*")
      .eq("provider_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  // Malpractice / claims rows are never part of a CV.
  const creds = ((credsRes.data ?? []) as ProviderCredential[]).filter(
    (c) => c.type !== "malpractice",
  );
  const references = (refsRes.data ?? []) as ProviderReference[];
  const application = (appRes.data?.[0] ?? null) as ApplicationResponse | null;
  const app = parseApplicationPayload(application?.payload);

  // Provider record is the source of truth; the application fills any gaps.
  const specialty = provider.specialty || app.primary_specialty || "";
  const subspecialty = provider.subspecialty || app.subspecialties || "";
  const years =
    provider.years_experience != null
      ? `${provider.years_experience} years`
      : app.years_in_practice
        ? `${app.years_in_practice} years`
        : "";
  const npi = provider.npi || app.npi || "";
  const languages = provider.languages?.length
    ? provider.languages.join(", ")
    : app.languages;
  const contact = [app.email, app.phone].filter((v) => v).join("  ·  ");
  const roleLine = [provider.clinician_role, specialty, subspecialty]
    .filter((v) => v)
    .join("  ·  ");

  const assignmentType = app.assignment_type
    ? ASSIGNMENT_TYPE_LABELS[app.assignment_type] ?? app.assignment_type
    : "";
  const yesNo = (v: string) =>
    v === "yes" ? "Yes" : v === "no" ? "No" : "";

  const hasPreferences =
    !!assignmentType ||
    !!app.desired_start ||
    !!app.ideal_schedule ||
    !!app.shift_preferences ||
    !!app.willing_to_travel ||
    !!app.travel_states ||
    !!app.telehealth_interest ||
    !!app.min_hourly_rate;

  return (
    <>
      {/* ── Toolbar (screen only) ──────────────────────────────── */}
      <div className="no-print">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            <Link href="/providers">Providers</Link> /{" "}
            <Link href={`/providers/${id}`}>{provider.full_name}</Link> / CV
          </p>
          <div className="row" style={{ gap: 8 }}>
            <Link href={`/providers/${id}?tab=application`} className="btn">
              Edit application
            </Link>
            <PrintButton />
          </div>
        </div>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {/* ── Header ───────────────────────────────────────────── */}
        <div className="card card-pad">
          <h1 style={{ fontSize: 26 }}>{provider.full_name}</h1>
          {app.preferred_name &&
            app.preferred_name !== provider.full_name && (
              <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                Goes by {app.preferred_name}
              </p>
            )}
          {roleLine && (
            <p
              style={{
                fontSize: 14,
                marginTop: 8,
                color: "var(--teal-dark)",
                fontWeight: 600,
              }}
            >
              {roleLine}
            </p>
          )}
          {(contact || app.current_employer) && (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              {[app.current_employer, contact].filter((v) => v).join("  ·  ")}
            </p>
          )}
        </div>

        {/* ── Profile summary ──────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <h3>Profile</h3>
          </div>
          <div className="card-pad">
            <dl className="def-list">
              <Detail label="Clinician role" value={provider.clinician_role} />
              <Detail label="Specialty" value={specialty || null} />
              <Detail label="Subspecialty" value={subspecialty || null} />
              <Detail label="Experience" value={years || null} />
              <Detail
                label="Current title"
                value={app.current_title || null}
              />
              <Detail label="NPI" value={npi || null} />
              <Detail
                label="Board certs"
                value={app.board_certifications || null}
              />
              <Detail label="Languages" value={languages || null} />
              <Detail
                label="Telehealth"
                value={provider.telehealth_ok ? "Open to telehealth" : null}
              />
              <Detail
                label="Available from"
                value={
                  provider.available_start
                    ? fmtDate(provider.available_start)
                    : null
                }
              />
            </dl>
            {app.reason_for_looking && (
              <p style={{ fontSize: 13, marginTop: 14 }}>
                {app.reason_for_looking}
              </p>
            )}
          </div>
        </div>

        {/* ── Licenses & credentials ───────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <h3>Licenses &amp; certifications</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {creds.length} on file
            </span>
          </div>
          {creds.length === 0 ? (
            <EmptyState
              title="No credentials recorded"
              hint="Licenses, DEA, board certs and life-support cards appear here."
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>State</th>
                  <th>Number</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Verified</th>
                </tr>
              </thead>
              <tbody>
                {creds.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>
                        {CREDENTIAL_LABELS[c.type as CredentialType] ?? c.type}
                      </b>
                      {c.is_compact && (
                        <span
                          className="badge badge-teal"
                          style={{ marginLeft: 6 }}
                        >
                          Compact
                        </span>
                      )}
                    </td>
                    <td>{c.state || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {c.number || "—"}
                    </td>
                    <td className="muted">{fmtDate(c.expires_on)}</td>
                    <td>
                      <ExpiryBadge expiresOn={c.expires_on} />
                    </td>
                    <td>
                      <VerifiedBadge verified={c.verified} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Experience ───────────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <h3>Experience</h3>
          </div>
          <div className="card-pad">
            {app.work_history.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                No work history captured in the application yet.
              </p>
            ) : (
              <div className="stack" style={{ gap: 16 }}>
                {app.work_history.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      paddingTop: i === 0 ? 0 : 14,
                      borderTop:
                        i === 0 ? "none" : "1px solid var(--line-2)",
                    }}
                  >
                    <div
                      className="row-between"
                      style={{ alignItems: "baseline", gap: 12 }}
                    >
                      <b style={{ fontSize: 14 }}>
                        {w.title || "Position"}
                        {w.employer ? ` — ${w.employer}` : ""}
                      </b>
                      {(w.start || w.end) && (
                        <span
                          className="muted"
                          style={{ fontSize: 12, whiteSpace: "nowrap" }}
                        >
                          {[w.start, w.end].filter((v) => v).join(" – ")}
                        </span>
                      )}
                    </div>
                    {w.location && (
                      <p className="muted" style={{ fontSize: 12 }}>
                        {w.location}
                      </p>
                    )}
                    {w.summary && (
                      <p style={{ fontSize: 13, marginTop: 4 }}>{w.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Education ────────────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <h3>Education &amp; training</h3>
          </div>
          <div className="card-pad">
            {app.education.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                No education captured in the application yet.
              </p>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                {app.education.map((e, i) => (
                  <div
                    key={i}
                    className="row-between"
                    style={{ alignItems: "baseline", gap: 12 }}
                  >
                    <div>
                      <b style={{ fontSize: 13 }}>
                        {e.credential || "Program"}
                        {e.field ? ` · ${e.field}` : ""}
                      </b>
                      {e.institution && (
                        <span
                          className="muted"
                          style={{ fontSize: 12, display: "block" }}
                        >
                          {e.institution}
                        </span>
                      )}
                    </div>
                    {e.year && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {e.year}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Assignment preferences ───────────────────────────── */}
        {hasPreferences && (
          <div className="card">
            <div className="card-head">
              <h3>Assignment preferences</h3>
            </div>
            <div className="card-pad">
              <dl className="def-list">
                <Detail label="Assignment type" value={assignmentType || null} />
                <Detail
                  label="Desired start"
                  value={
                    app.desired_start ? fmtDate(app.desired_start) : null
                  }
                />
                <Detail
                  label="Ideal schedule"
                  value={app.ideal_schedule || null}
                />
                <Detail
                  label="Shift preferences"
                  value={app.shift_preferences || null}
                />
                <Detail
                  label="Willing to travel"
                  value={yesNo(app.willing_to_travel) || null}
                />
                <Detail
                  label="Open to states"
                  value={app.travel_states || null}
                />
                <Detail
                  label="Telehealth"
                  value={yesNo(app.telehealth_interest) || null}
                />
                <Detail
                  label="Min. hourly rate"
                  value={app.min_hourly_rate || null}
                />
              </dl>
            </div>
          </div>
        )}

        {/* ── References ───────────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <h3>References</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {references.filter((r) => r.verified).length} of{" "}
              {references.length} verified
            </span>
          </div>
          <div className="card-pad">
            {references.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                No references on file.
              </p>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {references.map((r) => (
                  <div
                    key={r.id}
                    className="row-between"
                    style={{ alignItems: "baseline", gap: 12 }}
                  >
                    <div>
                      <b style={{ fontSize: 13 }}>{r.name}</b>
                      {r.relationship && (
                        <span
                          className="muted"
                          style={{ fontSize: 12 }}
                        >
                          {" "}
                          · {r.relationship}
                        </span>
                      )}
                      {r.contact && (
                        <span
                          className="muted"
                          style={{ fontSize: 12, display: "block" }}
                        >
                          {r.contact}
                        </span>
                      )}
                    </div>
                    <span
                      className={`badge ${
                        r.verified ? "badge-ok" : "badge-muted"
                      }`}
                    >
                      {r.verified ? "Verified" : "Unverified"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p
          className="muted"
          style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}
        >
          Generated by AlignMD · {fmtDate(new Date().toISOString())}
        </p>
      </div>
    </>
  );
}
