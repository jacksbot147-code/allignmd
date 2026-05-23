import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireFacilityContact } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { initials } from "@/lib/format";
import type { Facility, AppUser } from "@/lib/types";

export const metadata: Metadata = { title: "Facility & team" };
export const dynamic = "force-dynamic";

export default async function FacilityProfilePage() {
  const user = await requireFacilityContact();

  if (!user.facility_id) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Facility &amp; team</h2>
            <p>Your facility details and the contacts on your account.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your account isn't linked to a facility yet"
            hint="An AlignMD administrator still needs to connect your account to your facility. Once they do, your facility details and team will appear here."
          />
        </div>
      </>
    );
  }

  const supabase = createClient();
  const { data: facData } = await supabase
    .from("facilities")
    .select("*")
    .eq("id", user.facility_id)
    .maybeSingle();
  const facility = (facData ?? null) as Facility | null;

  // Other facility-contact users on the same facility. RLS limits app_users
  // reads, so this is defensive — an empty result just shows the signed-in
  // user alone.
  const { data: teamData } = await supabase
    .from("app_users")
    .select("id, full_name, email, role")
    .eq("facility_id", user.facility_id);
  const teamRows = (teamData ?? []) as Pick<
    AppUser,
    "id" | "full_name" | "email" | "role"
  >[];
  // Always include the signed-in user, even if RLS hid the wider list.
  const team =
    teamRows.length > 0
      ? teamRows
      : [
          {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
          },
        ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Facility &amp; team</h2>
          <p>Your facility details and the contacts on your account.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Facility details</h3>
          </div>
          <div className="card-pad">
            {facility ? (
              <dl className="def-list">
                <dt>Name</dt>
                <dd>{facility.name}</dd>
                <dt>Setting</dt>
                <dd>{facility.setting || "—"}</dd>
                <dt>EMR</dt>
                <dd>{facility.emr || "—"}</dd>
                <dt>City</dt>
                <dd>{facility.city || "—"}</dd>
                <dt>State</dt>
                <dd>{facility.state || "—"}</dd>
              </dl>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>
                Your facility record isn&apos;t available.
              </p>
            )}
            <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>
              Facility details are maintained by AlignMD staff — contact your
              recruiter to update anything here.
            </p>
          </div>
        </div>

        <div className="card" style={{ alignSelf: "start" }}>
          <div className="card-head">
            <h3>Your team</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {team.length} contact{team.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="card-pad">
            <div className="stack" style={{ gap: 10 }}>
              {team.map((m) => (
                <div key={m.id} className="row" style={{ gap: 10 }}>
                  <span className="avatar" style={{ flexShrink: 0 }}>
                    {initials(m.full_name || m.email)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: 650,
                        fontSize: 13,
                        display: "block",
                      }}
                    >
                      {m.full_name || m.email}
                      {m.id === user.id && (
                        <span
                          className="badge badge-teal"
                          style={{ marginLeft: 6 }}
                        >
                          You
                        </span>
                      )}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {m.email}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>
              Need another contact added? Ask your AlignMD recruiter to invite
              them.
            </p>
          </div>
        </div>
      </div>

      <p
        className="muted"
        style={{
          fontSize: 11,
          marginTop: 18,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <IconShield width={12} height={12} /> You only ever see your own
        facility&apos;s roles, candidates and team.
      </p>
    </>
  );
}
