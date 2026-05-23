import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/job-form";
import { EmptyState } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createJob } from "../actions";

export const metadata: Metadata = { title: "New job" };
export const dynamic = "force-dynamic";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: { error?: string; facility?: string };
}) {
  await requireStaff();
  const supabase = createClient();
  const { data } = await supabase
    .from("facilities")
    .select("id, name")
    .order("name", { ascending: true });
  const facilities = data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
            <Link href="/jobs">Jobs</Link> / New
          </p>
          <h2>Post a job</h2>
          <p>Define the role and its requirements — matching runs against it.</p>
        </div>
      </div>

      {facilities.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Add a facility first"
            hint="Every job belongs to a client facility."
            action={
              <Link href="/facilities/new" className="btn btn-primary">
                New facility
              </Link>
            }
          />
        </div>
      ) : (
        <div style={{ maxWidth: 820 }}>
          <JobForm
            action={createJob}
            facilities={facilities}
            mode="new"
            defaultFacilityId={searchParams.facility}
            error={searchParams.error}
          />
        </div>
      )}
    </>
  );
}
