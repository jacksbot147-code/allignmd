"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { asItemType, asStatus } from "@/lib/credentialing";

// ── FormData parse helper — mirrors providers/actions.ts ───────────────────
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Create or update one credentialing packet item for a provider. Upserts on
 * (provider_id, item_type) — the unique index from migration 0011 — so the
 * staff packet view can edit any checklist row whether or not it exists yet.
 *
 * completed_on is stamped the day an item first reaches "complete" and is
 * cleared whenever it leaves that status; verified_by records who completed it.
 */
export async function saveCredentialingItem(fd: FormData) {
  const me = await requireStaff();
  const providerId = str(fd, "provider_id");
  const itemType = asItemType(str(fd, "item_type"));
  if (!providerId || !itemType) return;

  const status = asStatus(str(fd, "status"));
  const completedOn =
    status === "complete" ? str(fd, "completed_on") ?? todayISO() : null;

  const supabase = createClient();
  const { error } = await supabase.from("credentialing_items").upsert(
    {
      provider_id: providerId,
      item_type: itemType,
      status,
      due_date: str(fd, "due_date"),
      completed_on: completedOn,
      notes: str(fd, "notes"),
      verified_by: status === "complete" ? me.id : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_id,item_type" },
  );

  const suffix = error
    ? "?tab=credentialing&error=" + encodeURIComponent(error.message)
    : "?tab=credentialing";
  revalidatePath(`/providers/${providerId}`);
  redirect(`/providers/${providerId}${suffix}`);
}

/** Clear a packet item back to "not started" by removing its stored row. */
export async function resetCredentialingItem(fd: FormData) {
  await requireStaff();
  const providerId = str(fd, "provider_id");
  const id = str(fd, "item_id");
  if (!providerId || !id) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("credentialing_items")
    .delete()
    .eq("id", id);

  const suffix = error
    ? "?tab=credentialing&error=" + encodeURIComponent(error.message)
    : "?tab=credentialing";
  revalidatePath(`/providers/${providerId}`);
  redirect(`/providers/${providerId}${suffix}`);
}
