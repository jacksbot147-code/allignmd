"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./brand";
import {
  IconDashboard,
  IconJobs,
  IconProviders,
  IconFacilities,
  IconLogout,
} from "./icons";
import { signOut } from "@/app/login/actions";
import { ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/format";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
};

// The facility self-service experience. Scoped entirely to /facility/* — the
// second first-class side of the platform.
const FACILITY_NAV: NavItem[] = [
  { href: "/facility", label: "Dashboard", icon: <IconDashboard className="ico" />, exact: true },
  { href: "/facility/jobs", label: "Jobs", icon: <IconJobs className="ico" /> },
  { href: "/facility/candidates", label: "Candidates", icon: <IconProviders className="ico" /> },
  { href: "/facility/profile", label: "Facility & team", icon: <IconFacilities className="ico" /> },
];

/**
 * Sidebar for the facility side of AlignMD. Owns /facility/* — facility
 * contacts manage their own roles, review candidates and keep their profile
 * current here.
 */
export function FacilitySidebar({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const pathname = usePathname();

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <aside className="sidebar">
      <Link href="/facility" className="sidebar-brand">
        <LogoMark size={26} />
        <b>
          Align<span style={{ color: "#5eead4" }}>MD</span>
        </b>
      </Link>

      <nav className="nav">
        <div className="nav-section">Facility</div>
        {FACILITY_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${isActive(item) ? " active" : ""}`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-foot">
        <span className="avatar">{initials(name || email)}</span>
        <div className="who">
          <b>{name || email}</b>
          <span>{ROLE_LABELS.facility_contact}</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="btn btn-ghost btn-sm"
            title="Sign out"
            style={{ color: "#94a8bd", padding: 6 }}
          >
            <IconLogout width={16} height={16} />
          </button>
        </form>
      </div>
    </aside>
  );
}
