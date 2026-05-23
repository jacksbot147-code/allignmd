import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { IconLicensing } from "@/components/icons";
import {
  LICENSE_STATUSES,
  LICENSE_STATUS_LABELS,
  LICENSE_STATUS_TONE,
} from "@/lib/constants";
import { parseLicenseBundle, licenseProgress } from "@/lib/licensing";
import { US_STATES } from "@/lib/validation";
import { fmtDate } from "@/lib/format";
import type { LicenseApplicationStatus } from "@/lib/types";
import { startLicenseApplication } from "./actions";

export const metadata: Metadata = { title: "Licensing" };
export const dynamic = "force-dynamic";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
  teal: "badge-teal",
};

export default async function LicensingPage({
  searchParams,
}: {
  searchParams: { status?: string; error?: string };
}) {
  const filter = searchParams.status;
  const supabase = createClient();

  const [appsRes, providersRes] = await Promise.all([
    supabase
      .from("license_applications")
      .select(
        "*, provider:providers(id, full_name, clinician_role, archived_at)",
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("providers")
      .select("id, full_name, clinician_role")
      .is("archived_at", null)
      .order("full_name", { ascending: true }),
  ]);

  const apps = (appsRes.data ?? []) as any[];
  const providers = (providersRes.data ?? []) as any[];

  const counts = {
    draft: apps.filter((a) => a.status === "draft").length,
    submitted: apps.filter((a) => a.status === "submitted").length,
    issued: apps.filter((a) => a.status === "issued").length,
    withdrawn: apps.filter((a) => a.status === "withdrawn").length,
  };
  const inFlight = counts.draft + counts.submitted;

  const rows = filter ? apps.filter((a) => a.status === filter) : apps;

  const kpis = [
    { label: "In flight", value: inFlight, tone: "var(--ink)" },
    { label: "Draft", value: counts.draft, tone: "var(--muted)" },
    { label: "Submitted to board", value: counts.submitted, tone: "var(--warn)" },
    { label: "Licenses issued", value: counts.issued, tone: "var(--ok)" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>State licensing</h2>
          <p>
            Every in-flight state-license application across the clinician
            roster, tracked from draft to issued.
          </p>
        </div>
      </div>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}

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
          href="/licensing"
          className={`btn btn-sm${!filter ? " btn-primary" : ""}`}
        >
          All
        </Link>
        {LICENSE_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/licensing?status=${s}`}
            className={`btn btn-sm${filter === s ? " btn-primary" : ""}`}
          >
            {LICENSE_STATUS_LABELS[s]}
          </Link>
        ))}
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {rows.length} shown
        </span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        {rows.length === 0 ? (
          <EmptyState
            title={
              filter
                ? "No applications with that status"
                : "No license applications yet"
            }
            hint={
              filter
                ? "Try a different status filter."
                : "Start an application below, or from a clinician's Licensing tab."
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Clinician</th>
                <th>Role</th>
                <th>Target state</th>
                <th>Status</th>
                <th>Checklist</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const role = a.provider?.clinician_role ?? null;
                const progress = licenseProgress(
                  parseLicenseBundle(a.document_bundle),
                  role,
                );
                const status = a.status as LicenseApplicationStatus;
                return (
                  <tr key={a.id} className="table-row-link">
                    <td>
                      <Link
                        href={`/licensing/${a.id}`}
                        style={{ fontWeight: 700 }}
                      >
                        {a.provider?.full_name ?? "Unknown clinician"}
                      </Link>
                    </td>
                    <td className="muted">{role ?? "—"}</td>
                    <td>
                      <span className="badge badge-muted">{a.state}</span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          toneClass[LICENSE_STATUS_TONE[status]] ??
                          "badge-muted"
                        }`}
                      >
                        {LICENSE_STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="muted">
                      {progress.complete}/{progress.total} · {progress.percent}%
                    </td>
                    <td className="muted">{fmtDate(a.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <details className="card card-pad">
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          <IconLicensing
            width={14}
            height={14}
            style={{ verticalAlign: "-2px", marginRight: 6 }}
          />
          Start a new license application
        </summary>
        {providers.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            Add a clinician first — applications attach to a provider record.
          </p>
        ) : (
          <form action={startLicenseApplication} style={{ marginTop: 16 }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="new-app-provider">Clinician *</label>
                <select
                  className="select"
                  id="new-app-provider"
                  name="provider_id"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose a clinician…
                  </option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                      {p.clinician_role ? ` — ${p.clinician_role}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="new-app-state">Target state *</label>
                <select
                  className="select"
                  id="new-app-state"
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
        )}
      </details>
    </>
  );
}
