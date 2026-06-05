// AlignMD — Per-requisition health classification.
//
// The pipeline-aging engine (src/lib/pipeline-aging.ts) answers "which
// clinician cards have sat too long in their stage?" — a card-side lens.
// The opportunities engine (src/lib/opportunities.ts) answers "for one
// open job, who can the desk submit today?" — a candidate-side lens.
// Neither answers the question a recruiting lead starts the week with:
// "across all my open jobs, which requisitions are at risk of NOT being
// filled — which jobs need intervention, and which are healthy?"
//
// Healthcare time-to-fill for an experienced RN averages 80–109 days
// (94 days mean, per the 2026 benchmark research carried in the agent
// log). 2026 ATS guidance ("job aging dashboards that project hiring
// demand using historical time-to-fill, current attrition, and open
// requisitions") names per-requisition health — days open crossed with
// pipeline depth and opportunity supply — as the differentiator
// separating an ATS-as-database from an ATS-as-operations-tool. This
// module rolls those three signals into a single verdict per job.
//
// Pure — no I/O. The /jobs/health page does the Supabase reads, runs
// `scoreMatch` + `computeReadiness` + `classifyOpportunity` exactly the
// same way `/opportunities` does, and hands the resulting per-job
// counts here. Reusing the same engines guarantees the health verdict
// and the opportunities board can never drift.

import type { PipelineStage } from "./types";
import { STAGE_SLA_DAYS } from "./pipeline-aging";

/**
 * Health bands, worst-first. The order is also the rendering / sort
 * order on `/jobs/health` — at-risk jobs surface to the top so the
 * recruiter sees what needs intervention before they see what is
 * already moving.
 */
export type JobHealthState = "at_risk" | "watch" | "on_track" | "filled";

export const JOB_HEALTH_ORDER: JobHealthState[] = [
  "at_risk",
  "watch",
  "on_track",
  "filled",
];

export const JOB_HEALTH_META: Record<
  JobHealthState,
  { label: string; tone: string; hint: string }
> = {
  at_risk: {
    label: "At risk",
    tone: "danger",
    hint: "Open past the at-risk threshold or no matched candidates — needs sourcing or a scope conversation.",
  },
  watch: {
    label: "Watch",
    tone: "warn",
    hint: "Aging and pipeline is shallow — bring in more candidates before this becomes at-risk.",
  },
  on_track: {
    label: "On track",
    tone: "ok",
    hint: "Has submit-ready leads or active in-pipeline candidates.",
  },
  filled: {
    label: "Filled",
    tone: "muted",
    hint: "A clinician has already been placed on this requisition.",
  },
};

/**
 * Calibrated aging thresholds for healthcare requisitions. The 2026
 * benchmark for an experienced RN is ~80–109 days to start (mean 94),
 * with the median platform fill running 24 days. We deliberately pick
 * a watch threshold well below the mean so an at-risk verdict actually
 * means "this job is in the slow half" — not "this job has hit the
 * national average and is therefore beyond saving."
 *
 *  - watch:    30+ days open
 *  - at_risk:  60+ days open (still inside the 80-day benchmark, but
 *              clearly in the slow tail without intervention)
 */
export const JOB_AGING_WATCH_DAYS = 30;
export const JOB_AGING_AT_RISK_DAYS = 60;

/**
 * Submissions in these stages count as a live, in-pipeline candidate
 * — i.e. the desk has movement on this job and it is not just sitting.
 * `new` and `screen` are intentionally excluded: those are the desk's
 * own intake stages, and a job with only `new`/`screen` cards is still
 * a job where nothing has actually been submitted yet.
 *
 * `placed` is handled separately as the filled flag.
 */
export const IN_PIPELINE_STAGES: PipelineStage[] = [
  "credentialing",
  "submitted",
  "interview",
  "offer",
];

const MS_PER_DAY = 86_400_000;

/** Whole-day age. Returns `null` for missing or unparseable timestamps. */
export function daysOpen(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / MS_PER_DAY));
}

/** Inputs the engine needs to score one open job. */
export interface JobHealthInput {
  /** Days since the requisition was opened. `null` if missing. */
  ageDays: number | null;
  /** Total submissions on this job, any stage. */
  submissionsTotal: number;
  /** Submissions in `credentialing`, `submitted`, `interview`, or `offer`. */
  submissionsActive: number;
  /** Submissions at the `placed` terminal stage. */
  submissionsPlaced: number;
  /** Submit-ready leads (from the opportunities engine). */
  submitReadyOpportunities: number;
  /** In-progress (credentialing-underway) leads. */
  inProgressOpportunities: number;
  /** Blocked-on-credentialing leads. */
  blockedOpportunities: number;
}

export interface JobHealthVerdict {
  state: JobHealthState;
  /** One-line plain-English explanation for the hover tooltip. */
  reason: string;
  /** True when no fair-or-better match exists on the roster at all. */
  noSupply: boolean;
}

/**
 * Classify one open job into a health verdict. The decision tree, in
 * order:
 *
 *  1. `placed` submission present → `filled`
 *  2. has an active in-pipeline submission OR has a submit-ready lead
 *     queued → `on_track` (regardless of age — movement is the cure)
 *  3. age ≥ at-risk threshold OR no fair-or-better match on the
 *     roster → `at_risk` (this is the requisition the desk needs to
 *     intervene on)
 *  4. age ≥ watch threshold with a shallow pipeline → `watch`
 *  5. otherwise → `on_track` (fresh — no signal of trouble yet)
 *
 * The decision order matters: a 90-day-old job with an interview
 * scheduled is on_track, not at_risk. A 10-day-old job with no roster
 * match at all is at_risk (no_supply), not on_track. Movement
 * dominates age; absence of supply dominates youth.
 */
export function classifyJobHealth(input: JobHealthInput): JobHealthVerdict {
  const noSupply =
    input.submitReadyOpportunities === 0 &&
    input.inProgressOpportunities === 0 &&
    input.blockedOpportunities === 0;

  if (input.submissionsPlaced > 0) {
    return { state: "filled", reason: "A clinician has been placed.", noSupply };
  }

  const hasMovement =
    input.submissionsActive > 0 || input.submitReadyOpportunities > 0;

  if (hasMovement) {
    const why =
      input.submissionsActive > 0
        ? `${input.submissionsActive} candidate${
            input.submissionsActive === 1 ? "" : "s"
          } in the pipeline.`
        : `${input.submitReadyOpportunities} submit-ready lead${
            input.submitReadyOpportunities === 1 ? "" : "s"
          } queued.`;
    return { state: "on_track", reason: why, noSupply };
  }

  if (noSupply) {
    return {
      state: "at_risk",
      reason: "No clinician on the roster matches this role yet.",
      noSupply,
    };
  }

  if (input.ageDays !== null && input.ageDays >= JOB_AGING_AT_RISK_DAYS) {
    return {
      state: "at_risk",
      reason: `Open ${input.ageDays} days — past the ${JOB_AGING_AT_RISK_DAYS}-day at-risk threshold with no in-pipeline candidate.`,
      noSupply,
    };
  }

  if (input.ageDays !== null && input.ageDays >= JOB_AGING_WATCH_DAYS) {
    return {
      state: "watch",
      reason: `Open ${input.ageDays} days with a shallow pipeline — bring in more candidates.`,
      noSupply,
    };
  }

  return {
    state: "on_track",
    reason: "Fresh requisition — no trouble signal yet.",
    noSupply,
  };
}

/** Summary roll-up the page's KPI strip renders. */
export interface JobHealthSummary {
  total: number;
  atRisk: number;
  watch: number;
  onTrack: number;
  filled: number;
  /** Jobs with no fair-or-better match on the roster at all. */
  noSupply: number;
  /** Oldest unfilled (non-`placed`) job's age in days. */
  oldestUnfilledDays: number;
}

export function summarizeJobHealth(
  verdicts: { state: JobHealthState; noSupply: boolean; ageDays: number | null }[],
): JobHealthSummary {
  let atRisk = 0;
  let watch = 0;
  let onTrack = 0;
  let filled = 0;
  let noSupply = 0;
  let oldestUnfilledDays = 0;
  for (const v of verdicts) {
    if (v.state === "at_risk") atRisk += 1;
    else if (v.state === "watch") watch += 1;
    else if (v.state === "on_track") onTrack += 1;
    else filled += 1;
    if (v.noSupply) noSupply += 1;
    if (v.state !== "filled" && v.ageDays !== null && v.ageDays > oldestUnfilledDays) {
      oldestUnfilledDays = v.ageDays;
    }
  }
  return {
    total: verdicts.length,
    atRisk,
    watch,
    onTrack,
    filled,
    noSupply,
    oldestUnfilledDays,
  };
}

/** Sort rank — lower is more actionable. */
export function jobHealthRank(state: JobHealthState): number {
  return JOB_HEALTH_ORDER.indexOf(state);
}

/** Filter chip definitions used by the page toolbar. */
export const JOB_HEALTH_FILTERS = [
  { key: "all", label: "All open" } as const,
  { key: "at_risk", label: "At risk" } as const,
  { key: "watch", label: "Watch" } as const,
  { key: "on_track", label: "On track" } as const,
];

export type JobHealthFilter = (typeof JOB_HEALTH_FILTERS)[number]["key"];

/** True when a verdict passes the given filter band. */
export function passesJobHealthFilter(
  state: JobHealthState,
  filter: JobHealthFilter,
): boolean {
  if (filter === "all") return state !== "filled";
  return state === filter;
}

/**
 * Inputs the lightweight classifier needs — strictly the signals the
 * morning-briefing dashboard already has in hand. No matched-candidate
 * fields: this classifier deliberately skips the (job × provider)
 * opportunities cross-product so it can run on every dashboard render
 * without the cost of `scoreMatch` / `computeReadiness` /
 * `classifyOpportunity` per pair.
 */
export interface JobHealthLiteInput {
  ageDays: number | null;
  submissionsTotal: number;
  submissionsActive: number;
  submissionsPlaced: number;
}

export interface JobHealthLiteVerdict {
  state: JobHealthState;
  reason: string;
}

/**
 * Lightweight job-health classifier — age + pipeline depth only.
 *
 * The full `classifyJobHealth` engine also crosses every open job with
 * every active provider through `scoreMatch` + `computeReadiness` +
 * `classifyOpportunity` to flag "no roster match at all" as at-risk and
 * a "submit-ready lead queued" as on-track. That is the right model on
 * `/jobs/health`, but it is too heavy to run on the dashboard, which
 * renders on every recruiter pageview. This classifier is the cheaper
 * subset:
 *
 *  - placed submission present → `filled`
 *  - active in-pipeline submission → `on_track`
 *  - age ≥ at-risk threshold with no in-pipeline candidate → `at_risk`
 *  - age ≥ watch threshold with no in-pipeline candidate → `watch`
 *  - otherwise → `on_track` (fresh, no trouble signal yet)
 *
 * It is always consistent with `classifyJobHealth` *when* movement
 * exists (active submissions short-circuit both engines to on_track)
 * or when age forces a verdict at/past the same thresholds. The two
 * can disagree on the no-supply path: a fresh job with no roster match
 * reads as on_track here but at_risk on `/jobs/health` (which checked
 * the roster). The dashboard widget that uses this engine treats the
 * full board at `/jobs/health` as the canonical view and links there.
 */
export function classifyJobHealthLite(
  input: JobHealthLiteInput,
): JobHealthLiteVerdict {
  if (input.submissionsPlaced > 0) {
    return { state: "filled", reason: "A clinician has been placed." };
  }
  if (input.submissionsActive > 0) {
    const n = input.submissionsActive;
    return {
      state: "on_track",
      reason: `${n} candidate${n === 1 ? "" : "s"} in the pipeline.`,
    };
  }
  if (input.ageDays !== null && input.ageDays >= JOB_AGING_AT_RISK_DAYS) {
    return {
      state: "at_risk",
      reason: `Open ${input.ageDays} days with no in-pipeline candidate — past the ${JOB_AGING_AT_RISK_DAYS}-day at-risk threshold.`,
    };
  }
  if (input.ageDays !== null && input.ageDays >= JOB_AGING_WATCH_DAYS) {
    return {
      state: "watch",
      reason: `Open ${input.ageDays} days with a shallow pipeline — bring in more candidates.`,
    };
  }
  return {
    state: "on_track",
    reason: "Fresh requisition — no trouble signal yet.",
  };
}

// ── Per-job time-to-fill projection ─────────────────────────────────────
//
// Where `classifyJobHealth` answers "is this requisition at risk?", the
// projection answers the next question: "*when* will it fill?" This gives
// the recruiter a calendar prediction they can communicate to the facility,
// mirroring the framing 2026 ATS analytics ship (TargetRecruit's "providers
// at risk of hitting their start date", Bullhorn's predictive workforce
// planning, viva-it's "forecast time to fill"). It is also the bridge
// between pipeline-side aging (per-stage SLAs in `pipeline-aging.ts`) and
// the job-side question this module otherwise answers — using the same
// `STAGE_SLA_DAYS` constants so the projection and the stale-card flagging
// can never disagree on a stage's expected dwell time.
//
// The projection is deliberately *coarse* — it is a planning estimate, not
// a guarantee, and the `confidence` band makes that explicit:
//
//   high    — there is a real active submission and we can roll forward
//             along the remaining SLA chain from its current stage.
//   medium  — there is a submit-ready lead (credentialing complete) but
//             no active submission yet; assume the desk submits today and
//             the full submitted→placed SLA chain follows.
//   low     — there are only in-progress leads (credentialing underway);
//             use the 2026 credentialing turnaround median (~75 days, in
//             the middle of the 60–90 day documented range) plus the full
//             submitted→placed chain.
//   unknown — only blocked / no-supply leads, or already filled handled
//             elsewhere. The desk needs to source or unblock before any
//             projection is meaningful.
//
// The 75-day median comes from the same 2026 research carried in the
// agent log: drcredentialing 2026 puts the average at 90–120 days,
// atlassystems / mbwrcm / Verisys put it at 60–90 days, Medicare 60–90,
// commercial 90–120. We pick 75 as a conservative middle so the projection
// is a real plan number rather than a worst-case alarm bell.

/** 2026-research-backed credentialing turnaround median, in days. */
export const CREDENTIALING_MEDIAN_DAYS = 75;

/**
 * Stages a submission moves through on the way to placement, in order.
 * `new` and `screen` are intake-side stages handled before submission; the
 * projection model only kicks in once a candidate has been credentialed
 * and submitted. `placed` is the terminal state — the goal of the chain.
 */
export const FORWARD_STAGES: PipelineStage[] = [
  "credentialing",
  "submitted",
  "interview",
  "offer",
];

/** Rank from earliest (0) to latest (3) along the forward chain. */
export function forwardStageRank(stage: PipelineStage): number {
  const i = FORWARD_STAGES.indexOf(stage);
  return i === -1 ? -1 : i;
}

/**
 * Pick the most-advanced active in-pipeline submission from a list — the
 * one whose remaining SLA budget defines how soon this job can fill. A
 * submission already at `offer` wins over one still at `credentialing`,
 * etc. Ties on stage break to the *oldest in stage* (closest to crossing).
 */
export function mostAdvancedActive<
  T extends { stage: PipelineStage; updatedAt: string | null },
>(subs: T[]): T | null {
  let best: T | null = null;
  let bestRank = -1;
  let bestDays = -1;
  const now = Date.now();
  for (const s of subs) {
    const r = forwardStageRank(s.stage);
    if (r < 0) continue;
    const ts = s.updatedAt ? new Date(s.updatedAt).getTime() : NaN;
    const d = Number.isFinite(ts)
      ? Math.max(0, Math.floor((now - ts) / 86_400_000))
      : 0;
    if (r > bestRank || (r === bestRank && d > bestDays)) {
      best = s;
      bestRank = r;
      bestDays = d;
    }
  }
  return best;
}

export type ProjectionConfidence = "high" | "medium" | "low" | "unknown";

export interface ProjectionInput {
  /** True if a `placed` submission already exists — the job is filled. */
  filled: boolean;
  /**
   * Most-advanced active in-pipeline submission's stage, or `null` if the
   * job has no active submission yet. Must be one of `FORWARD_STAGES`.
   */
  mostAdvancedActiveStage: PipelineStage | null;
  /**
   * Whole days that submission has spent in its current stage. The page
   * derives this from `submissions.updated_at`, mirroring the proxy
   * `pipeline-aging.ts` uses for `providers.updated_at`. `null` if
   * unknown — the engine treats it as 0 days consumed.
   */
  daysInCurrentStage: number | null;
  /** Submit-ready leads from the opportunities engine (credentialing complete). */
  submitReadyCount: number;
  /** In-progress leads (credentialing underway). */
  inProgressCount: number;
  /** Blocked-on-credentialing leads. */
  blockedCount: number;
}

export interface ProjectionVerdict {
  /**
   * Whole days from "today" to projected placement. `null` when no
   * projection can be made — i.e. the desk needs to source or unblock
   * before a calendar date is meaningful.
   */
  daysToFill: number | null;
  confidence: ProjectionConfidence;
  /** Plain-English basis the UI surfaces in the row's tooltip. */
  basis: string;
}

/** Sum of remaining-stage SLA days for stages strictly after `startIdx`. */
function sumStagesAfter(startIdx: number): number {
  let s = 0;
  for (let i = startIdx + 1; i < FORWARD_STAGES.length; i++) {
    const v = STAGE_SLA_DAYS[FORWARD_STAGES[i]];
    if (typeof v === "number") s += v;
  }
  return s;
}

/**
 * Project days-to-fill from the job's current pipeline state. See the
 * module docblock above for the confidence model.
 */
export function projectTimeToFill(input: ProjectionInput): ProjectionVerdict {
  if (input.filled) {
    return { daysToFill: 0, confidence: "high", basis: "Already placed." };
  }

  if (input.mostAdvancedActiveStage) {
    const idx = forwardStageRank(input.mostAdvancedActiveStage);
    if (idx < 0) {
      return {
        daysToFill: null,
        confidence: "unknown",
        basis: "Active submission is in a non-forward stage — no projection model.",
      };
    }
    const currentSla = STAGE_SLA_DAYS[input.mostAdvancedActiveStage] ?? 0;
    const consumed = input.daysInCurrentStage ?? 0;
    const remainingInCurrent = Math.max(0, currentSla - consumed);
    const remainingAfter = sumStagesAfter(idx);
    const days = remainingInCurrent + remainingAfter;
    return {
      daysToFill: days,
      confidence: "high",
      basis:
        `In ${input.mostAdvancedActiveStage}${
          input.daysInCurrentStage !== null
            ? ` for ${input.daysInCurrentStage}d`
            : ""
        } — ${days}d projected to placement using per-stage SLAs.`,
    };
  }

  if (input.submitReadyCount > 0) {
    // Assume the desk submits today; the full submitted→placed chain follows.
    const startIdx = forwardStageRank("submitted");
    const days =
      (STAGE_SLA_DAYS["submitted"] ?? 0) + sumStagesAfter(startIdx);
    return {
      daysToFill: days,
      confidence: "medium",
      basis: `${input.submitReadyCount} submit-ready lead${
        input.submitReadyCount === 1 ? "" : "s"
      } queued — ${days}d projected to placement once the desk submits.`,
    };
  }

  if (input.inProgressCount > 0) {
    // Credentialing turnaround + the full submitted→placed chain.
    const startIdx = forwardStageRank("submitted");
    const downstream =
      (STAGE_SLA_DAYS["submitted"] ?? 0) + sumStagesAfter(startIdx);
    const days = CREDENTIALING_MEDIAN_DAYS + downstream;
    return {
      daysToFill: days,
      confidence: "low",
      basis: `${input.inProgressCount} lead${
        input.inProgressCount === 1 ? "" : "s"
      } in credentialing — ~${days}d projected using the ${CREDENTIALING_MEDIAN_DAYS}-day credentialing median.`,
    };
  }

  return {
    daysToFill: null,
    confidence: "unknown",
    basis:
      input.blockedCount > 0
        ? `${input.blockedCount} blocked lead${
            input.blockedCount === 1 ? "" : "s"
          } — needs unblocking before a start date can be projected.`
        : "No matched candidate — needs sourcing before a start date can be projected.",
  };
}

/**
 * Translate a `daysToFill` count into a calendar date `n` days from `now`.
 * Returns `null` if `daysToFill` is `null`. Pure — the page formats with
 * `fmtDate` after.
 */
export function projectedStartDate(
  daysToFill: number | null,
  now: Date = new Date(),
): Date | null {
  if (daysToFill === null) return null;
  return new Date(now.getTime() + daysToFill * 86_400_000);
}

export const PROJECTION_CONFIDENCE_META: Record<
  ProjectionConfidence,
  { label: string; tone: string; hint: string }
> = {
  high: {
    label: "High",
    tone: "ok",
    hint: "Real active submission — rolling forward along the remaining stage SLAs.",
  },
  medium: {
    label: "Medium",
    tone: "teal",
    hint: "Submit-ready lead queued — assumes the desk submits today.",
  },
  low: {
    label: "Low",
    tone: "warn",
    hint: "Only credentialing-underway leads — projection uses the 75-day credentialing median.",
  },
  unknown: {
    label: "—",
    tone: "muted",
    hint: "No projection — needs sourcing or unblocking first.",
  },
};
