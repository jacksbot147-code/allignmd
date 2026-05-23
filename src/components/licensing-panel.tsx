import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { fmtDate } from "@/lib/format";
import { US_STATES } from "@/lib/validation";
import { LICENSE_STATUS_LABELS, LICENSE_STATUS_TONE } from "@/lib/constants";
import { parseLicenseBundle, licenseProgress } from "@/lib/licensing";
import type { LicenseApplication, ProviderRole } from "@/lib/types";
import { startLicenseApplication } from "@/app/(app)/licensing/actions";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
  teal: "badge-teal",
};

/**
 * The provider detail page's Licensing tab — every state-license application
 * for one clinician, plus a control to start a new one.
 */
export function LicensingPanel({
  providerId,
  clinicianRole,
  applications,
}: {
  providerId: string;
  clinicianRole: ProviderRole | null;
  applications: LicenseApplication[];
}) {
  return (
    <div className="stack">
      <div className="alert alert-info">
        <IconShield width={13} height={13} /> The licensing assistant pre-fills
        and organizes a state application — it does not submit to the board.
        Each state board still receives its own submission.
      </div>

      {!clinicianRole && (
        <div className="alert alert-info">
          Set this clinician&apos;s role on the Edit screen for a checklist
          tailored to their discipline.
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>License applications</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {applications.length} total
          </span>
        </div>
        {applications.length === 0 ? (
          <EmptyState
            title="No license applications yet"
            hint="Start an application below to help this clinician get licensed in a new state."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Target state</th>
                <th>Status</th>
                <th>Checklist</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const bundle = parseLicenseBundle(a.document_bundle);
                const progress = licenseProgress(bundle, clinicianRole);
                return (
                  <tr key={a.id} className="table-row-link">
                    <td>
                      <Link
                        href={`/licensing/${a.id}`}
                        style={{ fontWeight: 700 }}
                      >
                        {a.state}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          toneClass[LICENSE_STATUS_TONE[a.status]] ??
                          "badge-muted"
                        }`}
                      >
                        {LICENSE_STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="muted">
                      {progress.complete}/{progress.total} ·{" "}
                      {progress.percent}%
                    </td>
                    <td className="muted">{fmtDate(a.updated_at)}</td>
                    <td>
                      <div
                        className="row"
                        style={{ justifyContent: "flex-end" }}
                      >
                        <Link
                          href={`/licensing/${a.id}`}
                          className="btn btn-sm"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <details className="card card-pad">
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          + Start a license application
        </summary>
        <form action={startLicenseApplication} style={{ marginTop: 16 }}>
          <input type="hidden" name="provider_id" value={providerId} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-license-state">Target state *</label>
              <select
                className="select"
                id="new-license-state"
                name="state"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Choose a state…
                </option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            Start application
          </button>
        </form>
      </details>
    </div>
  );
}
