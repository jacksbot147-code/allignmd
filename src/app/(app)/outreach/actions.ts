"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { buildEmailDraft, buildSmsDraft } from "@/lib/outreach";
import type { OutreachContext } from "@/lib/outreach";

// ── FormData helpers ──────────────────────────────────────────────────────
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Build an /outreach URL, preserving the job filter and adding a flash param. */
function outreachUrl(jobId: string | null, extra: Record<string, string>): string {
  const sp = new URLSearchParams();
  if (jobId) sp.set("job", jobId);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/outreach?${qs}` : "/outreach";
}

/**
 * Generate email + SMS DRAFT copy for one or more clinicians and log them to
 * outreach_drafts. Nothing is sent — the drafts are displayed for copy/paste.
 */
export async function generateDrafts(fd: FormData) {
  const me = await requireStaff();
  const jobId = str(fd, "job_id");
  const providerIds = Array.from(
    new Set(
      fd
        .getAll("provider_id")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  );

  if (providerIds.length === 0) {
    redirect(
      outreachUrl(jobId, { error: "Select at least one clinician." }),
    );
  }

  const supabase = createClient();
  const { data: providers } = await supabase
    .from("providers")
    .select("id, full_name, clinician_role, specialty")
    .in("id", providerIds);

  let job: any = null;
  if (jobId) {
    const { data } = await supabase
      .from("jobs")
      .select(
        "id, title, specialty, is_permanent, rate_hourly, facility:facilities(name, city, state)",
      )
      .eq("id", jobId)
      .maybeSingle();
    job = data;
  }

  const recruiterName = me.full_name || me.email || "Your AlignMD recruiter";
  const facilityName: string | null = job?.facility?.name ?? null;
  const facilityLocation: string | null = job?.facility
    ? [job.facility.city, job.facility.state].filter(Boolean).join(", ") || null
    : null;

  const rows: Record<string, unknown>[] = [];
  for (const p of providers ?? []) {
    const ctx: OutreachContext = {
      providerName: p.full_name ?? "there",
      providerRole: p.clinician_role ?? null,
      providerSpecialty: p.specialty ?? null,
      recruiterName,
      jobTitle: job?.title ?? null,
      facilityName,
      facilityLocation,
      rateHourly: job?.rate_hourly ?? null,
      isPermanent: job?.is_permanent ?? null,
    };
    const email = buildEmailDraft(ctx);
    const sms = buildSmsDraft(ctx);
    rows.push({
      provider_id: p.id,
      job_id: jobId,
      channel: "email",
      subject: email.subject,
      body: email.body,
      created_by: me.id,
    });
    rows.push({
      provider_id: p.id,
      job_id: jobId,
      channel: "sms",
      subject: null,
      body: sms.body,
      created_by: me.id,
    });
  }

  if (rows.length === 0) {
    redirect(
      outreachUrl(jobId, { error: "No matching clinicians were found." }),
    );
  }

  const { error } = await supabase.from("outreach_drafts").insert(rows);
  revalidatePath("/outreach");
  if (error) {
    redirect(outreachUrl(jobId, { error: error.message }));
  }
  redirect(
    outreachUrl(jobId, { generated: String(providers?.length ?? 0) }),
  );
}

/** Remove a single logged draft. */
export async function deleteDraft(fd: FormData) {
  await requireStaff();
  const id = str(fd, "draft_id");
  const jobId = str(fd, "job_id");
  if (id) {
    const supabase = createClient();
    await supabase.from("outreach_drafts").delete().eq("id", id);
  }
  revalidatePath("/outreach");
  redirect(outreachUrl(jobId, {}));
}
