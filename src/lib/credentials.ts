// Credential expiry logic — the 30/60/90-day tracker.

export type ExpiryStatus =
  | "expired"
  | "expiring_30"
  | "expiring_60"
  | "expiring_90"
  | "ok"
  | "none";

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00").getTime();
  if (isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86400000);
}

export function expiryStatus(expiresOn: string | null | undefined): ExpiryStatus {
  const d = daysUntil(expiresOn);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= 30) return "expiring_30";
  if (d <= 60) return "expiring_60";
  if (d <= 90) return "expiring_90";
  return "ok";
}

export const EXPIRY_META: Record<
  ExpiryStatus,
  { label: string; tone: string }
> = {
  expired: { label: "Expired", tone: "danger" },
  expiring_30: { label: "≤ 30 days", tone: "danger" },
  expiring_60: { label: "≤ 60 days", tone: "warn" },
  expiring_90: { label: "≤ 90 days", tone: "warn" },
  ok: { label: "Current", tone: "ok" },
  none: { label: "No expiry", tone: "muted" },
};

/** True when a credential needs attention (expired or within 90 days). */
export function needsAttention(expiresOn: string | null | undefined): boolean {
  const s = expiryStatus(expiresOn);
  return s === "expired" || s.startsWith("expiring");
}

export function expiryCopy(expiresOn: string | null | undefined): string {
  const d = daysUntil(expiresOn);
  if (d === null) return "No expiry date";
  if (d < 0) return `Expired ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} ago`;
  if (d === 0) return "Expires today";
  return `Expires in ${d} day${d === 1 ? "" : "s"}`;
}
