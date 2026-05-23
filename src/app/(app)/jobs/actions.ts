"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { isValidState } from "@/lib/validation";
import type { PipelineStage } from "@/lib/types";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function num(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function bool(fd: FormData, key: string): boolean {
  return fd.get(key) != null;
}
/** Multi-value field (checkbox group). */
function strs(fd: FormData, key: string): string[] {
  return fd
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
}
/** Comma-separated text → upper-cased, de-duplicated array. */
function stateList(fd: FormData, key: string): string[] {
  const s = str(fd, key);
  if (!s) return [];
  return Array.from(
    new Set(
      s
        .split(",")
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function jobFields(fd: FormData) {
  return {
    facility_id: str(fd, "facility_id"),
    title: str(fd, "title") ?? "Untitled job",
    specialty: str(fd, "specialty"),
    setting: str(fd, "setting"),
    schedule: str(fd, "schedule"),
    call_requirement: str(fd, "call_requirement"),
    is_permanent: bool(fd, "is_permanent"),
    status: str(fd, "status") ?? "open",
    rate_hourly: num(fd, "rate_hourly"),
    rate_callback: num(fd, "rate_callback"),
    rate_ot: num(fd, "rate_ot"),
    rate_weekend: num(fd, "rate_weekend"),
    rate_holiday: num(fd, "rate_holiday"),
  };
}

// ── Create / update job + its requirement row ─────────────────────────────
export async function createJob(fd: FormData) {
  const me = await requireStaff();
  const fields = jobFields(fd);
  if (!fields.facility_id) {
    redirect("/jobs/new?error=" + encodeURIComponent("Choose a facility."));
  }
  if (!str(fd, "title")) {
    redirect("/jobs/new?error=" + encodeURIComponent("Job title is required."));
  }
  const states = stateList(fd, "required_license_states");
  const bad = states.find((s) => !isValidState(s));
  if (bad) {
    redirect(
      "/jobs/new?error=" +
        encodeURIComponent(`"${bad}" is not a valid US state code.`),
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({ ...fields, created_by: me?.id ?? null })
    .select("id")
    .single();
  if (error || !data) {
    redirect(
      "/jobs/new?error=" +
        encodeURIComponent(error?.message ?? "Could not create job."),
    );
  }

  await supabase.from("job_requirements").insert({
    job_id: data.id,
    required_license_states: states.length ? states : null,
    required_certs: strs(fd, "required_certs").length
      ? strs(fd, "required_certs")
      : null,
    min_years_experience: num(fd, "min_years_experience"),
    privileges: null,
  });

  revalidatePath("/jobs");
  revalidatePath(`/facilities/${fields.facility_id}`);
  redirect(`/jobs/${data.id}`);
}

export async function updateJob(fd: FormData) {
  await requireStaff();
  const id = str(fd, "id");
  if (!id) redirect("/jobs");
  const fields = jobFields(fd);
  const states = stateList(fd, "required_license_states");
  const bad = states.find((s) => !isValidState(s));
  if (bad) {
    redirect(
      `/jobs/${id}?error=` +
        encodeURIComponent(`"${bad}" is not a valid US state code.`),
    );
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    redirect(`/jobs/${id}?error=` + encodeURIComponent(error.message));
  }

  // One requirement row per job — replace it.
  await supabase.from("job_requirements").delete().eq("job_id", id);
  await supabase.from("job_requirements").insert({
    job_id: id,
    required_license_states: states.length ? states : null,
    required_certs: strs(fd, "required_certs").length
      ? strs(fd, "required_certs")
      : null,
    min_years_experience: num(fd, "min_years_experience"),
    privileges: null,
  });

  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${id}`);
}

export async function changeJobStatus(fd: FormData) {
  await requireStaff();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !status) return;
  const supabase = createClient();
  await supabase
    .from("jobs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
}

// ── Submissions (a clinician put forward for a job) ───────────────────────
export async function addSubmission(fd: FormData) {
  await requireStaff();
  const job_id = str(fd, "job_id");
  const provider_id = str(fd, "provider_id");
  if (!job_id || !provider_id) return;
  const score = num(fd, "match_score");
  const supabase = createClient();
  // unique(provider_id, job_id) — ignore if already submitted.
  await supabase.from("submissions").insert({
    job_id,
    provider_id,
    stage: "submitted",
    match_score: score,
    submitted_on: new Date().toISOString().slice(0, 10),
  });
  revalidatePath(`/jobs/${job_id}`);
  revalidatePath("/dashboard");
}

export async function changeSubmissionStage(fd: FormData) {
  await requireStaff();
  const id = str(fd, "submission_id");
  const job_id = str(fd, "job_id");
  const stage = str(fd, "stage") as PipelineStage | null;
  if (!id || !stage) return;
  const supabase = createClient();
  // Stamp placed_on when a submission reaches the placed stage so the reports
  // time-to-fill metric is exact; clear it if the submission moves back out.
  await supabase
    .from("submissions")
    .update({
      stage,
      placed_on:
        stage === "placed" ? new Date().toISOString().slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath(`/jobs/${job_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

export async function removeSubmission(fd: FormData) {
  await requireStaff();
  const id = str(fd, "submission_id");
  const job_id = str(fd, "job_id");
  if (!id) return;
  const supabase = createClient();
  await supabase.from("submissions").delete().eq("id", id);
  revalidatePath(`/jobs/${job_id}`);
}
