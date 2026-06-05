// AlignMD — placement-opportunity classification.
//
// The match engine (src/lib/match.ts) answers "how well does this clinician
// fit this job?" The readiness engine (src/lib/readiness.ts) answers "is this
// clinician's credentialing packet done — can we actually place them?" Neither
// answers the question a recruiter starts the day with: "which of my open jobs
// can I fill RIGHT NOW, and who do I submit?"
//
// This module crosses the two. A clinician who is a real match for an open job
// AND is credentialing-ready is a lead that should be actioned today; a real
// match who is blocked on credentialing is a placement the desk is leaving on
// the table — and a credentialing gap worth chasing. Credentialing turnaround
// is the headline bottleneck in clinical staffing, so the "blocked" count is
// the number that turns a vague backlog into a specific work list.
//
// Pure — no I/O. The /opportunities page does the Supabase reads, scores the
// match + readiness for each clinician, and hands the results here.

import type { MatchTier } from "./match";
import type { ReadinessResult } from "./readiness";

export type OpportunityState = "submit_now" | "in_progress" | "blocked";

// Display + sort order — most actionable first.
export const OPPORTUNITY_ORDER: OpportunityState[] = [
  "submit_now",
  "in_progress",
  "blocked",
];

export const OPPORTUNITY_META: Record<
  OpportunityState,
  { label: string; tone: string; hint: string }
> = {
  submit_now: {
    label: "Ready to submit",
    tone: "ok",
    hint: "A strong or fair match whose credentialing packet is complete — submit today.",
  },
  in_progress: {
    label: "Credentialing underway",
    tone: "warn",
    hint: "A real match whose credentialing packet is still being worked.",
  },
  blocked: {
    label: "Blocked on credentialing",
    tone: "danger",
    hint: "A real match held back by a major packet gap or an expired credential.",
  },
};

// A clinician only counts as an "opportunity" for a job when the match is at
// least a fair fit — surfacing a stretch or a long shot is noise, not a lead.
const OPPORTUNITY_TIERS: MatchTier[] = ["strong", "fair"];

/** True when a match tier is good enough to treat as a real placement lead. */
export function isOpportunityMatch(tier: MatchTier): boolean {
  return OPPORTUNITY_TIERS.includes(tier);
}

/**
 * Classify one clinician's credentialing readiness into an actionable
 * opportunity state, for a clinician already known to be a real match.
 *
 * The three states are mutually exclusive: `computeReadiness` only reports
 * `tier === "ready"` when the packet is complete with no expired credential,
 * and only sets `blocked` on a major gap or an expired credential.
 */
export function classifyOpportunity(
  readiness: ReadinessResult,
): OpportunityState {
  if (readiness.blocked) return "blocked";
  if (readiness.tier === "ready") return "submit_now";
  return "in_progress";
}

/** Sort rank for an opportunity state — lower is more actionable. */
export function opportunityRank(state: OpportunityState): number {
  return OPPORTUNITY_ORDER.indexOf(state);
}
