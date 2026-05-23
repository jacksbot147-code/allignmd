// AlignMD — Adzuna job-feed adapter.
//
// Adzuna's API needs a free app id + key (process.env.ADZUNA_APP_ID /
// ADZUNA_APP_KEY). We pull US healthcare/nursing postings. Adzuna's `location`
// carries an `area` array like ["US","Florida","Miami"]; area[1] is the state.
// https://developer.adzuna.com/

import type { JobFeedAdapter, RawJob } from "../types";
import { fetchWithTimeout } from "../http";
import { stripHtml } from "../classify";

interface AdzunaResult {
  id?: string | number;
  title?: string;
  description?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  created?: string;
  contract_type?: string;
  contract_time?: string;
}

function endpoint(appId: string, appKey: string): string {
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "50",
    category: "healthcare-nursing-jobs",
    "content-type": "application/json",
  });
  return `https://api.adzuna.com/v1/api/jobs/us/search/1?${params.toString()}`;
}

export const adzunaAdapter: JobFeedAdapter = {
  id: "adzuna",
  label: "Adzuna (US healthcare & nursing)",

  isConfigured() {
    return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
  },

  async fetch(): Promise<RawJob[]> {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) return [];

    try {
      const res = await fetchWithTimeout(endpoint(appId, appKey), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: AdzunaResult[] };
      const results = Array.isArray(data?.results) ? data.results : [];

      return results
        .filter((r) => r && r.id != null && r.title && r.redirect_url)
        .map((r): RawJob => {
          // area is like ["US","Florida","Miami"] — index 1 is the state.
          const area = Array.isArray(r.location?.area) ? r.location!.area! : [];
          const stateName = area.length > 1 ? area[1] : null;
          return {
            source: "adzuna",
            sourceJobId: String(r.id),
            title: String(r.title),
            orgName: r.company?.display_name ?? null,
            location: r.location?.display_name ?? stateName ?? null,
            // Leave parsing to the ingestion classifier; pass the state name
            // through as the location hint when one is available.
            state: null,
            isRemote: false,
            clinicianRole: null,
            specialty: null,
            employmentType:
              r.contract_time ?? r.contract_type ?? null,
            description: stripHtml(r.description, 400),
            url: String(r.redirect_url),
            salaryMin: typeof r.salary_min === "number" ? r.salary_min : null,
            salaryMax: typeof r.salary_max === "number" ? r.salary_max : null,
            postedAt: r.created ?? null,
          };
        });
    } catch {
      return [];
    }
  },
};
