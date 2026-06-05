import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { IconShield, IconCheck } from "@/components/icons";
import {
  buildPacket,
  CREDENTIALING_STATUS_LABELS,
  CREDENTIALING_STATUS_TONE,
  type CredentialingItem,
  type PacketRow,
} from "@/lib/credentialing";
import { computeReadiness, READINESS_META } from "@/lib/readiness";
import { expiryStatus, expiryCopy, EXPIRY_META } from "@/lib/credentials";
import { CREDENTIAL_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import type { CredentialType } from "@/lib/types";

export const metadata: Metadata = { title: "Placement readiness" };
export const dynamic = "force-dynamic";

// Maps a tone key (from READINESS_META / CREDENTIALING_STATUS_TONE / EXPIRY_META)
// onto the project's shared badge classes — same convention as the staff
// /readiness page and credentialing-panel.tsx.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

// Just the provider_credentials columns this view renders.
interface CredentialLite {
  type: CredentialType;
  state: string | null;
  expires_on: string | null;
}

// A thin packet-completion bar — same visual language as the staff /readiness
// page and the dashboard / reports progress bars.
function PacketBar({ percent, ready }: { percent: number; ready: boolean }) {
  return (
    <div
      style={{
        height: 9,
        borderRadius: 999,
        background: "var(--line-2)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          height: "100%",
          borderRadius: 999,
          background: ready ? "var(--ok)" : "var(--teal)",
        }}
      />
    </div>
  );
}

export default async function ClinicianReadinessPage() {
  await requireProvider();
  const provider = await getMyProvider();

  // Profile not linked yet — same calm empty state the other clinician pages
  // (credentials, home) show.
  if (!provider) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Placement readiness</h2>
            <p>What still needs to be in place before you can be placed.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your profile isn't linked yet"
            hint="An administrator still needs to connect your account to your clinician profile. Reach out to your AlignMD recruiter and your readiness will track here automatically."
          />
        </div>
      </>
    );
  }

  const supabase = createClient();

  // This clinician's credentialing packet (0011) and credentials (0001).
  // credentialing_items may not be migrated yet — the query is allowed to
  // error and we degrade to an "every item not started" view, exactly like
  // the clinician dashboard's credentialing card and the staff /readiness
  // page. RLS scopes both reads to this clinician's own rows.
  const [itemsRes, credsRes] = await Promise.all([
    supabase
      .from("credentialing_items")
      .select("*")
      .eq("provider_id", provider.id),
    supabase
      .from("provider_credentials")
      .select("type, state, expires_on")
      .eq("provider_id", provider.id),
  ]);

  const credentialingReady = !itemsRes.error;
  const items = (itemsRes.data as CredentialingItem[]) ?? [];
  const creds = (credsRes.data as CredentialLite[]) ?? [];

  // The merged packet + the rolled-up readiness verdict. computeReadiness is
  // the exact module the staff /readiness board uses, so the clinician's view
  // and the recruiter's view of the same packet can never drift apart.
  const packet = buildPacket(items);
  const result = computeReadiness({
    items,
    credentials: creds.map((c) => ({ expires_on: c.expires_on })),
  });
  const meta = READINESS_META[result.tier];
  const isReady = result.tier === "ready";

  // Outstanding packet items — everything not complete and not marked N/A.
  // This is the plain-English answer to "what's left before I can be placed?"
  const outstanding: PacketRow[] = packet.filter(
    (r) => r.status !== "complete" && r.status !== "na",
  );

  // Credentials that have expired or expire within 90 days.
  const attention = creds
    .map((c) => ({ c, status: expiryStatus(c.expires_on) }))
    .filter(
      ({ status }) => status === "expired" || status.startsWith("expiring"),
    )
    .sort((a, b) => (a.c.expires_on ?? "").localeCompare(b.c.expires_on ?? ""));

  const kpis = [
    {
      label: "Packet complete",
      value: `${result.packetComplete}/${result.packetCountable}`,
      sub: "checklist items done",
    },
    {
      label: "Still outstanding",
      value: String(result.openGaps),
      sub: result.openGaps === 1 ? "item to finish" : "items to finish",
    },
    {
      label: "Credentials to watch",
      value: String(attention.length),
      sub: "expired or expiring soon",
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Placement readiness</h2>
          <p>
            Everything that needs to be in place before AlignMD can put you in
            front of a facility — your credentialing packet and the expiry of
            your licenses and certifications, in one view.
          </p>
        </div>
      </div>

      {!credentialingReady && (
        <div className="alert alert-info">
          <IconShield width={13} height={13} /> Credentialing-packet tracking
          isn&apos;t switched on yet. Until it is, the checklist below shows the
          standard packet with every item still to do; your credential expiry
          is still live.
        </div>
      )}

      {/* ── Readiness verdict ──────────────────────────────────────── */}
      <div className="card card-pad">
        <div
          className="row-between"
          style={{ alignItems: "flex-start", gap: 16 }}
        >
          <div style={{ minWidth: 0 }}>
            <span className={`badge ${badgeTone[meta.tone] ?? "badge-muted"}`}>
              {meta.label}
            </span>
            <h3 style={{ fontSize: 16, marginTop: 8 }}>{result.summary}</h3>
            <p className="muted" style={{ fontSize: 12, marginTop: 3 }}>
              {meta.hint}
            </p>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="kpi-value" style={{ fontSize: 30, lineHeight: 1 }}>
              {result.packetPercent}%
            </div>
            <div className="kpi-label">packet complete</div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <PacketBar percent={result.packetPercent} ready={isReady} />
        </div>

        {result.blocked && (
          <p
            className="muted"
            style={{ fontSize: 12, marginTop: 12, color: "var(--danger)" }}
          >
            One or more items need attention before you can be placed — see
            what&apos;s outstanding below.
          </p>
        )}
      </div>

      <div className="kpi-grid" style={{ marginTop: 16 }}>
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── What's still needed ────────────────────────────────────── */}
      {outstanding.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h3>What&apos;s still needed</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {outstanding.length} item{outstanding.length === 1 ? "" : "s"}{" "}
              outstanding
            </span>
          </div>
          <div className="card-pad">
            <div className="stack" style={{ gap: 10 }}>
              {outstanding.map((r) => (
                <div
                  key={r.item_type}
                  className="row"
                  style={{ gap: 10, alignItems: "flex-start" }}
                >
                  <span
                    className={`badge ${
                      badgeTone[CREDENTIALING_STATUS_TONE[r.status]] ??
                      "badge-muted"
                    }`}
                    style={{ flexShrink: 0 }}
                  >
                    {CREDENTIALING_STATUS_LABELS[r.status]}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13 }}>{r.label}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.hint}
                    </div>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-pad">
            <div
              className="row"
              style={{ gap: 10, alignItems: "flex-start" }}
            >
              <span
                className="badge badge-ok"
                style={{ flexShrink: 0, marginTop: 1 }}
              >
                <IconCheck width={12} height={12} />
              </span>
              <span>
                <b style={{ fontSize: 13 }}>
                  Your credentialing packet is complete.
                </b>
                <div className="muted" style={{ fontSize: 12 }}>
                  Keep your licenses and certifications current and you stay
                  ready to place.
                </div>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Full packet checklist ──────────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>Packet checklist</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {packet.length} standard items
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {packet.map((r) => (
                <tr key={r.item_type}>
                  <td>
                    <b>{r.label}</b>
                    <div
                      className="muted"
                      style={{ fontSize: 11, marginTop: 2 }}
                    >
                      {r.hint}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        badgeTone[CREDENTIALING_STATUS_TONE[r.status]] ??
                        "badge-muted"
                      }`}
                    >
                      {CREDENTIALING_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="muted">{fmtDate(r.item?.completed_on)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Credential expiry ──────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>Licenses &amp; certifications</h3>
          <Link
            href="/clinician/credentials"
            className="muted"
            style={{ fontSize: 12, fontWeight: 600 }}
          >
            View all →
          </Link>
        </div>
        {creds.length === 0 ? (
          <EmptyState
            title="No credentials on file yet"
            hint="Your credentialing coordinator records your licenses, DEA and certifications. Upload supporting documents to help them along."
          />
        ) : attention.length === 0 ? (
          <div className="card-pad">
            <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <span
                className="badge badge-ok"
                style={{ flexShrink: 0, marginTop: 1 }}
              >
                <IconCheck width={12} height={12} />
              </span>
              <span>
                <b style={{ fontSize: 13 }}>All credentials current.</b>
                <div className="muted" style={{ fontSize: 12 }}>
                  Nothing on file has expired or expires within 90 days.
                </div>
              </span>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Credential</th>
                  <th>State</th>
                  <th>Expires</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attention.map(({ c, status }, i) => (
                  <tr key={`${c.type}-${c.state ?? ""}-${i}`}>
                    <td>
                      <b>
                        {CREDENTIAL_LABELS[c.type] ?? c.type}
                      </b>
                    </td>
                    <td className="muted">{c.state || "—"}</td>
                    <td className="muted">
                      {fmtDate(c.expires_on)}
                      <div style={{ fontSize: 11 }}>
                        {expiryCopy(c.expires_on)}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          badgeTone[EXPIRY_META[status].tone] ?? "badge-muted"
                        }`}
                      >
                        {EXPIRY_META[status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p
        className="muted"
        style={{
          fontSize: 11,
          marginTop: 18,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <IconShield width={12} height={12} /> Your credentialing packet is
        managed by your AlignMD credentialing coordinator. Uploading documents
        from the{" "}
        <Link href="/clinician/documents" style={{ fontWeight: 600 }}>
          Documents
        </Link>{" "}
        tab helps them clear these items faster.
      </p>
    </>
  );
}
