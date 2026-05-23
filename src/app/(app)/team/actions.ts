"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/lib/types";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const VALID_ROLES = Object.keys(ROLE_LABELS) as UserRole[];

/**
 * Admin-only: set a teammate's role, and the links the portals depend on —
 * a facility for a facility_contact, a provider record for a clinician.
 * Account creation and credentials are never touched here.
 */
export async function updateTeamMember(fd: FormData) {
  const me = await requireAdmin();
  const userId = str(fd, "user_id");
  const role = str(fd, "role") as UserRole | null;
  const facilityId = str(fd, "facility_id");
  const providerId = str(fd, "provider_id");

  if (!userId) redirect("/team?error=" + encodeURIComponent("Missing user."));
  if (!role || !VALID_ROLES.includes(role)) {
    redirect("/team?error=" + encodeURIComponent("Pick a valid role."));
  }
  // Guard against an admin removing their own admin access and locking
  // everyone out of team management.
  if (userId === me.id && role !== "admin") {
    redirect(
      "/team?error=" +
        encodeURIComponent("You can't change your own role away from admin."),
    );
  }

  const supabase = createClient();

  // app_users: role + facility link (facility link only for facility_contact).
  const { error: userErr } = await supabase
    .from("app_users")
    .update({
      role,
      facility_id: role === "facility_contact" ? facilityId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (userErr) {
    redirect("/team?error=" + encodeURIComponent(userErr.message));
  }

  // providers.user_id: clear any existing link for this user, then re-point
  // it at the chosen provider record when the role is 'provider'.
  await supabase
    .from("providers")
    .update({ user_id: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (role === "provider" && providerId) {
    const { error: linkErr } = await supabase
      .from("providers")
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", providerId);
    if (linkErr) {
      redirect("/team?error=" + encodeURIComponent(linkErr.message));
    }
  }

  revalidatePath("/team");
  redirect("/team?saved=1");
}
