"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFacilityContact } from "@/lib/auth";
import { isValidState } from "@/lib/validation";

// ── FormData parse helpers (mirror (app)/jobs/actions.ts) ─────────────────
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

function jobFields(fd: FormData, facilityId: string) {
  return {
    facility_id: facilityId,
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

// A clear, human message when the RLS migration that allows facility-contact
// writes (0013) has not been applied yet. Postgres returns this error code
// for a row-level-security violation; we surface it as guidance, never a crash.
const RLS_HINT =
  "Posting jobs isn't enabled yet — the 0013_facility_job_management.sql " +
  "migration still needs to be applied. Your AlignMD admin has been notified.";

function isRlsError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // 42501 = insufficient_privilege (RLS check failed).
  if (err.code === "42501") return true;
  const m = (err.message || "").toLowerCase();
  return m.includes("row-level security") || m.includes("violates row-level");
}

/**
 * Create a job for the signed-in facility contact's own facility. This is the
 * key facility-side innovation — until now only staff could post roles.
 *
 * Defensive by design: if migration 0013 has not been applied the INSERT is
 * blocked by RLS and we redirect with a clear message rather than crashing.
 */
export async function createFacilityJob(fd: FormData) {
  const user = await requireFacilityContact();
  if (!user.facility_id) {
    redirect(
      "/facility/jobs?error=" +
        encodeURIComponent("Your account isn't linked to a facility yet."),
    );
  }

  if (!str(fd, "title")) {
    redirect(
      "/facility/jobs/new?error=" +
        encodeURIComponent("Job title is required."),
    );
  }

  const states = stateList(fd, "required_license_states");
  const bad = states.find((s) => !isValidState(s));
  if (bad) {
    redirect(
      "/facility/jobs/new?error=" +
        encodeURIComponent(`"${bad}" is not a valid US state code.`),
    );
  }

  const fields = jobFields(fd, user.facility_id);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({ ...fields, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      "/facility/jobs/new?error=" +
        encodeURIComponent(
          isRlsError(error)
            ? RLS_HINT
            : error?.message ?? "Could not create the job.",
        ),
    );
  }

  // Best-effort requirement row — a failure here never blocks the job itself.
  const { error: reqErr } = await supabase.from("job_requirements").insert({
    job_id: data.id,
    required_license_states: states.length ? states : null,
    required_certs: strs(fd, "required_certs").length
      ? strs(fd, "required_certs")
      : null,
    min_years_experience: num(fd, "min_years_experience"),
    privileges: null,
  });
  if (reqErr) {
    // The job exists; only its requirement row failed. Land on it with a
    // notice rather than a misleading "saved" message.
    redirect(
      `/facility/jobs/${data.id}?error=` +
        encodeURIComponent(
          isRlsError(reqErr)
            ? "The role was posted, but its match requirements couldn't be saved — " +
                "the 0013 migration is still pending."
            : "The role was posted, but its match requirements couldn't be saved: " +
                reqErr.message,
        ),
    );
  }

  revalidatePath("/facility/jobs");
  revalidatePath("/facility");
  redirect(`/facility/jobs/${data.id}?saved=1`);
}

/**
 * Update one of the facility contact's own jobs. RLS confines both the SELECT
 * and the UPDATE to jobs at their facility; the page also re-verifies.
 */
export async function updateFacilityJob(fd: FormData) {
  const user = await requireFacilityContact();
  if (!user.facility_id) redirect("/facility/jobs");

  const id = str(fd, "id");
  if (!id) redirect("/facility/jobs");

  const states = stateList(fd, "required_license_states");
  const bad = states.find((s) => !isValidState(s));
  if (bad) {
    redirect(
      `/facility/jobs/${id}/edit?error=` +
        encodeURIComponent(`"${bad}" is not a valid US state code.`),
    );
  }

  const fields = jobFields(fd, user.facility_id);
  const supabase = createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("facility_id", user.facility_id);

  if (error) {
    redirect(
      `/facility/jobs/${id}/edit?error=` +
        encodeURIComponent(
          isRlsError(error) ? RLS_HINT : error.message,
        ),
    );
  }

  // One requirement row per job — replace it.
  await supabase.from("job_requirements").delete().eq("job_id", id);
  const { error: reqErr } = await supabase.from("job_requirements").insert({
    job_id: id,
    required_license_states: states.length ? states : null,
    required_certs: strs(fd, "required_certs").length
      ? strs(fd, "required_certs")
      : null,
    min_years_experience: num(fd, "min_years_experience"),
    privileges: null,
  });
  if (reqErr) {
    // The job itself was updated; only its requirement row failed. The old
    // requirement row was already deleted above, so surface the failure
    // rather than redirecting with a misleading "saved" message.
    redirect(
      `/facility/jobs/${id}?error=` +
        encodeURIComponent(
          isRlsError(reqErr)
            ? "The role was updated, but its match requirements couldn't be saved — " +
                "the 0013 migration is still pending."
            : "The role was updated, but its match requirements couldn't be saved: " +
                reqErr.message,
        ),
    );
  }

  revalidatePath(`/facility/jobs/${id}`);
  revalidatePath("/facility/jobs");
  revalidatePath("/facility");
  redirect(`/facility/jobs/${id}?saved=1`);
}

/** Change a job's status (open / on hold / filled / closed). */
export async function changeFacilityJobStatus(fd: FormData) {
  const user = await requireFacilityContact();
  if (!user.facility_id) return;
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !status) return;

  const supabase = createClient();
  await supabase
    .from("jobs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("facility_id", user.facility_id);

  revalidatePath(`/facility/jobs/${id}`);
  revalidatePath("/facility/jobs");
  revalidatePath("/facility");
}
