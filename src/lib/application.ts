// AlignMD — intake-application helpers (Phase 3).
// application_responses.payload is free-form jsonb; these helpers give it a
// stable, fully-typed shape for both the survey form and the CV view.

import type {
  ApplicationPayload,
  ApplicationWorkEntry,
  ApplicationEducationEntry,
} from "./types";
import { WORK_SLOTS, EDU_SLOTS } from "./constants";

/** Coerce any jsonb value to a trimmed string. */
function s(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

/** A blank payload — every field present, nothing filled in. */
export function emptyApplicationPayload(): ApplicationPayload {
  return {
    preferred_name: "",
    phone: "",
    email: "",
    current_title: "",
    current_employer: "",
    primary_specialty: "",
    subspecialties: "",
    years_in_practice: "",
    board_certifications: "",
    npi: "",
    languages: "",
    work_history: [],
    education: [],
    reason_for_looking: "",
    assignment_type: "",
    desired_start: "",
    ideal_schedule: "",
    shift_preferences: "",
    willing_to_travel: "",
    travel_states: "",
    license_states_needed: "",
    telehealth_interest: "",
    min_hourly_rate: "",
    malpractice_history: "",
    malpractice_explanation: "",
    license_action_history: "",
    license_action_explanation: "",
    additional_notes: "",
  };
}

function workEntryHasContent(e: ApplicationWorkEntry): boolean {
  return Object.values(e).some((v) => v.trim() !== "");
}

function eduEntryHasContent(e: ApplicationEducationEntry): boolean {
  return Object.values(e).some((v) => v.trim() !== "");
}

function parseWorkHistory(raw: unknown): ApplicationWorkEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const r = (item && typeof item === "object" ? item : {}) as Record<
        string,
        unknown
      >;
      return {
        employer: s(r.employer),
        title: s(r.title),
        location: s(r.location),
        start: s(r.start),
        end: s(r.end),
        summary: s(r.summary),
      };
    })
    .filter(workEntryHasContent)
    .slice(0, WORK_SLOTS);
}

function parseEducation(raw: unknown): ApplicationEducationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const r = (item && typeof item === "object" ? item : {}) as Record<
        string,
        unknown
      >;
      return {
        credential: s(r.credential),
        institution: s(r.institution),
        field: s(r.field),
        year: s(r.year),
      };
    })
    .filter(eduEntryHasContent)
    .slice(0, EDU_SLOTS);
}

/** Merge stored jsonb (or undefined) into a complete, typed payload. */
export function parseApplicationPayload(raw: unknown): ApplicationPayload {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    preferred_name: s(r.preferred_name),
    phone: s(r.phone),
    email: s(r.email),
    current_title: s(r.current_title),
    current_employer: s(r.current_employer),
    primary_specialty: s(r.primary_specialty),
    subspecialties: s(r.subspecialties),
    years_in_practice: s(r.years_in_practice),
    board_certifications: s(r.board_certifications),
    npi: s(r.npi),
    languages: s(r.languages),
    work_history: parseWorkHistory(r.work_history),
    education: parseEducation(r.education),
    reason_for_looking: s(r.reason_for_looking),
    assignment_type: s(r.assignment_type),
    desired_start: s(r.desired_start),
    ideal_schedule: s(r.ideal_schedule),
    shift_preferences: s(r.shift_preferences),
    willing_to_travel: s(r.willing_to_travel),
    travel_states: s(r.travel_states),
    license_states_needed: s(r.license_states_needed),
    telehealth_interest: s(r.telehealth_interest),
    min_hourly_rate: s(r.min_hourly_rate),
    malpractice_history: s(r.malpractice_history),
    malpractice_explanation: s(r.malpractice_explanation),
    license_action_history: s(r.license_action_history),
    license_action_explanation: s(r.license_action_explanation),
    additional_notes: s(r.additional_notes),
  };
}

/**
 * Rough completeness of an application — how many of the survey's key fields
 * the clinician has filled in. Used for a progress hint on the form.
 */
export function applicationProgress(p: ApplicationPayload): {
  filled: number;
  total: number;
  percent: number;
} {
  const keyFields: string[] = [
    p.preferred_name,
    p.phone,
    p.email,
    p.current_title,
    p.primary_specialty,
    p.years_in_practice,
    p.npi,
    p.reason_for_looking,
    p.assignment_type,
    p.desired_start,
    p.ideal_schedule,
    p.malpractice_history,
    p.license_action_history,
  ];
  const total = keyFields.length + 2; // +2 — work history & education
  let filled = keyFields.filter((v) => v.trim() !== "").length;
  if (p.work_history.length > 0) filled += 1;
  if (p.education.length > 0) filled += 1;
  return { filled, total, percent: Math.round((filled / total) * 100) };
}
