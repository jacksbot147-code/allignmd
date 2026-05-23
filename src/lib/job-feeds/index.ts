// AlignMD — job-feed adapter registry.
//
// To add a new source: implement a JobFeedAdapter (see types.ts), then append
// the instance to ADAPTERS. The ingestion route (/api/jobs/refresh) iterates
// activeAdapters() — only the configured ones run.

import type { JobFeedAdapter } from "./types";
import { remotiveAdapter } from "./adapters/remotive";
import { adzunaAdapter } from "./adapters/adzuna";
import { usajobsAdapter } from "./adapters/usajobs";

/** Every registered job-feed adapter, configured or not. */
export const ADAPTERS: JobFeedAdapter[] = [
  remotiveAdapter,
  adzunaAdapter,
  usajobsAdapter,
];

/** The adapters that have the env vars / config they need to run. */
export function activeAdapters(): JobFeedAdapter[] {
  return ADAPTERS.filter((a) => {
    try {
      return a.isConfigured();
    } catch {
      return false;
    }
  });
}

export type { JobFeedAdapter, RawJob } from "./types";
