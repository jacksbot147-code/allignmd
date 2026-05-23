import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { IconOutreach } from "@/components/icons";
import { scoreMatch, TIER_META } from "@/lib/match";
import { fmtDateTime } from "@/lib/format";
import type { JobRequirement } from "@/lib/types";
import { generateDrafts, deleteDraft } from "./actions";

export const metadata: Metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

// How many ranked candidates to surface for a job before the list gets noisy.
const CANDIDATE_LIMIT = 25;
// Cap for the un-scored roster shown when no job is in context.
const ROSTER_LIMIT = 100;

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: { job?: string; error?: string; generated?: string };
}) {
  const jobId = searchParams.job || null;
  const supabase = createClient();

  // Open jobs power the picker; recent drafts are always shown.
  const [openJobsRes, draftsRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, facility:facilities(name)")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("outreach_drafts")
      .select(
        "id, channel, subject, body, created_at, job_id, provider:providers(id, full_name), job:jobs(id, title)",
      )
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const openJobs = (openJobsRes.data ?? []) as any[];
  const drafts = (draftsRes.data ?? []) as any[];

  // ── Candidate list ────────────────────────────────────────────────────
  // With a job in context, every active clinician is scored and ranked (the
  // same engine the job page uses). Without one, we show a plain roster.
  let job: any = null;
  let candidates: {
    id: string;
    full_name: string;
    clinician_role: string | null;
    specialty: string | null;
    score: number | null;
    tier: string | null;
  }[] = [];

  if (jobId) {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("*, facility:facilities(id, name, city, state)")
      .eq("id", jobId)
      .maybeSingle();
    job = jobRow;

    if (job) {
      const [reqRes, provRes, credRes] = await Promise.all([
        supabase
          .from("job_requirements")
          .select("*")
          .eq("job_id", jobId)
          .limit(1),
        supabase
          .from("providers")
          .select(
            "id, full_name, clinician_role, specialty, years_experience, telehealth_ok",
          )
          .is("archived_at", null),
        supabase
          .from("provider_credentials")
          .select("provider_id, type, state, is_compact, expires_on"),
      ]);

      const requirement = (reqRes.data?.[0] ?? null) as JobRequirement | null;
      const providers = provRes.data ?? [];
      const credsByProvider = new Map<string, any[]>();
      for (const c of (credRes.data ?? []) as any[]) {
        const list = credsByProvider.get(c.provider_id) ?? [];
        list.push(c);
        credsByProvider.set(c.provider_id, list);
      }

      const jobStates =
        requirement?.required_license_states?.length
          ? requirement.required_license_states
          : job.facility?.state
            ? [job.facility.state]
            : [];
      const jobIsTelehealth =
        /telehealth/i.test(job.setting || "") ||
        /telehealth/i.test(job.specialty || "");
      const requiredCerts = (requirement?.required_certs ?? []) as string[];

      candidates = providers
        .map((p: any) => {
          const result = scoreMatch({
            provider: p,
            credentials: credsByProvider.get(p.id) ?? [],
            jobSpecialty: job.specialty,
            jobStates,
            jobIsTelehealth,
            requiredCerts,
            minYears: requirement?.min_years_experience ?? null,
          });
          return {
            id: p.id,
            full_name: p.full_name,
            clinician_role: p.clinician_role ?? null,
            specialty: p.specialty ?? null,
            score: result.score,
            tier: result.tier as string,
          };
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, CANDIDATE_LIMIT);
    }
  } else {
    const { data } = await supabase
      .from("providers")
      .select("id, full_name, clinician_role, specialty")
      .is("archived_at", null)
      .order("full_name", { ascending: true })
      .limit(ROSTER_LIMIT);
    candidates = (data ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      clinician_role: p.clinician_role ?? null,
      specialty: p.specialty ?? null,
      score: null,
      tier: null,
    }));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Outreach drafts</h2>
          <p>
            Generate email and SMS draft copy for a clinician or a shortlist —
            review it, edit it, then send from your own tools.
          </p>
        </div>
      </div>

      <div className="alert alert-info">
        <b>Draft only.</b> AlignMD writes the copy and logs it here — it never
        sends email or SMS, and no messaging account is connected. Review every
        draft, then copy it into your own email or phone to send.
      </div>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}
      {searchParams.generated && (
        <div className="alert alert-ok">
          Generated email + SMS drafts for {searchParams.generated} clinician
          {searchParams.generated === "1" ? "" : "s"} — find them under Recent
          drafts below.
        </div>
      )}

      {/* ── Job context picker ─────────────────────────────────────── */}
      <form method="get" className="toolbar">
        <label
          htmlFor="job-picker"
          className="muted"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          Job context
        </label>
        <select
          className="select"
          id="job-picker"
          name="job"
          defaultValue={jobId ?? ""}
        >
          <option value="">No job — general check-in</option>
          {openJobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
              {j.facility?.name ? ` · ${j.facility.name}` : ""}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Load candidates
        </button>
        {jobId && (
          <Link href="/outreach" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      {/* ── Candidate shortlist ────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3>
            {job
              ? `Clinicians for ${job.title}`
              : "Clinician roster"}
          </h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {job
              ? `top ${candidates.length} by match score`
              : `${candidates.length} active`}
          </span>
        </div>
        {candidates.length === 0 ? (
          <EmptyState
            title="No clinicians to show"
            hint="Add clinicians to the CRM to draft outreach for them."
          />
        ) : (
          <form action={generateDrafts}>
            <OutreachForm jobId={jobId} candidates={candidates} job={job} />
          </form>
        )}
      </div>

      {/* ── Recent drafts ──────────────────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <h3>Recent drafts</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {drafts.length} shown
          </span>
        </div>
        {drafts.length === 0 ? (
          <EmptyState
            title="No drafts yet"
            hint="Pick clinicians above and generate drafts — they'll appear here for copy/paste."
          />
        ) : (
          <div className="stack" style={{ padding: 14, gap: 12 }}>
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} jobId={jobId} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// The candidate checklist + submit. Rendered inside a server-action <form>.
function OutreachForm({
  jobId,
  candidates,
  job,
}: {
  jobId: string | null;
  candidates: {
    id: string;
    full_name: string;
    clinician_role: string | null;
    specialty: string | null;
    score: number | null;
    tier: string | null;
  }[];
  job: any;
}) {
  return (
    <>
      <input type="hidden" name="job_id" value={jobId ?? ""} />
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 36 }}></th>
            <th>Clinician</th>
            <th>Specialty</th>
            {job && <th>Match</th>}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const meta = c.tier
              ? TIER_META[c.tier as keyof typeof TIER_META]
              : null;
            return (
              <tr key={c.id}>
                <td>
                  <input
                    type="checkbox"
                    name="provider_id"
                    value={c.id}
                    aria-label={`Select ${c.full_name}`}
                  />
                </td>
                <td>
                  <b>{c.full_name}</b>
                  {c.clinician_role && (
                    <span className="badge badge-teal" style={{ marginLeft: 8 }}>
                      {c.clinician_role}
                    </span>
                  )}
                </td>
                <td className="muted">{c.specialty || "—"}</td>
                {job && (
                  <td>
                    {c.score != null && meta ? (
                      <span className={`badge ${badgeTone[meta.tone]}`}>
                        {c.score} · {meta.label}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="card-pad row" style={{ gap: 10 }}>
        <button type="submit" className="btn btn-primary">
          <IconOutreach width={15} height={15} /> Generate email + SMS drafts
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          Tick the clinicians to draft for. Both an email and an SMS draft are
          created for each.
        </span>
      </div>
    </>
  );
}

// One logged draft, with copy + delete controls.
function DraftCard({ draft, jobId }: { draft: any; jobId: string | null }) {
  const isEmail = draft.channel === "email";
  const copyText = draft.subject
    ? `Subject: ${draft.subject}\n\n${draft.body}`
    : draft.body;
  return (
    <div className="card card-pad" style={{ margin: 0 }}>
      <div className="row-between" style={{ alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className={`badge ${isEmail ? "badge-teal" : "badge-muted"}`}>
              {isEmail ? "Email" : "SMS"}
            </span>
            <b style={{ fontSize: 14 }}>
              {draft.provider?.full_name ?? "Unknown clinician"}
            </b>
            <span className="muted" style={{ fontSize: 12 }}>
              {draft.job?.title ? `· ${draft.job.title}` : "· General check-in"}
            </span>
          </div>
          <span className="muted" style={{ fontSize: 11 }}>
            {fmtDateTime(draft.created_at)}
          </span>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          <CopyButton text={copyText} label="Copy" />
          <form action={deleteDraft}>
            <input type="hidden" name="draft_id" value={draft.id} />
            <input type="hidden" name="job_id" value={jobId ?? ""} />
            <button type="submit" className="btn btn-sm btn-danger">
              Delete
            </button>
          </form>
        </div>
      </div>
      {isEmail && draft.subject && (
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>
          Subject: {draft.subject}
        </div>
      )}
      <div
        style={{
          whiteSpace: "pre-wrap",
          fontSize: 13,
          lineHeight: 1.55,
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "10px 12px",
          marginTop: 8,
        }}
      >
        {draft.body}
      </div>
    </div>
  );
}
