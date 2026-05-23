import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/format";
import type { AppUser, UserRole } from "@/lib/types";
import { updateTeamMember } from "./actions";

export const metadata: Metadata = { title: "Team & access" };
export const dynamic = "force-dynamic";

const ROLE_ENTRIES = Object.entries(ROLE_LABELS) as [UserRole, string][];

export default async function TeamPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const me = await requireAdmin();
  const supabase = createClient();

  const [usersRes, facRes, provRes] = await Promise.all([
    supabase
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase.from("facilities").select("id, name").order("name"),
    supabase
      .from("providers")
      .select("id, full_name, user_id")
      .is("archived_at", null)
      .order("full_name"),
  ]);

  const users = (usersRes.data ?? []) as AppUser[];
  const facilities = facRes.data ?? [];
  const providers = provRes.data ?? [];

  // Which provider record (if any) each user is currently linked to.
  const providerByUser = new Map<string, string>();
  for (const p of providers as any[]) {
    if (p.user_id) providerByUser.set(p.user_id, p.id);
  }
  const facilityName = (id: string | null) =>
    id ? facilities.find((f: any) => f.id === id)?.name ?? "Unknown" : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Team &amp; access</h2>
          <p>
            Set each teammate&apos;s role and the links the self-service
            portals run on — a facility for facility contacts, a clinician
            profile for providers.
          </p>
        </div>
      </div>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}
      {searchParams.saved && (
        <div className="alert alert-ok">Team member updated.</div>
      )}

      <div className="alert alert-info">
        Accounts are created when a person signs up — this page never creates
        accounts or sets passwords. It only assigns roles and portal links.
      </div>

      {users.length === 0 ? (
        <div className="card">
          <EmptyState title="No teammates yet" />
        </div>
      ) : (
        <div className="stack">
          {users.map((u) => {
            const linkedProvider = providerByUser.get(u.id) ?? "";
            const isMe = u.id === me.id;
            return (
              <div className="card card-pad" key={u.id}>
                <div
                  className="row-between"
                  style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}
                >
                  <div className="row" style={{ gap: 12 }}>
                    <span className="avatar">{initials(u.full_name || u.email)}</span>
                    <div>
                      <b style={{ fontSize: 14 }}>
                        {u.full_name || u.email}
                        {isMe && (
                          <span className="muted" style={{ fontWeight: 400 }}>
                            {" "}
                            · you
                          </span>
                        )}
                      </b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {u.email}
                      </div>
                      <div
                        className="row"
                        style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}
                      >
                        <span className="badge badge-teal">
                          {ROLE_LABELS[u.role]}
                        </span>
                        {u.role === "facility_contact" && (
                          <span className="badge badge-muted">
                            {facilityName(u.facility_id) ?? "No facility linked"}
                          </span>
                        )}
                        {u.role === "provider" && (
                          <span className="badge badge-muted">
                            {linkedProvider
                              ? "Clinician profile linked"
                              : "No clinician profile linked"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isMe ? (
                    <span className="muted" style={{ fontSize: 12 }}>
                      Your own role can&apos;t be changed here.
                    </span>
                  ) : (
                    <form
                      action={updateTeamMember}
                      className="row"
                      style={{
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "flex-end",
                      }}
                    >
                      <input type="hidden" name="user_id" value={u.id} />
                      <div className="field" style={{ minWidth: 170 }}>
                        <label>Role</label>
                        <select
                          className="select"
                          name="role"
                          defaultValue={u.role}
                        >
                          {ROLE_ENTRIES.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ minWidth: 190 }}>
                        <label>Facility link</label>
                        <select
                          className="select"
                          name="facility_id"
                          defaultValue={u.facility_id ?? ""}
                        >
                          <option value="">— None —</option>
                          {facilities.map((f: any) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ minWidth: 190 }}>
                        <label>Clinician profile link</label>
                        <select
                          className="select"
                          name="provider_id"
                          defaultValue={linkedProvider}
                        >
                          <option value="">— None —</option>
                          {providers.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name}
                              {p.user_id && p.user_id !== u.id
                                ? " (linked elsewhere)"
                                : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className="btn btn-primary btn-sm">
                        Save
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>
        Facility links apply to facility contacts; clinician-profile links apply
        to providers. A link to the wrong role is ignored when saved.
      </p>
    </>
  );
}
