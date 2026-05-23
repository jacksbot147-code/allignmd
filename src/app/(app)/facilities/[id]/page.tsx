import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { FacilityForm } from "@/components/facility-form";
import { IconPlus } from "@/components/icons";
import { JOB_STATUS_LABELS, JOB_STATUS_TONE } from "@/lib/constants";
import { fmtDate, fmtMoney } from "@/lib/format";
import { updateFacility } from "../actions";
import type { Facility } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("facilities")
    .select("name")
    .eq("id", params.id)
    .maybeSingle();
  return { title: data?.name ?? "Facility" };
}

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  teal: "badge-teal",
  muted: "badge-muted",
};

export default async function FacilityDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const { data: facRow } = await supabase
    .from("facilities")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!facRow) notFound();
  const facility = facRow as Facility;

  const { data: jobsData } = await supabase
    .from("jobs")
    .select("id, title, specialty, status, is_permanent, rate_hourly, created_at")
    .eq("facility_id", params.id)
    .order("created_at", { ascending: false });
  const jobs = jobsData ?? [];

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/facilities">Facilities</Link> / {facility.name}
      </p>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row-between" style={{ alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 21 }}>{facility.name}</h2>
            <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {facility.setting && (
                <span className="badge badge-teal">{facility.setting}</span>
              )}
              <span className="muted" style={{ fontSize: 13 }}>
                {[facility.city, facility.state].filter(Boolean).join(", ") ||
                  "Location not set"}
                {facility.emr ? ` · ${facility.emr}` : ""}
              </span>
            </div>
          </div>
          <Link href={`/jobs/new?facility=${facility.id}`} className="btn btn-primary">
            <IconPlus width={15} height={15} /> Post a job
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3>Jobs at this facility</h3>
        </div>
        {jobs.length === 0 ? (
          <EmptyState
            title="No jobs posted"
            hint="Post a job to start matching clinicians to this facility."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Specialty</th>
                <th>Type</th>
                <th>Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j: any) => (
                <tr key={j.id} className="table-row-link">
                  <td>
                    <Link href={`/jobs/${j.id}`} style={{ fontWeight: 700 }}>
                      {j.title}
                    </Link>
                  </td>
                  <td>{j.specialty || "—"}</td>
                  <td className="muted">
                    {j.is_permanent ? "Permanent" : "Locum / temp"}
                  </td>
                  <td className="muted">
                    {j.rate_hourly != null ? `${fmtMoney(j.rate_hourly)}/hr` : "—"}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        toneClass[JOB_STATUS_TONE[j.status] ?? "muted"]
                      }`}
                    >
                      {JOB_STATUS_LABELS[j.status] ?? j.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <details className="card card-pad">
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          Edit facility details
        </summary>
        <div style={{ marginTop: 16, maxWidth: 680 }}>
          <FacilityForm
            action={updateFacility}
            facility={facility}
            mode="edit"
          />
        </div>
      </details>
    </>
  );
}
