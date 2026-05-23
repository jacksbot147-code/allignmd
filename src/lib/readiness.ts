// AlignMD — placement-readiness rollup.
//
// The credentialing packet (src/lib/credentialing.ts) answers "is THIS
// clinician's onboarding paperwork done?" for one provider at a time, on the
// provider detail page's Credentialing tab. This module rolls that exact same
// packet logic up across the whole active roster so a recruiter can answer the
// placement question the market actually cares about: "who can I put in front
// of a facility right now, and who is blocked?"
//
// Credentialing turnaround is the headline bottleneck in clinical staffing —
// a clinician can be a strong match for a job and still not be placeable for
// weeks because the packet is not done. This module surfaces that gap.
//
// Pure — no I/O. The /readiness page does the Supabase reads and passes the
// rows in. It reuses buildPacket / packetProgress / packetGaps / isPacketReady
// verbatim, so the per-provider Credentialing tab and this roster view can
// never drift apart.

import {
  buildPacket,
  packetProgress,
  packetGaps,
  isPacketReady,
  type CredentialingItem,
} from "./credentialing";
import { expiryStatus } from "./credentials";

export type ReadinessTier =
  | "ready"
  | "nearly"
  | "in_progress"
  | "not_started";

// Display + sort order — best-prepared first.
export const READINESS_TIERS: ReadinessTier[] = [
  "ready",
  "nearly",
  "in_progress",
  "not_started",
];

export const READINESS_META: Record<
  ReadinessTier,
  { label: string; tone: string; hint: string }
> = {
  ready: {
    label: "Ready to place",
    tone: "ok",
    hint: "Credentialing packet complete with no expired credential.",
  },
  nearly: {
    label: "Nearly ready",
    tone: "teal",
    hint: "Packet mostly done — only a short list of items remain.",
  },
  in_progress: {
    label: "In progress",
    tone: "warn",
    hint: "Credentialing packet is underway.",
  },
  not_started: {
    label: "Not started",
    tone: "muted",
    hint: "No credentialing-packet items have been worked yet.",
  },
};

/** A provider_credentials row, narrowed to what readiness needs. */
export interface ReadinessCredential {
  expires_on: string | null;
}

export interface ReadinessInput {
  /** This provider's credentialing_items rows (0011). Empty is valid. */
  items: CredentialingItem[];
  /** This provider's provider_credentials rows (0001). Empty is valid. */
  credentials: ReadinessCredential[];
}

export interface ReadinessResult {
  tier: ReadinessTier;
  packetPercent: number; // 0–100
  packetComplete: number;
  packetCountable: number;
  majorGaps: number;
  openGaps: number;
  expiredCredentials: number;
  expiringCredentials: number; // within 90 days, not yet expired
  blocked: boolean; // a major packet gap, or an expired credential
  summary: string; // one-line plain-English status
}

// A packet at or above this completion counts as "nearly ready" (provided no
// major gaps and no expired credentials).
const NEARLY_THRESHOLD = 70;

/**
 * Roll one clinician's credentialing packet + credential expiry into a single
 * placement-readiness verdict. Pure — safe to call in a loop over the roster.
 *
 * Degrades cleanly: pass `items: []` (e.g. when migration 0011 has not been
 * applied) and the clinician simply reads back as "not started" rather than
 * crashing — exactly how the per-provider Credentialing tab behaves.
 */
export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const rows = buildPacket(input.items ?? []);
  const progress = packetProgress(rows);
  const gaps = packetGaps(rows);
  const majorGaps = gaps.filter((g) => g.severity === "major").length;

  let expired = 0;
  let expiring = 0;
  for (const c of input.credentials ?? []) {
    const s = expiryStatus(c.expires_on);
    if (s === "expired") expired++;
    else if (s.startsWith("expiring")) expiring++;
  }

  const packetReady = isPacketReady(rows);
  const blocked = majorGaps > 0 || expired > 0;

  let tier: ReadinessTier;
  if (packetReady && expired === 0) {
    tier = "ready";
  } else if (
    progress.percent >= NEARLY_THRESHOLD &&
    majorGaps === 0 &&
    expired === 0
  ) {
    tier = "nearly";
  } else if (progress.complete > 0 || progress.inProgress > 0) {
    tier = "in_progress";
  } else {
    tier = "not_started";
  }

  return {
    tier,
    packetPercent: progress.percent,
    packetComplete: progress.complete,
    packetCountable: progress.countable,
    majorGaps,
    openGaps: gaps.length,
    expiredCredentials: expired,
    expiringCredentials: expiring,
    blocked,
    summary: summarize(
      tier,
      progress.complete,
      progress.countable,
      majorGaps,
      expired,
      expiring,
    ),
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function summarize(
  tier: ReadinessTier,
  complete: number,
  countable: number,
  majorGaps: number,
  expired: number,
  expiring: number,
): string {
  const parts: string[] = [];
  if (tier === "ready") {
    parts.push("Credentialing packet complete");
  } else {
    parts.push(`${complete} of ${countable} packet items complete`);
  }
  if (majorGaps > 0) parts.push(`${plural(majorGaps, "major gap")}`);
  if (expired > 0) {
    parts.push(`${plural(expired, "expired credential")}`);
  } else if (expiring > 0) {
    parts.push(`${plural(expiring, "credential")} expiring soon`);
  }
  return parts.join(" · ") + ".";
}
