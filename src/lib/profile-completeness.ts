// AlignMD — clinician profile completeness.
//
// The customer asked for the product to be "more focused on the provider
// end." A clinician with a fuller profile gets sharper matches and a faster
// placement — but they need to know what is still missing. This module scores
// a clinician's profile against the fields the match engine and recruiters
// actually use, and turns every gap into a specific, actionable nudge.
//
// Pure — no I/O. The portal home passes the signed-in clinician's provider
// row plus a couple of related counts; the widget renders the result.

import type { Provider } from "./types";

export interface CompletenessInput {
  provider: Provider;
  availabilityCount: number;
  documentCount: number;
}

// One scored profile field. `done` is whether it is filled in; when it is
// not, `nudge` is the specific thing to do and `href` is where to do it.
export interface CompletenessField {
  key: string;
  label: string;
  done: boolean;
  nudge: string;
  href: string;
}

export interface ProfileCompleteness {
  fields: CompletenessField[];
  done: number;
  total: number;
  percent: number; // done / total, 0–100 rounded
  missing: CompletenessField[]; // fields still to complete, in display order
  complete: boolean; // every field done
}

const PROFILE = "/clinician/profile";
const AVAILABILITY = "/clinician/availability";
const DOCUMENTS = "/clinician/documents";

/** True for a non-null value that is not an empty / whitespace-only string. */
function filled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

/**
 * Score a clinician's profile. Each field counts equally toward the percent.
 * full_name is required at the database level (never empty) so it is not
 * scored — every field here is something the clinician can act on. Optional
 * fields (subspecialty, travel radius, telehealth) are intentionally left out
 * so a clinician is never nudged toward something that may not apply to them.
 */
export function profileCompleteness(
  input: CompletenessInput,
): ProfileCompleteness {
  const p = input.provider;

  const fields: CompletenessField[] = [
    {
      key: "clinician_role",
      label: "Clinician role",
      done: filled(p.clinician_role),
      nudge:
        "Add your clinician role so recruiters can match you to the right openings.",
      href: PROFILE,
    },
    {
      key: "specialty",
      label: "Specialty",
      done: filled(p.specialty),
      nudge:
        "Add your primary specialty — it is one of the biggest factors in your match score.",
      href: PROFILE,
    },
    {
      key: "years_experience",
      label: "Years of experience",
      done: p.years_experience != null,
      nudge:
        "Add your years of experience so facilities can see your seniority.",
      href: PROFILE,
    },
    {
      key: "npi",
      label: "NPI number",
      done: filled(p.npi),
      nudge: "Add your 10-digit NPI — credentialing cannot move without it.",
      href: PROFILE,
    },
    {
      key: "languages",
      label: "Languages",
      done: Array.isArray(p.languages) && p.languages.length > 0,
      nudge: "List the languages you speak — it widens the roles you fit.",
      href: PROFILE,
    },
    {
      key: "available_start",
      label: "Available-from date",
      done: filled(p.available_start),
      nudge:
        "Set the date you are available from so recruiters know your timeline.",
      href: PROFILE,
    },
    {
      key: "availability",
      label: "Availability blocks",
      done: input.availabilityCount > 0,
      nudge:
        "Add at least one availability block — shift and date ranges sharpen every match.",
      href: AVAILABILITY,
    },
    {
      key: "documents",
      label: "Documents",
      done: input.documentCount > 0,
      nudge: "Upload your CV — it speeds up credentialing and submissions.",
      href: DOCUMENTS,
    },
  ];

  const done = fields.filter((f) => f.done).length;
  const total = fields.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const missing = fields.filter((f) => !f.done);
  return {
    fields,
    done,
    total,
    percent,
    missing,
    complete: missing.length === 0,
  };
}
