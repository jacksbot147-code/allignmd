#!/usr/bin/env node
/**
 * AlignMD — seed script.
 *
 * Creates an admin login and a set of realistic demo records so the CRM
 * is usable the moment it deploys. Idempotent: re-running only ensures the
 * admin account; demo data is inserted once (skipped if providers exist).
 *
 *   node scripts/seed.mjs
 *
 * Override the admin credentials with env vars if you like:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Load .env.local ───────────────────────────────────────────────────────
function loadEnv() {
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* env may already be set */
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("  Fill alignmd/.env.local first.");
  process.exit(1);
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@alignmd.dev";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "AlignMD!2026";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "AlignMD Admin";

const db = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Date helpers (relative to run time) ───────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10);
const offsetDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

async function ensureAdmin() {
  console.log(`→ Ensuring admin account: ${ADMIN_EMAIL}`);
  let userId = null;

  const { data: created, error } = await db.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: ADMIN_NAME },
  });

  if (created?.user) {
    userId = created.user.id;
    console.log("  ✓ admin auth user created");
  } else {
    // Likely already exists — find it.
    const { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
    const found = list?.users?.find(
      (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    );
    if (found) {
      userId = found.id;
      console.log("  • admin auth user already existed");
    } else {
      throw new Error("Could not create or find admin user: " + error?.message);
    }
  }

  await db
    .from("app_users")
    .upsert(
      {
        id: userId,
        email: ADMIN_EMAIL,
        full_name: ADMIN_NAME,
        role: "admin",
        status: "active",
      },
      { onConflict: "id" },
    );
  console.log("  ✓ app_users row set to role=admin");
  return userId;
}

async function seedDemo(adminId) {
  const { count } = await db
    .from("providers")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.log("• Demo data already present — skipping.");
    return;
  }
  console.log("→ Inserting demo data…");

  // Procedure catalog
  const procedures = [
    ["Orthopedic Surgery", "Joint injection / aspiration"],
    ["Orthopedic Surgery", "Fracture reduction"],
    ["Orthopedic Surgery", "Casting / splinting"],
    ["General Surgery", "Central line placement"],
    ["General Surgery", "Chest tube assist"],
    ["Emergency Medicine", "Laceration repair"],
    ["Emergency Medicine", "Procedural sedation"],
    ["Family Medicine", "Skin biopsy"],
  ];
  await db
    .from("procedure_catalog")
    .upsert(
      procedures.map(([specialty, procedure_name]) => ({
        specialty,
        procedure_name,
      })),
      { onConflict: "specialty,procedure_name" },
    );

  // Facilities
  const { data: facilities } = await db
    .from("facilities")
    .insert([
      { name: "Gulf Coast Regional Medical Center", setting: "inpatient", emr: "Epic", city: "Fort Myers", state: "FL" },
      { name: "Cape Surgical Center", setting: "OR", emr: "Cerner", city: "Cape Coral", state: "FL" },
      { name: "Estero Urgent Care", setting: "outpatient", emr: "athenahealth", city: "Estero", state: "FL" },
    ])
    .select("id, name");

  const fac = (n) => facilities.find((f) => f.name.includes(n))?.id;

  // Jobs
  const { data: jobs } = await db
    .from("jobs")
    .insert([
      { facility_id: fac("Gulf Coast"), title: "Hospitalist NP — Nights", specialty: "Hospitalist", setting: "inpatient", schedule: "7 on / 7 off, nights", call_requirement: "none", status: "open", rate_hourly: 95, rate_weekend: 110, rate_holiday: 130 },
      { facility_id: fac("Cape Surgical"), title: "Orthopedic First Assist PA", specialty: "Orthopedic Surgery", setting: "OR", schedule: "Mon–Fri days", call_requirement: "1:4 weekend call", status: "open", rate_hourly: 88, rate_callback: 120 },
      { facility_id: fac("Estero"), title: "Urgent Care NP — PRN", specialty: "Urgent Care", setting: "outpatient", schedule: "PRN, flexible", call_requirement: "none", status: "open", rate_hourly: 78 },
    ])
    .select("id, title");

  await db.from("job_requirements").insert([
    { job_id: jobs[0].id, required_license_states: ["FL"], required_certs: ["bls", "acls"], min_years_experience: 2 },
    { job_id: jobs[1].id, required_license_states: ["FL"], required_certs: ["bls", "acls", "atls"], min_years_experience: 3 },
    { job_id: jobs[2].id, required_license_states: ["FL"], required_certs: ["bls"], min_years_experience: 1 },
  ]);

  // Providers
  const { data: providers } = await db
    .from("providers")
    .insert([
      { full_name: "Dana Whitfield", clinician_role: "NP", specialty: "Hospitalist", years_experience: 8, npi: "1538291746", languages: ["English", "Spanish"], travel_radius_miles: 120, telehealth_ok: true, available_start: offsetDays(21), pipeline_stage: "credentialing", owner_id: adminId, created_by: adminId },
      { full_name: "Marcus Boone", clinician_role: "PA", specialty: "Orthopedic Surgery", subspecialty: "Sports Medicine", years_experience: 6, npi: "1902847163", languages: ["English"], travel_radius_miles: 200, telehealth_ok: false, available_start: offsetDays(10), pipeline_stage: "submitted", owner_id: adminId, created_by: adminId },
      { full_name: "Priya Nadella", clinician_role: "MD", specialty: "Emergency Medicine", years_experience: 12, npi: "1748392016", languages: ["English", "Hindi"], travel_radius_miles: 90, telehealth_ok: true, available_start: offsetDays(45), pipeline_stage: "screen", owner_id: adminId, created_by: adminId },
      { full_name: "Tyler Hendricks", clinician_role: "CRNA", specialty: "Anesthesiology", years_experience: 9, npi: "1093847562", languages: ["English"], travel_radius_miles: 150, telehealth_ok: false, available_start: offsetDays(30), pipeline_stage: "new", owner_id: adminId, created_by: adminId },
      { full_name: "Sofia Reyes", clinician_role: "NP", specialty: "Urgent Care", years_experience: 4, npi: "1657483920", languages: ["English", "Spanish"], travel_radius_miles: 60, telehealth_ok: true, available_start: offsetDays(7), pipeline_stage: "interview", owner_id: adminId, created_by: adminId },
      { full_name: "Alan Cho", clinician_role: "DO", specialty: "Family Medicine", years_experience: 15, npi: "1384756291", languages: ["English", "Korean"], travel_radius_miles: 100, telehealth_ok: true, available_start: offsetDays(60), pipeline_stage: "placed", owner_id: adminId, created_by: adminId },
    ])
    .select("id, full_name");

  const prov = (n) => providers.find((p) => p.full_name.includes(n))?.id;

  // SSN (last 4) lives in the privileged-only side table — see 0005 migration.
  const ssnByName = { Dana: "4821", Marcus: "9075", Priya: "1190", Tyler: "7733", Sofia: "3308", Alan: "5512" };
  await db.from("provider_private").insert(
    Object.entries(ssnByName)
      .map(([name, ssn_last4]) => {
        const provider_id = prov(name);
        return provider_id ? { provider_id, ssn_last4 } : null;
      })
      .filter(Boolean),
  );

  // Credentials — spread across expiry buckets so the tracker is meaningful.
  await db.from("provider_credentials").insert([
    { provider_id: prov("Dana"), type: "state_license", state: "FL", number: "ARNP-FL-228174", issued_on: "2021-03-01", expires_on: offsetDays(-12), verified: true, verification_source: "state board" },
    { provider_id: prov("Dana"), type: "acls", number: "ACLS-99182", issued_on: "2024-06-01", expires_on: offsetDays(22), verified: true },
    { provider_id: prov("Dana"), type: "bls", number: "BLS-44021", issued_on: "2024-06-01", expires_on: offsetDays(420), verified: true },
    { provider_id: prov("Marcus"), type: "state_license", state: "FL", number: "PA-FL-771902", issued_on: "2022-01-15", expires_on: offsetDays(54), verified: true, verification_source: "state board" },
    { provider_id: prov("Marcus"), type: "state_license", state: "GA", is_compact: false, number: "PA-GA-330218", issued_on: "2022-08-01", expires_on: offsetDays(310), verified: false },
    { provider_id: prov("Marcus"), type: "atls", number: "ATLS-7781", issued_on: "2023-09-01", expires_on: offsetDays(78), verified: true },
    { provider_id: prov("Priya"), type: "state_license", state: "FL", number: "MD-FL-540019", issued_on: "2019-05-01", expires_on: offsetDays(500), verified: true, verification_source: "state board" },
    { provider_id: prov("Priya"), type: "dea", number: "BP4471829", issued_on: "2023-02-01", expires_on: offsetDays(85), verified: true },
    { provider_id: prov("Priya"), type: "board_certification", number: "ABEM-118273", issued_on: "2020-11-01", expires_on: offsetDays(900), verified: true },
    { provider_id: prov("Tyler"), type: "state_license", state: "FL", number: "CRNA-FL-118827", issued_on: "2020-07-01", expires_on: offsetDays(28), verified: false },
    { provider_id: prov("Sofia"), type: "state_license", state: "FL", number: "ARNP-FL-661204", issued_on: "2023-04-01", expires_on: offsetDays(640), verified: true, verification_source: "state board" },
    { provider_id: prov("Sofia"), type: "bls", number: "BLS-55817", issued_on: "2024-10-01", expires_on: offsetDays(47), verified: true },
    { provider_id: prov("Alan"), type: "state_license", state: "FL", number: "DO-FL-220094", issued_on: "2015-06-01", expires_on: offsetDays(720), verified: true, verification_source: "state board" },
    { provider_id: prov("Alan"), type: "dea", number: "BC9928174", issued_on: "2022-12-01", expires_on: offsetDays(-3), verified: true },
  ]);

  // A little activity history.
  await db.from("activities").insert([
    { provider_id: prov("Dana"), type: "call", body: "Intro call — strong fit for the Gulf Coast nights role. Confirming FL license renewal timeline.", actor_id: adminId },
    { provider_id: prov("Dana"), type: "note", body: "FL license lapsed — flagged for credentialing follow-up before submission.", actor_id: adminId },
    { provider_id: prov("Marcus"), type: "email", body: "Sent Cape Surgical first-assist details and rate card. Awaiting reply on start date.", actor_id: adminId },
    { provider_id: prov("Priya"), type: "text", body: "Scheduled screening call for Thursday 2pm.", actor_id: adminId },
    { provider_id: prov("Sofia"), type: "call", body: "Interview with Estero Urgent Care went well — they want references.", actor_id: adminId },
    { provider_id: prov("Alan"), type: "note", body: "Placed at a prior facility; DEA renewal overdue — confirm before next submission.", actor_id: adminId },
  ]);

  // Open credentialing tasks.
  await db.from("tasks_reminders").insert([
    { provider_id: prov("Dana"), title: "Renew FL ARNP license", due_on: offsetDays(7), type: "expiry_30", status: "open", assignee_id: adminId },
    { provider_id: prov("Tyler"), title: "Verify FL CRNA license with state board", due_on: offsetDays(14), type: "missing_item", status: "open", assignee_id: adminId },
    { provider_id: prov("Alan"), title: "Confirm DEA renewal", due_on: offsetDays(3), type: "expiry_30", status: "open", assignee_id: adminId },
  ]);

  console.log(`  ✓ ${providers.length} providers, ${jobs.length} jobs, 14 credentials, demo activity`);
}

async function main() {
  console.log("AlignMD seed\n────────────");
  const adminId = await ensureAdmin();
  await seedDemo(adminId);
  console.log("\n✓ Done.");
  console.log(`\n  Sign in at /login`);
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`\n  Change this password after first sign-in.`);
}

main().catch((e) => {
  console.error("\n✗ Seed failed:", e.message || e);
  process.exit(1);
});
