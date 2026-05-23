// AlignMD — USAJOBS job-feed adapter.
//
// USAJOBS (federal jobs) needs an API key + the registered email address
// (process.env.USAJOBS_API_KEY / USAJOBS_EMAIL). The email is sent as the
// User-Agent and the key as Authorization-Key, per their auth scheme.
// https://developer.usajobs.gov/

import type { JobFeedAdapter, RawJob } from "../types";
import { fetchWithTimeout } from "../http";
import { stripHtml } from "../classify";

const ENDPOINT =
  "https://data.usajobs.gov/api/search?Keyword=nurse%20practitioner&ResultsPerPage=50";

interface UsaJobsRemuneration {
  MinimumRange?: string;
  MaximumRange?: string;
}

interface UsaJobsDescriptor {
  PositionID?: string;
  PositionTitle?: string;
  PositionURI?: string;
  PositionLocationDisplay?: string;
  OrganizationName?: string;
  PositionRemuneration?: UsaJobsRemuneration[];
  PublicationStartDate?: string;
  UserArea?: {
    Details?: {
      JobSummary?: string;
    };
  };
}

interface UsaJobsItem {
  MatchedObjectDescriptor?: UsaJobsDescriptor;
}

function toNumber(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const usajobsAdapter: JobFeedAdapter = {
  id: "usajobs",
  label: "USAJOBS (federal clinical roles)",

  isConfigured() {
    return Boolean(process.env.USAJOBS_API_KEY && process.env.USAJOBS_EMAIL);
  },

  async fetch(): Promise<RawJob[]> {
    const apiKey = process.env.USAJOBS_API_KEY;
    const email = process.env.USAJOBS_EMAIL;
    if (!apiKey || !email) return [];

    try {
      const res = await fetchWithTimeout(ENDPOINT, {
        headers: {
          Host: "data.usajobs.gov",
          "User-Agent": email,
          "Authorization-Key": apiKey,
          Accept: "application/json",
        },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        SearchResult?: { SearchResultItems?: UsaJobsItem[] };
      };
      const items = Array.isArray(data?.SearchResult?.SearchResultItems)
        ? data.SearchResult!.SearchResultItems!
        : [];

      return items
        .map((it) => it.MatchedObjectDescriptor)
        .filter(
          (d): d is UsaJobsDescriptor =>
            Boolean(d && d.PositionID && d.PositionTitle && d.PositionURI),
        )
        .map((d): RawJob => {
          const pay = Array.isArray(d.PositionRemuneration)
            ? d.PositionRemuneration[0]
            : undefined;
          return {
            source: "usajobs",
            sourceJobId: String(d.PositionID),
            title: String(d.PositionTitle),
            orgName: d.OrganizationName ?? null,
            location: d.PositionLocationDisplay ?? null,
            state: null,
            isRemote: false,
            clinicianRole: null,
            specialty: null,
            employmentType: null,
            description: stripHtml(d.UserArea?.Details?.JobSummary, 400),
            url: String(d.PositionURI),
            salaryMin: toNumber(pay?.MinimumRange),
            salaryMax: toNumber(pay?.MaximumRange),
            postedAt: d.PublicationStartDate ?? null,
          };
        });
    } catch {
      return [];
    }
  },
};
