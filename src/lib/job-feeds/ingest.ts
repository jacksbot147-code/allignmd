// AlignMD — job-feed ingestion core.
//
// The fetch → normalize → upsert work behind /api/jobs/refresh, factored out
// so both the daily cron route AND the staff "Refresh now" server action run
// the exact same ingestion. Each caller does its own authorization first —
// the route checks CRON_SECRET / staff auth, the server action requireStaff()
// — then calls runJobFeedIngestion().
//
// Writes go through the service-role admin client, which bypasses RLS; this
// module is server-only and must never be imported into a client component.

import { createAdminClient } from "@/lib/supabase/admin";
import { activeAdapters } from "@/lib/job-feeds";
import {
  classifyRole,
  classifySpecialty,
  parseState,
  classifyEmploymentType,
} from "@/lib/job-feeds/classify";
import type { RawJob } from "@/lib/job-feeds/types";

/** The outcome of one ingestion run — returned to both callers. */
export interface IngestSummary {
  ok: boolean;
  sources: string[];
  inserted: number;
  updated: number;
  deactivated: number;
  started_at: string;
  finished_at: string;
  error?: string;
}

/** A row ready to upsert into external_jobs. */
interface ExternalJobRow {
  source: string;
  source_job_id: string;
  title: string;
  org_name: string | null;
  location: string | null;
  state: string | null;
  is_remote: boolean;
  clinician_role: string | null;
  specialty: string | null;
  employment_type: string | null;
  description: string | null;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  posted_at: string | null;
  fetched_at: string;
  active: boolean;
}

/** Normalize one RawJob into a DB row, filling any blank classifier fields. */
function toRow(job: RawJob, fetchedAt: string): ExternalJobRow {
  const text = `${job.title} ${job.description ?? ""}`;
  const role =
    job.clinicianRole ?? classifyRole(job.title, job.description) ?? null;
  const state = job.state ?? parseState(job.location) ?? null;
  // Adapters leave specialty null — infer it from the posting text. The title
  // is authoritative; the description is only a fallback (see classify.ts).
  const specialty =
    job.specialty ?? classifySpecialty(job.title, job.description) ?? null;
  const employmentType =
    classifyEmploymentType(job.employmentType ?? "") ??
    classifyEmploymentType(text) ??
    null;

  return {
    source: job.source,
    source_job_id: job.sourceJobId,
    title: job.title,
    org_name: job.orgName ?? null,
    location: job.location ?? null,
    state,
    is_remote: Boolean(job.isRemote),
    clinician_role: role,
    specialty,
    employment_type: employmentType,
    description: job.description ?? null,
    url: job.url,
    salary_min: job.salaryMin ?? null,
    salary_max: job.salaryMax ?? null,
    posted_at: job.postedAt ?? null,
    fetched_at: fetchedAt,
    active: true,
  };
}

/**
 * Pull every configured job-board feed, normalize the postings, and upsert
 * them into external_jobs. Opens a job_feed_runs row up front so a crash
 * still leaves a record, and never throws — failures come back as
 * `{ ok: false, error }` so callers can branch on the result.
 */
export async function runJobFeedIngestion(): Promise<IngestSummary> {
  const admin = createAdminClient();
  const startedAt = new Date().toISOString();

  // Open the run row up front so a crash still leaves a record.
  const { data: runRow } = await admin
    .from("job_feed_runs")
    .insert({ started_at: startedAt })
    .select("id")
    .single();
  const runId = (runRow as { id?: string } | null)?.id ?? null;

  try {
    const adapters = activeAdapters();
    let inserted = 0;
    let updated = 0;
    let deactivated = 0;

    for (const adapter of adapters) {
      const rawJobs = await adapter.fetch();
      const fetchedAt = new Date().toISOString();
      const rows = rawJobs.map((j) => toRow(j, fetchedAt));

      // De-dupe within this batch — a feed can repeat a posting and the
      // upsert would otherwise hit the same conflict target twice.
      const seen = new Set<string>();
      const uniqueRows = rows.filter((r) => {
        const key = `${r.source}::${r.source_job_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (uniqueRows.length > 0) {
        // Before upserting, look up which (source, source_job_id) keys already
        // exist. An upsert touches both new and existing rows and bumps every
        // matched row's fetched_at, so the post-write state can't tell them
        // apart — the only reliable signal is whether the key existed first.
        // The .in() lookups are chunked to keep request URLs within limits.
        const existingKeys = new Set<string>();
        for (let i = 0; i < uniqueRows.length; i += 200) {
          const chunk = uniqueRows.slice(i, i + 200);
          const { data: existingRows } = await admin
            .from("external_jobs")
            .select("source,source_job_id")
            .in(
              "source_job_id",
              chunk.map((r) => r.source_job_id),
            );
          for (const e of existingRows ?? []) {
            const row = e as Pick<
              ExternalJobRow,
              "source" | "source_job_id"
            >;
            existingKeys.add(`${row.source}::${row.source_job_id}`);
          }
        }

        const { error: upsertErr } = await admin
          .from("external_jobs")
          .upsert(uniqueRows, { onConflict: "source,source_job_id" });
        if (upsertErr) throw upsertErr;

        // Genuinely-new rows are those whose key was absent beforehand; every
        // other upserted row was an update. Their sum is the batch size, so
        // the combined inserted+updated total is unchanged.
        let newRows = 0;
        for (const r of uniqueRows) {
          if (!existingKeys.has(`${r.source}::${r.source_job_id}`)) newRows++;
        }
        inserted += newRows;
        updated += uniqueRows.length - newRows;
      }

      // Deactivate this source's postings that did not appear in this run.
      const { data: stale } = await admin
        .from("external_jobs")
        .update({ active: false })
        .eq("source", adapter.id)
        .eq("active", true)
        .lt("fetched_at", startedAt)
        .select("id");
      deactivated += stale?.length ?? 0;
    }

    const finishedAt = new Date().toISOString();
    const sources = adapters.map((a) => a.id);

    if (runId) {
      await admin
        .from("job_feed_runs")
        .update({
          finished_at: finishedAt,
          sources,
          inserted,
          updated,
          deactivated,
          ok: true,
        })
        .eq("id", runId);
    }

    return {
      ok: true,
      sources,
      inserted,
      updated,
      deactivated,
      started_at: startedAt,
      finished_at: finishedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finishedAt = new Date().toISOString();
    if (runId) {
      await admin
        .from("job_feed_runs")
        .update({ finished_at: finishedAt, ok: false, error: message })
        .eq("id", runId);
    }
    return {
      ok: false,
      sources: [],
      inserted: 0,
      updated: 0,
      deactivated: 0,
      started_at: startedAt,
      finished_at: finishedAt,
      error: message,
    };
  }
}
