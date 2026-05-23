// AlignMD — server-side pagination helpers (Phase 6).
//
// The providers and jobs lists used to load every row. These helpers turn a
// `?page=` query param into a Supabase range() window plus the metadata a
// pager needs. Pure — no Supabase or React imports.

/** Rows per page. One knob for every paginated list. */
export const PAGE_SIZE = 25;

/** Parse a `?page=` value into a 1-based page number (defaults to 1). */
export function parsePageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export interface PageInfo {
  page: number; // clamped to [1, totalPages]
  pageSize: number;
  total: number;
  totalPages: number;
  from: number; // 0-based, inclusive — for supabase .range()
  to: number; // 0-based, inclusive — for supabase .range()
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Resolve a requested page against a known row total. `page` is clamped so a
 * stale or hand-edited `?page=` value can never point past the last page.
 */
export function pageInfo(
  requestedPage: number,
  total: number,
  pageSize = PAGE_SIZE,
): PageInfo {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const from = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    total,
    totalPages,
    from,
    to: from + pageSize - 1,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}
