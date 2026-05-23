import { redirect } from "next/navigation";
import { FacilitySidebar } from "@/components/facility-sidebar";
import { requireUser } from "@/lib/auth";
import { homePathForRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Shell for the facility side of AlignMD. The facility experience is its own
 * first-class route group with its own layout, navigation and dashboard. Any
 * non-facility user (staff or clinician) is bounced to their own home.
 */
export default async function FacilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.role !== "facility_contact") redirect(homePathForRole(user.role));

  return (
    <div className="shell">
      <FacilitySidebar name={user.full_name || ""} email={user.email} />
      <div className="main">
        <header className="topbar">
          <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
            Facility portal
          </span>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
