import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ExpiryBadge, VerifiedBadge, EmptyState } from "@/components/ui";
import { CREDENTIAL_LABELS } from "@/lib/constants";
import { expiryStatus, expiryCopy } from "@/lib/credentials";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Credentials" };
export const dynamic = "force-dynamic";

export default async function CredentialsPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const riskOnly = searchParams.view === "risk";
  const supabase = createClient();

  const { data } = await supabase
    .from("provider_credentials")
    .select("*, provider:providers(id, full_name)")
    .order("expires_on", { ascending: true, nullsFirst: false });

  const creds = data ?? [];

  const counts = {
    expired: creds.filter((c: any) => expiryStatus(c.expires_on) === "expired").length,
    d30: creds.filter((c: any) => expiryStatus(c.expires_on) === "expiring_30").length,
    d60: creds.filter((c: any) => expiryStatus(c.expires_on) === "expiring_60").length,
    d90: creds.filter((c: any) => expiryStatus(c.expires_on) === "expiring_90").length,
  };

  const rows = riskOnly
    ? creds.filter((c: any) => {
        const s = expiryStatus(c.expires_on);
        return s === "expired" || s.startsWith("expiring");
      })
    : creds;

  const kpis = [
    { label: "Expired", value: counts.expired, tone: "var(--danger)" },
    { label: "Due ≤ 30 days", value: counts.d30, tone: "var(--danger)" },
    { label: "Due ≤ 60 days", value: counts.d60, tone: "var(--warn)" },
    { label: "Due ≤ 90 days", value: counts.d90, tone: "var(--warn)" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Credential tracker</h2>
          <p>
            Every license and certification across the CRM, ranked by how soon
            it expires.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.tone }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <Link
          href="/credentials"
          className={`btn btn-sm${!riskOnly ? " btn-primary" : ""}`}
        >
          All credentials
        </Link>
        <Link
          href="/credentials?view=risk"
          className={`btn btn-sm${riskOnly ? " btn-primary" : ""}`}
        >
          Needs attention
        </Link>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {rows.length} shown
        </span>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            title={riskOnly ? "Nothing needs attention" : "No credentials recorded"}
            hint={
              riskOnly
                ? "Every credential is current beyond 90 days."
                : "Credentials added to a provider profile show up here."
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Credential</th>
                  <th>State</th>
                  <th>Number</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Verified</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c: any) => (
                  <tr key={c.id} className="table-row-link">
                    <td>
                      <Link
                        href={`/providers/${c.provider?.id}?tab=credentials`}
                        style={{ fontWeight: 600 }}
                      >
                        {c.provider?.full_name ?? "—"}
                      </Link>
                    </td>
                    <td>
                      {CREDENTIAL_LABELS[c.type as keyof typeof CREDENTIAL_LABELS]}
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
