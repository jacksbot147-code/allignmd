import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireFacilityContact } from "@/lib/auth";
import { FacilityJobForm } from "@/components/facility-job-form";
import { updateFacilityJob } from "../../../../actions";
import type { Job, Facility, JobRequirement } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", params.id)
    .maybeSingle();
  return { title: data?.title ? `Edit · ${data.title}` : "Edit role" };
}

export default async function FacilityEditJobPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const user = await requireFacilityContact();
  if (!user.facility_id) notFound();

  const supabase = createClient();
  // RLS confines this to the contact's own facility.
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("*, facility:facilities(id, name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!jobRow) notFound();
  const job = jobRow as Job & { facility: Facility | null };

  const { data: reqRows } = await supabase
    .from("job_requirements")
    .select("*")
    .eq("job_id", job.id)
    .limit(1);
  const requirement = (reqRows?.[0] ?? null) as JobRequirement | null;

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/facility/jobs">Jobs</Link> /{" "}
        <Link href={`/facility/jobs/${job.id}`}>{job.title}</Link> / Edit
      </p>

      <div className="page-head">
        <div>
          <h2>Edit role</h2>
          <p>Update the role&apos;s detail, requirements and pay rates.</p>
        </div>
      </div>

      <FacilityJobForm
        action={updateFacilityJob}
        facilityName={job.facility?.name ?? "Your facility"}
        job={job}
        requirement={requirement}
        mode="edit"
        error={searchParams.error}
      />
    </>
  );
}
