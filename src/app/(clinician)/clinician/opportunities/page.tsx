import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { scoreMatch, TIER_META, type MatchResult } from "@/lib/match";
import { computeReadiness, READINESS_META } from "@/lib/readiness";
import {
  classifyOpportunity,
  isOpportunityMatch,
  OPPORTUNITY_META,
  type OpportunityState,
} from "@/lib/opportunities";
import type { CredentialingItem } from "@/lib/credentialing";
import { fmtDate } from "@/lib/format";
import type { Provider } from "@/lib/types";

export const metadata: Metadata = { title: "My matches" };
export const dynamic = "force-dynamic";

// Maps a TIER_META / OPPORTUNITY_META / READINESS_META tone onto the
// project's badge classes — same convention as the other clinician pages.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

// One open internal requisition, with its facility joined. The facility join
// is null-tolerant — if migration 0014's facilities policy isn't applied the
// join simply returns null and the row renders without a facility name.
interface OpenJobRow {
  id: string;
  title: string;
  specialty: string | null;
  setting: string | null;
  schedule: string | null;
  is_permanent: boolean | null;
  created_at: string;
  facility: { id: string; name: string; state: string | null } | null;
}

// A provider_credentials row scoped to what the match + readiness engines
// consume — the same shape the staff /opportunities page uses.
interface CredRow {
  type: string;
  state: string | null;
  is_compact: boolean | null;
  expires_on: string | null;
}

interface MatchedRole {
  job: OpenJobRow;
  match: MatchResult;
  state: OpportunityState;
}

export default async function ClinicianOpportunitiesPage() {
  await requireProvider();
  const provider = await getMyProvider();

  // Profile not linked yet — same calm empty state the other clinician pages
  // (credentials, readiness, jobs) show.
  if (!provider) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>My matches</h2>
            <p>Open AlignMD roles you fit, and what&apos;s left before you can be placed.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your profile isn't linked yet"
            hint="An administrator still needs to connect your account to your clinician profile. Reach out to your AlignMD recruiter and your matches will appear here automatically."
          />
        </div>
      </>
    );
  }

  const p = provider as Provider;
  const supabase = createClient();

  // Open internal requisitions (visible under migration 0014's additive RLS
  // policy — before it is applied the jobs read simply returns only roles
  // this clinician was already submitted to, which are excluded below), this
  // clinician's credentials, their credentialing packet (0011 — allowed to
  // error; degrades to a "packet not started" readiness, exactly like
  // /clinician/readiness), and their existing submissions.
  const [jobsRes, credsRes, itemsRes, subsRes] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, title, specialty, setting, schedule, is_permanent, created_at, facility:facilities(id, name, state)",
      )
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("provider_credentials")
      .select("type, state, is_compact, expires_on")
      .eq("provider_id", p.id),
    supabase
      .from("credentialing_items")
      .select("*")
      .eq("provider_id", p.id),
    supabase.from("submissions").select("job_id").eq("provider_id", p.id),
  ]);

  const jobs = ((jobsRes.data as unknown as OpenJobRow[]) ?? []).map((j) => ({
    ...j,
    // Supabase typings can surface a to-one join as an array — normalise.
    facility: Array.isArray(j.facility) ? (j.facility[0] ?? null) : j.facility,
  }));
  const creds = ((credsRes.data as CredRow[]) ?? []).map((c) => ({
    type: c.type,
    state: c.state,
    is_compact: c.is_compact,
    expires_on: c.expires_on,
  }));
  const credentialingReady = !itemsRes.error;
  const items = (itemsRes.data as CredentialingItem[]) ?? [];
  const submittedJobIds = new Set(
    ((subsRes.data as { job_id: string }[] | null) ?? []).map(
      (s) => s.job_id,
    ),
  );

  // This clinician's readiness — the exact module the staff /readiness board
  // and /clinician/readiness use, so the verdict can never drift.
  const readiness = computeReadiness({ items, credentials: creds });
  const readinessMeta = READINESS_META[readiness.tier];
  const state = classifyOpportunity(readiness);
  const stateMeta = OPPORTUNITY_META[state];

  // Match requirements for the visible open jobs — same derivation as the
  // staff /opportunities page and jobs/[id]: requirement states, else the
  // facility's state; telehealth inferred from setting/specialty.
  const jobIds = jobs.map((j) => j.id);
  let requirements: {
    job_id: string;
    required_license_states: string[] | null;
    required_certs: string[] | null;
    min_years_experience: number | null;
  }[] = [];
  if (jobIds.length) {
    const { data } = await supabase
      .from("job_requirements")
      .select(
        "job_id, required_license_states, required_certs, min_years_experience",
      )
      .in("job_id", jobIds);
    requirements = (data as typeof requirements) ?? [];
  }
  const requirementByJob = new Map<string, (typeof requirements)[number]>();
  for (const r of requirements) requirementByJob.set(r.job_id, r);

  // Score this clinician against every visible open role and keep the real
  // matches (fair or better — a stretch or long shot is noise, not a lead).
  // Roles already submitted to are tracked on /clinician/submissions instead.
  const matched: MatchedRole[] = [];
  for (const job of jobs) {
    if (submittedJobIds.has(job.id)) continue;
    const req = requirementByJob.get(job.id) ?? null;
    const jobStates: string[] =
      req?.required_license_states && req.required_license_states.length
        ? req.required_license_states
        : job.facility?.state
          ? [job.facility.state]
          : [];
    const jobIsTelehealth =
      /telehealth/i.test(job.setting || "") ||
      /telehealth/i.test(job.specialty || "");
    const match = scoreMatch({
      provider: {
        clinician_role: p.clinician_role,
        specialty: p.specialty,
        years_experience: p.years_experience,
        telehealth_ok: p.telehealth_ok,
      },
      credentials: creds,
      jobSpecialty: job.specialty,
      jobStates,
      jobIsTelehealth,
      requiredCerts: (req?.required_certs ?? []) as string[],
      minYears: req?.min_years_experience ?? null,
    });
    if (!isOpportunityMatch(match.tier)) continue;
    matched.push({ job, match, state });
  }
  matched.sort((a, b) => b.match.score - a.match.score);

  const strongCount = matched.filter((m) => m.match.tier === "strong").length;

  const kpis = [
    {
      label: "Roles you match",
      value: String(matched.length),
      sub: "open AlignMD roles, fair fit or better",
    },
    {
      label: "Strong matches",
      value: String(strongCount),
      sub: strongCount === 1 ? "role that fits well" : "roles that fit well",
    },
    {
      label: "Packet complete",
      value: `${readiness.packetPercent}%`,
      sub: "credentialing checklist",
    },
    {
      label: "Placement status",
      value: stateMeta.label,
      sub: readinessMeta.label.toLowerCase(),
      small: true,
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>My matches</h2>
          <p>
            Open AlignMD roles ranked against your profile and credentials —
            the same scoring your recruiter sees — plus where your
            credentialing stands on the way to a placement.
          </p>
        </div>
      </div>

      {!credentialingReady && (
        <div className="alert alert-info">
          <IconShield width={13} height={13} /> Credentialing-packet tracking
          isn&apos;t switched on yet, so your placement status reads from your
          credential expiry only. Your match scores below are live.
        </div>
      )}

      {/* ── Readiness call-out — the "what's between you and placement" line ── */}
      <div className="card card-pad">
        <div className="row-between" style={{ alignItems: "center", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <span
              className={`badge ${badgeTone[stateMeta.tone] ?? "badge-muted"}`}
            >
              {stateMeta.label}
            </span>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {state === "submit_now"
                ? "Your credentialing packet is complete — you can be submitted to any role below as soon as you and your recruiter pick one."
                : state === "blocked"
                  ? "A major credentialing gap or an expired credential is holding back every submission. Clearing it unlocks all the roles below."
                  : "Your credentialing packet is still being worked. You can be submitted once it's complete — finishing it is what stands between you and the roles below."}
            </p>
          </div>
          <Link
            href="/clinician/readiness"
            className="btn btn-sm"
            style={{ flexShrink: 0 }}
          >
            See what&apos;s left
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={k.small ? { fontSize: 18 } : undefined}>
              {k.value}
            </div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {matched.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No matched roles right now"
            hint="Either the desk has no open role that fits your profile today, or role matching hasn't been switched on for the portal yet. New requisitions are matched against your profile automatically — check back, and keep your credentials current so you surface at the top when one opens."
          />
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>Matched roles ({matched.length})</h3>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Facility</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Match</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {matched.map(({ job, match }) => {
                  const tierMeta = TIER_META[match.tier];
                  const gaps = match.reasons.filter(
                    (r) => !r.ok && r.severity === "major",
                  );
                  return (
                    <tr key={job.id}>
                      <td>
                        <b>{job.title}</b>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {job.specialty ?? "—"}
                          {gaps.length > 0 && (
                            <> · {gaps[0].text}</>
                          )}
                        </div>
                      </td>
                      <td>{job.facility?.name ?? "—"}</td>
                      <td>{job.facility?.state ?? "—"}</td>
                      <td>{job.is_permanent ? "Permanent" : "Temp / locum"}</td>
                      <td>
                        <span
                          className={`badge ${badgeTone[tierMeta.tone] ?? "badge-muted"}`}
                          title={match.reasons.map((r) => r.text).join(" · ")}
                        >
                          {tierMeta.label} · {match.score}
                        </span>
                      </td>
                      <td>{fmtDate(job.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        Matches are scored on licensure, specialty, certifications, experience
        and location — the same engine your recruiter uses. Roles you&apos;ve
        already been submitted to are tracked under{" "}
        <Link href="/clinician/submissions">My submissions</Link>. Interested
        in a role here? Tell your recruiter — submissions are made by the
        AlignMD desk.
      </p>
    </>
  );
}
