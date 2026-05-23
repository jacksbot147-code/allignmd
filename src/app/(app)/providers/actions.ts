"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, isPrivileged } from "@/lib/auth";
import {
  validateProvider,
  validateCredential,
  validateReference,
  validateApplication,
  errorSummary,
} from "@/lib/validation";
import { WORK_SLOTS, EDU_SLOTS } from "@/lib/constants";
import type {
  PipelineStage,
  ApplicationPayload,
  ApplicationWorkEntry,
  ApplicationEducationEntry,
} from "@/lib/types";

// ── FormData parse helpers ────────────────────────────────────────────────
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
function list(fd: FormData, key: string): string[] | null {
  const s = str(fd, key);
  if (!s) return null;
  const arr = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

// SSN (last 4) is intentionally NOT part of providerFields — it lives in the
// privileged-only `provider_private` table (see migration 0005).
function providerFields(fd: FormData) {
  return {
    full_name: str(fd, "full_name") ?? "Unnamed provider",
    clinician_role: str(fd, "clinician_role"),
    specialty: str(fd, "specialty"),
    subspecialty: str(fd, "subspecialty"),
    years_experience: num(fd, "years_experience"),
    npi: str(fd, "npi"),
    languages: list(fd, "languages"),
    travel_radius_miles: num(fd, "travel_radius_miles"),
    telehealth_ok: bool(fd, "telehealth_ok"),
    available_start: str(fd, "available_start"),
  };
}

// ── Provider create / update ──────────────────────────────────────────────
export async function createProvider(fd: FormData) {
  const me = await requireStaff();
  const fields = providerFields(fd);
  // Only privileged staff can set SSN; the field isn't rendered for others.
  const ssn = isPrivileged(me.role) ? str(fd, "ssn_last4") : null;

  const errs = validateProvider({
    full_name: fields.full_name,
    npi: fields.npi,
    ssn_last4: ssn,
    years_experience: fields.years_experience,
    travel_radius_miles: fields.travel_radius_miles,
    available_start: fields.available_start,
  });
  if (Object.keys(errs).length) {
    redirect("/providers/new?error=" + encodeURIComponent(errorSummary(errs)));
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("providers")
    .insert({
      ...fields,
      pipeline_stage: (str(fd, "pipeline_stage") as PipelineStage) ?? "new",
      owner_id: me?.id ?? null,
      created_by: me?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      "/providers/new?error=" +
        encodeURIComponent(error?.message ?? "Could not create provider."),
    );
  }

  if (ssn) {
    await supabase.from("provider_private").upsert({
      provider_id: data.id,
      ssn_last4: ssn,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    });
  }

  revalidatePath("/providers");
  revalidatePath("/pipeline");
  redirect(`/providers/${data.id}`);
}

export async function updateProvider(fd: FormData) {
  const me = await requireStaff();
  const id = str(fd, "id");
  if (!id) redirect("/providers");
  const fields = providerFields(fd);
  const privileged = isPrivileged(me.role);
  const ssn = privileged ? str(fd, "ssn_last4") : null;

  const errs = validateProvider({
    full_name: fields.full_name,
    npi: fields.npi,
    ssn_last4: ssn,
    years_experience: fields.years_experience,
    travel_radius_miles: fields.travel_radius_miles,
    available_start: fields.available_start,
  });
  if (Object.keys(errs).length) {
    redirect(
      `/providers/${id}/edit?error=` + encodeURIComponent(errorSummary(errs)),
    );
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("providers")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    redirect(`/providers/${id}/edit?error=` + encodeURIComponent(error.message));
  }

  // SSN — privileged staff only; RLS on provider_private enforces this too.
  if (privileged) {
    if (ssn) {
      await supabase.from("provider_private").upsert({
        provider_id: id,
        ssn_last4: ssn,
        updated_by: me.id,
        updated_at: new Date().toISOString(),
      });
    } else {
      await supabase.from("provider_private").delete().eq("provider_id", id);
    }
  }

  revalidatePath(`/providers/${id}`);
  revalidatePath("/providers");
  redirect(`/providers/${id}`);
}

// ── Archive / restore ─────────────────────────────────────────────────────
export async function archiveProvider(fd: FormData) {
  const me = await requireStaff();
  const id = str(fd, "id") ?? str(fd, "provider_id");
  if (!id) redirect("/providers");
  const supabase = createClient();
  await supabase
    .from("providers")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: me.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/providers");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  redirect(`/providers/${id}`);
}

export async function restoreProvider(fd: FormData) {
  await requireStaff();
  const id = str(fd, "id") ?? str(fd, "provider_id");
  if (!id) redirect("/providers");
  const supabase = createClient();
  await supabase
    .from("providers")
    .update({
      archived_at: null,
      archived_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/providers");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  redirect(`/providers/${id}`);
}

// ── Pipeline stage change ─────────────────────────────────────────────────
export async function changeStage(fd: FormData) {
  await requireStaff();
  const id = str(fd, "provider_id");
  const stage = str(fd, "stage") as PipelineStage | null;
  if (!id || !stage) return;
  const supabase = createClient();
  await supabase
    .from("providers")
    .update({ pipeline_stage: stage, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/pipeline");
  revalidatePath(`/providers/${id}`);
  revalidatePath("/providers");
  revalidatePath("/dashboard");
}

// ── Credentials ───────────────────────────────────────────────────────────
export async function addCredential(fd: FormData) {
  const providerId = str(fd, "provider_id");
  if (!providerId) return;
  const me = await requireStaff();

  const type = str(fd, "type") ?? "other";
  const state = str(fd, "state");
  const issued_on = str(fd, "issued_on");
  const expires_on = str(fd, "expires_on");

  const errs = validateCredential({ type, state, issued_on, expires_on });
  if (Object.keys(errs).length) {
    redirect(
      `/providers/${providerId}?tab=credentials&error=` +
        encodeURIComponent(errorSummary(errs)),
    );
  }

  const supabase = createClient();
  const verified = bool(fd, "verified");
  const { error } = await supabase.from("provider_credentials").insert({
    provider_id: providerId,
    type,
    state: state ? state.toUpperCase() : null,
    is_compact: bool(fd, "is_compact"),
    number: str(fd, "number"),
    issued_on,
    expires_on,
    verified,
    verified_by: verified ? me?.id ?? null : null,
    verified_at: verified ? new Date().toISOString() : null,
    verification_source: str(fd, "verification_source"),
    notes: str(fd, "notes"),
  });
  const suffix = error
    ? "?tab=credentials&error=" + encodeURIComponent(error.message)
    : "?tab=credentials";
  revalidatePath(`/providers/${providerId}`);
  revalidatePath("/credentials");
  revalidatePath("/dashboard");
  redirect(`/providers/${providerId}${suffix}`);
}

export async function verifyCredential(fd: FormData) {
  const id = str(fd, "credential_id");
  const providerId = str(fd, "provider_id");
  if (!id) return;
  const supabase = createClient();
  const me = await requireStaff();
  await supabase
    .from("provider_credentials")
    .update({
      verified: true,
      verified_by: me?.id ?? null,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath(`/providers/${providerId}`);
  revalidatePath("/credentials");
}

export async function deleteCredential(fd: FormData) {
  await requireStaff();
  const id = str(fd, "credential_id");
  const providerId = str(fd, "provider_id");
  if (!id) return;
  const supabase = createClient();
  await supabase.from("provider_credentials").delete().eq("id", id);
  revalidatePath(`/providers/${providerId}`);
  revalidatePath("/credentials");
}

// ── Availability ──────────────────────────────────────────────────────────
export async function addAvailability(fd: FormData) {
  await requireStaff();
  const providerId = str(fd, "provider_id");
  if (!providerId) return;

  const block_start = str(fd, "block_start");
  const block_end = str(fd, "block_end");
  if (block_start && block_end && block_start > block_end) {
    redirect(
      `/providers/${providerId}?tab=availability&error=` +
        encodeURIComponent("End date can't be before the start date."),
    );
  }

  const supabase = createClient();
  const { error } = await supabase.from("provider_availability").insert({
    provider_id: providerId,
    block_type: str(fd, "block_type") ?? "custom",
    block_start,
    block_end,
    note: str(fd, "note"),
  });
  const suffix = error
    ? "?tab=availability&error=" + encodeURIComponent(error.message)
    : "?tab=availability";
  revalidatePath(`/providers/${providerId}`);
  redirect(`/providers/${providerId}${suffix}`);
}

export async function deleteAvailability(fd: FormData) {
  await requireStaff();
  const id = str(fd, "availability_id");
  const providerId = str(fd, "provider_id");
  if (!id) return;
  const supabase = createClient();
  await supabase.from("provider_availability").delete().eq("id", id);
  revalidatePath(`/providers/${providerId}`);
}

// ── Activity log ──────────────────────────────────────────────────────────
export async function addActivity(fd: FormData) {
  const providerId = str(fd, "provider_id");
  const body = str(fd, "body");
  if (!providerId || !body) return;
  const supabase = createClient();
  const me = await requireStaff();
  await supabase.from("activities").insert({
    provider_id: providerId,
    type: str(fd, "type") ?? "note",
    body,
    actor_id: me?.id ?? null,
  });
  revalidatePath(`/providers/${providerId}`);
  revalidatePath("/dashboard");
  redirect(`/providers/${providerId}?tab=activity`);
}

// ── Documents (Supabase Storage) ──────────────────────────────────────────
export async function uploadDocument(fd: FormData) {
  const providerId = str(fd, "provider_id");
  const file = fd.get("file");
  if (!providerId || !(file instanceof File) || file.size === 0) {
    redirect(
      `/providers/${providerId}?tab=documents&error=` +
        encodeURIComponent("Choose a file to upload."),
    );
  }
  const supabase = createClient();
  const me = await requireStaff();
  const safeName = (file as File).name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${providerId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("provider-documents")
    .upload(path, file as File, { upsert: false });

  if (upErr) {
    redirect(
      `/providers/${providerId}?tab=documents&error=` +
        encodeURIComponent("Upload failed: " + upErr.message),
    );
  }

  const { error: rowErr } = await supabase.from("provider_documents").insert({
    provider_id: providerId,
    doc_type: str(fd, "doc_type") ?? "other",
    storage_path: path,
    sensitivity: str(fd, "sensitivity") ?? "standard",
    uploaded_by: me?.id ?? null,
  });
  const suffix = rowErr
    ? "?tab=documents&error=" + encodeURIComponent(rowErr.message)
    : "?tab=documents";
  revalidatePath(`/providers/${providerId}`);
  redirect(`/providers/${providerId}${suffix}`);
}

export async function deleteDocument(fd: FormData) {
  await requireStaff();
  const id = str(fd, "document_id");
  const providerId = str(fd, "provider_id");
  const path = str(fd, "storage_path");
  if (!id) return;
  const supabase = createClient();
  if (path) {
    await supabase.storage.from("provider-documents").remove([path]);
  }
  await supabase.from("provider_documents").delete().eq("id", id);
  revalidatePath(`/providers/${providerId}`);
}

// ── Provider intake application (Phase 3) ─────────────────────────────────
/** Read a value as plain text — never null, so jsonb stays consistent. */
function text(fd: FormData, key: string): string {
  return str(fd, key) ?? "";
}

/** Assemble the full survey payload from the posted form. */
function applicationPayloadFromForm(fd: FormData): ApplicationPayload {
  const work_history: ApplicationWorkEntry[] = [];
  for (let i = 0; i < WORK_SLOTS; i++) {
    const entry: ApplicationWorkEntry = {
      employer: text(fd, `work_${i}_employer`),
      title: text(fd, `work_${i}_title`),
      location: text(fd, `work_${i}_location`),
      start: text(fd, `work_${i}_start`),
      end: text(fd, `work_${i}_end`),
      summary: text(fd, `work_${i}_summary`),
    };
    if (Object.values(entry).some((v) => v !== "")) work_history.push(entry);
  }

  const education: ApplicationEducationEntry[] = [];
  for (let i = 0; i < EDU_SLOTS; i++) {
    const entry: ApplicationEducationEntry = {
      credential: text(fd, `edu_${i}_credential`),
      institution: text(fd, `edu_${i}_institution`),
      field: text(fd, `edu_${i}_field`),
      year: text(fd, `edu_${i}_year`),
    };
    if (Object.values(entry).some((v) => v !== "")) education.push(entry);
  }

  return {
    preferred_name: text(fd, "preferred_name"),
    phone: text(fd, "phone"),
    email: text(fd, "email"),
    current_title: text(fd, "current_title"),
    current_employer: text(fd, "current_employer"),
    primary_specialty: text(fd, "primary_specialty"),
    subspecialties: text(fd, "subspecialties"),
    years_in_practice: text(fd, "years_in_practice"),
    board_certifications: text(fd, "board_certifications"),
    npi: text(fd, "npi"),
    languages: text(fd, "languages"),
    work_history,
    education,
    reason_for_looking: text(fd, "reason_for_looking"),
    assignment_type: text(fd, "assignment_type"),
    desired_start: text(fd, "desired_start"),
    ideal_schedule: text(fd, "ideal_schedule"),
    shift_preferences: text(fd, "shift_preferences"),
    willing_to_travel: text(fd, "willing_to_travel"),
    travel_states: text(fd, "travel_states"),
    license_states_needed: text(fd, "license_states_needed"),
    telehealth_interest: text(fd, "telehealth_interest"),
    min_hourly_rate: text(fd, "min_hourly_rate"),
    malpractice_history: text(fd, "malpractice_history"),
    malpractice_explanation: text(fd, "malpractice_explanation"),
    license_action_history: text(fd, "license_action_history"),
    license_action_explanation: text(fd, "license_action_explanation"),
    additional_notes: text(fd, "additional_notes"),
  };
}

/** Create an empty application record so the survey can be filled in. */
export async function startApplication(fd: FormData) {
  const me = await requireStaff();
  const providerId = str(fd, "provider_id");
  if (!providerId) redirect("/providers");
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("application_responses")
    .select("id")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from("application_responses").insert({
      provider_id: providerId,
      payload: {},
      updated_by: me.id,
    });
  }
  revalidatePath(`/providers/${providerId}`);
  redirect(`/providers/${providerId}?tab=application`);
}

/**
 * Save the intake survey. `intent` controls submission state:
 *   save   — persist the payload, leave submitted_at unchanged
 *   submit — persist + stamp submitted_at
 *   reopen — persist + clear submitted_at (back to draft)
 */
export async function saveApplication(fd: FormData) {
  const me = await requireStaff();
  const providerId = str(fd, "provider_id");
  if (!providerId) redirect("/providers");
  const applicationId = str(fd, "application_id");
  const intent = str(fd, "intent") ?? "save";

  const payload = applicationPayloadFromForm(fd);
  const errs = validateApplication({
    npi: payload.npi || null,
    email: payload.email || null,
    desired_start: payload.desired_start || null,
  });
  if (Object.keys(errs).length) {
    redirect(
      `/providers/${providerId}?tab=application&error=` +
        encodeURIComponent(errorSummary(errs)),
    );
  }

  const supabase = createClient();
  const now = new Date().toISOString();
  const base: Record<string, unknown> = {
    provider_id: providerId,
    payload,
    updated_at: now,
    updated_by: me.id,
  };
  if (intent === "submit") base.submitted_at = now;
  if (intent === "reopen") base.submitted_at = null;

  let error;
  if (applicationId) {
    ({ error } = await supabase
      .from("application_responses")
      .update(base)
      .eq("id", applicationId));
  } else {
    ({ error } = await supabase
      .from("application_responses")
      .insert(base));
  }

  const suffix = error
    ? "?tab=application&error=" + encodeURIComponent(error.message)
    : "?tab=application";
  revalidatePath(`/providers/${providerId}`);
  revalidatePath(`/providers/${providerId}/cv`);
  redirect(`/providers/${providerId}${suffix}`);
}

// ── Provider references (Phase 3) ─────────────────────────────────────────
export async function addReference(fd: FormData) {
  const me = await requireStaff();
  const providerId = str(fd, "provider_id");
  if (!providerId) redirect("/providers");

  const name = str(fd, "name");
  const errs = validateReference({ name });
  if (Object.keys(errs).length) {
    redirect(
      `/providers/${providerId}?tab=references&error=` +
        encodeURIComponent(errorSummary(errs)),
    );
  }

  const supabase = createClient();
  const verified = bool(fd, "verified");
  const { error } = await supabase.from("provider_references").insert({
    provider_id: providerId,
    name,
    contact: str(fd, "contact"),
    relationship: str(fd, "relationship"),
    verified,
    called_at: verified ? new Date().toISOString() : null,
    notes: str(fd, "notes"),
    created_by: me.id,
  });

  const suffix = error
    ? "?tab=references&error=" + encodeURIComponent(error.message)
    : "?tab=references";
  revalidatePath(`/providers/${providerId}`);
  revalidatePath(`/providers/${providerId}/cv`);
  redirect(`/providers/${providerId}${suffix}`);
}

export async function updateReference(fd: FormData) {
  await requireStaff();
  const id = str(fd, "reference_id");
  const providerId = str(fd, "provider_id");
  if (!id || !providerId) redirect("/providers");

  const name = str(fd, "name");
  const errs = validateReference({ name });
  if (Object.keys(errs).length) {
    redirect(
      `/providers/${providerId}?tab=references&error=` +
        encodeURIComponent(errorSummary(errs)),
    );
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("provider_references")
    .update({
      name,
      contact: str(fd, "contact"),
      relationship: str(fd, "relationship"),
      notes: str(fd, "notes"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  const suffix = error
    ? "?tab=references&error=" + encodeURIComponent(error.message)
    : "?tab=references";
  revalidatePath(`/providers/${providerId}`);
  revalidatePath(`/providers/${providerId}/cv`);
  redirect(`/providers/${providerId}${suffix}`);
}

/** Mark a reference verified / unverified — records the call timestamp. */
export async function setReferenceVerified(fd: FormData) {
  await requireStaff();
  const id = str(fd, "reference_id");
  const providerId = str(fd, "provider_id");
  if (!id) return;
  const verified = str(fd, "verified") === "true";

  const supabase = createClient();
  await supabase
    .from("provider_references")
    .update({
      verified,
      called_at: verified ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath(`/providers/${providerId}`);
  revalidatePath(`/providers/${providerId}/cv`);
}

export async function deleteReference(fd: FormData) {
  await requireStaff();
  const id = str(fd, "reference_id");
  const providerId = str(fd, "provider_id");
  if (!id) return;
  const supabase = createClient();
  await supabase.from("provider_references").delete().eq("id", id);
  revalidatePath(`/providers/${providerId}`);
  revalidatePath(`/providers/${providerId}/cv`);
}
