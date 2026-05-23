import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, StageBadge } from "@/components/ui";
import {
  computeReadiness,
  READINESS_META,
  READINESS_TIERS,
  type ReadinessResult,
  type ReadinessTier,
} from "@/lib/readiness";
import type { CredentialingItem } from "@/lib/credentialing";
import type { PipelineStage } from "@/lib/types";

export const metadata: Metadata = { title: "Placement readiness" };
export const dynamic = "force-dynamic";

// Maps a READINESS_META tone onto the project's badge classes.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

// Just the provider columns this view renders.
interface ProviderLite {
  id: string;
  full_name: string;
  clinician_role: string | null;
  specialty: string | null;
  pipeline_stage: PipelineStage;
}

interface ReadinessRow {
  provider: ProviderLite;
  result: ReadinessResult;
}

// A thin packet-completion bar — same visual language as the dashboard /
// reports progress bars.
function PacketBar({ percent }: { percent: number }) {
  return (
    <div
      style={{
        height: 7,
        width: 96,
        borderRadius: 100,
        background: "var(--line-2)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          height: "100%",
          background: "var(--teal)",
          borderRadius: 100,
        }}
      />
    </div>
  );
}

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: { tier?: string };
}) {
  const supabase = createClient();

  const tierParam =
    searchParams.tier &&
    (READINESS_TIERS as string[]).includes(searchParams.tier)
      ? (searchParams.tier as ReadinessTier)
      : null;

  // Active roster, every credentialing_items row, and every credential with an
  // expiry. credentialing_items (migration 0011) may not be applied yet — the
  // query is allowed to error and we degrade to an every-clinician "not
  // started" view rather than crashing, exactly like the Credentialing tab.
  const [providersRes, itemsRes, credsRes] = await Promise.all([
    supabase
      .from("providers")
      .select("id, full_name, clinician_role, specialty, pipeline_stage")
      .is("archived_at", null)
      .order("full_name", { ascending: true }),
    supabase.from("credentialing_items").select("*"),
    supabase
      .from("provider_credentials")
      .select("provider_id, expires_on")
      .not("expires_on", "is", null),
  ]);

  const providers = (providersRes.data as ProviderLite[]) ?? [];
  const credentialingReady = !itemsRes.error;

  // Group credentialing_items by provider.
  const itemsByProvider = new Map<string, CredentialingItem[]>();
  for (const it of (itemsRes.data as CredentialingItem[]) ?? []) {
    const list = itemsByProvider.get(it.provider_id) ?? [];
    list.push(it);
    itemsByProvider.set(it.provider_id, list);
  }

  // Group expiring/expired credentials by provider.
  const credsByProvider = new Map<string, { expires_on: string | null }[]>();
  for (const c of (credsRes.data as
    | { provider_id: string; expires_on: string | null }[]
    | null) ?? []) {
    const list = credsByProvider.get(c.provider_id) ?? [];
    list.push({ expires_on: c.expires_on });
    credsByProvider.set(c.provider_id, list);
  }

  // Score every clinician once.
  const rows: ReadinessRow[] = providers.map((p) => ({
    provider: p,
    result: computeReadiness({
      items: itemsByProvider.get(p.id) ?? [],
      credentials: credsByProvider.get(p.id) ?? [],
    }),
  }));

  // Roster-wide counts (stable — computed before the tier filter).
  const tierCounts: Record<ReadinessTier, number> = {
    ready: 0,
    nearly: 0,
    in_progress: 0,
    not_started: 0,
  };
  let blocked = 0;
  for (const r of rows) {
    tierCounts[r.result.tier]++;
    if (r.result.blocked) blocked++;
  }

  // Best-prepared first, then by packet completion, then by name.
  const tierRank = (t: ReadinessTier) => READINESS_TIERS.indexOf(t);
  const sorted = [...rows].sort((a, b) => {
    const byTier = tierRank(a.result.tier) - tierRank(b.result.tier);
    if (byTier !== 0) return byTier;
    const byPacket = b.result.packetPercent - a.result.packetPercent;
    if (byPacket !== 0) return byPacket;
    return a.provider.full_name.localeCompare(b.provider.full_name);
  });

  const visible = tierParam
    ? sorted.filter((r) => r.result.tier === tierParam)
    : sorted;

  const kpis = [
    {
      label: "Active clinicians",
      value: providers.length,
      sub: "on the roster",
    },
    {
      label: "Ready to place",
      value: tierCounts.ready,
      sub: "packet complete",
    },
    {
      label: "Nearly ready",
      value: tierCounts.nearly,
      sub: "a short list remains",
    },
    {
      label: "Placement blocked",
      value: blocked,
      sub: "major gap or expired credential",
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Placement readiness</h2>
          <p>
            Every active clinician&apos;s credentialing packet, rolled up so you
            can see at a glance who is ready to put in front of a facility and
            who is still blocked.
          </p>
        </div>
      </div>

      {!credentialingReady && (
        <div className="alert alert-info">
          Credentialing-packet tracking is not set up yet — apply migration{" "}
          <code>0011_credentialing.sql</code> to record packet progress. Until
          then every clinician reads as &quot;not started&quot;; the credential
          expiry column below is still live.
        </div>
      )}

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <Link
          href="/readiness"
          className={`btn btn-sm${!tierParam ? " btn-primary" : ""}`}
        >
          All ({rows.length})
        </Link>
        {READINESS_TIERS.map((t) => (
          <Link
            key={t}
            href={`/readiness?tier=${t}`}
            className={`btn btn-sm${tierParam === t ? " btn-primary" : ""}`}
          >
            {READINESS_META[t].label} ({tierCounts[t]})
          </Link>
        ))}
      </div>

      {providers.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No clinicians on the roster yet"
            hint="Add clinicians, or import them in bulk, and their placement readiness will track here."
            action={
              <Link href="/providers/new" className="btn btn-primary btn-sm">
                Add a clinician
              </Link>
            }
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No clinicians in that band"
            hint="Try another readiness filter."
          />
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>
              {tierParam ? READINESS_META[tierParam].label : "All clinicians"}
            </h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {tierParam
                ? `${visible.length} of ${rows.length} shown`
                : `${rows.length} clinician${rows.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Clinician</th>
                  <th>Specialty</th>
                  <th>Stage</th>
                  <th>Credentialing packet</th>
                  <th>Open gaps</th>
                  <th>Credentials</th>
                  <th>Readiness</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ provider, result }) => {
                  const meta = READINESS_META[result.tier];
                  return (
                    <tr key={provider.id}>
                      <td>
                        <Link
                          href={`/providers/${provider.id}?tab=credentialing`}
                          style={{ fontWeight: 700 }}
                        >
                          {provider.full_name}
                        </Link>
                        {provider.clinician_role && (
                          <span className="muted" style={{ fontSize: 11 }}>
                            {" · "}
                            {provider.clinician_role}
                          </span>
                        )}
                      </td>
                      <td className="muted">{provider.specialty ?? "—"}</td>
                      <td>
                        <StageBadge stage={provider.pipeline_stage} />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <PacketBar percent={result.packetPercent} />
                          <span style={{ fontSize: 12, fontWeight: 700 }}>
                            {result.packetPercent}%
                          </span>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {result.packetComplete}/{result.packetCountable}
                          </span>
                        </div>
                      </td>
                      <td>
                        {result.openGaps === 0 ? (
                          <span className="muted" style={{ fontSize: 12 }}>
                            None
                          </span>
                        ) : (
                          <span style={{ fontSize: 12 }}>
                            {result.openGaps}
                            {result.majorGaps > 0 && (
                              <span
                                className="badge badge-danger"
                                style={{ marginLeft: 6 }}
                              >
                                {result.majorGaps} major
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td>
                        {result.expiredCredentials > 0 ? (
                          <span className="badge badge-danger">
                            {result.expiredCredentials} expired
                          </span>
                        ) : result.expiringCredentials > 0 ? (
                          <span className="badge badge-warn">
                            {result.expiringCredentials} expiring
                          </span>
                        ) : (
                          <span className="badge badge-ok">Current</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            badgeTone[meta.tone] ?? "badge-muted"
                          }`}
                          title={result.summary}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Readiness combines the credentialing packet on each clinician&apos;s{" "}
        Credentialing tab with the expiry of their licenses and certifications.
        Click a clinician to open and work their packet.
      </p>
    </>
  );
}
