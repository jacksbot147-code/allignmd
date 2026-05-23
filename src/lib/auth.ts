import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { AppUser, Provider } from "./types";
import {
  isStaff as roleIsStaff,
  isPrivileged as roleIsPrivileged,
  homePathForRole,
} from "./constants";

/**
 * Resolve the current app_users row for the signed-in user.
 * Bootstraps the row on first sign-in (first-ever user becomes admin).
 * Returns null when nobody is signed in.
 */
export async function getAppUser(): Promise<AppUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) return existing as AppUser;

  // First sign-in — provision the app_users row via service role.
  const admin = createAdminClient();
  const { count } = await admin
    .from("app_users")
    .select("id", { count: "exact", head: true });
  const role = (count ?? 0) === 0 ? "admin" : "recruiter";
  const { data: created } = await admin
    .from("app_users")
    .insert({
      id: user.id,
      email: user.email ?? "",
      full_name:
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        null,
      role,
    })
    .select("*")
    .single();
  return (created as AppUser) ?? null;
}

/** Require a signed-in user; redirect to /login otherwise. */
export async function requireUser(): Promise<AppUser> {
  const u = await getAppUser();
  if (!u) redirect("/login");
  return u;
}

/** Require a CRM-staff user; redirect non-staff to their own home. */
export async function requireStaff(): Promise<AppUser> {
  const u = await requireUser();
  if (!roleIsStaff(u.role)) redirect(homePathForRole(u.role));
  return u;
}

/** Require an admin; redirect everyone else to their own home. */
export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect(homePathForRole(u.role));
  return u;
}

/** Require a clinician (provider portal); redirect everyone else home. */
export async function requireProvider(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role !== "provider") redirect(homePathForRole(u.role));
  return u;
}

/** Require a facility contact (facility portal); redirect everyone else home. */
export async function requireFacilityContact(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role !== "facility_contact") redirect(homePathForRole(u.role));
  return u;
}

/**
 * The provider record owned by the signed-in user, if one has been linked.
 * Relies on the `provider_self_read` RLS policy (providers.user_id = uid).
 */
export async function getMyProvider(): Promise<Provider | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("providers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as Provider) ?? null;
}

export const isStaff = roleIsStaff;
export const isPrivileged = roleIsPrivileged;
