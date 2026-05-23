// AlignMD — clinician dashboard widgets.
//
// Presentational cards for the clinician home (src/app/(clinician)/clinician/
// page.tsx). All data is fetched by the page and passed in as props — these
// components do no I/O, so the page stays the single data-fetching hub. Every
// widget renders a sensible empty state and never assumes its backing table
// exists.

import Link from "next/link";
import { EmptyState } from "./ui";
import { IconArrowRight, IconCheck, IconAlert } from "./icons";
import { TIER_META, type MatchResult } from "@/lib/match";
import type { PacketProgress, CredentialingGap } from "@/lib/credentialing";
import type { ProfileCompleteness } from "@/lib/profile-completeness";

// Maps a TIER_META tone onto the project's badge class.
const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--faint)",
  marginBottom: 10,
};

/** A slim progress bar — mirrors the inline bar in credentialing-panel.tsx. */
function ProgressBar({
  percent,
  tone = "var(--teal)",
}: {
  percent: number;
  tone?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const fill =
    tone === "var(--ok)"
      ? "linear-gradient(90deg, #1a9456, var(--ok))"
      : "linear-gradient(90deg, #13a294, var(--teal))";
  return (
    <div
      style={{
        height: 6,
        borderRadius: 0,
        background: "var(--surface-3)",
        overflow: "hidden",
        border: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          borderRadius: 0,
          background: fill,
          transition: "width 0.5s var(--ease)",
        }}
      />
    </div>
  );
}

function MiniStat({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 760,
          letterSpacing: "-0.04em",
          color: tone ?? "var(--ink)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

// ── Quick actions ───────────────────────────────────────────────────────────
/** A compact row of the things a clinician most often comes here to do. */
export function QuickActionsCard() {
  const actions: { href: string; label: string; hint: string }[] = [
    {
      href: "/clinician/jobs",
      label: "Browse open jobs",
      hint: "Roles matched to your credentials",
    },
    {
      href: "/clinician/profile",
      label: "Update my profile",
      hint: "Keep your match score sharp",
    },
    {
      href: "/clinician/availability",
      label: "Set availability",
      hint: "Tell recruiters when you can work",
    },
    {
      href: "/clinician/documents",
      label: "Upload a document",
      hint: "Speed up credentialing",
    },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <h3>Quick actions</h3>
      </div>
      <div
        className="card-pad"
        style={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="nudge-row row-between"
            style={{
              gap: 12,
              padding: "10px 8px",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span
                style={{ fontWeight: 650, fontSize: 13, display: "block" }}
              >
                {a.label}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {a.hint}
              </span>
            </span>
            <IconArrowRight
              width={14}
              height={14}
              style={{ color: "var(--muted)", flexShrink: 0 }}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Credential-expiry alerts ────────────────────────────────────────────────
export interface ExpiringCredential {
  id: string;
  label: string;
  state: string | null;
  expiresOn: string | null;
  copy: string;
  tone: "warn" | "danger";
}

/**
 * Credentials that have expired or are expiring soon. The page filters and
 * sorts these; the widget only renders. Shown only when there is something to
 * flag — a clinician with everything current never sees it.
 */
export function CredentialExpiryCard({
  expiring,
}: {
  expiring: ExpiringCredential[];
}) {
  if (expiring.length === 0) return null;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3 className="row" style={{ gap: 7 }}>
          <IconAlert
            width={15}
            height={15}
            style={{ color: "var(--warn)" }}
          />
          Credentials needing attention
        </h3>
        <Link
          href="/clinician/credentials"
          className="muted"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          View all →
        </Link>
      </div>
      <div
        className="card-pad"
        style={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        {expiring.map((c) => (
          <div
            key={c.id}
            className="row-between"
            style={{ gap: 12, padding: "8px 0" }}
          >
            <span style={{ minWidth: 0 }}>
              <span
                style={{ fontWeight: 650, fontSize: 13, display: "block" }}
              >
                {c.label}
                {c.state ? ` · ${c.state}` : ""}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {c.copy}
              </span>
            </span>
            <span className={`badge badge-${c.tone}`}>
              {c.tone === "danger" ? "Expired" : "Expiring soon"}
            </span>
          </div>
        ))}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Your credentialing coordinator keeps these on file — reach out to your
          recruiter if any need renewing.
        </p>
      </div>
    </div>
  );
}

// ── Credentialing progress ──────────────────────────────────────────────────
/**
 * The signed-in clinician's own credentialing packet status. `tableReady` is
 * false when migration 0011 has not been applied — the widget then shows a
 * calm "not started" empty state rather than an alarming 0%.
 */
export function CredentialingProgressCard({
  tableReady,
  packetReady,
  progress,
  gaps,
}: {
  tableReady: boolean;
  packetReady: boolean;
  progress: PacketProgress;
  gaps: CredentialingGap[];
}) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Credentialing packet</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          Managed with your coordinator
        </span>
      </div>
      <div className="card-pad">
        {!tableReady ? (
          <EmptyState
            title="Credentialing hasn't started yet"
            hint="Once your AlignMD credentialing coordinator opens your packet, your checklist and progress will appear here."
          />
        ) : (
          <>
            <div
              className="row-between"
              style={{ alignItems: "flex-start", marginBottom: 10 }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {progress.complete} of {progress.countable} items complete
                  {progress.na > 0 ? ` · ${progress.na} N/A` : ""}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Your placement packet
                </div>
              </div>
              <span
                className={`badge ${packetReady ? "badge-ok" : "badge-warn"}`}
              >
                {packetReady ? "Packet ready" : `${progress.percent}%`}
              </span>
            </div>

            <ProgressBar
              percent={progress.percent}
              tone={packetReady ? "var(--ok)" : "var(--teal)"}
            />

            <div
              className="row"
              style={{ gap: 18, marginTop: 12, flexWrap: "wrap" }}
            >
              <MiniStat value={progress.complete} label="Complete" />
              <MiniStat value={progress.inProgress} label="In progress" />
              <MiniStat value={progress.notStarted} label="Not started" />
              {progress.expired > 0 && (
                <MiniStat
                  value={progress.expired}
                  label="Expired"
                  tone="var(--danger)"
                />
              )}
            </div>

            {packetReady ? (
              <div
                className="row"
                style={{
                  gap: 7,
                  marginTop: 14,
                  fontSize: 12.5,
                  color: "var(--ok)",
                }}
              >
                <IconCheck width={14} height={14} />
                Your credentialing packet is complete.
              </div>
            ) : (
              gaps.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={SECTION_LABEL}>Outstanding</div>
                  <div className="stack" style={{ gap: 7 }}>
                    {gaps.slice(0, 4).map((g) => (
                      <div
                        key={g.item_type}
                        className="row"
                        style={{ gap: 8, alignItems: "flex-start" }}
                      >
                        <span
                          className={`badge ${
                            g.severity === "major"
                              ? "badge-danger"
                              : "badge-warn"
                          }`}
                        >
                          {g.severity === "major" ? "Major" : "Minor"}
                        </span>
                        <span style={{ fontSize: 12.5 }}>{g.text}</span>
                      </div>
                    ))}
                  </div>
                  {gaps.length > 4 && (
                    <div
                      className="muted"
                      style={{ fontSize: 12, marginTop: 8 }}
                    >
                      +{gaps.length - 4} more outstanding
                    </div>
                  )}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Profile completeness ────────────────────────────────────────────────────
/** A profile-strength meter with specific nudges for whatever is missing. */
export function ProfileCompletenessCard({
  completeness,
}: {
  completeness: ProfileCompleteness;
}) {
  const { percent, done, total, missing, complete } = completeness;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Profile strength</h3>
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
          className="row-between"
          style={{ alignItems: "flex-start", marginBottom: 10 }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {done} of {total} sections complete
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              A fuller profile means sharper matches
            </div>
          </div>
          <span
            className={`badge ${
              complete
                ? "badge-ok"
                : percent >= 50
                  ? "badge-teal"
                  : "badge-warn"
            }`}
          >
            {percent}%
          </span>
        </div>

        <ProgressBar
          percent={percent}
          tone={complete ? "var(--ok)" : "var(--teal)"}
        />

        {complete ? (
          <div
            className="row"
            style={{
              gap: 7,
              marginTop: 14,
              fontSize: 12.5,
              color: "var(--ok)",
            }}
          >
            <IconCheck width={14} height={14} />
            Your profile is complete — nicely done.
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={SECTION_LABEL}>Finish these</div>
            <div className="stack" style={{ gap: 4 }}>
              {missing.slice(0, 4).map((f) => (
                <Link
                  key={f.key}
                  href={f.href}
                  className="nudge-row row"
                  style={{
                    gap: 9,
                    alignItems: "flex-start",
                    padding: "7px 8px",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      border: "2px solid var(--warn)",
                      flexShrink: 0,
                      marginTop: 4,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 650,
                        display: "block",
                      }}
                    >
                      {f.label}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {f.nudge}
                    </span>
                  </span>
                  <IconArrowRight
                    width={13}
                    height={13}
                    style={{
                      color: "var(--muted)",
                      flexShrink: 0,
                      marginTop: 3,
                    }}
                  />
                </Link>
              ))}
            </div>
            {missing.length > 4 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                +{missing.length - 4} more to complete
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Matched jobs preview ────────────────────────────────────────────────────
export interface MatchedJobPreview {
  id: string;
  title: string;
  org_name: string | null;
  location: string | null;
  state: string | null;
  is_remote: boolean | null;
  specialty: string | null;
  match: MatchResult;
}

/**
 * The top scanned jobs ranked against the clinician's credentials. `available`
 * is false when the external_jobs table (migration 0010) is missing — the
 * widget then shows an empty state instead of crashing.
 */
export function MatchedJobsCard({
  jobs,
  available,
}: {
  jobs: MatchedJobPreview[];
  available: boolean;
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3>Jobs matched to you</h3>
        <Link
          href="/clinician/jobs"
          className="muted"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          View all →
        </Link>
      </div>
      {!available || jobs.length === 0 ? (
        <EmptyState
          title="No matched jobs yet"
          hint="Live clinical roles are scanned daily from public job boards and ranked against your credentials. Keep your profile current to sharpen your matches."
          action={
            <Link href="/clinician/jobs" className="btn btn-primary">
              Browse open jobs
            </Link>
          }
        />
      ) : (
        <div
          className="card-pad"
          style={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {jobs.map((j) => {
            const meta = TIER_META[j.match.tier];
            const locationText = j.is_remote
              ? "Remote"
              : j.location ?? j.state ?? "—";
            return (
              <Link
                key={j.id}
                href="/clinician/jobs"
                className="nudge-row row-between"
                style={{
                  gap: 12,
                  padding: "10px 8px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      fontWeight: 650,
                      fontSize: 13,
                      display: "block",
                    }}
                  >
                    {j.title}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {j.org_name ?? "—"} · {locationText}
                    {j.specialty ? ` · ${j.specialty}` : ""}
                  </span>
                </span>
                <span
                  className={`badge ${badgeTone[meta.tone] ?? "badge-muted"}`}
                >
                  {meta.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
