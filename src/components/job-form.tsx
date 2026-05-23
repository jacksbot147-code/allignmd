import Link from "next/link";
import { CARE_SETTINGS, CREDENTIAL_LABELS } from "@/lib/constants";
import type { Job, JobRequirement, CredentialType } from "@/lib/types";

// Certifications a job commonly requires.
const REQ_CERTS: CredentialType[] = [
  "bls",
  "acls",
  "pals",
  "atls",
  "dea",
  "board_certification",
];

export function JobForm({
  action,
  facilities,
  job,
  requirement,
  defaultFacilityId,
  mode,
  error,
}: {
  action: (fd: FormData) => void;
  facilities: { id: string; name: string }[];
  job?: Job;
  requirement?: JobRequirement | null;
  defaultFacilityId?: string;
  mode: "new" | "edit";
  error?: string;
}) {
  const j = job;
  const reqCerts = new Set(requirement?.required_certs ?? []);

  return (
    <form action={action}>
      {j && <input type="hidden" name="id" value={j.id} />}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Role</h3>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="facility_id">Facility *</label>
            <select
              className="select"
              id="facility_id"
              name="facility_id"
              required
              defaultValue={j?.facility_id ?? defaultFacilityId ?? ""}
            >
              <option value="">Select…</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="title">Job title *</label>
            <input
              className="input"
              id="title"
              name="title"
              required
              defaultValue={j?.title ?? ""}
              placeholder="Hospitalist NP — Nights"
            />
          </div>

          <div className="field">
            <label htmlFor="specialty">Specialty</label>
            <input
              className="input"
              id="specialty"
              name="specialty"
              defaultValue={j?.specialty ?? ""}
              placeholder="Hospitalist"
            />
          </div>

          <div className="field">
            <label htmlFor="setting">Care setting</label>
            <input
              className="input"
              id="setting"
              name="setting"
              list="job-setting-list"
              defaultValue={j?.setting ?? ""}
              placeholder="Inpatient"
            />
            <datalist id="job-setting-list">
              {CARE_SETTINGS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="schedule">Schedule</label>
            <input
              className="input"
              id="schedule"
              name="schedule"
              defaultValue={j?.schedule ?? ""}
              placeholder="7 on / 7 off, nights"
            />
          </div>

          <div className="field">
            <label htmlFor="call_requirement">Call requirement</label>
            <input
              className="input"
              id="call_requirement"
              name="call_requirement"
              defaultValue={j?.call_requirement ?? ""}
              placeholder="1:4 weekend call"
            />
          </div>

          <div className="field full">
            <label className="row" style={{ gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                name="is_permanent"
                defaultChecked={j?.is_permanent ?? false}
                style={{ width: 16, height: 16 }}
              />
              Permanent placement (unchecked = locum / temporary)
            </label>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Match requirements</h3>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="required_license_states">
              Required license states
            </label>
            <input
              className="input"
              id="required_license_states"
              name="required_license_states"
              defaultValue={
                requirement?.required_license_states?.join(", ") ?? ""
              }
              placeholder="FL, GA"
              style={{ textTransform: "uppercase" }}
            />
            <span className="hint">
              Comma-separated. Compact licenses are honored automatically.
            </span>
          </div>

          <div className="field">
            <label htmlFor="min_years_experience">Minimum experience</label>
            <input
              className="input"
              id="min_years_experience"
              name="min_years_experience"
              type="number"
              min={0}
              defaultValue={requirement?.min_years_experience ?? ""}
              placeholder="2"
            />
            <span className="hint">Years</span>
          </div>

          <div className="field full">
            <label>Required certifications</label>
            <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
              {REQ_CERTS.map((c) => (
                <label
                  key={c}
                  className="row"
                  style={{ gap: 6, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    name="required_certs"
                    value={c}
                    defaultChecked={reqCerts.has(c)}
                    style={{ width: 15, height: 15 }}
                  />
                  {CREDENTIAL_LABELS[c]}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Pay rates (optional)</h3>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rate_hourly">Hourly</label>
            <input className="input" id="rate_hourly" name="rate_hourly" type="number" min={0} step="0.01" defaultValue={j?.rate_hourly ?? ""} placeholder="95" />
          </div>
          <div className="field">
            <label htmlFor="rate_callback">Callback</label>
            <input className="input" id="rate_callback" name="rate_callback" type="number" min={0} step="0.01" defaultValue={j?.rate_callback ?? ""} placeholder="120" />
          </div>
          <div className="field">
            <label htmlFor="rate_ot">Overtime</label>
            <input className="input" id="rate_ot" name="rate_ot" type="number" min={0} step="0.01" defaultValue={j?.rate_ot ?? ""} placeholder="140" />
          </div>
          <div className="field">
            <label htmlFor="rate_weekend">Weekend</label>
            <input className="input" id="rate_weekend" name="rate_weekend" type="number" min={0} step="0.01" defaultValue={j?.rate_weekend ?? ""} placeholder="110" />
          </div>
          <div className="field">
            <label htmlFor="rate_holiday">Holiday</label>
            <input className="input" id="rate_holiday" name="rate_holiday" type="number" min={0} step="0.01" defaultValue={j?.rate_holiday ?? ""} placeholder="130" />
          </div>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <button type="submit" className="btn btn-primary">
            {mode === "new" ? "Create job" : "Save changes"}
          </button>
          <Link
            href={j ? `/jobs/${j.id}` : "/jobs"}
            className="btn btn-ghost"
          >
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
