import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { CREDENTIAL_LABELS } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  VERIFICATION_TYPES,
  VERIFICATION_TYPE_LABELS,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_TONE,
  modeLabel,
} from "@/lib/verification";
import type {
  VerificationType,
  VerificationStatus,
} from "@/lib/verification";
import type { CredentialType } from "@/lib/types";
import {
  requestVerification,
  updateVerification,
  deleteVerification,
} from "@/app/(app)/providers/verification-actions";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

/**
 * Phase 4 — verification & screening for one provider. Async server component:
 * fetches its own verifications + credentials so the provider page only has to
 * mount it. Malpractice rows are RLS-filtered to privileged staff at the DB.
 */
export async function VerificationPanel({
  providerId,
  privileged,
}: {
  providerId: string;
  privileged: boolean;
}) {
  const supabase = createClient();
  const [verRes, credRes] = await Promise.all([
    supabase
      .from("verifications")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("provider_credentials")
      .select("id, type, state, created_at")
      .eq("provider_id", providerId),
  ]);
  const verifications = verRes.data ?? [];
  const creds = credRes.data ?? [];

  // Non-privileged staff can't open malpractice checks (and RLS hides them).
  const offerTypes: VerificationType[] = privileged
    ? VERIFICATION_TYPES
    : VERIFICATION_TYPES.filter((t) => t !== "malpractice");

  // ── Merged credentialing timeline, most recent first ──────────────────
  type Ev = { at: string; text: string; tone: string };
  const events: Ev[] = [];
  for (const v of verifications as any[]) {
    const label =
      VERIFICATION_TYPE_LABELS[v.type as VerificationType] ?? v.type;
    events.push({ at: v.created_at, text: `${label} requested`, tone: "muted" });
    if (v.completed_at) {
      events.push({
        at: v.completed_at,
        text: `${label} — ${
          VERIFICATION_STATUS_LABELS[v.status as VerificationStatus] ?? v.status
        }`,
        tone: VERIFICATION_STATUS_TONE[v.status as VerificationStatus] ?? "muted",
      });
    }
  }
  for (const c of creds as any[]) {
    if (!c.created_at) continue;
    const label = CREDENTIAL_LABELS[c.type as CredentialType] ?? c.type;
    events.push({
      at: c.created_at,
      text: `${label}${c.state ? ` (${c.state})` : ""} added`,
      tone: "muted",
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="stack">
      <div className="alert alert-info">
        <IconShield width={13} height={13} /> Background checks:{" "}
        {modeLabel("background")}. Malpractice / NPDB and reference checks run
        as a coordinator workflow; malpractice records are visible to
        privileged staff only.
      </div>

      {/* ── Verifications ──────────────────────────────────────── */}
      <div className="card">
        <div className="card-head"><h3>Verifications &amp; screening</h3></div>
        {verifications.length === 0 ? (
          <EmptyState
            title="No verifications yet"
            hint="Open a background, malpractice or reference check below."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Result</th>
                <th>Requested</th>
                <th>Update</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {verifications.map((v: any) => (
                <tr key={v.id}>
                  <td>
                    <b>
                      {VERIFICATION_TYPE_LABELS[v.type as VerificationType] ??
                        v.type}
                    </b>
                    {v.vendor && (
                      <span className="badge badge-teal" style={{ marginLeft: 6 }}>
                        {v.vendor}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        toneClass[
                          VERIFICATION_STATUS_TONE[
                            v.status as VerificationStatus
                          ] ?? "muted"
                        ]
                      }`}
                    >
                      {VERIFICATION_STATUS_LABELS[
                        v.status as VerificationStatus
                      ] ?? v.status}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {v.result || "—"}
                  </td>
                  <td className="muted">{fmtDate(v.created_at)}</td>
                  <td>
                    <form
                      action={updateVerification}
                      className="row"
                      style={{ gap: 6, alignItems: "flex-start" }}
                    >
                      <input type="hidden" name="verification_id" value={v.id} />
                      <input type="hidden" name="provider_id" value={providerId} />
                      <select
                        className="select"
                        name="status"
                        defaultValue={v.status}
                        style={{ padding: "4px 8px", fontSize: 12 }}
                      >
                        {VERIFICATION_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {VERIFICATION_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        name="result"
                        defaultValue={v.result ?? ""}
                        placeholder="Result note"
                        style={{ width: 150, fontSize: 12 }}
                      />
                      <button type="submit" className="btn btn-sm">
                        Save
                      </button>
                    </form>
                  </td>
                  <td>
                    <form action={deleteVerification}>
                      <input type="hidden" name="verification_id" value={v.id} />
                      <input type="hidden" name="provider_id" value={providerId} />
                      <button type="submit" className="btn btn-sm btn-danger">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <details className="card card-pad">
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          + Open a verification
        </summary>
        <form action={requestVerification} style={{ marginTop: 16 }}>
          <input type="hidden" name="provider_id" value={providerId} />
          <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Type *</label>
              <select className="select" name="type" required defaultValue="background">
                {offerTypes.map((t) => (
                  <option key={t} value={t}>
                    {VERIFICATION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              Open verification
            </button>
          </div>
        </form>
      </details>

      {/* ── Credentialing timeline ─────────────────────────────── */}
      <div className="card">
        <div className="card-head"><h3>Credentialing timeline</h3></div>
        {events.length === 0 ? (
          <EmptyState
            title="Nothing on the timeline yet"
            hint="Credentials and verifications appear here in date order."
          />
        ) : (
          <div style={{ padding: "4px 18px" }}>
            <div className="timeline">
              {events.map((e, i) => (
                <div className="timeline-item" key={i}>
                  <div className="timeline-ico">
                    <span
                      className={`badge ${toneClass[e.tone] ?? "badge-muted"}`}
                      style={{ padding: "2px 6px" }}
                    >
                      •
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-between">
                      <span style={{ fontSize: 13 }}>{e.text}</span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {fmtDateTime(e.at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
