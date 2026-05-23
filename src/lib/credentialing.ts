// AlignMD — credentialing packet logic (Phase 1).
//
// The customer flagged credentialing as "the hard part — a lot of work." The
// credentialing packet is the fixed checklist every clinician must clear
// before placement. credentialing_items (migration 0011) stores one row per
// (provider, item_type); this module defines the canonical checklist, merges
// the stored rows over it, and computes packet progress + gap flags.
//
// Distinct from src/lib/credentials.ts — that module is the 30/60/90-day
// expiry tracker for provider_credentials (the licenses / certs themselves).
// This module is the onboarding-packet workflow.

export type CredentialingItemType =
  | "state_license"
  | "dea"
  | "board_certification"
  | "malpractice_coi"
  | "references"
  | "background_check"
  | "immunizations"
  | "npdb_query"
  | "work_history"
  | "peer_references";

export type CredentialingStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "expired"
  | "na";

// A credentialing_items row — mirrors supabase/migrations/0011_credentialing.sql.
export interface CredentialingItem {
  id: string;
  provider_id: string;
  item_type: string;
  status: CredentialingStatus;
  due_date: string | null;
  completed_on: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Canonical checklist ────────────────────────────────────────────────────
// The fixed packet, in display order. The packet view merges stored rows over
// this list, so a provider with no rows yet still shows the full checklist
// (every item "not started") — the view never depends on seeded data.
export const CREDENTIALING_ITEM_TYPES: CredentialingItemType[] = [
  "state_license",
  "dea",
  "board_certification",
  "malpractice_coi",
  "work_history",
  "references",
  "peer_references",
  "background_check",
  "npdb_query",
  "immunizations",
];

export const CREDENTIALING_ITEM_LABELS: Record<CredentialingItemType, string> = {
  state_license: "State license",
  dea: "DEA registration",
  board_certification: "Board certification",
  malpractice_coi: "Malpractice COI",
  work_history: "Work history",
  references: "Professional references",
  peer_references: "Peer references",
  background_check: "Background check",
  npdb_query: "NPDB query",
  immunizations: "Immunizations & health",
};

// One-line description shown under each item on the packet checklist.
export const CREDENTIALING_ITEM_HINTS: Record<CredentialingItemType, string> = {
  state_license: "Active license in every state the assignment covers.",
  dea: "Current DEA registration where the role prescribes.",
  board_certification: "Board certification or documented active eligibility.",
  malpractice_coi: "Certificate of insurance and prior coverage history.",
  work_history: "Continuous work history with any gaps explained.",
  references: "Professional references collected and logged.",
  peer_references: "Peer references from clinical colleagues.",
  background_check: "Criminal background screening completed and cleared.",
  npdb_query: "National Practitioner Data Bank self-query on file.",
  immunizations: "Immunization records and health clearances on file.",
};

export const CREDENTIALING_STATUSES: CredentialingStatus[] = [
  "not_started",
  "in_progress",
  "complete",
  "expired",
  "na",
];

export const CREDENTIALING_STATUS_LABELS: Record<CredentialingStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  expired: "Expired",
  na: "N/A",
};

// Tone keys map to the shared badge classes (badge-ok / badge-warn / …).
export const CREDENTIALING_STATUS_TONE: Record<CredentialingStatus, string> = {
  not_started: "muted",
  in_progress: "warn",
  complete: "ok",
  expired: "danger",
  na: "muted",
};

/** Narrow an arbitrary string to a known item type, or null. */
export function asItemType(
  v: string | null | undefined,
): CredentialingItemType | null {
  return v != null && (CREDENTIALING_ITEM_TYPES as string[]).includes(v)
    ? (v as CredentialingItemType)
    : null;
}

/** Narrow an arbitrary string to a known status; falls back to not_started. */
export function asStatus(v: string | null | undefined): CredentialingStatus {
  return v != null && (CREDENTIALING_STATUSES as string[]).includes(v)
    ? (v as CredentialingStatus)
    : "not_started";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Packet assembly ────────────────────────────────────────────────────────
// One row of the merged packet: a canonical item plus its stored row, if any.
export interface PacketRow {
  item_type: CredentialingItemType;
  label: string;
  hint: string;
  item: CredentialingItem | null;
  status: CredentialingStatus;
}

/**
 * Merge stored credentialing_items over the canonical checklist. Pass `[]`
 * (e.g. when the 0011 table has not been migrated yet) and every item simply
 * comes back "not started" — the packet view never crashes on missing data.
 */
export function buildPacket(items: CredentialingItem[]): PacketRow[] {
  const byType = new Map<string, CredentialingItem>();
  for (const it of items) {
    const prev = byType.get(it.item_type);
    // Defensive: if duplicate rows somehow exist, keep the most recent.
    if (!prev || (it.updated_at ?? "") >= (prev.updated_at ?? "")) {
      byType.set(it.item_type, it);
    }
  }
  return CREDENTIALING_ITEM_TYPES.map((t) => {
    const item = byType.get(t) ?? null;
    return {
      item_type: t,
      label: CREDENTIALING_ITEM_LABELS[t],
      hint: CREDENTIALING_ITEM_HINTS[t],
      item,
      status: item ? asStatus(item.status) : "not_started",
    };
  });
}

// ── Progress ───────────────────────────────────────────────────────────────
export interface PacketProgress {
  countable: number; // canonical items excluding N/A
  complete: number;
  inProgress: number;
  notStarted: number;
  expired: number;
  na: number;
  percent: number; // complete / countable, 0–100 rounded
}

export function packetProgress(rows: PacketRow[]): PacketProgress {
  let complete = 0;
  let inProgress = 0;
  let notStarted = 0;
  let expired = 0;
  let na = 0;
  for (const r of rows) {
    if (r.status === "complete") complete++;
    else if (r.status === "in_progress") inProgress++;
    else if (r.status === "expired") expired++;
    else if (r.status === "na") na++;
    else notStarted++;
  }
  const countable = rows.length - na;
  const percent = countable > 0 ? Math.round((complete / countable) * 100) : 0;
  return { countable, complete, inProgress, notStarted, expired, na, percent };
}

/** A packet is ready once every countable item is complete. */
export function isPacketReady(rows: PacketRow[]): boolean {
  return rows.every((r) => r.status === "complete" || r.status === "na");
}

// ── Gap flags ──────────────────────────────────────────────────────────────
export interface CredentialingGap {
  item_type: CredentialingItemType;
  label: string;
  severity: "major" | "minor";
  text: string;
}

/**
 * Outstanding work on a packet. Expired items, and not-started / in-progress
 * items past their due date, are major; everything else still open is minor.
 */
export function packetGaps(rows: PacketRow[]): CredentialingGap[] {
  const today = todayISO();
  const gaps: CredentialingGap[] = [];
  for (const r of rows) {
    if (r.status === "complete" || r.status === "na") continue;
    const due = r.item?.due_date ?? null;
    const overdue = due != null && due < today;
    if (r.status === "expired") {
      gaps.push({
        item_type: r.item_type,
        label: r.label,
        severity: "major",
        text: `${r.label} has expired — renew before placement.`,
      });
    } else if (r.status === "in_progress") {
      gaps.push({
        item_type: r.item_type,
        label: r.label,
        severity: overdue ? "major" : "minor",
        text: overdue
          ? `${r.label} is in progress and past its due date.`
          : `${r.label} is in progress.`,
      });
    } else {
      // not_started
      gaps.push({
        item_type: r.item_type,
        label: r.label,
        severity: overdue ? "major" : "minor",
        text: overdue
          ? `${r.label} has not been started and is past its due date.`
          : `${r.label} has not been started.`,
      });
    }
  }
  // Major gaps first; stable sort keeps canonical order within each severity.
  return gaps.sort(
    (a, b) =>
      (a.severity === "major" ? 0 : 1) - (b.severity === "major" ? 0 : 1),
  );
}
