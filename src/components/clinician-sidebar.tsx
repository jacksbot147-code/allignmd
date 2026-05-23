"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./brand";
import {
  IconDashboard,
  IconProviders,
  IconActivity,
  IconDoc,
  IconPipeline,
  IconJobs,
  IconCredentials,
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

// The clinician self-service experience. Mirrors the staff sidebar layout but
// is scoped entirely to /clinician/* — one first-class side of the platform.
const CLINICIAN_NAV: NavItem[] = [
  { href: "/clinician", label: "Home", icon: <IconDashboard className="ico" />, exact: true },
  { href: "/clinician/profile", label: "My profile", icon: <IconProviders className="ico" /> },
  { href: "/clinician/credentials", label: "Credentials", icon: <IconCredentials className="ico" /> },
  { href: "/clinician/availability", label: "Availability", icon: <IconActivity className="ico" /> },
  { href: "/clinician/documents", label: "Documents", icon: <IconDoc className="ico" /> },
  { href: "/clinician/jobs", label: "Open jobs", icon: <IconJobs className="ico" /> },
  { href: "/clinician/submissions", label: "My submissions", icon: <IconPipeline className="ico" /> },
];

/**
 * Sidebar for the clinician side of AlignMD. Each customer-facing experience
 * has its own route group, layout and sidebar — this one owns /clinician/*.
 */
export function ClinicianSidebar({
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
      <Link href="/clinician" className="sidebar-brand">
        <LogoMark size={26} />
        <b>
          Align<span style={{ color: "#5eead4" }}>MD</span>
        </b>
      </Link>

      <nav className="nav">
        <div className="nav-section">Clinician</div>
        {CLINICIAN_NAV.map((item) => (
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
          <span>{ROLE_LABELS.provider}</span>
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
