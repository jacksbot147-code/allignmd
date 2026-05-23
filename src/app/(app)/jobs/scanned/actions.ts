"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { runJobFeedIngestion } from "@/lib/job-feeds/ingest";

/**
 * Staff "Refresh now" trigger for the scanned-jobs view. Runs the same
 * ingestion the daily cron runs (every configured job-board adapter), then
 * redirects back to /jobs/scanned with a result banner.
 *
 * Staff are already authorized for the ingestion on /api/jobs/refresh;
 * requireStaff() enforces the same bar before running it from inside the CRM.
 */
export async function refreshScannedJobs() {
  await requireStaff();

  const summary = await runJobFeedIngestion();
  revalidatePath("/jobs/scanned");

  if (!summary.ok) {
    redirect(
      "/jobs/scanned?error=" +
        encodeURIComponent(summary.error ?? "Refresh failed."),
    );
  }

  const touched = summary.inserted + summary.updated;
  redirect(`/jobs/scanned?refreshed=${touched}&deactivated=${summary.deactivated}`);
}
