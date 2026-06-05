// AlignMD — Today's-submissions digest.
//
// The opportunities engine (src/lib/opportunities.ts) crosses the match score
// (match.ts) with the readiness verdict (readiness.ts) into a per-(job,
// clinician) opportunity state. /opportunities lists those leads job by job,
// which is the right view when the recruiter is working a specific role.
//
// The question the recruiter starts the *day* with is different: "across all
// 70 open jobs, who do I submit first this morning, and to which role?"
// Healthcare desks now manage 70 open roles on average; a job-by-job board
// makes that pile feel infinite. This module pivots the same opportunity
// pairs into a flat, score-ranked recruiter to-do list — one row per
// clinician, with the strongest submit-ready job they fit. A parallel chase
// list surfaces clinicians the desk is leaving on the table because a
// credentialing gap is blocking placement.
//
// Pure — no I/O. The /today page does the Supabase reads, computes every
// (provider, job) opportunity exactly like /opportunities does, and passes
// the flat list in here.

import type { MatchResult } from "./match";
import type { ReadinessResult } from "./readiness";
import type { OpportunityState } from "./opportunities";
import { opportunityRank } from "./opportunities";

/** A single (provider, job) opportunity, already classified. */
export interface OpportunityEntry {
  providerId: string;
  providerName: string;
  providerRole: string | null;
  providerSpecialty: string | null;
  jobId: string;
  jobTitle: string;
  facilityName: string | null;
  facilityState: string | null;
  match: MatchResult;
  readiness: ReadinessResult;
  state: OpportunityState;
}

/** A clinician's top opportunity row in the digest, plus the rest as context. */
export interface DigestRow {
  providerId: string;
  providerName: string;
  providerRole: string | null;
  providerSpecialty: string | null;
  top: OpportunityEntry;
  /** Other matches in the same state — count is the headline, list is for drill. */
  others: OpportunityEntry[];
}

export interface TodayDigest {
  /** Submit-ready leads, dedup'd to one row per clinician. Most actionable first. */
  topPicks: DigestRow[];
  /** Matched clinicians blocked on credentialing — chase these to unblock. */
  chaseList: DigestRow[];
  /** Counts before dedupe — useful for KPIs and the "+N more" footer. */
  totals: {
    submitReadyPairs: number;
    inProgressPairs: number;
    blockedPairs: number;
    cliniciansWithSubmitReady: number;
    cliniciansBlocked: number;
    strongSubmitReady: number;
  };
}

/**
 * Sort the top-picks list: strongest match first; on a tie, the most-complete
 * packet first (a 100% packet beats a 95% one for "submit today"); finally by
 * name for a stable order.
 */
function compareTopPicks(a: OpportunityEntry, b: OpportunityEntry): number {
  const byScore = b.match.score - a.match.score;
  if (byScore !== 0) return byScore;
  const byPacket = b.readiness.packetPercent - a.readiness.packetPercent;
  if (byPacket !== 0) return byPacket;
  return a.providerName.localeCompare(b.providerName);
}

/**
 * Sort the chase list: the closest-to-ready first (highest packet %) so the
 * desk works the cheapest unblocks today; ties resolve by stronger match and
 * then name.
 */
function compareChase(a: OpportunityEntry, b: OpportunityEntry): number {
  const byPacket = b.readiness.packetPercent - a.readiness.packetPercent;
  if (byPacket !== 0) return byPacket;
  const byScore = b.match.score - a.match.score;
  if (byScore !== 0) return byScore;
  return a.providerName.localeCompare(b.providerName);
}

/**
 * Group every opportunity in `entries` by clinician within the given state,
 * picking the strongest entry per clinician as the digest row's `top`. The
 * remaining entries in that state are kept on `others` so the page can show
 * "+N more roles" without re-querying. The state argument selects which
 * opportunity band populates the digest (`submit_now` for top picks,
 * `blocked` for the chase list).
 */
function digestForState(
  entries: OpportunityEntry[],
  state: OpportunityState,
  rank: (a: OpportunityEntry, b: OpportunityEntry) => number,
): DigestRow[] {
  const byProvider = new Map<string, OpportunityEntry[]>();
  for (const e of entries) {
    if (e.state !== state) continue;
    const list = byProvider.get(e.providerId) ?? [];
    list.push(e);
    byProvider.set(e.providerId, list);
  }
  const rows: DigestRow[] = [];
  byProvider.forEach((list) => {
    const sorted = [...list].sort(rank);
    const top = sorted[0];
    rows.push({
      providerId: top.providerId,
      providerName: top.providerName,
      providerRole: top.providerRole,
      providerSpecialty: top.providerSpecialty,
      top,
      others: sorted.slice(1),
    });
  });
  rows.sort((a, b) => rank(a.top, b.top));
  return rows;
}

/**
 * Pivot a flat list of (provider, job) opportunities into the recruiter's
 * "today" digest — one ranked clinician list to submit, one ranked clinician
 * list to chase.
 *
 * Pure — pass the same entries the /opportunities page already computes.
 */
export function buildTodayDigest(entries: OpportunityEntry[]): TodayDigest {
  const topPicks = digestForState(entries, "submit_now", compareTopPicks);
  const chaseList = digestForState(entries, "blocked", compareChase);

  let submitReady = 0;
  let inProgress = 0;
  let blocked = 0;
  let strongSubmitReady = 0;
  for (const e of entries) {
    if (e.state === "submit_now") {
      submitReady++;
      if (e.match.tier === "strong") strongSubmitReady++;
    } else if (e.state === "in_progress") {
      inProgress++;
    } else if (e.state === "blocked") {
      blocked++;
    }
  }

  return {
    topPicks,
    chaseList,
    totals: {
      submitReadyPairs: submitReady,
      inProgressPairs: inProgress,
      blockedPairs: blocked,
      cliniciansWithSubmitReady: topPicks.length,
      cliniciansBlocked: chaseList.length,
      strongSubmitReady,
    },
  };
}

/** Convenience: sort rank of an opportunity state, re-exported from opportunities. */
export { opportunityRank };
