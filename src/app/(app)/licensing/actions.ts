"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import {
  isValidState,
  validateLicenseSurvey,
  errorSummary,
} from "@/lib/validation";
import { LICENSE_STATUSES } from "@/lib/constants";
import {
  LICENSE_SURVEY_KEYS,
  parseLicenseBundle,
  emptyLicenseBundle,
} from "@/lib/licensing";
import type {
  LicenseSurvey,
  LicenseBundle,
  LicenseApplicationStatus,
} from "@/lib/types";

// ── FormData parse helpers ────────────────────────────────────────────────
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
/** Read a value as plain text — never null, so the jsonb survey stays whole. */
function text(fd: FormData, key: string): string {
  return str(fd, key) ?? "";
}

/** Assemble the full wizard survey from a posted form. */
function licenseSurveyFromForm(fd: FormData): LicenseSurvey {
  const survey = {} as LicenseSurvey;
  for (const k of LICENSE_SURVEY_KEYS) survey[k] = text(fd, k);
  return survey;
}

/** Fetch and parse one application's stored bundle. */
async function readBundle(
  supabase: ReturnType<typeof createClient>,
  applicationId: string,
): Promise<LicenseBundle> {
  const { data } = await supabase
    .from("license_applications")
    .select("document_bundle")
    .eq("id", applicationId)
    .maybeSingle();
  return data
    ? parseLicenseBundle(data.document_bundle)
    : emptyLicenseBundle();
}

// ── Start a license application ───────────────────────────────────────────
export async function startLicenseApplication(fd: FormData) {
  const me = await requireStaff();
  const providerId = str(fd, "provider_id");
  const stateRaw = str(fd, "state");
  if (!providerId) redirect("/licensing");

  const backTo = `/providers/${providerId}?tab=licensing`;
  if (!stateRaw || !isValidState(stateRaw)) {
    redirect(
      `${backTo}&error=` +
        encodeURIComponent("Choose a valid target state for the application."),
    );
  }
  const state = (stateRaw as string).toUpperCase();
  const supabase = createClient();

  // One live application per clinician + state — reuse any existing one.
  const { data: existing } = await supabase
    .from("license_applications")
    .select("id, status")
    .eq("provider_id", providerId)
    .eq("state", state)
    .neq("status", "withdrawn")
    .limit(1);
  if (existing && existing.length > 0) {
    redirect(`/licensing/${existing[0].id}`);
  }

  const { data, error } = await supabase
    .from("license_applications")
    .insert({
      provider_id: providerId,
      state,
      status: "draft",
      document_bundle: emptyLicenseBundle(),
      created_by: me.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `${backTo}&error=` +
        encodeURIComponent(
          error?.message ?? "Could not start the license application.",
        ),
    );
  }

  revalidatePath("/licensing");
  revalidatePath(`/providers/${providerId}`);
  redirect(`/licensing/${data.id}`);
}

// ── Save the wizard survey ────────────────────────────────────────────────
export async function saveLicenseApplication(fd: FormData) {
  await requireStaff();
  const id = str(fd, "application_id");
  if (!id) redirect("/licensing");

  const survey = licenseSurveyFromForm(fd);
  const errs = validateLicenseSurvey({
    npi: survey.npi || null,
    email: survey.email || null,
    date_of_birth: survey.date_of_birth || null,
  });
  if (Object.keys(errs).length) {
    redirect(
      `/licensing/${id}?error=` + encodeURIComponent(errorSummary(errs)),
    );
  }

  const supabase = createClient();
  const bundle = await readBundle(supabase, id as string);
  const next: LicenseBundle = { ...bundle, survey };

  const { error } = await supabase
    .from("license_applications")
    .update({ document_bundle: next, updated_at: new Date().toISOString() })
    .eq("id", id);

  const suffix = error
    ? "?error=" + encodeURIComponent(error.message)
    : "?saved=1";
  revalidatePath(`/licensing/${id}`);
  revalidatePath("/licensing");
  redirect(`/licensing/${id}${suffix}`);
}

// ── Update one checklist item (completion + note) ─────────────────────────
export async function updateChecklistItem(fd: FormData) {
  await requireStaff();
  const id = str(fd, "application_id");
  const itemKey = str(fd, "item_key");
  if (!id || !itemKey) redirect("/licensing");

  const complete = str(fd, "complete") === "true";
  const note = text(fd, "note");

  const supabase = createClient();
  const bundle = await readBundle(supabase, id as string);
  const next: LicenseBundle = {
    ...bundle,
    checklist: {
      ...bundle.checklist,
      [itemKey as string]: { complete, note },
    },
  };

  const { error } = await supabase
    .from("license_applications")
    .update({ document_bundle: next, updated_at: new Date().toISOString() })
    .eq("id", id);

  const suffix = error
    ? "?error=" + encodeURIComponent(error.message)
    : "?tab=checklist";
  revalidatePath(`/licensing/${id}`);
  revalidatePath("/licensing");
  redirect(`/licensing/${id}${suffix}`);
}

// ── Change application status (draft → submitted → issued / withdrawn) ─────
export async function setLicenseStatus(fd: FormData) {
  await requireStaff();
  const id = str(fd, "application_id");
  const statusRaw = str(fd, "status");
  if (!id) redirect("/licensing");
  if (
    !statusRaw ||
    !LICENSE_STATUSES.includes(statusRaw as LicenseApplicationStatus)
  ) {
    redirect(
      `/licensing/${id}?error=` +
        encodeURIComponent("Unknown application status."),
    );
  }
  const status = statusRaw as LicenseApplicationStatus;

  const supabase = createClient();
  const { data: row } = await supabase
    .from("license_applications")
    .select("submitted_at, issued_at, provider_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) redirect("/licensing");

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  if (status === "draft") {
    patch.submitted_at = null;
    patch.issued_at = null;
  } else if (status === "submitted") {
    patch.submitted_at = row.submitted_at ?? now;
    patch.issued_at = null;
  } else if (status === "issued") {
    patch.submitted_at = row.submitted_at ?? now;
    patch.issued_at = row.issued_at ?? now;
  }
  // 'withdrawn' leaves the existing lifecycle timestamps untouched.

  const { error } = await supabase
    .from("license_applications")
    .update(patch)
    .eq("id", id);

  const suffix = error ? "?error=" + encodeURIComponent(error.message) : "";
  revalidatePath(`/licensing/${id}`);
  revalidatePath("/licensing");
  if (row.provider_id) revalidatePath(`/providers/${row.provider_id}`);
  redirect(`/licensing/${id}${suffix}`);
}

// ── Delete an application ─────────────────────────────────────────────────
export async function deleteLicenseApplication(fd: FormData) {
  await requireStaff();
  const id = str(fd, "application_id");
  const providerId = str(fd, "provider_id");
  if (!id) redirect("/licensing");

  const supabase = createClient();
  await supabase.from("license_applications").delete().eq("id", id);

  revalidatePath("/licensing");
  if (providerId) {
    revalidatePath(`/providers/${providerId}`);
    redirect(`/providers/${providerId}?tab=licensing`);
  }
  redirect("/licensing");
}
