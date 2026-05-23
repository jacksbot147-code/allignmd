// AlignMD — Remotive job-feed adapter.
//
// Remotive's public API needs no key. We pull its "medical-health" category,
// which is remote-by-definition, so every posting is marked isRemote: true.
// https://remotive.com/api/remote-jobs

import type { JobFeedAdapter, RawJob } from "../types";
import { fetchWithTimeout } from "../http";
import { stripHtml } from "../classify";

const ENDPOINT =
  "https://remotive.com/api/remote-jobs?category=medical-health&limit=50";

interface RemotiveJob {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export const remotiveAdapter: JobFeedAdapter = {
  id: "remotive",
  label: "Remotive (remote medical & health)",

  // No API key required — always available.
  isConfigured() {
    return true;
  },

  async fetch(): Promise<RawJob[]> {
    try {
      const res = await fetchWithTimeout(ENDPOINT, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { jobs?: RemotiveJob[] };
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

      return jobs
        .filter((j) => j && j.id != null && j.title && j.url)
        .map((j): RawJob => ({
          source: "remotive",
          sourceJobId: String(j.id),
          title: String(j.title),
          orgName: j.company_name ?? null,
          location: j.candidate_required_location ?? null,
          state: null, // remote postings rarely carry a US state
          isRemote: true,
          clinicianRole: null, // filled by the ingestion classifier
          specialty: null,
          employmentType: j.job_type ?? null,
          description: stripHtml(j.description, 400),
          url: String(j.url),
          salaryMin: null,
          salaryMax: null,
          postedAt: j.publication_date ?? null,
        }));
    } catch {
      // Network error, abort/timeout, or malformed JSON — skip this source.
      return [];
    }
  },
};
