import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFacilityContact } from "@/lib/auth";
import { EmptyState, StageBadge } from "@/components/ui";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants";
import { TIER_META, type MatchTier } from "@/lib/match";
import { fmtDate } from "@/lib/format";
import type { PipelineStage } from "@/lib/types";
import {
  facilityReadinessFor,
  facilityReadinessUnknown,
  type FacilityReadinessSignal,
} from "@/lib/facility-readiness";
import type { CredentialingItem } from "@/lib/credentialing";

export const metadata: Metadata = { title: "Candidates" };
export const dynamic = "force-dynamic";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  teal: "badge-teal",
  muted: "badge-muted",
  danger: "badge-danger",
};

/** Derive a match tier from a stored numeric score (mirrors match.ts). */
function tierForScore(score: number | null): MatchTier | null {
  if (score == null) return null;
  if (score >= 80) return "strong";
  if (score >= 60) return "fair";
  if (score >= 40) return "stretch";
  return "ineligible";
}

export default async function FacilityCandidatesPage({
  searchParams,
}: {
  searchParams: { stage?: string };
}) {
  const user = await requireFacilityContact();

  if (!user.facility_id) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Candidates</h2>
            <p>Clinicians submitted across all of your roles.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your account isn't linked to a facility yet"
            hint="An AlignMD administrator still needs to connect your account to your facility. Once they do, submitted candidates will appear here."
          />
        </div>
      </>
    );
  }

  const supabase = createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("facility_id", user.facility_id);
  const jobIds = (jobs ?? []).map((j: any) => j.id);
  const jobTitle = new Map<string, string>(
    (jobs ?? []).map((j: any) => [j.id, j.title]),
  );

  let submissions: any[] = [];
  if (jobIds.length) {
    const { data } = await supabase
      .from("submissions")
      .select(
        "*, provider:providers(id, full_name, clinician_role, specialty, years_experience)",
      )
      .in("job_id", jobIds)
      .order("match_score", { ascending: false, nullsFirst: false });
    submissions = data ?? [];
  }

  // ── Per-candidate readiness signal (rolled-up verdict only) ──────────────
  //
  // RLS does not grant facility_contact read access to credentialing_items or
  // provider_credentials (see migrations 0003/0007/0011), and that's correct:
  // those tables are full of internal credentialing detail a facility should
  // never see. But the *rolled-up verdict* — "ready to start / in progress /
  // pending" — is exactly the transparency signal the 2026 VMS commentary
  // names as table-stakes for facility-side portals.
  //
  // Security model — enforced server-side, in this page:
  //   1. The user is already proven to be a facility_contact for `facility_id`
  //      (requireFacilityContact above).
  //   2. We only ever consider providers that this facility has *already* been
  //      submitted a candidate for, by AlignMD (the submissions read above is
  //      RLS-scoped to this facility's jobs — they cannot synthesise an
  //      arbitrary provider id).
  //   3. The admin client below is server-only — the service-role key never
  //      reaches the browser — and is constrained by .in("provider_id", …)
  //      to that exact set of already-submitted providers.
  //   4. We compute the verdict here and pass only the verdict (label, tone,
  //      tier) into JSX. The raw credentialing_items rows and the raw
  //      provider_credentials rows never leave the server frame.
  //   5. facilityReadinessFor() is the only escape hatch out of the raw
  //      readiness numbers — it deliberately drops packetPercent, gap counts,
  //      named credential expiries and the blocked flag.
  //
  // Degrades cleanly: if migration 0011 is absent, the credentialing_items
  // query throws, we fall back to an empty map, and every row reads
  // "Onboarding pending" instead of crashing.
  const readinessByProvider = new Map<string, FacilityReadinessSignal>();
  const providerIds = Array.from(
    new Set(
      submissions
        .map((s: any) => s.provider?.id ?? s.provider_id)
        .filter((id: string | null | undefined): id is string => !!id),
    ),
  );
  if (providerIds.length) {
    const admin = createAdminClient();
    let items: CredentialingItem[] = [];
    try {
      const { data } = await admin
        .from("credentialing_items")
        .select(
          "id, provider_id, item_type, status, due_date, completed_on, verified_by, notes, created_at, updated_at",
        )
        .in("provider_id", providerIds);
      items = (data ?? []) as CredentialingItem[];
    } catch {
      items = [];
    }
    // Mirror the "non-privileged staff" view of provider_credentials —
    // malpractice rows are not used by the readiness computation, so we
    // exclude them at the read.
    let creds: Array<{ provider_id: string; expires_on: string | null }> = [];
    try {
      const { data } = await admin
        .from("provider_credentials")
        .select("provider_id, expires_on")
        .in("provider_id", providerIds)
        .neq("type", "malpractice");
      creds = (data ?? []) as typeof creds;
    } catch {
      creds = [];
    }

    const itemsByProvider = new Map<string, CredentialingItem[]>();
    for (const row of items) {
      const bucket = itemsByProvider.get(row.provider_id);
      if (bucket) bucket.push(row);
      else itemsByProvider.set(row.provider_id, [row]);
    }
    const credsByProvider = new Map<
      string,
      Array<{ expires_on: string | null }>
    >();
    for (const row of creds) {
      const bucket = credsByProvider.get(row.provider_id);
      if (bucket) bucket.push({ expires_on: row.expires_on });
      else credsByProvider.set(row.provider_id, [{ expires_on: row.expires_on }]);
    }

    for (const id of providerIds) {
      readinessByProvider.set(
        id,
        facilityReadinessFor({
          items: itemsByProvider.get(id) ?? [],
          credentials: credsByProvider.get(id) ?? [],
        }),
      );
    }
  }

  const stageFilter =
    searchParams.stage && PIPELINE_STAGES.includes(searchParams.stage as PipelineStage)
      ? (searchParams.stage as PipelineStage)
      : null;
  const visible = stageFilter
    ? submissions.filter((s: any) => s.stage === stageFilter)
    : submissions;

  // Per-stage counts for the filter strip.
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: submissions.filter((s: any) => s.stage === stage).length,
  }));

  // KPI counts for the readiness strip. We count each candidate (submission)
  // once — duplicates across multiple roles are intentional, since each
  // submission is a real piece of work for the facility's pipeline.
  const readinessCounts = (() => {
    let ready = 0;
    let progressing = 0; // "nearly" + "in_progress" — same facility-facing message
    let pending = 0;
    for (const s of submissions) {
      const id = s.provider?.id ?? s.provider_id;
      const r = id ? readinessByProvider.get(id) : undefined;
      const tier = r?.tier ?? "not_started";
      if (tier === "ready") ready++;
      else if (tier === "not_started") pending++;
      else progressing++;
    }
    return { ready, progressing, pending };
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Candidates</h2>
          <p>
            Every clinician AlignMD has submitted across your roles, ranked by
            match score.
          </p>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No candidates yet"
            hint="As AlignMD submits matched clinicians to your open roles, they'll appear here with their match score and pipeline stage."
            action={
              <Link href="/facility/jobs" className="btn btn-primary">
                View your roles
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Ready to start</div>
              <div className="kpi-value">{readinessCounts.ready}</div>
              <div className="kpi-sub">cleared to begin</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">In credentialing</div>
              <div className="kpi-value">{readinessCounts.progressing}</div>
              <div className="kpi-sub">paperwork in motion</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Onboarding pending</div>
              <div className="kpi-value">{readinessCounts.pending}</div>
              <div className="kpi-sub">not yet started</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Total submitted</div>
              <div className="kpi-value">{submissions.length}</div>
              <div className="kpi-sub">across your roles</div>
            </div>
          </div>

          <div className="toolbar">
            <Link
              href="/facility/candidates"
              className={`btn btn-sm${!stageFilter ? " btn-primary" : ""}`}
            >
              All ({submissions.length})
            </Link>
            {stageCounts
              .filter((s) => s.count > 0)
              .map((s) => (
                <Link
                  key={s.stage}
                  href={`/facility/candidates?stage=${s.stage}`}
                  className={`btn btn-sm${
                    stageFilter === s.stage ? " btn-primary" : ""
                  }`}
                >
                  {STAGE_LABELS[s.stage]} ({s.count})
                </Link>
              ))}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>
                {stageFilter ? STAGE_LABELS[stageFilter] : "All candidates"} (
                {visible.length})
              </h3>
            </div>
            {visible.length === 0 ? (
              <EmptyState
                title="No candidates at this stage"
                hint="Try another stage, or clear the filter to see everyone."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Clinician</th>
                      <th>Role applied to</th>
                      <th>Experience</th>
                      <th>Match</th>
                      <th>Readiness</th>
                      <th>Submitted</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s: any) => {
                      const tier = tierForScore(s.match_score);
                      const meta = tier ? TIER_META[tier] : null;
                      const providerId: string | null =
                        s.provider?.id ?? s.provider_id ?? null;
                      const readiness =
                        (providerId
                          ? readinessByProvider.get(providerId)
                          : null) ?? facilityReadinessUnknown();
                      return (
                        <tr key={s.id} className="table-row-link">
                          <td>
                            <b>{s.provider?.full_name ?? "Clinician"}</b>
                            <div
                              className="muted"
                              style={{ fontSize: 11 }}
                            >
                              {s.provider?.clinician_role ?? ""}
                              {s.provider?.specialty
                                ? `${
                                    s.provider?.clinician_role ? " · " : ""
                                  }${s.provider.specialty}`
                                : ""}
                            </div>
                          </td>
                          <td>
                            <Link href={`/facility/jobs/${s.job_id}`}>
                              {jobTitle.get(s.job_id) ?? "Role"}
                            </Link>
                          </td>
                          <td className="muted">
                            {s.provider?.years_experience != null
                              ? `${s.provider.years_experience} yrs`
                              : "—"}
                          </td>
                          <td>
                            {s.match_score != null && meta ? (
                              <span
                                className={`badge ${
                                  toneClass[meta.tone] ?? "badge-muted"
                                }`}
                              >
                                {s.match_score} · {meta.label}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                toneClass[readiness.tone] ?? "badge-muted"
                              }`}
                              title={readiness.summary}
                            >
                              {readiness.label}
                            </span>
                          </td>
                          <td className="muted">
                            {fmtDate(s.submitted_on)}
                          </td>
                          <td>
                            <StageBadge stage={s.stage} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 18 }}>
        Candidate submissions, pipeline stages and readiness are managed by
        AlignMD recruiters. The readiness signal indicates whether onboarding
        and credentialing are complete; contact your recruiter for any
        specifics on a particular candidate.
      </p>
    </>
  );
}
