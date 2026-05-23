import Link from "next/link";
import {
  PROVIDER_ROLES,
  PROVIDER_ROLE_LABELS,
  SPECIALTIES,
  PIPELINE_STAGES,
  STAGE_LABELS,
} from "@/lib/constants";
import type { Provider } from "@/lib/types";

export function ProviderForm({
  action,
  provider,
  mode,
  canSeeRestricted,
  ssnLast4,
  error,
}: {
  action: (fd: FormData) => void;
  provider?: Provider;
  mode: "new" | "edit";
  canSeeRestricted: boolean;
  ssnLast4?: string | null;
  error?: string;
}) {
  const p = provider;
  return (
    <form action={action}>
      {p && <input type="hidden" name="id" value={p.id} />}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card card-pad">
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="full_name">Full name *</label>
            <input
              className="input"
              id="full_name"
              name="full_name"
              required
              defaultValue={p?.full_name ?? ""}
              placeholder="Jordan Rivera"
            />
          </div>

          <div className="field">
            <label htmlFor="clinician_role">Clinician role</label>
            <select
              className="select"
              id="clinician_role"
              name="clinician_role"
              defaultValue={p?.clinician_role ?? ""}
            >
              <option value="">Select…</option>
              {PROVIDER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {PROVIDER_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="years_experience">Years of experience</label>
            <input
              className="input"
              id="years_experience"
              name="years_experience"
              type="number"
              min={0}
              defaultValue={p?.years_experience ?? ""}
              placeholder="8"
            />
          </div>

          <div className="field">
            <label htmlFor="specialty">Specialty</label>
            <input
              className="input"
              id="specialty"
              name="specialty"
              list="specialty-list"
              defaultValue={p?.specialty ?? ""}
              placeholder="Hospitalist"
            />
            <datalist id="specialty-list">
              {SPECIALTIES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="subspecialty">Subspecialty</label>
            <input
              className="input"
              id="subspecialty"
              name="subspecialty"
              defaultValue={p?.subspecialty ?? ""}
              placeholder="Sports Medicine"
            />
          </div>

          <div className="field">
            <label htmlFor="npi">NPI number</label>
            <input
              className="input mono"
              id="npi"
              name="npi"
              defaultValue={p?.npi ?? ""}
              placeholder="10-digit NPI"
              maxLength={10}
              inputMode="numeric"
              pattern="\d{10}"
              title="NPI must be 10 digits."
            />
            <span className="hint">10 digits — checked against the NPI standard.</span>
          </div>

          <div className="field">
            <label htmlFor="available_start">Available from</label>
            <input
              className="input"
              id="available_start"
              name="available_start"
              type="date"
              defaultValue={p?.available_start ?? ""}
            />
          </div>

          <div className="field">
            <label htmlFor="languages">Languages</label>
            <input
              className="input"
              id="languages"
              name="languages"
              defaultValue={p?.languages?.join(", ") ?? ""}
              placeholder="English, Spanish"
            />
            <span className="hint">Comma-separated</span>
          </div>

          <div className="field">
            <label htmlFor="travel_radius_miles">Travel radius (miles)</label>
            <input
              className="input"
              id="travel_radius_miles"
              name="travel_radius_miles"
              type="number"
              min={0}
              defaultValue={p?.travel_radius_miles ?? ""}
              placeholder="120"
            />
          </div>

          {canSeeRestricted && (
            <div className="field">
              <label htmlFor="ssn_last4">SSN — last 4</label>
              <input
                className="input mono"
                id="ssn_last4"
                name="ssn_last4"
                maxLength={4}
                inputMode="numeric"
                pattern="\d{4}"
                title="Enter exactly the last 4 digits."
                defaultValue={ssnLast4 ?? ""}
                placeholder="0000"
              />
              <span className="hint">Full SSN is never stored.</span>
            </div>
          )}

          {mode === "new" && (
            <div className="field">
              <label htmlFor="pipeline_stage">Pipeline stage</label>
              <select
                className="select"
                id="pipeline_stage"
                name="pipeline_stage"
                defaultValue="new"
              >
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field full">
            <label className="row" style={{ gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                name="telehealth_ok"
                defaultChecked={p?.telehealth_ok ?? false}
                style={{ width: 16, height: 16 }}
              />
              Open to telehealth assignments
            </label>
          </div>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          <button type="submit" className="btn btn-primary">
            {mode === "new" ? "Create provider" : "Save changes"}
          </button>
          <Link
            href={p ? `/providers/${p.id}` : "/providers"}
            className="btn btn-ghost"
          >
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
