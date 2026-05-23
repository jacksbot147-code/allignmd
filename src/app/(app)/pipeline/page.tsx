import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { changeStage } from "../providers/actions";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/format";
import type { PipelineStage } from "@/lib/types";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("providers")
    .select("id, full_name, clinician_role, specialty, pipeline_stage")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  const providers = data ?? [];
  const byStage = (stage: PipelineStage) =>
    providers.filter((p: any) => p.pipeline_stage === stage);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Pipeline</h2>
          <p>
            Every clinician from first screen to placed. Use the arrows to move
            a provider between stages.
          </p>
        </div>
      </div>

      <div className="board">
        {PIPELINE_STAGES.map((stage, stageIdx) => {
          const cards = byStage(stage);
          return (
            <div className="board-col" key={stage}>
              <div className="board-col-head">
                <span>{STAGE_LABELS[stage]}</span>
                <span className="badge badge-muted">{cards.length}</span>
              </div>
              <div className="board-col-body">
                {cards.length === 0 && (
                  <p
                    className="muted"
                    style={{ fontSize: 12, textAlign: "center", padding: "10px 4px" }}
                  >
                    Empty
                  </p>
                )}
                {cards.map((p: any) => (
                  <div className="kard" key={p.id}>
                    <Link href={`/providers/${p.id}`} className="row" style={{ gap: 8 }}>
                      <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
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
                    <div className="kard-move">
                      <form action={changeStage} style={{ flex: 1, display: "flex" }}>
                        <input type="hidden" name="provider_id" value={p.id} />
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
                      <form action={changeStage} style={{ flex: 1, display: "flex" }}>
                        <input type="hidden" name="provider_id" value={p.id} />
                        <input
                          type="hidden"
                          name="stage"
                          value={
                            PIPELINE_STAGES[
                              Math.min(PIPELINE_STAGES.length - 1, stageIdx + 1)
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
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
