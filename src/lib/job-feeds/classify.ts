// AlignMD — pure classifiers for raw job-feed text.
//
// Job boards rarely tag a posting with a discrete clinician role, US state, or
// engagement type, so we infer them from the title/description/location with
// keyword heuristics. These are deliberately conservative — when in doubt they
// return null and the row simply carries less metadata.

import type { ProviderRole } from "@/lib/types";

// Every value classifyRole may return is a member of the Postgres provider_role
// enum. Anything else would break the upsert, so the keyword table is keyed by
// these exact strings only.
const ROLE_KEYWORDS: { role: ProviderRole; needles: string[] }[] = [
  { role: "CRNA", needles: ["nurse anesthetist", "crna"] },
  { role: "NP", needles: ["nurse practitioner", " np ", " np,", " np.", "np-c", "aprn", "advanced practice"] },
  { role: "PA", needles: ["physician assistant", "physician associate", "pa-c", " pa ", " pa,", " pa."] },
  { role: "PT", needles: ["physical therap"] },
  { role: "OT", needles: ["occupational therap"] },
  { role: "SLP", needles: ["speech", "slp", "speech-language patholog"] },
  { role: "DO", needles: ["osteopathic", " do ", "d.o."] },
  { role: "MD", needles: ["physician", "hospitalist", " md ", "m.d.", "doctor of medicine"] },
];

/**
 * Infer a clinician role from a posting's title (and optionally its body).
 * Returns a provider_role enum value or null — never any other string.
 */
export function classifyRole(
  title: string,
  description?: string | null,
): ProviderRole | null {
  // Pad with spaces so the " np "-style word-boundary needles can match at
  // the very start / end of the text.
  const hay = ` ${(title || "")} ${(description || "")} `.toLowerCase();
  for (const { role, needles } of ROLE_KEYWORDS) {
    if (needles.some((n) => hay.includes(n))) return role;
  }
  return null;
}

// US states + DC, by full name → 2-letter code.
const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI",
  idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

const STATE_CODES = new Set(Object.values(US_STATES));

// Match longer names first so "west virginia" resolves to WV before the
// substring "virginia" can grab it as VA.
const STATE_ENTRIES = Object.entries(US_STATES).sort(
  (a, b) => b[0].length - a[0].length,
);

/**
 * Pull a 2-letter US state code out of a free-text location string.
 * Recognizes both full state names and 2-letter codes. Returns null when
 * nothing is found (e.g. a remote-only or non-US posting).
 */
export function parseState(location?: string | null): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();
  // Full-name match — longest names first (see STATE_ENTRIES).
  for (const [name, code] of STATE_ENTRIES) {
    if (lower.includes(name)) return code;
  }
  // 2-letter code match — split on common separators and look for a token.
  const tokens = location.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length === 2 && STATE_CODES.has(t)) return t;
  }
  return null;
}

/**
 * Classify the engagement type from any descriptive text. Returns one of
 * "locum" | "contract" | "permanent", or null when nothing clearly matches.
 */
export function classifyEmploymentType(text: string): string | null {
  const t = (text || "").toLowerCase();
  if (t.includes("locum")) return "locum";
  if (t.includes("travel") || t.includes("contract")) return "contract";
  if (
    t.includes("permanent") ||
    t.includes("full-time") ||
    t.includes("full time")
  ) {
    return "permanent";
  }
  return null;
}

// ── Specialty inference ────────────────────────────────────────────────────
// Job boards almost never tag a posting with a discrete specialty, so we infer
// one from the title (authoritative) and fall back to the description. Every
// value returned is a member of SPECIALTIES (src/lib/constants.ts) so the
// inferred specialty lines up exactly with the values clinicians pick on their
// profile — that string alignment is what lets scoreMatch credit a match.
//
// Ordered most-specific-first: the first table entry whose needle appears in
// the text wins, so e.g. "Hospitalist" is checked before the broader
// "Internal Medicine", and "Critical Care" before "Emergency Medicine".
const SPECIALTY_KEYWORDS: { specialty: string; needles: string[] }[] = [
  {
    specialty: "Emergency Medicine",
    needles: [
      "emergency medicine",
      "emergency department",
      "emergency dept",
      "emergency room",
      "emergency physician",
      " er physician",
      " er np",
      " er pa",
    ],
  },
  {
    specialty: "Critical Care",
    needles: ["critical care", "intensive care", "intensivist", " icu "],
  },
  { specialty: "Hospitalist", needles: ["hospitalist", "hospital medicine"] },
  {
    specialty: "Anesthesiology",
    needles: ["anesthesiolog", "anaesthe", "anesthesia", "nurse anesthet"],
  },
  {
    specialty: "Orthopedic Surgery",
    needles: ["orthopedic", "orthopaedic", " ortho "],
  },
  {
    specialty: "General Surgery",
    needles: ["general surgery", "general surgeon"],
  },
  {
    specialty: "Cardiology",
    needles: ["cardiolog", "cardiac", "cardiovascular"],
  },
  {
    specialty: "Psychiatry",
    needles: [
      "psychiatr",
      "behavioral health",
      "mental health",
      " psych ",
    ],
  },
  {
    specialty: "Pediatrics",
    needles: ["pediatric", "paediatric", " peds ", "neonatal"],
  },
  {
    specialty: "OB/GYN",
    needles: [
      "ob/gyn",
      "ob-gyn",
      "obgyn",
      "obstetric",
      "gynecolog",
      "gynaecolog",
      "women's health",
      "labor and delivery",
      "labor & delivery",
    ],
  },
  { specialty: "Dermatology", needles: ["dermatolog"] },
  { specialty: "Urgent Care", needles: ["urgent care"] },
  {
    specialty: "Internal Medicine",
    needles: ["internal medicine", "internist"],
  },
  {
    specialty: "Family Medicine",
    needles: [
      "family medicine",
      "family practice",
      "family physician",
      "family nurse practitioner",
      "primary care",
      "general practice",
    ],
  },
];

/** Run the keyword table against one block of text. Padded so " icu "-style
 *  word-boundary needles can match at the very start / end. */
function matchSpecialty(text: string): string | null {
  const hay = ` ${(text || "").toLowerCase()} `;
  for (const { specialty, needles } of SPECIALTY_KEYWORDS) {
    if (needles.some((n) => hay.includes(n))) return specialty;
  }
  return null;
}

/**
 * Infer a clinical specialty from a posting. The title is authoritative — it
 * is classified first and, when it yields a specialty, that wins; the body
 * text is only a fallback. Returns a SPECIALTIES value or null (conservative:
 * an un-inferable posting simply carries no specialty rather than a guess).
 */
export function classifySpecialty(
  title: string,
  description?: string | null,
): string | null {
  return matchSpecialty(title) ?? matchSpecialty(description ?? "");
}

/** Strip HTML tags + entities from feed copy and clamp to `max` chars. */
export function stripHtml(html: string | null | undefined, max = 400): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}
