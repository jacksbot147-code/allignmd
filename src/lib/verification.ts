// AlignMD — verification & screening (Phase 4).
//
// Background checks, malpractice / NPDB checks, and reference verification.
// The client chose a vendor integration for background checks; this module is
// the vendor-adapter scaffold. It ships a working MANUAL mode (a credentialing
// coordinator works each check by hand) and a vendor mode that the app falls
// back away from until a vendor API key is configured — so AlignMD is fully
// usable today and a real vendor can be wired in later with no schema or UI
// change.

export type VerificationType = "background" | "malpractice" | "reference";

export type VerificationStatus =
  | "pending"
  | "in_progress"
  | "passed"
  | "failed"
  | "flagged";

export const VERIFICATION_TYPES: VerificationType[] = [
  "background",
  "malpractice",
  "reference",
];

export const VERIFICATION_TYPE_LABELS: Record<VerificationType, string> = {
  background: "Background check",
  malpractice: "Malpractice / NPDB",
  reference: "Reference verification",
};

export const VERIFICATION_STATUSES: VerificationStatus[] = [
  "pending",
  "in_progress",
  "passed",
  "failed",
  "flagged",
];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  passed: "Passed",
  failed: "Failed",
  flagged: "Flagged",
};

export const VERIFICATION_STATUS_TONE: Record<VerificationStatus, string> = {
  pending: "muted",
  in_progress: "warn",
  passed: "ok",
  failed: "danger",
  flagged: "danger",
};

/** A verification is resolved once it has a pass / fail / flag outcome. */
export function isResolved(s: VerificationStatus): boolean {
  return s === "passed" || s === "failed" || s === "flagged";
}

// ── Vendor adapters ───────────────────────────────────────────────────────
// A vendor adapter declares which verification types it can run automatically.
// The MVP ships manual processing; a background-check vendor (e.g. Checkr) is
// picked up automatically once its API key is present in the server env.

export type VerificationMode = "manual" | "vendor";

export interface VendorAdapter {
  name: string;
  /** Verification types this vendor runs automatically. */
  handles: VerificationType[];
}

/**
 * The background-check vendor configured via server env, or null if none.
 * Server-side only — a vendor key must never reach the browser.
 */
export function configuredVendor(): VendorAdapter | null {
  if (process.env.ALIGNMD_CHECKR_API_KEY) {
    return { name: "Checkr", handles: ["background"] };
  }
  return null;
}

/**
 * How a verification type is processed right now: "vendor" when a configured
 * vendor handles it, otherwise "manual" (coordinator workflow).
 */
export function verificationMode(type: VerificationType): VerificationMode {
  const v = configuredVendor();
  return v && v.handles.includes(type) ? "vendor" : "manual";
}

/** Human-readable processing mode for a verification type. */
export function modeLabel(type: VerificationType): string {
  const v = configuredVendor();
  if (v && v.handles.includes(type)) return `Automated via ${v.name}`;
  return "Manual — coordinator workflow";
}
