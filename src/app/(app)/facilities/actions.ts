"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { isValidState } from "@/lib/validation";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function facilityFields(fd: FormData) {
  return {
    name: str(fd, "name") ?? "Unnamed facility",
    setting: str(fd, "setting"),
    emr: str(fd, "emr"),
    city: str(fd, "city"),
    state: (() => {
      const s = str(fd, "state");
      return s ? s.toUpperCase() : null;
    })(),
  };
}

export async function createFacility(fd: FormData) {
  await requireStaff();
  const fields = facilityFields(fd);
  if (!str(fd, "name")) {
    redirect(
      "/facilities/new?error=" +
        encodeURIComponent("Facility name is required."),
    );
  }
  if (fields.state && !isValidState(fields.state)) {
    redirect(
      "/facilities/new?error=" +
        encodeURIComponent(`"${fields.state}" is not a valid US state code.`),
    );
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("facilities")
    .insert(fields)
    .select("id")
    .single();
  if (error || !data) {
    redirect(
      "/facilities/new?error=" +
        encodeURIComponent(error?.message ?? "Could not create facility."),
    );
  }
  revalidatePath("/facilities");
  redirect(`/facilities/${data.id}`);
}

export async function updateFacility(fd: FormData) {
  await requireStaff();
  const id = str(fd, "id");
  if (!id) redirect("/facilities");
  const fields = facilityFields(fd);
  if (fields.state && !isValidState(fields.state)) {
    redirect(
      `/facilities/${id}?error=` +
        encodeURIComponent(`"${fields.state}" is not a valid US state code.`),
    );
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("facilities")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    redirect(`/facilities/${id}?error=` + encodeURIComponent(error.message));
  }
  revalidatePath(`/facilities/${id}`);
  revalidatePath("/facilities");
  redirect(`/facilities/${id}`);
}
