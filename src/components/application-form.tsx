import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { IconDoc } from "@/components/icons";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  ASSIGNMENT_TYPES,
  ASSIGNMENT_TYPE_LABELS,
  SPECIALTIES,
  WORK_SLOTS,
  EDU_SLOTS,
} from "@/lib/constants";
import { applicationProgress } from "@/lib/application";
import type { ApplicationResponse, ApplicationPayload } from "@/lib/types";
import { startApplication, saveApplication } from "@/app/(app)/providers/actions";

// ── Small field helpers — keep the long survey readable ───────────────────
function Field({
  name,
  label,
  value,
  placeholder,
  type = "text",
  full = false,
  list,
}: {
  name: string;
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  full?: boolean;
  list?: string;
}) {
  return (
    <div className={full ? "field full" : "field"}>
      <label htmlFor={name}>{label}</label>
      <input
        className="input"
        id={name}
        name={name}
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        list={list}
      />
    </div>
  );
}

function Area({
  name,
  label,
  value,
  placeholder,
}: {
  name: string;
  label: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <div className="field full">
      <label htmlFor={name}>{label}</label>
      <textarea
        className="textarea"
        id={name}
        name={name}
        defaultValue={value}
        placeholder={placeholder}
      />
    </div>
  );
}

function YesNo({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select className="select" id={name} name={name} defaultValue={value}>
        <option value="">Not answered</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        {hint && (
          <span className="muted" style={{ fontSize: 12 }}>
            {hint}
          </span>
        )}
      </div>
      <div className="card-pad">{children}</div>
    </div>
  );
}

export function ApplicationForm({
  providerId,
  application,
  payload,
}: {
  providerId: string;
  application: ApplicationResponse | null;
  payload: ApplicationPayload;
}) {
  // No application yet — offer to start one.
  if (!application) {
    return (
      <div className="card">
        <div className="card-head">
          <h3>Provider application</h3>
        </div>
        <EmptyState
          title="No application started"
          hint="Begin the intake survey to capture this clinician's profile, work history, education, and assignment preferences."
          action={
            <form action={startApplication}>
              <input type="hidden" name="provider_id" value={providerId} />
              <button type="submit" className="btn btn-primary">
                Start application
              </button>
            </form>
          }
        />
      </div>
    );
  }

  const submitted = !!application.submitted_at;
  const progress = applicationProgress(payload);
  const work = payload.work_history;
  const edu = payload.education;

  return (
    <form action={saveApplication} className="stack" style={{ gap: 16 }}>
      <input type="hidden" name="provider_id" value={providerId} />
      <input type="hidden" name="application_id" value={application.id} />

      {/* ── Status banner ─────────────────────────────────────────── */}
      <div className="card card-pad">
        <div
          className="row-between"
          style={{ flexWrap: "wrap", gap: 10 }}
        >
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className={`badge ${submitted ? "badge-ok" : "badge-warn"}`}>
              {submitted ? "Submitted" : "Draft"}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              {submitted
                ? `Submitted ${fmtDate(application.submitted_at)}`
                : `${progress.percent}% complete`}
              {` · last saved ${fmtDateTime(application.updated_at)}`}
            </span>
          </div>
          <Link
            href={`/providers/${providerId}/cv`}
            className="btn btn-sm"
          >
            <IconDoc width={14} height={14} /> View CV
          </Link>
        </div>
      </div>

      {/* ── 1. Professional profile ───────────────────────────────── */}
      <SectionCard title="Professional profile">
        <div className="form-grid">
          <Field
            name="preferred_name"
            label="Preferred name"
            value={payload.preferred_name}
            placeholder="How they like to be addressed"
          />
          <Field
            name="current_title"
            label="Current title / role"
            value={payload.current_title}
            placeholder="Hospitalist NP"
          />
          <Field
            name="phone"
            label="Phone"
            value={payload.phone}
            type="tel"
            placeholder="(555) 010-2030"
          />
          <Field
            name="email"
            label="Email"
            value={payload.email}
            type="email"
            placeholder="name@example.com"
          />
          <Field
            name="current_employer"
            label="Current employer"
            value={payload.current_employer}
            placeholder="Current facility / group"
          />
          <Field
            name="primary_specialty"
            label="Primary specialty"
            value={payload.primary_specialty}
            list="application-specialty-list"
            placeholder="Hospitalist"
          />
          <datalist id="application-specialty-list">
            {SPECIALTIES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Field
            name="subspecialties"
            label="Subspecialties"
            value={payload.subspecialties}
            placeholder="Sports Medicine, Critical Care"
          />
          <Field
            name="years_in_practice"
            label="Years in practice"
            value={payload.years_in_practice}
            type="number"
            placeholder="8"
          />
          <Field
            name="npi"
            label="NPI number"
            value={payload.npi}
            placeholder="10-digit NPI"
          />
          <Field
            name="languages"
            label="Languages spoken"
            value={payload.languages}
            placeholder="English, Spanish"
          />
          <Field
            name="board_certifications"
            label="Board certifications"
            value={payload.board_certifications}
            full
            placeholder="ANCC FNP-BC, NCCPA, AANP…"
          />
        </div>
      </SectionCard>

      {/* ── 2. Work history ───────────────────────────────────────── */}
      <SectionCard
        title="Work history"
        hint={`Up to ${WORK_SLOTS} positions, most recent first`}
      >
        {Array.from({ length: WORK_SLOTS }).map((_, i) => {
          const w = work[i];
          return (
            <div
              key={i}
              style={{
                marginTop: i === 0 ? 0 : 16,
                paddingTop: i === 0 ? 0 : 16,
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
              }}
            >
              <p
                className="eyebrow"
                style={{ marginBottom: 10, color: "var(--muted)" }}
              >
                Position {i + 1}
              </p>
              <div className="form-grid">
                <Field
                  name={`work_${i}_employer`}
                  label="Employer / facility"
                  value={w?.employer ?? ""}
                  placeholder="Facility or group"
                />
                <Field
                  name={`work_${i}_title`}
                  label="Title / role"
                  value={w?.title ?? ""}
                  placeholder="Role held"
                />
                <Field
                  name={`work_${i}_location`}
                  label="Location"
                  value={w?.location ?? ""}
                  placeholder="City, ST"
                />
                <div className="field">
                  <label htmlFor={`work_${i}_start`}>Dates</label>
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      className="input"
                      id={`work_${i}_start`}
                      name={`work_${i}_start`}
                      defaultValue={w?.start ?? ""}
                      placeholder="Start — Jan 2022"
                    />
                    <input
                      className="input"
                      name={`work_${i}_end`}
                      defaultValue={w?.end ?? ""}
                      placeholder="End — Present"
                    />
                  </div>
                </div>
                <Area
                  name={`work_${i}_summary`}
                  label="Summary"
                  value={w?.summary ?? ""}
                  placeholder="Scope, setting, patient volume, key procedures…"
                />
              </div>
            </div>
          );
        })}
      </SectionCard>

      {/* ── 3. Education & training ───────────────────────────────── */}
      <SectionCard
        title="Education & training"
        hint={`Up to ${EDU_SLOTS} entries`}
      >
        {Array.from({ length: EDU_SLOTS }).map((_, i) => {
          const e = edu[i];
          return (
            <div
              key={i}
              style={{
                marginTop: i === 0 ? 0 : 16,
                paddingTop: i === 0 ? 0 : 16,
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
              }}
            >
              <p
                className="eyebrow"
                style={{ marginBottom: 10, color: "var(--muted)" }}
              >
                Entry {i + 1}
              </p>
              <div className="form-grid">
                <Field
                  name={`edu_${i}_credential`}
                  label="Degree / program"
                  value={e?.credential ?? ""}
                  placeholder="MSN, MD, Residency, Fellowship"
                />
                <Field
                  name={`edu_${i}_institution`}
                  label="Institution"
                  value={e?.institution ?? ""}
                  placeholder="School or program"
                />
                <Field
                  name={`edu_${i}_field`}
                  label="Field of study"
                  value={e?.field ?? ""}
                  placeholder="Nursing, Internal Medicine…"
                />
                <Field
                  name={`edu_${i}_year`}
                  label="Year completed"
                  value={e?.year ?? ""}
                  placeholder="2016"
                />
              </div>
            </div>
          );
        })}
      </SectionCard>

      {/* ── 4. Assignment preferences ─────────────────────────────── */}
      <SectionCard title="Assignment preferences">
        <div className="form-grid">
          <Area
            name="reason_for_looking"
            label="Why are you looking for a new assignment?"
            value={payload.reason_for_looking}
            placeholder="Motivation, timing, what they want next…"
          />
          <div className="field">
            <label htmlFor="assignment_type">Assignment type</label>
            <select
              className="select"
              id="assignment_type"
              name="assignment_type"
              defaultValue={payload.assignment_type}
            >
              <option value="">Not specified</option>
              {ASSIGNMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ASSIGNMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <Field
            name="desired_start"
            label="Desired start date"
            value={payload.desired_start}
            type="date"
          />
          <Field
            name="ideal_schedule"
            label="Ideal schedule"
            value={payload.ideal_schedule}
            placeholder="7-on / 7-off, 3x12s…"
          />
          <Field
            name="shift_preferences"
            label="Shift preferences"
            value={payload.shift_preferences}
            placeholder="Days, nights, weekends…"
          />
          <YesNo
            name="willing_to_travel"
            label="Willing to travel"
            value={payload.willing_to_travel}
          />
          <Field
            name="travel_states"
            label="States / regions open to"
            value={payload.travel_states}
            placeholder="FL, GA, TX"
          />
          <Field
            name="license_states_needed"
            label="States needing licensure help"
            value={payload.license_states_needed}
            placeholder="States not yet licensed in"
          />
          <YesNo
            name="telehealth_interest"
            label="Interested in telehealth"
            value={payload.telehealth_interest}
          />
          <Field
            name="min_hourly_rate"
            label="Minimum hourly rate expectation"
            value={payload.min_hourly_rate}
            placeholder="$"
          />
        </div>
      </SectionCard>

      {/* ── 5. Screening disclosures ──────────────────────────────── */}
      <SectionCard
        title="Screening disclosures"
        hint="Verified separately during credentialing"
      >
        <div className="form-grid">
          <YesNo
            name="malpractice_history"
            label="Any malpractice claims or settlements?"
            value={payload.malpractice_history}
          />
          <YesNo
            name="license_action_history"
            label="Any board / license actions?"
            value={payload.license_action_history}
          />
          <Area
            name="malpractice_explanation"
            label="Malpractice — explanation (if any)"
            value={payload.malpractice_explanation}
            placeholder="Provide context for any disclosed claims."
          />
          <Area
            name="license_action_explanation"
            label="License action — explanation (if any)"
            value={payload.license_action_explanation}
            placeholder="Provide context for any disclosed actions."
          />
          <Area
            name="additional_notes"
            label="Anything else we should know"
            value={payload.additional_notes}
            placeholder="Optional — additional context for the recruiter."
          />
        </div>
      </SectionCard>

      {/* ── Action bar ────────────────────────────────────────────── */}
      <div className="card card-pad">
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button
            type="submit"
            name="intent"
            value="save"
            className="btn btn-primary"
          >
            Save changes
          </button>
          {submitted ? (
            <button
              type="submit"
              name="intent"
              value="reopen"
              className="btn"
            >
              Reopen as draft
            </button>
          ) : (
            <button
              type="submit"
              name="intent"
              value="submit"
              className="btn"
            >
              Mark as submitted
            </button>
          )}
          <span className="muted" style={{ fontSize: 12 }}>
            Drafts save without marking the application complete.
          </span>
        </div>
      </div>
    </form>
  );
}
