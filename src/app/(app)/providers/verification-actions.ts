"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import {
  configuredVendor,
  verificationMode,
  isResolved,
} from "@/lib/verification";
import type { VerificationType, VerificationStatus } from "@/lib/verification";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Open a new verification (background / malpractice / reference). */
export async function requestVerification(fd: FormData) {
  await requireStaff();
  const providerId = str(fd, "provider_id");
  const type = str(fd, "type") as VerificationType | null;
  if (!providerId || !type) return;

  const supabase = createClient();
  // If a vendor handles this type, stamp the vendor name; otherwise manual.
  const vendor =
    verificationMode(type) === "vendor"
      ? configuredVendor()?.name ?? null
      : null;

  const { error } = await supabase.from("verifications").insert({
    provider_id: providerId,
    type,
    vendor,
    status: "pending",
  });

  const suffix = error
    ? "?tab=verification&error=" + encodeURIComponent(error.message)
    : "?tab=verification";
  revalidatePath(`/providers/${providerId}`);
  redirect(`/providers/${providerId}${suffix}`);
}

/** Move a verification through its lifecycle and record the outcome. */
export async function updateVerification(fd: FormData) {
  await requireStaff();
  const id = str(fd, "verification_id");
  const providerId = str(fd, "provider_id");
  const status = str(fd, "status") as VerificationStatus | null;
  if (!id || !status) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("verifications")
    .update({
      status,
      result: str(fd, "result"),
      // Stamp completion only for a resolved (pass/fail/flag) outcome.
      completed_at: isResolved(status) ? new Date().toISOString() : null,
    })
    .eq("id", id);

  const suffix = error
    ? "?tab=verification&error=" + encodeURIComponent(error.message)
    : "?tab=verification";
  revalidatePath(`/providers/${providerId}`);
  redirect(`/providers/${providerId}${suffix}`);
}

export async function deleteVerification(fd: FormData) {
  await requireStaff();
  const id = str(fd, "verification_id");
  const providerId = str(fd, "provider_id");
  if (!id) return;
  const supabase = createClient();
  await supabase.from("verifications").delete().eq("id", id);
  revalidatePath(`/providers/${providerId}`);
}
