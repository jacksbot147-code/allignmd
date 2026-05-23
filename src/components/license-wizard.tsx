"use client";

import { useState } from "react";
import { LICENSE_WIZARD_STEPS } from "@/lib/licensing";
import { saveLicenseApplication } from "@/app/(app)/licensing/actions";
import type { LicenseSurvey } from "@/lib/types";

// ── Field helpers — keep the long survey readable ─────────────────────────
function Field({
  name,
  label,
  value,
  placeholder,
  type = "text",
  full = false,
}: {
  name: keyof LicenseSurvey;
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "field full" : "field"}>
      <label htmlFor={`lw-${name}`}>{label}</label>
      <input
        className="input"
        id={`lw-${name}`}
        name={name}
        type={type}
        defaultValue={value}
        placeholder={placeholder}
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
  name: keyof LicenseSurvey;
  label: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <div className="field full">
      <label htmlFor={`lw-${name}`}>{label}</label>
      <textarea
        className="textarea"
        id={`lw-${name}`}
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
  name: keyof LicenseSurvey;
  label: string;
  value: string;
}) {
  return (
    <div className="field">
      <label htmlFor={`lw-${name}`}>{label}</label>
      <select
        className="select"
        id={`lw-${name}`}
        name={name}
        defaultValue={value}
      >
        <option value="">Not answered</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
}

export function LicenseWizard({
  applicationId,
  survey,
}: {
  applicationId: string;
  survey: LicenseSurvey;
}) {
  const [step, setStep] = useState(0);
  const steps = LICENSE_WIZARD_STEPS;
  const last = steps.length - 1;
  const active = steps[step];

  return (
    <div className="card">
      <div className="card-head">
        <h3>Application wizard</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          Step {step + 1} of {steps.length}
        </span>
      </div>

      {/* ── Stepper ─────────────────────────────────────────────── */}
      <div
        className="row"
        style={{
          gap: 6,
          flexWrap: "wrap",
          padding: "12px 18px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {steps.map((st, i) => (
          <button
            key={st.key}
            type="button"
            onClick={() => setStep(i)}
            className={`btn btn-sm${i === step ? " btn-primary" : ""}`}
          >
            {i + 1}. {st.title}
          </button>
        ))}
      </div>

      <form action={saveLicenseApplication}>
        <input type="hidden" name="application_id" value={applicationId} />

        <div className="card-pad">
          <p className="eyebrow" style={{ marginBottom: 2 }}>
            {active.title}
          </p>
          <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
            {active.hint}
          </p>

          {/* All steps stay mounted so every field posts on save. */}
          {/* ── 1. Applicant identity ───────────────────────────── */}
          <div style={{ display: step === 0 ? "block" : "none" }}>
            <div className="form-grid">
              <Field
                name="legal_full_name"
                label="Legal full name"
                value={survey.legal_full_name}
                placeholder="As it appears on the clinician's ID"
                full
              />
              <Field
                name="former_names"
                label="Former / other names"
                value={survey.former_names}
                placeholder="Maiden or prior names, if any"
              />
              <Field
                name="date_of_birth"
                label="Date of birth"
                value={survey.date_of_birth}
                type="date"
              />
              <Field
                name="npi"
                label="NPI number"
                value={survey.npi}
                placeholder="10-digit NPI"
              />
              <Field
                name="phone"
                label="Phone"
                value={survey.phone}
                type="tel"
                placeholder="(555) 010-2030"
              />
              <Field
                name="email"
                label="Email"
                value={survey.email}
                type="email"
                placeholder="name@example.com"
              />
              <Field
                name="home_address"
                label="Home / mailing address"
                value={survey.home_address}
                placeholder="Street, city, ST ZIP"
                full
              />
            </div>
          </div>

          {/* ── 2. Education & training ─────────────────────────── */}
          <div style={{ display: step === 1 ? "block" : "none" }}>
            <div className="form-grid">
              <Field
                name="professional_school"
                label="Professional school"
                value={survey.professional_school}
                placeholder="Medical / nursing / therapy school"
                full
              />
              <Field
                name="degree"
                label="Degree earned"
                value={survey.degree}
                placeholder="MD, DO, MSN, DNP, DPT…"
              />
              <Field
                name="graduation_year"
                label="Graduation year"
                value={survey.graduation_year}
                placeholder="2016"
              />
              <Area
                name="postgraduate_training"
                label="Residency, fellowship & post-graduate training"
                value={survey.postgraduate_training}
                placeholder="Program, institution and completion year for each"
              />
            </div>
          </div>

          {/* ── 3. Licensure & certification ────────────────────── */}
          <div style={{ display: step === 2 ? "block" : "none" }}>
            <div className="form-grid">
              <Field
                name="licenses_held"
                label="States currently licensed in"
                value={survey.licenses_held}
                placeholder="FL, GA, TX"
                full
              />
              <Field
                name="board_certification"
                label="Board / national certification"
                value={survey.board_certification}
                placeholder="ABMS, NCCPA, ANCC, NBCRNA…"
                full
              />
              <Field
                name="dea_number"
                label="DEA number"
                value={survey.dea_number}
                placeholder="If the clinician prescribes"
              />
              <Field
                name="target_license_type"
                label="Target license type"
                value={survey.target_license_type}
                placeholder="e.g. Physician, APRN, PA, PT"
              />
            </div>
          </div>

          {/* ── 4. Practice history ─────────────────────────────── */}
          <div style={{ display: step === 3 ? "block" : "none" }}>
            <div className="form-grid">
              <Field
                name="current_employer"
                label="Current employer"
                value={survey.current_employer}
                placeholder="Current facility or group"
                full
              />
              <Area
                name="practice_summary"
                label="Recent practice summary"
                value={survey.practice_summary}
                placeholder="Setting, scope, patient population and key procedures"
              />
              <Area
                name="practice_gaps"
                label="Practice gaps — explanation"
                value={survey.practice_gaps}
                placeholder="Explain any gaps of 30+ days in clinical practice"
              />
            </div>
          </div>

          {/* ── 5. Disclosures & attestations ───────────────────── */}
          <div style={{ display: step === 4 ? "block" : "none" }}>
            <div className="form-grid">
              <YesNo
                name="malpractice_history"
                label="Any malpractice claims or settlements?"
                value={survey.malpractice_history}
              />
              <YesNo
                name="board_action_history"
                label="Any prior board / license actions?"
                value={survey.board_action_history}
              />
              <Area
                name="malpractice_explanation"
                label="Malpractice — explanation (if any)"
                value={survey.malpractice_explanation}
                placeholder="Context for any disclosed claims"
              />
              <Area
                name="board_action_explanation"
                label="Board action — explanation (if any)"
                value={survey.board_action_explanation}
                placeholder="Context for any disclosed actions"
              />
              <YesNo
                name="criminal_history"
                label="Any criminal history to disclose?"
                value={survey.criminal_history}
              />
              <Area
                name="criminal_explanation"
                label="Criminal history — explanation (if any)"
                value={survey.criminal_explanation}
                placeholder="Context for any disclosed matters"
              />
            </div>
            <div className="alert alert-info" style={{ marginTop: 6 }}>
              Disclosures are verified separately during credentialing. The
              clinician attests to their accuracy on each state board&apos;s own
              application form.
            </div>
          </div>
        </div>

        {/* ── Navigation + save ─────────────────────────────────── */}
        <div
          className="row"
          style={{
            gap: 10,
            flexWrap: "wrap",
            padding: "14px 18px",
            borderTop: "1px solid var(--line)",
          }}
        >
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            ← Back
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setStep((s) => Math.min(last, s + 1))}
            disabled={step === last}
          >
            Next →
          </button>
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>
            Saving stores every step.
          </span>
          <button type="submit" className="btn btn-primary btn-sm">
            Save application
          </button>
        </div>
      </form>
    </div>
  );
}
