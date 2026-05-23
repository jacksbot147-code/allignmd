// AlignMD — reporting aggregations (Phase 6).
//
// Pure functions over submission rows. The /reports page does the Supabase
// reads, flattens each submission into a ReportSubmission, then hands the list
// here. Keeping the arithmetic pure makes it trivial to reason about and reuse.

import type { PipelineStage } from "./types";
import { PIPELINE_STAGES } from "./constants";

/**
 * A submission flattened to exactly what the report needs. The recruiter (the
 * owning provider's owner_id) and the facility (the job's facility_id) are
 * resolved by the page before the rows reach this module.
 */
export interface ReportSubmission {
  id: string;
  stage: PipelineStage;
  placed_on: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  facility_id: string | null;
  job_created_at: string | null;
}

export interface StageCount {
  stage: PipelineStage;
  count: number;
}

/** Submission / placement stats for one recruiter or one facility. */
export interface GroupStat {
  key: string;
  label: string;
  submissions: number;
  placed: number;
  fillRate: number; // 0–1
}

export interface ReportSummary {
  totalSubmissions: number;
  placed: number;
  fillRate: number; // 0–1
  avgTimeToFillDays: number | null;
  placedWithTiming: number;
  byStage: StageCount[];
  byRecruiter: GroupStat[];
  byFacility: GroupStat[];
}

const MS_PER_DAY = 86_400_000;

/** A submission counts as filled once it has reached the 'placed' stage. */
export function isPlaced(s: ReportSubmission): boolean {
  return s.stage === "placed";
}

/**
 * Days from the job being posted to the submission reaching 'placed'. Uses
 * placed_on when stamped, otherwise the row's updated_at as a fallback.
 * Returns null when the submission is not placed or a date is missing.
 */
export function timeToFillDays(s: ReportSubmission): number | null {
  if (!isPlaced(s) || !s.job_created_at) return null;
  const end = s.placed_on ?? s.updated_at;
  if (!end) return null;
  const start = new Date(s.job_created_at).getTime();
  const finish = new Date(end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return null;
  return Math.max(0, Math.round((finish - start) / MS_PER_DAY));
}

/** Placed ÷ submitted, guarded against a zero denominator. */
function rate(placed: number, submissions: number): number {
  return submissions > 0 ? placed / submissions : 0;
}

/** Group submissions by a key, resolve a display label, biggest group first. */
function groupBy(
  subs: ReportSubmission[],
  keyOf: (s: ReportSubmission) => string | null,
  labelOf: (key: string) => string,
  unassignedLabel: string,
): GroupStat[] {
  const UNASSIGNED = "__unassigned__";
  const buckets = new Map<string, { submissions: number; placed: number }>();
  for (const s of subs) {
    const key = keyOf(s) ?? UNASSIGNED;
    const b = buckets.get(key) ?? { submissions: 0, placed: 0 };
    b.submissions += 1;
    if (isPlaced(s)) b.placed += 1;
    buckets.set(key, b);
  }
  const out: GroupStat[] = [];
  for (const [key, b] of Array.from(buckets.entries())) {
    out.push({
      key,
      label: key === UNASSIGNED ? unassignedLabel : labelOf(key),
      submissions: b.submissions,
      placed: b.placed,
      fillRate: rate(b.placed, b.submissions),
    });
  }
  out.sort(
    (a, b) => b.submissions - a.submissions || a.label.localeCompare(b.label),
  );
  return out;
}

/** Build the full reporting summary from flattened submission rows. */
export function buildReport(
  subs: ReportSubmission[],
  recruiterName: (id: string) => string,
  facilityName: (id: string) => string,
): ReportSummary {
  const totalSubmissions = subs.length;
  const placed = subs.filter(isPlaced).length;

  const byStage: StageCount[] = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: subs.filter((s) => s.stage === stage).length,
  }));

  const ttf = subs
    .map(timeToFillDays)
    .filter((d): d is number => d != null);
  const avgTimeToFillDays =
    ttf.length > 0
      ? Math.round(ttf.reduce((a, b) => a + b, 0) / ttf.length)
      : null;

  return {
    totalSubmissions,
    placed,
    fillRate: rate(placed, totalSubmissions),
    avgTimeToFillDays,
    placedWithTiming: ttf.length,
    byStage,
    byRecruiter: groupBy(subs, (s) => s.owner_id, recruiterName, "Unassigned"),
    byFacility: groupBy(
      subs,
      (s) => s.facility_id,
      facilityName,
      "Facility not set",
    ),
  };
}

/** Format a 0–1 rate as a whole-number percentage. */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
