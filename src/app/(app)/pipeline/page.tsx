import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { changeStage } from "../providers/actions";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/format";
import {
  AGING_FILTERS,
  AGING_META,
  agingSummary,
  classifyAging,
  passesFilter,
  STAGE_SLA_DAYS,
  summarizeBoard,
  type AgingFilter,
  type AgingResult,
} from "@/lib/pipeline-aging";
import type { PipelineStage } from "@/lib/types";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

const badgeTone: Record<string, string> = {
  ok: "badge-ok",
  teal: "badge-teal",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
};

const FILTER_LABELS: Record<AgingFilter, string> = {
  all: "All cards",
  stale: "Stale (SLA breached)",
  watch: "Watch",
  fresh: "On track",
};

interface PipelineCard {
  id: string;
  full_name: string;
  clinician_role: string | null;
  specialty: string | null;
  pipeline_stage: PipelineStage;
  updated_at: string | null;
  aging: AgingResult;
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from("providers")
    .select(
      "id, full_name, clinician_role, specialty, pipeline_stage, updated_at",
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: true });

  const filterParam = (AGING_FILTERS as string[]).includes(
    searchParams.filter ?? "",
  )
    ? (searchParams.filter as AgingFilter)
    : "all";

  // Compute aging once at request time so every downstream view (KPI
  // strip, column counts, card badges) reads the same verdicts.
  const now = new Date();
  const providers: PipelineCard[] = ((data as any[]) ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    clinician_role: p.clinician_role,
    specialty: p.specialty,
    pipeline_stage: p.pipeline_stage,
    updated_at: p.updated_at ?? null,
    aging: classifyAging(p.pipeline_stage, p.updated_at ?? null, now),
  }));

  const summary = summarizeBoard(
    providers.map((p) => ({ stage: p.pipeline_stage, aging: p.aging })),
  );

  const byStage = (stage: PipelineStage) =>
    providers.filter((p) => p.pipeline_stage === stage);

  const worstStageLabel = summary.worstStage
    ? STAGE_LABELS[summary.worstStage.stage]
    : null;

  const kpis = [
    {
      label: "Active cards",
      value: summary.totalCards,
      sub: "on the board",
    },
    {
      label: "Stale",
      value: summary.staleTotal,
      sub:
        worstStageLabel && summary.worstStage!.staleCount > 0
          ? `${summary.worstStage!.staleCount} in ${worstStageLabel}`
          : "all stages on track",
    },
    {
      label: "Watch",
      value: summary.watchTotal,
      sub: "approaching SLA",
    },
    {
      label: "Avg days since update",
      value: summary.averageDaysSinceUpdate ?? "—",
      sub: "across active cards",
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Pipeline</h2>
          <p>
            Every clinician from first screen to placed. Cards flag when they
            sit in a stage past its dwell-time target so SLA breaches surface
            before they cost a placement. Use the arrows to move a provider
            between stages.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        {AGING_FILTERS.map((f) => {
          const count =
            f === "all"
              ? summary.totalCards
              : f === "stale"
                ? summary.staleTotal
                : f === "watch"
                  ? summary.watchTotal
                  : summary.freshTotal +
                    (summary.totalCards - summary.trackedCards);
          const href = f === "all" ? "/pipeline" : `/pipeline?filter=${f}`;
          return (
            <Link
              key={f}
              href={href}
              className={`btn btn-sm${filterParam === f ? " btn-primary" : ""}`}
            >
              {FILTER_LABELS[f]} ({count})
            </Link>
          );
        })}
      </div>

      <div className="board">
        {PIPELINE_STAGES.map((stage, stageIdx) => {
          const cards = byStage(stage).filter((p) =>
            passesFilter(p.aging.state, filterParam),
          );
          // Within a column, surface the stalest cards at the top so the
          // recruiter's eye lands on the work that needs them most. Inside
          // each aging band the existing "most-recently-updated last"
          // ordering survives, because the underlying list is already
          // sorted by updated_at ascending.
          cards.sort((a, b) => {
            const rank = (state: string) =>
              state === "stale" ? 0 : state === "watch" ? 1 : 2;
            return rank(a.aging.state) - rank(b.aging.state);
          });
          const stageSummary = summary.byStage.find((s) => s.stage === stage)!;
          const slaDays = STAGE_SLA_DAYS[stage];
          return (
            <div className="board-col" key={stage}>
              <div className="board-col-head">
                <span>
                  {STAGE_LABELS[stage]}
                  {slaDays != null && (
                    <span
                      className="muted"
                      style={{ fontSize: 11, marginLeft: 6, fontWeight: 500 }}
                    >
                      {slaDays}d SLA
                    </span>
                  )}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  {stageSummary.stale > 0 && (
                    <span
                      className="badge badge-danger"
                      title={`${stageSummary.stale} stale in ${STAGE_LABELS[stage]}`}
                    >
                      {stageSummary.stale}
                    </span>
                  )}
                  <span className="badge badge-muted">{cards.length}</span>
                </span>
              </div>
              <div className="board-col-body">
                {cards.length === 0 && (
                  <p
                    className="muted"
                    style={{
                      fontSize: 12,
                      textAlign: "center",
                      padding: "10px 4px",
                    }}
                  >
                    {filterParam === "all"
                      ? "Empty"
                      : "Nothing in this band"}
                  </p>
                )}
                {cards.map((p) => {
                  const meta = AGING_META[p.aging.state];
                  const showBadge =
                    p.aging.state === "stale" || p.aging.state === "watch";
                  return (
                    <div className="kard" key={p.id}>
                      <Link
                        href={`/providers/${p.id}`}
                        className="row"
                        style={{ gap: 8 }}
                      >
                        <span
                          className="avatar"
                          style={{ width: 28, height: 28, fontSize: 11 }}
                        >
                          {initials(p.full_name)}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <div className="kard-name">{p.full_name}</div>
                          <div className="kard-meta">
                            {p.clinician_role || "—"}
                            {p.specialty ? ` · ${p.specialty}` : ""}
                          </div>
                        </span>
                      </Link>
                      {showBadge && (
                        <div className="row" style={{ marginTop: 6, gap: 6 }}>
                          <span
                            className={`badge ${badgeTone[meta.tone] ?? "badge-muted"}`}
                            title={agingSummary(p.aging, STAGE_LABELS[stage])}
                          >
                            {meta.label}
                            {p.aging.days != null
                              ? ` · ${p.aging.days}d`
                              : ""}
                          </span>
                        </div>
                      )}
                      <div className="kard-move">
                        <form
                          action={changeStage}
                          style={{ flex: 1, display: "flex" }}
                        >
                          <input
                            type="hidden"
                            name="provider_id"
                            value={p.id}
                          />
                          <input
                            type="hidden"
                            name="stage"
                            value={PIPELINE_STAGES[Math.max(0, stageIdx - 1)]}
                          />
                          <button
                            type="submit"
                            disabled={stageIdx === 0}
                            title="Move back"
                            style={{ width: "100%" }}
                          >
                            ←
                          </button>
                        </form>
                        <form
                          action={changeStage}
                          style={{ flex: 1, display: "flex" }}
                        >
                          <input
                            type="hidden"
                            name="provider_id"
                            value={p.id}
                          />
                          <input
                            type="hidden"
                            name="stage"
                            value={
                              PIPELINE_STAGES[
                                Math.min(
                                  PIPELINE_STAGES.length - 1,
                                  stageIdx + 1,
                                )
                              ]
                            }
                          />
                          <button
                            type="submit"
                            disabled={stageIdx === PIPELINE_STAGES.length - 1}
                            title="Move forward"
                            style={{ width: "100%" }}
                          >
                            →
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Dwell time is measured from each card&apos;s last update —
        a stage change, a profile edit, or any other recruiter action
        on the clinician&apos;s record. Targets:{" "}
        {PIPELINE_STAGES.filter((s) => STAGE_SLA_DAYS[s] != null)
          .map((s) => `${STAGE_LABELS[s]} ${STAGE_SLA_DAYS[s]}d`)
          .join(" · ")}
        .
      </p>
    </>
  );
}
