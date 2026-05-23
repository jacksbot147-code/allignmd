"use client";

import { changeStage } from "@/app/(app)/providers/actions";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants";
import type { PipelineStage } from "@/lib/types";

/** Inline pipeline-stage selector — submits on change, no extra button. */
export function StageSelect({
  providerId,
  stage,
}: {
  providerId: string;
  stage: PipelineStage;
}) {
  return (
    <form action={changeStage}>
      <input type="hidden" name="provider_id" value={providerId} />
      <select
        className="select"
        name="stage"
        defaultValue={stage}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        style={{ width: "auto", fontWeight: 600 }}
        aria-label="Pipeline stage"
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
