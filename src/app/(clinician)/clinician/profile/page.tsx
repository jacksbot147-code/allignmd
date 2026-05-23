import Link from "next/link";
import type { Metadata } from "next";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import {
  PROVIDER_ROLES,
  PROVIDER_ROLE_LABELS,
  SPECIALTIES,
} from "@/lib/constants";
import type { Provider } from "@/lib/types";
import { updateMyProfile } from "../../actions";

export const metadata: Metadata = { title: "My profile" };
export const dynamic = "force-dynamic";

export default async function ClinicianProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  await requireProvider();
  const provider = await getMyProvider();

  if (!provider) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>My profile</h2>
            <p>Your clinician profile.</p>
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

  return (
    <>
      <div className="page-head">
        <div>
          <h2>My profile</h2>
          <p>This is what recruiters and the match engine work from.</p>
        </div>
      </div>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}
      {searchParams.saved && (
        <div className="alert alert-ok">Profile saved.</div>
      )}

      <form action={updateMyProfile}>
        <div className="card card-pad">
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="full_name">Full name *</label>
              <input
                className="input"
                id="full_name"
                name="full_name"
                required
                defaultValue={p.full_name ?? ""}
                placeholder="Jordan Rivera"
              />
            </div>

            <div className="field">
              <label htmlFor="clinician_role">Clinician role</label>
              <select
                className="select"
                id="clinician_role"
                name="clinician_role"
                defaultValue={p.clinician_role ?? ""}
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
                defaultValue={p.years_experience ?? ""}
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
                defaultValue={p.specialty ?? ""}
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
                defaultValue={p.subspecialty ?? ""}
                placeholder="Sports Medicine"
              />
            </div>

            <div className="field">
              <label htmlFor="npi">NPI number</label>
              <input
                className="input mono"
                id="npi"
                name="npi"
                defaultValue={p.npi ?? ""}
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
                defaultValue={p.available_start ?? ""}
              />
            </div>

            <div className="field">
              <label htmlFor="languages">Languages</label>
              <input
                className="input"
                id="languages"
                name="languages"
                defaultValue={p.languages?.join(", ") ?? ""}
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
                defaultValue={p.travel_radius_miles ?? ""}
                placeholder="120"
              />
            </div>

            <div className="field full">
              <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name="telehealth_ok"
                  defaultChecked={p.telehealth_ok ?? false}
                  style={{ width: 16, height: 16 }}
                />
                Open to telehealth assignments
              </label>
            </div>
          </div>

          <div className="row" style={{ gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
            <Link href="/clinician" className="btn btn-ghost">
              Cancel
            </Link>
          </div>
        </div>
      </form>

      <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>
        Pipeline stage, credentials and verification are managed by AlignMD
        staff — contact your recruiter if any of those need a change.
      </p>
    </>
  );
}
