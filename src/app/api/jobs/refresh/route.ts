// AlignMD — job-feed ingestion endpoint.
//
// Pulls every configured job-board feed, normalizes the postings, and upserts
// them into external_jobs. A Vercel cron (vercel.json) hits this daily so the
// clinician portal's "Open jobs" list stays current; staff can also trigger it
// on demand from inside the CRM (the /jobs/scanned "Refresh now" button, which
// calls runJobFeedIngestion through a server action).
//
// The fetch/normalize/upsert work lives in src/lib/job-feeds/ingest.ts so the
// route and the server action run the exact same ingestion — this file only
// adds request authorization on top.
//
// Auth: the request is allowed when EITHER
//   (a) Authorization === `Bearer ${CRON_SECRET}` — what Vercel cron sends, or
//   (b) a signed-in staff user is making the request.
// If CRON_SECRET is unset, only (b) applies.

import { NextResponse } from "next/server";
import { getAppUser, isStaff } from "@/lib/auth";
import { runJobFeedIngestion } from "@/lib/job-feeds/ingest";

export const dynamic = "force-dynamic";

/** True when this request is authorized to run an ingestion. */
async function isAuthorized(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  // Fall through to interactive staff auth.
  try {
    const user = await getAppUser();
    return isStaff(user?.role);
  } catch {
    return false;
  }
}

async function runIngestion(request: Request): Promise<NextResponse> {
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const summary = await runJobFeedIngestion();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

export async function GET(request: Request): Promise<NextResponse> {
  return runIngestion(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return runIngestion(request);
}
