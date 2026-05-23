import Link from "next/link";
import { CARE_SETTINGS } from "@/lib/constants";
import type { Facility } from "@/lib/types";

export function FacilityForm({
  action,
  facility,
  mode,
  error,
}: {
  action: (fd: FormData) => void;
  facility?: Facility;
  mode: "new" | "edit";
  error?: string;
}) {
  const f = facility;
  return (
    <form action={action}>
      {f && <input type="hidden" name="id" value={f.id} />}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card card-pad">
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="name">Facility name *</label>
            <input
              className="input"
              id="name"
              name="name"
              required
              defaultValue={f?.name ?? ""}
              placeholder="Gulf Coast Regional Medical Center"
            />
          </div>

          <div className="field">
            <label htmlFor="setting">Care setting</label>
            <input
              className="input"
              id="setting"
              name="setting"
              list="setting-list"
              defaultValue={f?.setting ?? ""}
              placeholder="Inpatient"
            />
            <datalist id="setting-list">
              {CARE_SETTINGS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="emr">EMR system</label>
            <input
              className="input"
              id="emr"
              name="emr"
              defaultValue={f?.emr ?? ""}
              placeholder="Epic"
            />
          </div>

          <div className="field">
            <label htmlFor="city">City</label>
            <input
              className="input"
              id="city"
              name="city"
              defaultValue={f?.city ?? ""}
              placeholder="Fort Myers"
            />
          </div>

          <div className="field">
            <label htmlFor="state">State</label>
            <input
              className="input"
              id="state"
              name="state"
              maxLength={2}
              defaultValue={f?.state ?? ""}
              placeholder="FL"
              style={{ textTransform: "uppercase" }}
            />
          </div>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          <button type="submit" className="btn btn-primary">
            {mode === "new" ? "Create facility" : "Save changes"}
          </button>
          <Link
            href={f ? `/facilities/${f.id}` : "/facilities"}
            className="btn btn-ghost"
          >
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
