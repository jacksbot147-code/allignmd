import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { EmptyState, StageBadge } from "@/components/ui";
import { IconShield } from "@/components/icons";
import {
  CredentialingProgressCard,
  ProfileCompletenessCard,
  MatchedJobsCard,
  CredentialExpiryCard,
  QuickActionsCard,
  type MatchedJobPreview,
  type ExpiringCredential,
} from "@/components/clinician-dashboard";
import { CREDENTIAL_LABELS, AVAILABILITY_LABELS } from "@/lib/constants";
import { expiryStatus, expiryCopy } from "@/lib/credentials";
import { fmtDate, titleCase } from "@/lib/format";
import {
  buildPacket,
  packetProgress,
  packetGaps,
  isPacketReady,
  type CredentialingItem,
} from "@/lib/credentialing";
import { profileCompleteness } from "@/lib/profile-completeness";
import { scoreMatch, type MatchCredential } from "@/lib/match";
import type {
  Provider,
  ProviderCredential,
  ProviderAvailability,
  CredentialType,
  AvailabilityBlock,
} from "@/lib/types";

export const metadata: Metadata = { title: "Clinician dashboard" };
export const dynamic = "force-dynamic";

// One active row from external_jobs (migration 0010).
interface ExternalJobRow {
  id: string;
  source: string;
  title: string;
  org_name: string | null;
  location: string | null;
  state: string | null;
  is_remote: boolean | null;
  clinician_role: string | null;
  specialty: string | null;
  employment_type: string | null;
  url: string;
  posted_at: string | null;
}

/** A friendly time-of-day greeting. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function ClinicianHomePage() {
  await requireProvider();
  const provider = await getMyProvider();

  if (!provider) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Welcome to AlignMD</h2>
            <p>Your clinician portal.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your profile isn't linked yet"
            hint="An administrator still needs to connect your account to your clinician profile. Reach out to your AlignMD recruiter and they'll set it up — your portal will fill in automatically once they do."
          />
        </div>
      </>
    );
  }

  const p = provider as Provider;
  const supabase = createClient();

  // Single data-fetching hub for the clinician dashboard. Every query is
  // defensive — credentialing_items (0011) and external_jobs (0010) error
  // cleanly if their migration has not been applied, and the widgets handle
  // that without crashing.
  const [credsRes, availRes, docsRes, subsRes, credItemsRes, extJobsRes] =
    await Promise.all([
      supabase
        .from("provider_credentials")
        .select("*")
        .eq("provider_id", p.id)
        .order("expires_on", { ascending: true, nullsFirst: false }),
      supabase
        .from("provider_availability")
        .select("*")
        .eq("provider_id", p.id)
        .order("block_start", { ascending: true }),
      supabase
        .from("provider_documents")
        .select("id")
        .eq("provider_id", p.id),
      supabase
        .from("submissions")
        .select(
          "*, job:jobs(id, title, specialty, setting, facility:facilities(name, state))",
        )
        .eq("provider_id", p.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("credentialing_items")
        .select("*")
        .eq("provider_id", p.id),
      supabase
        .from("external_jobs")
        .select(
          "id, source, title, org_name, location, state, is_remote, clinician_role, specialty, employment_type, url, posted_at",
        )
        .eq("active", true)
        .order("posted_at", { ascending: false })
        .limit(100),
    ]);

  const creds = (credsRes.data ?? []) as ProviderCredential[];
  const availability = (availRes.data ?? []) as ProviderAvailability[];
  const docCount = (docsRes.data ?? []).length;
  const submissions = subsRes.data ?? [];

  // ── Credentialing packet — a missing 0011 table shows a calm "not started"
  // state rather than a misleading 0%.
  const credentialingReady = !credItemsRes.error;
  const credItems = (credItemsRes.data ?? []) as CredentialingItem[];
  const packet = buildPacket(credItems);
  const packetProg = packetProgress(packet);
  const packetGapList = packetGaps(packet);
  const packetReady = isPacketReady(packet);

  // ── Profile completeness — scored over the fields the match engine uses.
  const completeness = profileCompleteness({
    provider: p,
    availabilityCount: availability.length,
    documentCount: docCount,
  });

  // ── Credential-expiry alerts — anything expired or inside 90 days.
  const expiringCreds: ExpiringCredential[] = creds
    .map((c) => {
      const status = expiryStatus(c.expires_on);
      return { c, status };
    })
    .filter(
      ({ status }) => status === "expired" || status.startsWith("expiring"),
    )
    .slice(0, 5)
    .map(({ c, status }) => ({
      id: c.id,
      label: CREDENTIAL_LABELS[c.type as CredentialType] ?? c.type,
      state: c.state,
      expiresOn: c.expires_on,
      copy: expiryCopy(c.expires_on),
      tone:
        status === "expired" || status === "expiring_30" ? "danger" : "warn",
    }));

  // ── Matched jobs — score every active posting against this clinician,
  // exactly as the Open-jobs page does, then keep the top few by score.
  const jobsAvailable = !extJobsRes.error;
  const externalJobs = (extJobsRes.data as ExternalJobRow[]) ?? [];
  const matchCredentials: MatchCredential[] = creds.map((c) => ({
    type: c.type,
    state: c.state,
    is_compact: c.is_compact,
    expires_on: c.expires_on,
  }));
  const matchedJobs: MatchedJobPreview[] = externalJobs
    .map((job) => ({
      id: job.id,
      title: job.title,
      org_name: job.org_name,
      location: job.location,
      state: job.state,
      is_remote: job.is_remote,
      specialty: job.specialty,
      match: scoreMatch({
        provider: {
          clinician_role: p.clinician_role,
          specialty: p.specialty,
          years_experience: p.years_experience,
          telehealth_ok: p.telehealth_ok,
        },
        credentials: matchCredentials,
        jobSpecialty: job.specialty,
        jobStates: job.state ? [job.state] : [],
        jobIsTelehealth: Boolean(job.is_remote),
        requiredCerts: [],
        minYears: null,
      }),
    }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 4);

  const firstName = (p.full_name || "").split(" ")[0] || "there";

  // Active submissions — anything not yet placed.
  const activeSubs = submissions.filter((s: any) => s.stage !== "placed");
  const placedCount = submissions.length - activeSubs.length;

  const kpis = [
    { label: "Open submissions", value: activeSubs.length, sub: "roles in motion" },
    {
      label: "Placements",
      value: placedCount,
      sub: "roles you've landed",
    },
    {
      label: "Credentials",
      value: creds.length,
      sub: "on file",
    },
    {
      label: "Strong matches",
      value: matchedJobs.filter((j) => j.match.tier === "strong").length,
      sub: "jobs that fit you",
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>
            {greeting()}, {firstName}
          </h2>
          <p>
            Here&apos;s where things stand — keep your profile current so
            facilities see your best match.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Where you stand: credentialing + profile strength ──────── */}
      <div className="grid-2">
        <CredentialingProgressCard
          tableReady={credentialingReady}
          packetReady={packetReady}
          progress={packetProg}
          gaps={packetGapList}
        />
        <ProfileCompletenessCard completeness={completeness} />
      </div>

      {/* ── Credential-expiry alerts (only when there's something) ── */}
      <CredentialExpiryCard expiring={expiringCreds} />

      {/* ── Matched jobs preview ───────────────────────────────────── */}
      <MatchedJobsCard jobs={matchedJobs} available={jobsAvailable} />

      <div className="grid-2" style={{ marginTop: 16 }}>
        {/* ── Active submissions snapshot ──────────────────────── */}
        <div className="card" style={{ alignSelf: "start" }}>
          <div className="card-head">
            <h3>Your submissions</h3>
            <Link
              href="/clinician/submissions"
              className="muted"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              View all →
            </Link>
          </div>
          {submissions.length === 0 ? (
            <EmptyState
              title="No submissions yet"
              hint="When a recruiter puts you forward for a role, it shows up here with its current stage."
            />
          ) : (
            <div className="card-pad" style={{ paddingTop: 4 }}>
              <div className="stack" style={{ gap: 2 }}>
                {submissions.slice(0, 5).map((s: any) => (
                  <div
                    key={s.id}
                    className="row-between"
                    style={{ gap: 12, padding: "9px 0" }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          fontWeight: 650,
                          fontSize: 13,
                          display: "block",
                        }}
                      >
                        {s.job?.title ?? "Role"}
                      </span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {s.job?.facility?.name ?? "—"}
                        {s.job?.facility?.state
                          ? ` · ${s.job.facility.state}`
                          : ""}
                      </span>
                    </span>
                    <StageBadge stage={s.stage} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Quick actions ────────────────────────────────────── */}
        <QuickActionsCard />
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        {/* ── Profile snapshot ─────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <h3>Your profile</h3>
            <Link
              href="/clinician/profile"
              className="muted"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              Edit →
            </Link>
          </div>
          <div className="card-pad">
            <div
              className="row"
              style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}
            >
              {p.clinician_role && (
                <span className="badge badge-teal">{p.clinician_role}</span>
              )}
              <StageBadge stage={p.pipeline_stage} />
            </div>
            <dl className="def-list">
              <dt>Specialty</dt>
              <dd>{p.specialty || "—"}</dd>
              <dt>Subspecialty</dt>
              <dd>{p.subspecialty || "—"}</dd>
              <dt>Experience</dt>
              <dd>
                {p.years_experience != null
                  ? `${p.years_experience} years`
                  : "—"}
              </dd>
              <dt>NPI</dt>
              <dd className="mono">{p.npi || "—"}</dd>
              <dt>Languages</dt>
              <dd>{p.languages?.join(", ") || "—"}</dd>
              <dt>Telehealth</dt>
              <dd>{p.telehealth_ok ? "Open to it" : "No"}</dd>
              <dt>Available from</dt>
              <dd>{fmtDate(p.available_start)}</dd>
            </dl>
          </div>
        </div>

        {/* ── Availability ─────────────────────────────────────── */}
        <div className="card" style={{ alignSelf: "start" }}>
          <div className="card-head">
            <h3>Availability</h3>
            <Link
              href="/clinician/availability"
              className="muted"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              Manage →
            </Link>
          </div>
          <div className="card-pad">
            {availability.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                No availability set yet — add the shifts and date ranges
                you&apos;re open to so recruiters can match you faster.
              </p>
            ) : (
              <div className="stack">
                {availability.map((a) => (
                  <div key={a.id} className="row-between">
                    <span className="badge badge-teal">
                      {AVAILABILITY_LABELS[
                        a.block_type as AvailabilityBlock
                      ] ?? titleCase(a.block_type)}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {a.block_start || a.block_end
                        ? `${fmtDate(a.block_start)} – ${fmtDate(a.block_end)}`
                        : a.note || "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
        <IconShield width={12} height={12} /> You only ever see your own
        record. Malpractice and restricted data stay with privileged staff.
      </p>
    </>
  );
}
