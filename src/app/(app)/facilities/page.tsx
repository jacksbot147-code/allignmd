import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Facilities" };
export const dynamic = "force-dynamic";

export default async function FacilitiesPage() {
  const supabase = createClient();
  const [facRes, jobsRes] = await Promise.all([
    supabase.from("facilities").select("*").order("name", { ascending: true }),
    supabase.from("jobs").select("id, facility_id, status"),
  ]);
  const facilities = facRes.data ?? [];
  const jobs = jobsRes.data ?? [];

  const openCount = (id: string) =>
    jobs.filter((j: any) => j.facility_id === id && j.status === "open").length;
  const totalCount = (id: string) =>
    jobs.filter((j: any) => j.facility_id === id).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Facilities</h2>
          <p>Client hospitals, surgical centers and clinics.</p>
        </div>
        <Link href="/facilities/new" className="btn btn-primary">
          <IconPlus width={15} height={15} /> New facility
        </Link>
      </div>

      <div className="card">
        {facilities.length === 0 ? (
          <EmptyState
            title="No facilities yet"
            hint="Add a client facility, then post jobs against it."
            action={
              <Link href="/facilities/new" className="btn btn-primary">
                <IconPlus width={15} height={15} /> New facility
              </Link>
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Setting</th>
                <th>Location</th>
                <th>EMR</th>
                <th>Open jobs</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((f: any) => (
                <tr key={f.id} className="table-row-link">
                  <td>
                    <Link href={`/facilities/${f.id}`} style={{ fontWeight: 700 }}>
                      {f.name}
                    </Link>
                  </td>
                  <td>{f.setting || "—"}</td>
                  <td className="muted">
                    {[f.city, f.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="muted">{f.emr || "—"}</td>
                  <td>
                    <span className="badge badge-teal">{openCount(f.id)}</span>
                    {totalCount(f.id) > openCount(f.id) && (
                      <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                        of {totalCount(f.id)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
