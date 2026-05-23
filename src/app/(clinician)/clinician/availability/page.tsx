import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { AVAILABILITY_BLOCKS, AVAILABILITY_LABELS } from "@/lib/constants";
import { fmtDate, titleCase } from "@/lib/format";
import type { Provider, ProviderAvailability, AvailabilityBlock } from "@/lib/types";
import { addMyAvailability, deleteMyAvailability } from "../../actions";

export const metadata: Metadata = { title: "Availability" };
export const dynamic = "force-dynamic";

export default async function ClinicianAvailabilityPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  await requireProvider();
  const provider = await getMyProvider();

  if (!provider) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Availability</h2>
            <p>The shifts and dates you&apos;re open to.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your profile isn't linked yet"
            hint="An administrator still needs to connect your account to your clinician profile. Reach out to your AlignMD recruiter."
          />
        </div>
      </>
    );
  }

  const p = provider as Provider;
  const supabase = createClient();
  const { data } = await supabase
    .from("provider_availability")
    .select("*")
    .eq("provider_id", p.id)
    .order("block_start", { ascending: true });
  const availability = (data ?? []) as ProviderAvailability[];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Availability</h2>
          <p>
            Tell recruiters when you can work — it sharpens every match the
            engine makes for you.
          </p>
        </div>
      </div>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}
      {searchParams.saved && (
        <div className="alert alert-ok">Availability updated.</div>
      )}

      <div className="stack">
        <div className="card">
          <div className="card-head">
            <h3>Your availability blocks</h3>
          </div>
          {availability.length === 0 ? (
            <EmptyState
              title="No availability recorded"
              hint="Add the shift types and date ranges you're open to below."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {availability.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="badge badge-teal">
                        {AVAILABILITY_LABELS[
                          a.block_type as AvailabilityBlock
                        ] ?? titleCase(a.block_type)}
                      </span>
                    </td>
                    <td className="muted">{fmtDate(a.block_start)}</td>
                    <td className="muted">{fmtDate(a.block_end)}</td>
                    <td>{a.note || "—"}</td>
                    <td>
                      <div
                        className="row"
                        style={{ gap: 4, justifyContent: "flex-end" }}
                      >
                        <form action={deleteMyAvailability}>
                          <input
                            type="hidden"
                            name="availability_id"
                            value={a.id}
                          />
                          <button
                            className="btn btn-sm btn-danger"
                            type="submit"
                          >
                            Remove
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>

        <details className="card card-pad" open={availability.length === 0}>
          <summary
            style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}
          >
            + Add an availability block
          </summary>
          <form action={addMyAvailability} style={{ marginTop: 16 }}>
            <div className="form-grid">
              <div className="field">
                <label>Type *</label>
                <select
                  className="select"
                  name="block_type"
                  required
                  defaultValue="custom"
                >
                  {AVAILABILITY_BLOCKS.map((b) => (
                    <option key={b} value={b}>
                      {AVAILABILITY_LABELS[b]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Start date</label>
                <input className="input" name="block_start" type="date" />
              </div>
              <div className="field">
                <label>End date</label>
                <input className="input" name="block_end" type="date" />
              </div>
              <div className="field full">
                <label>Note</label>
                <input
                  className="input"
                  name="note"
                  placeholder="e.g. open to 13-week contracts"
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              Add availability
            </button>
          </form>
        </details>
      </div>
    </>
  );
}
