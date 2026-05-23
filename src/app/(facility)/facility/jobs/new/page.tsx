import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireFacilityContact } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { FacilityJobForm } from "@/components/facility-job-form";
import { createFacilityJob } from "../../../actions";
import type { Facility } from "@/lib/types";

export const metadata: Metadata = { title: "Post a role" };
export const dynamic = "force-dynamic";

export default async function FacilityNewJobPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireFacilityContact();

  if (!user.facility_id) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Post a role</h2>
            <p>Open a new position for AlignMD to fill.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your account isn't linked to a facility yet"
            hint="An AlignMD administrator still needs to connect your account to your facility before you can post roles."
          />
        </div>
      </>
    );
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("facilities")
    .select("*")
    .eq("id", user.facility_id)
    .maybeSingle();
  const facility = (data ?? null) as Facility | null;

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/facility/jobs">Jobs</Link> / Post a role
      </p>

      <div className="page-head">
        <div>
          <h2>Post a role</h2>
          <p>
            Open a new position — AlignMD will start matching clinicians to it
            right away.
          </p>
        </div>
      </div>

      <FacilityJobForm
        action={createFacilityJob}
        facilityName={facility?.name ?? "Your facility"}
        mode="new"
        error={searchParams.error}
      />
    </>
  );
}
