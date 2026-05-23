"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { validateProvider, errorSummary } from "@/lib/validation";

// ── FormData parse helpers (mirror providers/actions.ts) ──────────────────
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

/**
 * Resolve the signed-in clinician's own provider record. A 'provider' user
 * with no linked profile is bounced back to the clinician home, which explains
 * the situation.
 */
async function myProviderId(): Promise<string> {
  await requireProvider();
  const provider = await getMyProvider();
  if (!provider) redirect("/clinician");
  return provider.id;
}

// ── Profile — a clinician edits their own basic info ──────────────────────
// Only basic-info columns are written here; pipeline stage, ownership and
// archive state stay staff-controlled. RLS (provider_self_update) is the
// database backstop that confines the write to this clinician's own row.
export async function updateMyProfile(fd: FormData) {
  const providerId = await myProviderId();

  const fields = {
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

  const errs = validateProvider({
    full_name: fields.full_name,
    npi: fields.npi,
    years_experience: fields.years_experience,
    travel_radius_miles: fields.travel_radius_miles,
    available_start: fields.available_start,
  });
  if (Object.keys(errs).length) {
    redirect(
      "/clinician/profile?error=" + encodeURIComponent(errorSummary(errs)),
    );
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("providers")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", providerId);

  if (error) {
    redirect("/clinician/profile?error=" + encodeURIComponent(error.message));
  }
  revalidatePath("/clinician");
  revalidatePath("/clinician/profile");
  redirect("/clinician/profile?saved=1");
}

// ── Availability — a clinician manages their own shift blocks ─────────────
export async function addMyAvailability(fd: FormData) {
  const providerId = await myProviderId();

  const block_start = str(fd, "block_start");
  const block_end = str(fd, "block_end");
  if (block_start && block_end && block_start > block_end) {
    redirect(
      "/clinician/availability?error=" +
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
  if (error) {
    redirect(
      "/clinician/availability?error=" + encodeURIComponent(error.message),
    );
  }
  revalidatePath("/clinician/availability");
  revalidatePath("/clinician");
  redirect("/clinician/availability?saved=1");
}

export async function deleteMyAvailability(fd: FormData) {
  const providerId = await myProviderId();
  const id = str(fd, "availability_id");
  if (!id) redirect("/clinician/availability");
  const supabase = createClient();
  await supabase
    .from("provider_availability")
    .delete()
    .eq("id", id)
    .eq("provider_id", providerId);
  revalidatePath("/clinician/availability");
  revalidatePath("/clinician");
}

// ── Documents — a clinician uploads / removes their own files ─────────────
// Storage path is `<provider_id>/<timestamp>-<name>`; the provider storage
// RLS policy keys off that first segment. Clinicians may only file standard
// or sensitive documents — 'restricted' stays a staff-only classification.
export async function uploadMyDocument(fd: FormData) {
  const providerId = await myProviderId();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      "/clinician/documents?error=" +
        encodeURIComponent("Choose a file to upload."),
    );
  }

  const supabase = createClient();
  const sensitivityIn = str(fd, "sensitivity");
  const sensitivity =
    sensitivityIn === "sensitive" ? "sensitive" : "standard";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${providerId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("provider-documents")
    .upload(path, file, { upsert: false });
  if (upErr) {
    redirect(
      "/clinician/documents?error=" +
        encodeURIComponent("Upload failed: " + upErr.message),
    );
  }

  const { error: rowErr } = await supabase.from("provider_documents").insert({
    provider_id: providerId,
    doc_type: str(fd, "doc_type") ?? "other",
    storage_path: path,
    sensitivity,
  });
  if (rowErr) {
    redirect(
      "/clinician/documents?error=" + encodeURIComponent(rowErr.message),
    );
  }
  revalidatePath("/clinician/documents");
  revalidatePath("/clinician");
  redirect("/clinician/documents?saved=1");
}

export async function deleteMyDocument(fd: FormData) {
  const providerId = await myProviderId();
  const id = str(fd, "document_id");
  const path = str(fd, "storage_path");
  if (!id) redirect("/clinician/documents");
  const supabase = createClient();
  if (path) {
    await supabase.storage.from("provider-documents").remove([path]);
  }
  await supabase
    .from("provider_documents")
    .delete()
    .eq("id", id)
    .eq("provider_id", providerId);
  revalidatePath("/clinician/documents");
  revalidatePath("/clinician");
}

// ── Saved jobs — a clinician flags a scanned posting as "interested" ──────
// Toggles a saved_jobs row (migration 0012) for the signed-in clinician and
// one external_jobs posting: if a row exists it is removed, otherwise added.
// Defensive — if the saved_jobs table has not been migrated yet the lookup
// errors and the action redirects with a notice instead of crashing.
export async function toggleSavedJob(fd: FormData) {
  const providerId = await myProviderId();
  const externalJobId = str(fd, "external_job_id");
  // Preserve which view the clinician toggled from (all jobs vs. saved).
  const dest =
    str(fd, "view") === "saved"
      ? "/clinician/jobs?view=saved"
      : "/clinician/jobs";
  if (!externalJobId) redirect(dest);

  const supabase = createClient();
  const { data: existing, error: selErr } = await supabase
    .from("saved_jobs")
    .select("id")
    .eq("provider_id", providerId)
    .eq("external_job_id", externalJobId)
    .maybeSingle();

  if (selErr) {
    redirect(
      "/clinician/jobs?error=" +
        encodeURIComponent(
          "Saved jobs aren't available yet — the 0012 migration is still pending.",
        ),
    );
  }

  if (existing) {
    await supabase
      .from("saved_jobs")
      .delete()
      .eq("id", (existing as { id: string }).id);
  } else {
    const { error: insErr } = await supabase
      .from("saved_jobs")
      .insert({ provider_id: providerId, external_job_id: externalJobId });
    if (insErr) {
      redirect("/clinician/jobs?error=" + encodeURIComponent(insErr.message));
    }
  }

  revalidatePath("/clinician/jobs");
  revalidatePath("/clinician");
  redirect(dest);
}
