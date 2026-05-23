#!/usr/bin/env node
/**
 * credential-expiry-alerter.mjs — AlignMD ops agent.
 *
 * Scans provider credentials and opens a task reminder for any expiring
 * within 90 days (or already expired). Buckets: expired / 30 / 60 / 90.
 * Deduped — one reminder per credential per bucket. This is what keeps the
 * dashboard's "Open tasks" / 30-60-90 view live; nothing else creates these
 * rows.
 *
 * Runs against AlignMD's own Supabase via the service-role key (server-side
 * only — never ship this key to the browser). No dependencies — talks to the
 * PostgREST API directly. Schedule it daily.
 *
 * Run: node scripts/credential-expiry-alerter.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(HERE, "..", ".env.local");

async function loadEnv() {
  const env = {};
  try {
    const t = await fs.readFile(ENV_FILE, "utf8");
    for (const line of t.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
      if (m && !line.trim().startsWith("#")) {
        env[m[1]] = m[2].replace(/^['"]|['"]$/g, "").trim();
      }
    }
  } catch {
    /* handled by the missing-env check below */
  }
  return env;
}

/** Which reminder bucket a credential falls into, by days until expiry. */
function bucket(days) {
  if (days < 0) return { type: "expired", label: "has expired" };
  if (days <= 30) return { type: "expiry_30", label: "expires within 30 days" };
  if (days <= 60) return { type: "expiry_60", label: "expires within 60 days" };
  return { type: "expiry_90", label: "expires within 90 days" };
}

async function main() {
  const env = await loadEnv();
  const URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in alignmd/.env.local");
    process.exit(1);
  }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

  const now = Date.now();
  const horizon = new Date(now + 90 * 86_400_000).toISOString().slice(0, 10);

  // Credentials with an expiry date inside the 90-day horizon.
  const credUrl =
    `${URL}/rest/v1/provider_credentials` +
    `?select=id,provider_id,type,state,expires_on,providers(full_name)` +
    `&expires_on=not.is.null&expires_on=lte.${horizon}`;
  const credRes = await fetch(credUrl, { headers: H });
  const creds = await credRes.json();
  if (!Array.isArray(creds)) {
    console.error("credential query failed:", JSON.stringify(creds).slice(0, 300));
    process.exit(1);
  }

  // Existing credential-linked reminders, to dedupe on (credential_id + bucket).
  const existRes = await fetch(
    `${URL}/rest/v1/tasks_reminders?select=credential_id,type&credential_id=not.is.null`,
    { headers: H }
  );
  const existing = await existRes.json();
  const have = new Set(
    (Array.isArray(existing) ? existing : []).map((r) => `${r.credential_id}|${r.type}`)
  );

  const toCreate = [];
  for (const c of creds) {
    if (!c.expires_on) continue;
    const days = Math.floor((new Date(c.expires_on).getTime() - now) / 86_400_000);
    const b = bucket(days);
    if (have.has(`${c.id}|${b.type}`)) continue;
    const who = c.providers?.full_name || "Provider";
    const what = [String(c.type || "credential").replace(/_/g, " "), c.state]
      .filter(Boolean)
      .join(" ");
    toCreate.push({
      provider_id: c.provider_id,
      credential_id: c.id,
      title: `${who} — ${what} ${b.label}`,
      due_on: c.expires_on,
      type: b.type,
      status: "open",
    });
  }

  let created = 0;
  if (toCreate.length) {
    const res = await fetch(`${URL}/rest/v1/tasks_reminders`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(toCreate),
    });
    if (res.ok) {
      created = toCreate.length;
    } else {
      console.error("reminder insert failed:", res.status, (await res.text()).slice(0, 300));
      process.exit(1);
    }
  }

  console.log(
    `credential-expiry-alerter: ${creds.length} credential(s) inside the 90-day horizon · ` +
      `${created} new reminder(s) opened`
  );
}

main().catch((e) => {
  console.error("credential-expiry-alerter failed:", e.message);
  process.exit(1);
});
