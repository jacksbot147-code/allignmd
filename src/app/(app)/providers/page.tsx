import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StageBadge, EmptyState, Pagination } from "@/components/ui";
import { IconSearch, IconPlus } from "@/components/icons";
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  PROVIDER_ROLES,
} from "@/lib/constants";
import { fmtDate, initials } from "@/lib/format";
import { parsePageParam, pageInfo } from "@/lib/pagination";

export const metadata: Metadata = { title: "Providers" };
export const dynamic = "force-dynamic";

// Only the columns the table renders — keeps the list query lean at scale.
const PROVIDER_COLS =
  "id, full_name, clinician_role, specialty, subspecialty, years_experience, pipeline_stage, available_start, npi";

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    stage?: string;
    role?: string;
    archived?: string;
    page?: string;
  };
}) {
  const { q, stage, role } = searchParams;
  const showArchived = searchParams.archived === "1";
  const requestedPage = parsePageParam(searchParams.page);
  const supabase = createClient();

  // The same filters apply to the count and the page-of-rows query.
  const withFilters = (builder: any) => {
    let qb = showArchived
      ? builder.not("archived_at", "is", null)
      : builder.is("archived_at", null);
    if (q) qb = qb.ilike("full_name", `%${q}%`);
    if (stage) qb = qb.eq("pipeline_stage", stage);
    if (role) qb = qb.eq("clinician_role", role);
    return qb;
  };

  // 1) Count the filtered set, then 2) fetch only the requested page.
  const { count } = await withFilters(
    supabase.from("providers").select("id", { count: "exact", head: true }),
  );
  const info = pageInfo(requestedPage, count ?? 0);

  const { data } = await withFilters(
    supabase.from("providers").select(PROVIDER_COLS),
  )
    .order("created_at", { ascending: false })
    .range(info.from, info.to);

  const providers = data ?? [];
  const filtered = Boolean(q || stage || role);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Providers</h2>
          <p>Every clinician in the CRM, across all pipeline stages.</p>
        </div>
        <Link href="/providers/new" className="btn btn-primary">
          <IconPlus width={15} height={15} /> New provider
        </Link>
      </div>

      <form className="toolbar" method="get">
        <div style={{ position: "relative" }}>
          <IconSearch
            width={15}
            height={15}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted)",
            }}
          />
          <input
            className="input"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name…"
            style={{ paddingLeft: 32, width: 240 }}
          />
        </div>
        <select className="select" name="role" defaultValue={role ?? ""}>
          <option value="">All roles</option>
          {PROVIDER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select className="select" name="stage" defaultValue={stage ?? ""}>
          <option value="">All stages</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <button type="submit" className="btn">Filter</button>
        {filtered && (
          <Link
            href={showArchived ? "/providers?archived=1" : "/providers"}
            className="btn btn-ghost"
          >
            Clear
          </Link>
        )}
        <Link
          href={showArchived ? "/providers" : "/providers?archived=1"}
          className="btn btn-ghost"
        >
          {showArchived ? "← Active providers" : "View archived"}
        </Link>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {info.total} provider{info.total === 1 ? "" : "s"}
        </span>
      </form>

      <div className="card">
        {providers.length === 0 ? (
          <EmptyState
            title={filtered ? "No matching providers" : "No providers yet"}
            hint={
              filtered
                ? "Try clearing the filters."
                : "Add your first clinician to start building the pipeline."
            }
            action={
              !filtered && (
                <Link href="/providers/new" className="btn btn-primary">
                  <IconPlus width={15} height={15} /> New provider
                </Link>
              )
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Role</th>
                <th>Specialty</th>
                <th>Experience</th>
                <th>Available</th>
                <th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p: any) => (
                <tr key={p.id} className="table-row-link">
                  <td>
                    <Link
                      href={`/providers/${p.id}`}
                      className="row"
                      style={{ gap: 10 }}
                    >
                      <span className="avatar">{initials(p.full_name)}</span>
                      <span>
                        <b style={{ display: "block" }}>{p.full_name}</b>
                        <span className="muted mono" style={{ fontSize: 11 }}>
                          NPI {p.npi || "—"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    {p.clinician_role ? (
                      <span className="badge badge-teal">{p.clinician_role}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {p.specialty || "—"}
                    {p.subspecialty && (
                      <span className="muted"> · {p.subspecialty}</span>
                    )}
                  </td>
                  <td className="muted">
                    {p.years_experience != null
                      ? `${p.years_experience} yr`
                      : "—"}
                  </td>
                  <td className="muted">{fmtDate(p.available_start)}</td>
                  <td>
                    <StageBadge stage={p.pipeline_stage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        info={info}
        basePath="/providers"
        params={{
          q,
          stage,
          role,
          archived: showArchived ? "1" : undefined,
        }}
      />
    </>
  );
}
