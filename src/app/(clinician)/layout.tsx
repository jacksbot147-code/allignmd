import { redirect } from "next/navigation";
import { ClinicianSidebar } from "@/components/clinician-sidebar";
import { requireUser } from "@/lib/auth";
import { homePathForRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Shell for the clinician side of AlignMD. The clinician experience is its own
 * first-class route group with its own layout, navigation and dashboard. Any
 * non-clinician (staff or facility contact) is bounced to their own home.
 */
export default async function ClinicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.role !== "provider") redirect(homePathForRole(user.role));

  return (
    <div className="shell">
      <ClinicianSidebar name={user.full_name || ""} email={user.email} />
      <div className="main">
        <header className="topbar">
          <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
            Clinician portal
          </span>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
