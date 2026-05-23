// AlignMD — job-feed adapter contracts.
//
// A `RawJob` is the normalized shape every adapter emits. The ingestion route
// fills in any classification fields an adapter left blank, then upserts these
// into the `external_jobs` table (migration 0010).

export interface RawJob {
  /** Stable adapter id, e.g. "remotive". Matches JobFeedAdapter.id. */
  source: string;
  /** The posting's id within its source feed. Deduped on (source, sourceJobId). */
  sourceJobId: string;
  title: string;
  orgName?: string | null;
  location?: string | null;
  /** 2-letter US state code, if the adapter could determine one. */
  state?: string | null;
  isRemote?: boolean;
  /** A value in the provider_role enum (NP/PA/MD/DO/CRNA/PT/OT/SLP) or null. */
  clinicianRole?: string | null;
  specialty?: string | null;
  /** "locum" | "contract" | "permanent" | null. */
  employmentType?: string | null;
  description?: string | null;
  url: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  /** ISO-8601 string, or null when the feed gives no posting date. */
  postedAt?: string | null;
}

/**
 * A pluggable job-board source. New feeds are added by implementing this and
 * registering the instance in src/lib/job-feeds/index.ts.
 */
export interface JobFeedAdapter {
  /** Stable id; also written to external_jobs.source. */
  id: string;
  /** Human-readable name for logs and the staff UI. */
  label: string;
  /** True when the adapter has the env vars / config it needs to run. */
  isConfigured(): boolean;
  /** Fetch + normalize current postings. Must never throw — return [] on failure. */
  fetch(): Promise<RawJob[]>;
}
