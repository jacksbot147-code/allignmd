// AlignMD — server-side form validation.
// The functions here are the real gate; forms also carry lightweight HTML5
// hints. Validation errors are surfaced back to the form via ?error=.

export type FieldErrors = Record<string, string>;

/** US states + DC + territories — two-letter postal codes. */
export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC", "PR", "VI", "GU", "AS", "MP",
];
const STATE_SET = new Set(US_STATES);

export function isValidState(code: string | null | undefined): boolean {
  return !!code && STATE_SET.has(code.trim().toUpperCase());
}

/**
 * Validate a 10-digit NPI with the CMS Luhn check. The NPI check digit is
 * computed over the constant "80840" issuer prefix plus the first 9 digits.
 */
export function isValidNpi(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  const base = "80840" + npi.slice(0, 9);
  let sum = 0;
  let double = true; // the rightmost payload digit is doubled
  for (let i = base.length - 1; i >= 0; i--) {
    let d = base.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === npi.charCodeAt(9) - 48;
}

/** True for a well-formed ISO calendar date (yyyy-mm-dd). */
export function isValidDate(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(s + "T00:00:00").getTime();
  if (Number.isNaN(t)) return false;
  // Reject roll-over (e.g. 2026-02-31 parsing to March).
  return new Date(t).toISOString().slice(0, 10) === s;
}

/** Validate the provider create/edit form. An empty object means valid. */
export function validateProvider(f: {
  full_name?: string | null;
  npi?: string | null;
  ssn_last4?: string | null;
  years_experience?: number | null;
  travel_radius_miles?: number | null;
  available_start?: string | null;
}): FieldErrors {
  const e: FieldErrors = {};

  if (!f.full_name || f.full_name.trim().length < 2) {
    e.full_name = "Full name is required.";
  }
  if (f.npi && !isValidNpi(f.npi)) {
    e.npi = "NPI must be a valid 10-digit number.";
  }
  if (f.ssn_last4 && !/^\d{4}$/.test(f.ssn_last4)) {
    e.ssn_last4 = "SSN (last 4) must be exactly 4 digits.";
  }
  if (
    f.years_experience != null &&
    (f.years_experience < 0 || f.years_experience > 70)
  ) {
    e.years_experience = "Years of experience must be between 0 and 70.";
  }
  if (
    f.travel_radius_miles != null &&
    (f.travel_radius_miles < 0 || f.travel_radius_miles > 5000)
  ) {
    e.travel_radius_miles = "Travel radius must be between 0 and 5000 miles.";
  }
  if (f.available_start && !isValidDate(f.available_start)) {
    e.available_start = "Available-from date is invalid.";
  }
  return e;
}

/** Validate the add-credential form. An empty object means valid. */
export function validateCredential(f: {
  type?: string | null;
  state?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
}): FieldErrors {
  const e: FieldErrors = {};

  if (!f.type) e.type = "Credential type is required.";

  if (f.state && !isValidState(f.state)) {
    e.state = `"${f.state}" is not a valid US state code.`;
  }
  if (f.issued_on && !isValidDate(f.issued_on)) {
    e.issued_on = "Issued-on date is invalid.";
  }
  if (f.expires_on && !isValidDate(f.expires_on)) {
    e.expires_on = "Expiry date is invalid.";
  }
  if (
    isValidDate(f.issued_on) &&
    isValidDate(f.expires_on) &&
    (f.issued_on as string) > (f.expires_on as string)
  ) {
    e.expires_on = "Expiry date can't be before the issue date.";
  }
  return e;
}

/** Validate the add/edit-reference form. An empty object means valid. */
export function validateReference(f: {
  name?: string | null;
}): FieldErrors {
  const e: FieldErrors = {};
  if (!f.name || f.name.trim().length < 2) {
    e.name = "Reference name is required.";
  }
  return e;
}

/**
 * Validate the intake-survey fields that have a strict format. The survey is
 * mostly free-text, so this only guards the few fields that must be well
 * formed — an empty object means valid.
 */
export function validateApplication(f: {
  npi?: string | null;
  email?: string | null;
  desired_start?: string | null;
}): FieldErrors {
  const e: FieldErrors = {};
  if (f.npi && !isValidNpi(f.npi)) {
    e.npi = "Application NPI must be a valid 10-digit number.";
  }
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) {
    e.email = "Application email address looks invalid.";
  }
  if (f.desired_start && !isValidDate(f.desired_start)) {
    e.desired_start = "Desired start date is invalid.";
  }
  return e;
}

/**
 * Validate the strict-format fields of the license-application wizard survey.
 * The survey is mostly free-text, so this guards only the few fields that must
 * be well formed — an empty object means valid.
 */
export function validateLicenseSurvey(f: {
  npi?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
}): FieldErrors {
  const e: FieldErrors = {};
  if (f.npi && !isValidNpi(f.npi)) {
    e.npi = "NPI must be a valid 10-digit number.";
  }
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) {
    e.email = "Email address looks invalid.";
  }
  if (f.date_of_birth && !isValidDate(f.date_of_birth)) {
    e.date_of_birth = "Date of birth is invalid.";
  }
  return e;
}

/** Flatten a FieldErrors map into one human-readable message. */
export function errorSummary(e: FieldErrors): string {
  return Object.values(e).join(" ");
}
