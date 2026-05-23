import Link from "next/link";
import { expiryStatus, EXPIRY_META } from "@/lib/credentials";
import { STAGE_LABELS } from "@/lib/constants";
import type { PipelineStage } from "@/lib/types";
import type { PageInfo } from "@/lib/pagination";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
  teal: "badge-teal",
};

export function ExpiryBadge({
  expiresOn,
}: {
  expiresOn: string | null | undefined;
}) {
  const status = expiryStatus(expiresOn);
  const meta = EXPIRY_META[status];
  return <span className={`badge ${toneClass[meta.tone]}`}>{meta.label}</span>;
}

const STAGE_TONE: Record<PipelineStage, string> = {
  new: "muted",
  screen: "teal",
  credentialing: "warn",
  submitted: "teal",
  interview: "warn",
  offer: "ok",
  placed: "ok",
};

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return (
    <span className={`badge ${toneClass[STAGE_TONE[stage]]}`}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean | null }) {
  return verified ? (
    <span className="badge badge-ok">Verified</span>
  ) : (
    <span className="badge badge-muted">Unverified</span>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <b>{title}</b>
      {hint && <div>{hint}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/**
 * Prev / Next pager for a server-paginated list. `params` carries the list's
 * current filters so paging never drops them; the `page` param is omitted on
 * page 1 to keep page-1 URLs clean. Renders nothing for single-page lists.
 */
export function Pagination({
  info,
  basePath,
  params = {},
}: {
  info: PageInfo;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  if (info.totalPages <= 1) return null;

  const hrefFor = (page: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="toolbar" style={{ marginTop: 14 }}>
      <span className="muted" style={{ fontSize: 12 }}>
        {info.total} total
      </span>
      <div className="spacer" />
      {info.hasPrev ? (
        <Link className="btn btn-sm" href={hrefFor(info.page - 1)}>
          ← Prev
        </Link>
      ) : (
        <span className="btn btn-sm" style={{ opacity: 0.4 }} aria-disabled>
          ← Prev
        </span>
      )}
      <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
        Page {info.page} of {info.totalPages}
      </span>
      {info.hasNext ? (
        <Link className="btn btn-sm" href={hrefFor(info.page + 1)}>
          Next →
        </Link>
      ) : (
        <span className="btn btn-sm" style={{ opacity: 0.4 }} aria-disabled>
          Next →
        </span>
      )}
    </div>
  );
}
