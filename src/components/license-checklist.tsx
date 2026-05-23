import { updateChecklistItem } from "@/app/(app)/licensing/actions";
import type { LicenseChecklistItemDef } from "@/lib/licensing";
import type { LicenseChecklistState } from "@/lib/types";

/**
 * The state-license checklist — the items a board application typically needs,
 * each with a completion status and a working note. The item list is varied by
 * clinician role upstream (see licenseChecklistForRole).
 */
export function LicenseChecklist({
  applicationId,
  items,
  checklist,
  hints,
}: {
  applicationId: string;
  items: LicenseChecklistItemDef[];
  checklist: Record<string, LicenseChecklistState>;
  hints: Record<string, string>;
}) {
  const done = items.filter((it) => checklist[it.key]?.complete).length;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Application checklist</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          {done} of {items.length} complete
        </span>
      </div>
      <div className="stack" style={{ padding: 14, gap: 0 }}>
        {items.map((it, i) => {
          const state = checklist[it.key];
          const complete = state?.complete ?? false;
          const hint = hints[it.key];
          return (
            <div
              key={it.key}
              style={{
                paddingTop: i === 0 ? 0 : 14,
                marginTop: i === 0 ? 0 : 14,
                borderTop: i === 0 ? "none" : "1px solid var(--line-2)",
              }}
            >
              <div
                className="row-between"
                style={{ alignItems: "flex-start", gap: 12 }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13 }}>{it.label}</b>
                    <span
                      className={`badge ${
                        complete ? "badge-ok" : "badge-muted"
                      }`}
                    >
                      {complete ? "Done" : "Pending"}
                    </span>
                  </div>
                  <p
                    className="muted"
                    style={{ fontSize: 12, marginTop: 4 }}
                  >
                    {it.detail}
                  </p>
                  {hint && (
                    <p
                      className="badge badge-teal"
                      style={{ marginTop: 6, fontWeight: 600 }}
                    >
                      {hint}
                    </p>
                  )}
                </div>
              </div>

              <form action={updateChecklistItem} style={{ marginTop: 8 }}>
                <input
                  type="hidden"
                  name="application_id"
                  value={applicationId}
                />
                <input type="hidden" name="item_key" value={it.key} />
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <select
                    className="select"
                    name="complete"
                    defaultValue={complete ? "true" : "false"}
                    style={{ width: 120 }}
                    aria-label={`${it.label} status`}
                  >
                    <option value="false">Pending</option>
                    <option value="true">Done</option>
                  </select>
                  <input
                    className="input"
                    name="note"
                    defaultValue={state?.note ?? ""}
                    placeholder="Note — e.g. requested from board 5/12"
                    style={{ flex: 1, minWidth: 180 }}
                  />
                  <button type="submit" className="btn btn-sm">
                    Save
                  </button>
                </div>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
