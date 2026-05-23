"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { validateProvider, isValidState } from "@/lib/validation";
import { PROVIDER_ROLES } from "@/lib/constants";
import type {
  ImportOutcome,
  ImportRowError,
  ImportState,
  ProviderRole,
} from "@/lib/types";

type DbClient = ReturnType<typeof createClient>;

// ── Dependency-free CSV parser ────────────────────────────────────────────
/**
 * Parse CSV text into rows of string cells. Handles quoted fields, embedded
 * commas, embedded newlines, escaped "" quotes, a leading BOM, and both LF
 * and CRLF line endings. No external dependency.
 */
function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\n") {
      endField();
      endRow();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Flush a final field/row when the file does not end with a newline.
  if (field !== "" || row.length > 0) {
    endField();
    endRow();
  }
  return rows;
}

interface ParsedRecord {
  row: number; // 1-based line number in the file
  cells: Record<string, string>;
}

/** Parse CSV text into header-keyed records, preserving original line numbers. */
function readTable(text: string): { headers: string[]; records: ParsedRecord[] } {
  const all = parseCsv(text);
  const headerIdx = all.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx === -1) return { headers: [], records: [] };

  const headers = all[headerIdx].map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_"),
  );
  const records: ParsedRecord[] = [];
  for (let i = headerIdx + 1; i < all.length; i++) {
    const cells = all[i];
    if (!cells.some((c) => c.trim() !== "")) continue; // skip blank lines
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      obj[h] = (cells[j] ?? "").trim();
    });
    records.push({ row: i + 1, cells: obj });
  }
  return { headers, records };
}

/** Loose truthy parse for a CSV boolean cell. */
function boolCell(v: string): boolean {
  return /^(true|yes|y|1)$/i.test(v.trim());
}

const ROLE_SET = new Set<string>(PROVIDER_ROLES as readonly string[]);

// ── Clinician import ──────────────────────────────────────────────────────
async function importClinicians(
  supabase: DbClient,
  userId: string,
  text: string,
): Promise<ImportOutcome> {
  const { headers, records } = readTable(text);
  const errors: ImportRowError[] = [];

  if (!headers.includes("full_name")) {
    return {
      kind: "Clinicians",
      total: 0,
      succeeded: 0,
      failed: 0,
      errors: [
        { row: 1, message: 'Missing the required "full_name" column in the header row.' },
      ],
    };
  }

  const valid: { row: number; payload: Record<string, unknown> }[] = [];

  for (const rec of records) {
    const c = rec.cells;
    const rowErrors: string[] = [];

    const full_name = (c.full_name ?? "").trim();

    let clinician_role: ProviderRole | null = null;
    if (c.clinician_role) {
      const r = c.clinician_role.toUpperCase();
      if (ROLE_SET.has(r)) clinician_role = r as ProviderRole;
      else
        rowErrors.push(
          `Unknown clinician_role "${c.clinician_role}" — use one of ${PROVIDER_ROLES.join(", ")}.`,
        );
    }

    let years_experience: number | null = null;
    if (c.years_experience) {
      const n = Number(c.years_experience);
      if (!Number.isFinite(n))
        rowErrors.push(`years_experience "${c.years_experience}" is not a number.`);
      else years_experience = n;
    }

    let travel_radius_miles: number | null = null;
    if (c.travel_radius_miles) {
      const n = Number(c.travel_radius_miles);
      if (!Number.isFinite(n))
        rowErrors.push(
          `travel_radius_miles "${c.travel_radius_miles}" is not a number.`,
        );
      else travel_radius_miles = n;
    }

    const languages = c.languages
      ? c.languages
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const npi = c.npi || null;
    const available_start = c.available_start || null;

    const fieldErrs = validateProvider({
      full_name,
      npi,
      years_experience,
      travel_radius_miles,
      available_start,
    });
    for (const m of Object.values(fieldErrs)) rowErrors.push(m);

    if (rowErrors.length) {
      errors.push({ row: rec.row, message: rowErrors.join(" ") });
      continue;
    }

    valid.push({
      row: rec.row,
      payload: {
        full_name,
        clinician_role,
        specialty: c.specialty || null,
        npi,
        years_experience,
        languages: languages.length ? languages : null,
        travel_radius_miles,
        telehealth_ok: c.telehealth_ok ? boolCell(c.telehealth_ok) : false,
        available_start,
        pipeline_stage: "new",
        owner_id: userId,
        created_by: userId,
      },
    });
  }

  let succeeded = 0;
  const inserted = await Promise.all(
    valid.map(async (v) => {
      const { error } = await supabase.from("providers").insert(v.payload);
      return { row: v.row, error: error?.message ?? null };
    }),
  );
  for (const r of inserted) {
    if (r.error) errors.push({ row: r.row, message: `Database error: ${r.error}` });
    else succeeded++;
  }

  errors.sort((a, b) => a.row - b.row);
  return {
    kind: "Clinicians",
    total: records.length,
    succeeded,
    failed: records.length - succeeded,
    errors,
  };
}

// ── Facility import ───────────────────────────────────────────────────────
async function importFacilities(
  supabase: DbClient,
  text: string,
): Promise<ImportOutcome> {
  const { headers, records } = readTable(text);
  const errors: ImportRowError[] = [];

  if (!headers.includes("name")) {
    return {
      kind: "Facilities",
      total: 0,
      succeeded: 0,
      failed: 0,
      errors: [
        { row: 1, message: 'Missing the required "name" column in the header row.' },
      ],
    };
  }

  const valid: { row: number; payload: Record<string, unknown> }[] = [];

  for (const rec of records) {
    const c = rec.cells;
    const rowErrors: string[] = [];

    const name = (c.name ?? "").trim();
    if (name.length < 2) rowErrors.push("Facility name is required.");

    let state: string | null = null;
    if (c.state) {
      state = c.state.toUpperCase();
      if (!isValidState(state))
        rowErrors.push(`"${c.state}" is not a valid US state code.`);
    }

    if (rowErrors.length) {
      errors.push({ row: rec.row, message: rowErrors.join(" ") });
      continue;
    }

    valid.push({
      row: rec.row,
      payload: {
        name,
        setting: c.setting || null,
        emr: c.emr || null,
        city: c.city || null,
        state,
      },
    });
  }

  let succeeded = 0;
  const inserted = await Promise.all(
    valid.map(async (v) => {
      const { error } = await supabase.from("facilities").insert(v.payload);
      return { row: v.row, error: error?.message ?? null };
    }),
  );
  for (const r of inserted) {
    if (r.error) errors.push({ row: r.row, message: `Database error: ${r.error}` });
    else succeeded++;
  }

  errors.sort((a, b) => a.row - b.row);
  return {
    kind: "Facilities",
    total: records.length,
    succeeded,
    failed: records.length - succeeded,
    errors,
  };
}

// ── Server action — drives the importer form via useFormState ─────────────
export async function runImport(
  _prev: ImportState,
  fd: FormData,
): Promise<ImportState> {
  const me = await requireStaff();
  const supabase = createClient();

  const clinFile = fd.get("clinicians_csv");
  const facFile = fd.get("facilities_csv");
  const hasClin = clinFile instanceof File && clinFile.size > 0;
  const hasFac = facFile instanceof File && facFile.size > 0;

  if (!hasClin && !hasFac) {
    return {
      ran: false,
      outcomes: [],
      message: "Choose at least one CSV file to import.",
    };
  }

  const outcomes: ImportOutcome[] = [];
  if (hasClin) {
    outcomes.push(
      await importClinicians(supabase, me.id, await (clinFile as File).text()),
    );
  }
  if (hasFac) {
    outcomes.push(
      await importFacilities(supabase, await (facFile as File).text()),
    );
  }

  revalidatePath("/providers");
  revalidatePath("/facilities");
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");

  return { ran: true, outcomes, message: null };
}
