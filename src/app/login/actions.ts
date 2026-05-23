"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { homePathForRole } from "@/lib/constants";
import type { UserRole } from "@/lib/types";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "");

  if (!email || !password) {
    redirect("/login?error=" + encodeURIComponent("Email and password are required."));
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  // Honor an explicit deep link; otherwise route by role — staff to the CRM
  // dashboard, providers and facility contacts to their portals. Only a
  // genuine in-app path is allowed: a protocol-relative target ("//evil.com"
  // or "/\\evil.com") would be an open redirect off-site.
  const isSafeNext =
    !!next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    next !== "/dashboard";
  if (isSafeNext) {
    redirect(next);
  }
  let role: UserRole | null = null;
  const uid = data.user?.id;
  if (uid) {
    const { data: row } = await supabase
      .from("app_users")
      .select("role")
      .eq("id", uid)
      .maybeSingle();
    role = (row?.role as UserRole | undefined) ?? null;
  }
  redirect(homePathForRole(role));
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();

  if (!email || !password) {
    redirect(
      "/login?mode=signup&error=" +
        encodeURIComponent("Email and password are required."),
    );
  }
  if (password.length < 8) {
    redirect(
      "/login?mode=signup&error=" +
        encodeURIComponent("Password must be at least 8 characters."),
    );
  }

  // Build the absolute origin so the confirmation email links back to THIS
  // deployment's /auth/callback route (where the session gets established).
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });
  if (error) {
    redirect("/login?mode=signup&error=" + encodeURIComponent(error.message));
  }

  if (data.session) {
    redirect("/dashboard");
  }
  // Email confirmation is enabled on the project.
  redirect("/login?notice=" + encodeURIComponent("confirm-email"));
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
