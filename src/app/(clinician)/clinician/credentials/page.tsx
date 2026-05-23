import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { EmptyState, ExpiryBadge, VerifiedBadge } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { CREDENTIAL_LABELS } from "@/lib/constants";
import { expiryStatus, expiryCopy } from "@/lib/credentials";
import { fmtDate } from "@/lib/format";
import type { Provider, ProviderCredential, CredentialType } from "@/lib/types";

export const metadata: Metadata = { title: "Credentials" };
export const dynamic = "force-dynamic";

export default async function ClinicianCredentialsPage() {
  await requireProvider();
  const provider = await getMyProvider();

  if (!provider) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Credentials</h2>
            <p>Your licenses, DEA and certifications.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your profile isn't linked yet"
            hint="An administrator still needs to connect your account to your clinician profile. Reach out to your AlignMD recruiter."
          />
        </div>
      </>
    );
  }

  const p = provider as Provider;
  const supabase = createClient();
  const { data } = await supabase
    .from("provider_credentials")
    .select("*")
    .eq("provider_id", p.id)
    .order("expires_on", { ascending: true, nullsFirst: false });
  const creds = (data ?? []) as ProviderCredential[];

  const verified = creds.filter((c) => c.verified).length;
  const attention = creds.filter((c) => {
    const s = expiryStatus(c.expires_on);
    return s === "expired" || s.startsWith("expiring");
  }).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Credentials</h2>
          <p>
            Your licenses, DEA and certifications — kept current with your
            credentialing coordinator.
          </p>
        </div>
      </div>

      {creds.length > 0 && (
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">On file</div>
            <div className="kpi-value">{creds.length}</div>
            <div className="kpi-sub">credentials</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Verified</div>
            <div className="kpi-value">{verified}</div>
            <div className="kpi-sub">primary-source checked</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Need attention</div>
            <div className="kpi-value">{attention}</div>
            <div className="kpi-sub">expired or expiring soon</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Your credentials</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            Maintained by your credentialing coordinator
          </span>
        </div>
        {creds.length === 0 ? (
          <EmptyState
            title="No credentials on file yet"
            hint="Your credentialing coordinator records licenses, DEA and certifications here. Upload supporting documents from the Documents tab to help them along."
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
                    <td className="mono muted">{c.number || "—"}</td>
                    <td className="muted">
                      {fmtDate(c.expires_on)}
                      <div style={{ fontSize: 11 }}>
                        {expiryCopy(c.expires_on)}
                      </div>
                    </td>
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
          </div>
        )}
      </div>

      <p
        className="muted"
        style={{
          fontSize: 11,
          marginTop: 18,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <IconShield width={12} height={12} /> Credentials are read-only here.
        Contact your AlignMD recruiter if anything needs updating or renewing.
      </p>
    </>
  );
}
