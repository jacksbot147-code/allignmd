import Link from "next/link";
import type { Metadata } from "next";
import { FacilityForm } from "@/components/facility-form";
import { requireStaff } from "@/lib/auth";
import { createFacility } from "../actions";

export const metadata: Metadata = { title: "New facility" };
export const dynamic = "force-dynamic";

export default async function NewFacilityPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
            <Link href="/facilities">Facilities</Link> / New
          </p>
          <h2>Add a facility</h2>
          <p>Create a client facility so you can post jobs against it.</p>
        </div>
      </div>

      <div style={{ maxWidth: 720 }}>
        <FacilityForm
          action={createFacility}
          mode="new"
          error={searchParams.error}
        />
      </div>
    </>
  );
}
