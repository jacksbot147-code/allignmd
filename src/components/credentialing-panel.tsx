import { createClient } from "@/lib/supabase/server";
import { IconShield } from "@/components/icons";
import { fmtDate } from "@/lib/format";
import {
  buildPacket,
  packetProgress,
  packetGaps,
  isPacketReady,
  CREDENTIALING_STATUSES,
  CREDENTIALING_STATUS_LABELS,
  CREDENTIALING_STATUS_TONE,
} from "@/lib/credentialing";
import type { CredentialingItem } from "@/lib/credentialing";
import {
  saveCredentialingItem,
  resetCredentialingItem,
} from "@/app/(app)/providers/credentialing-actions";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
  teal: "badge-teal",
};

/**
 * Phase 1 — the staff credentialing packet for one provider. Async server
 * component: self-fetches credentialing_items so the provider page only mounts
 * it. Defensive — if the 0011 migration has not been run the query errors
 * cleanly and the packet renders read-only over the canonical checklist.
 */
export async function CredentialingPanel({
  providerId,
}: {
  providerId: string;
}) {
  const supabase = createClient();
  const res = await supabase
    .from("credentialing_items")
    .select("*")
    .eq("provider_id", providerId);

  // No table yet (migration not applied) → render read-only over the canon.
  const tableReady = !res.error;
  const items = (res.data ?? []) as CredentialingItem[];

  const rows = buildPacket(items);
  const progress = packetProgress(rows);
  const gaps = packetGaps(rows);
  const ready = isPacketReady(rows);

  return (
    <div className="stack">
      {!tableReady && (
        <div className="alert alert-info">
          <IconShield width={13} height={13} /> The credentialing packet store
          isn&apos;t set up yet. Once migration{" "}
          <span className="mono">0011_credentialing.sql</span> is applied this
          checklist becomes editable. The standard packet is shown below.
        </div>
      )}

      {/* ── Progress ───────────────────────────────────────────── */}
      <div className="card card-pad">
        <div className="row-between" style={{ alignItems: "flex-start" }}>
          <div>
            <h3 style={{ fontSize: 14 }}>Credentialing packet</h3>
            <p className="muted" style={{ fontSize: 12, marginTop: 3 }}>
              {progress.complete} of {progress.countable} items complete
              {progress.na > 0 ? ` · ${progress.na} N/A` : ""}
            </p>
          </div>
          <span className={`badge ${ready ? "badge-ok" : "badge-warn"}`}>
            {ready ? "Packet ready" : "In progress"}
          </span>
        </div>

        <div
          style={{
            marginTop: 12,
            height: 9,
            borderRadius: 999,
            background: "var(--line-2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress.percent}%`,
              height: "100%",
              borderRadius: 999,
              background: ready ? "var(--ok)" : "var(--teal)",
            }}
          />
        </div>

        <div
          className="row"
          style={{ gap: 20, marginTop: 14, flexWrap: "wrap" }}
        >
          <PacketStat value={`${progress.percent}%`} label="Complete" />
          <PacketStat value={progress.inProgress} label="In progress" />
          <PacketStat value={progress.notStarted} label="Not started" />
          <PacketStat
            value={progress.expired}
            label="Expired"
            tone={progress.expired > 0 ? "var(--danger)" : undefined}
          />
        </div>
      </div>

      {/* ── Gaps ───────────────────────────────────────────────── */}
      {gaps.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>Open gaps</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {gaps.length} item{gaps.length === 1 ? "" : "s"} outstanding
            </span>
          </div>
          <div className="card-pad">
            <div className="stack" style={{ gap: 8 }}>
              {gaps.map((g) => (
                <div
                  key={g.item_type}
                  className="row"
                  style={{ gap: 8, alignItems: "flex-start" }}
                >
                  <span
                    className={`badge ${
                      g.severity === "major" ? "badge-danger" : "badge-warn"
                    }`}
                  >
                    {g.severity === "major" ? "Major" : "Minor"}
                  </span>
                  <span style={{ fontSize: 13 }}>{g.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Checklist ──────────────────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <h3>Packet checklist</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {rows.length} standard items
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Status</th>
              <th>Due</th>
              <th>Completed</th>
              <th>{tableReady ? "Update" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item_type}>
                <td>
                  <b>{r.label}</b>
                  <div
                    className="muted"
                    style={{ fontSize: 11, marginTop: 2 }}
                  >
                    {r.hint}
                  </div>
                  {r.item?.notes && (
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {r.item.notes}
                    </div>
                  )}
                </td>
                <td>
                  <span
                    className={`badge ${
                      toneClass[CREDENTIALING_STATUS_TONE[r.status]] ??
                      "badge-muted"
                    }`}
                  >
                    {CREDENTIALING_STATUS_LABELS[r.status]}
                  </span>
                </td>
                <td className="muted">{fmtDate(r.item?.due_date)}</td>
                <td className="muted">{fmtDate(r.item?.completed_on)}</td>
                <td>
                  {tableReady ? (
                    <div
                      className="row"
                      style={{ gap: 6, justifyContent: "flex-end" }}
                    >
                      <form
                        action={saveCredentialingItem}
                        className="row"
                        style={{
                          gap: 6,
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                        }}
                      >
                        <input
                          type="hidden"
                          name="provider_id"
                          value={providerId}
                        />
                        <input
                          type="hidden"
                          name="item_type"
                          value={r.item_type}
                        />
                        <input
                          type="hidden"
                          name="completed_on"
                          value={r.item?.completed_on ?? ""}
                        />
                        <select
                          className="select"
                          name="status"
                          defaultValue={r.status}
                          aria-label={`${r.label} status`}
                          style={{ padding: "4px 8px", fontSize: 12 }}
                        >
                          {CREDENTIALING_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {CREDENTIALING_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          type="date"
                          name="due_date"
                          defaultValue={r.item?.due_date ?? ""}
                          aria-label={`${r.label} due date`}
                          style={{ fontSize: 12, width: 142 }}
                        />
                        <input
                          className="input"
                          name="notes"
                          defaultValue={r.item?.notes ?? ""}
                          placeholder="Note"
                          aria-label={`${r.label} note`}
                          style={{ fontSize: 12, width: 150 }}
                        />
                        <button type="submit" className="btn btn-sm">
                          Save
                        </button>
                      </form>
                      {r.item && (
                        <form action={resetCredentialingItem}>
                          <input
                            type="hidden"
                            name="provider_id"
                            value={providerId}
                          />
                          <input
                            type="hidden"
                            name="item_id"
                            value={r.item.id}
                          />
                          <button
                            type="submit"
                            className="btn btn-sm btn-danger"
                          >
                            Reset
                          </button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PacketStat({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone?: string;
}) {
  return (
    <div>
      <div
        className="kpi-value"
        style={{ fontSize: 20, color: tone ?? "var(--ink)" }}
      >
        {value}
      </div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
