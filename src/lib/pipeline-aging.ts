// AlignMD — Pipeline aging / stale-card classification.
//
// Healthcare desks now manage ~70 open roles per recruiter and 41% of
// recruiters report being overworked; the 2026 SLA guidance is that
// candidate response inside 48 h is a tracked metric and pipelines that
// "sit" beyond a stage's expected dwell time are the single biggest
// hidden cost — submissions silently age past their SLA and the breach
// has already happened by the time a recruiter notices. The cure named
// by every 2026 ATS guide is the same: surface dwell time per card on
// the board itself, so a card that has not moved in N days is flagged
// where the recruiter is already looking.
//
// This module is pure — no I/O. The /pipeline page reads the provider
// rows it already needs (and their `updated_at`) and hands each one to
// `classifyAging`. The aging verdict is then layered onto the existing
// board cards as a small badge, the column headers as a stale count,
// and a KPI strip above the board. Nothing in the existing stage-move
// workflow changes.
//
// We deliberately use `providers.updated_at` as the dwell proxy: the
// existing `changeStage` action stamps `updated_at` on every transition
// (see src/app/(app)/providers/actions.ts → `changeStage`), and any
// other recruiter edit (profile update, archive/restore) also stamps
// it. That is the right semantics for "has anyone done anything with
// this provider recently?" — which is exactly what the stale flag is
// asking. The audit_log table holds true per-field stage history but
// is admin-read-only under RLS (0003), so we cannot use it from a
// recruiter session without a migration.

import type { PipelineStage } from "./types";
import { PIPELINE_STAGES } from "./constants";

/**
 * Per-stage threshold (in days) beyond which a card is considered
 * stale — i.e. it has sat in this stage past the reasonable dwell
 * time and is at risk of breaching the recruiter SLA.
 *
 * Calibrated from 2026 staffing-research guidance:
 *  - candidate response inside 48 h is a tracked SLA
 *  - hospital submission→offer target is ~12 days when SLAs are
 *    enforced (Boundee 2026: reality 42 days when they are not)
 *  - credentialing genuinely takes longer (60–90 days end-to-end);
 *    the per-stage dwell budget must reflect that without flagging
 *    every credentialing card as stale on day 8
 *
 * Stages with no time pressure (`placed`) are `null` — never stale.
 */
export const STAGE_SLA_DAYS: Record<PipelineStage, number | null> = {
  new: 7,
  screen: 5,
  credentialing: 14,
  submitted: 7,
  interview: 5,
  offer: 3,
  placed: null,
};

/** Number of days inside the threshold that count as the "watch" amber band. */
const WATCH_WINDOW_DAYS = 2;

const MS_PER_DAY = 86_400_000;

/** Whole-day age. `null` if the timestamp is missing or unparseable. */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / MS_PER_DAY));
}

/** Aging state for one card. `none` means the stage has no SLA at all (`placed`). */
export type AgingState = "fresh" | "watch" | "stale" | "none";

export interface AgingResult {
  state: AgingState;
  /** Days since `updated_at` (rounded down). `null` if unknown. */
  days: number | null;
  /** SLA threshold for this stage in days, or `null` if the stage has none. */
  thresholdDays: number | null;
}

/**
 * Classify one provider card by stage + last-touched timestamp.
 *
 * - `stale`  — days ≥ threshold (SLA breached)
 * - `watch`  — within `WATCH_WINDOW_DAYS` of the threshold
 * - `fresh`  — comfortably inside the threshold
 * - `none`   — the stage has no SLA (e.g. `placed`)
 */
export function classifyAging(
  stage: PipelineStage,
  updatedAt: string | null,
  now: Date = new Date(),
): AgingResult {
  const thresholdDays = STAGE_SLA_DAYS[stage];
  const days = daysSince(updatedAt, now);

  if (thresholdDays == null) {
    return { state: "none", days, thresholdDays: null };
  }
  if (days == null) {
    // No timestamp — treat as fresh rather than crying wolf on partial data.
    return { state: "fresh", days: null, thresholdDays };
  }
  if (days >= thresholdDays) return { state: "stale", days, thresholdDays };
  if (days >= thresholdDays - WATCH_WINDOW_DAYS) {
    return { state: "watch", days, thresholdDays };
  }
  return { state: "fresh", days, thresholdDays };
}

/** UI metadata for an aging state — label + badge tone the UI maps to a class. */
export const AGING_META: Record<
  AgingState,
  { label: string; tone: "ok" | "warn" | "danger" | "muted" }
> = {
  fresh: { label: "On track", tone: "ok" },
  watch: { label: "Watch", tone: "warn" },
  stale: { label: "Stale", tone: "danger" },
  none: { label: "—", tone: "muted" },
};

/**
 * Plain-English summary for tooltips and rollover copy.
 */
export function agingSummary(r: AgingResult, stageLabel: string): string {
  if (r.state === "none") {
    return `${stageLabel} has no dwell-time target.`;
  }
  if (r.days == null) {
    return `No activity timestamp for this ${stageLabel} card yet.`;
  }
  if (r.state === "stale") {
    return `${r.days} days in ${stageLabel} — past the ${r.thresholdDays}-day target.`;
  }
  if (r.state === "watch") {
    return `${r.days} days in ${stageLabel} — close to the ${r.thresholdDays}-day target.`;
  }
  return `${r.days} days in ${stageLabel} — inside the ${r.thresholdDays}-day target.`;
}

/** Per-stage breakdown of aging across the board. */
export interface StageAgingSummary {
  stage: PipelineStage;
  total: number;
  stale: number;
  watch: number;
  fresh: number;
  /** Number of cards that count against an SLA (excludes `none` stages). */
  tracked: number;
  /** Oldest stale card's age, in days. `null` if no stale cards. */
  oldestStaleDays: number | null;
}

export interface BoardAgingSummary {
  totalCards: number;
  trackedCards: number;
  staleTotal: number;
  watchTotal: number;
  freshTotal: number;
  /** Average days since last update across cards with a known timestamp. */
  averageDaysSinceUpdate: number | null;
  /** Stage whose stale count is highest — useful for the KPI sub-line. */
  worstStage: { stage: PipelineStage; staleCount: number } | null;
  byStage: StageAgingSummary[];
}

/** One classified card — what the board receives to render. */
export interface AgingCard {
  stage: PipelineStage;
  aging: AgingResult;
}

/**
 * Roll a flat list of classified cards into the page-level KPI strip
 * and per-stage stale counts.
 */
export function summarizeBoard(cards: AgingCard[]): BoardAgingSummary {
  const byStage = new Map<PipelineStage, StageAgingSummary>();
  for (const stage of PIPELINE_STAGES) {
    byStage.set(stage, {
      stage,
      total: 0,
      stale: 0,
      watch: 0,
      fresh: 0,
      tracked: 0,
      oldestStaleDays: null,
    });
  }

  let staleTotal = 0;
  let watchTotal = 0;
  let freshTotal = 0;
  let dayTotal = 0;
  let dayCount = 0;

  for (const c of cards) {
    const row = byStage.get(c.stage);
    if (!row) continue;
    row.total += 1;
    if (c.aging.state !== "none") row.tracked += 1;
    if (c.aging.days != null) {
      dayTotal += c.aging.days;
      dayCount += 1;
    }
    if (c.aging.state === "stale") {
      row.stale += 1;
      staleTotal += 1;
      if (
        c.aging.days != null &&
        (row.oldestStaleDays == null || c.aging.days > row.oldestStaleDays)
      ) {
        row.oldestStaleDays = c.aging.days;
      }
    } else if (c.aging.state === "watch") {
      row.watch += 1;
      watchTotal += 1;
    } else if (c.aging.state === "fresh") {
      row.fresh += 1;
      freshTotal += 1;
    }
  }

  let worstStage: { stage: PipelineStage; staleCount: number } | null = null;
  for (const row of Array.from(byStage.values())) {
    if (row.stale > 0 && (!worstStage || row.stale > worstStage.staleCount)) {
      worstStage = { stage: row.stage, staleCount: row.stale };
    }
  }

  return {
    totalCards: cards.length,
    trackedCards: cards.filter((c) => c.aging.state !== "none").length,
    staleTotal,
    watchTotal,
    freshTotal,
    averageDaysSinceUpdate:
      dayCount > 0 ? Math.round(dayTotal / dayCount) : null,
    worstStage,
    byStage: PIPELINE_STAGES.map((s) => byStage.get(s)!),
  };
}

/** Filter band the page exposes as filter chips on the board toolbar. */
export type AgingFilter = "all" | "stale" | "watch" | "fresh";
export const AGING_FILTERS: AgingFilter[] = ["all", "stale", "watch", "fresh"];

/** True if a card should appear under the given filter band. */
export function passesFilter(state: AgingState, filter: AgingFilter): boolean {
  if (filter === "all") return true;
  if (filter === "stale") return state === "stale";
  if (filter === "watch") return state === "watch";
  if (filter === "fresh") return state === "fresh" || state === "none";
  return true;
}
