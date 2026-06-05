"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./brand";
import {
  IconDashboard,
  IconProviders,
  IconPipeline,
  IconCredentials,
  IconReadiness,
  IconOpportunity,
  IconToday,
  IconFacilities,
  IconJobs,
  IconImport,
  IconLicensing,
  IconReports,
  IconOutreach,
  IconShield,
  IconLogout,
} from "./icons";
import { signOut } from "@/app/login/actions";
import { ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/format";
import type { UserRole } from "@/lib/types";

const NAV: {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: <IconDashboard className="ico" /> },
  { href: "/today", label: "Today", icon: <IconToday className="ico" /> },
  { href: "/providers", label: "Providers", icon: <IconProviders className="ico" /> },
  { href: "/jobs", label: "Jobs", icon: <IconJobs className="ico" /> },
  { href: "/opportunities", label: "Opportunities", icon: <IconOpportunity className="ico" /> },
  { href: "/facilities", label: "Facilities", icon: <IconFacilities className="ico" /> },
  { href: "/pipeline", label: "Pipeline", icon: <IconPipeline className="ico" /> },
  { href: "/credentials", label: "Credentials", icon: <IconCredentials className="ico" /> },
  { href: "/readiness", label: "Readiness", icon: <IconReadiness className="ico" /> },
  { href: "/licensing", label: "Licensing", icon: <IconLicensing className="ico" /> },
  { href: "/reports", label: "Reports", icon: <IconReports className="ico" /> },
  { href: "/outreach", label: "Outreach", icon: <IconOutreach className="ico" /> },
  { href: "/import", label: "Import", icon: <IconImport className="ico" /> },
  { href: "/team", label: "Team & access", icon: <IconShield className="ico" />, adminOnly: true },
];

export function Sidebar({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: UserRole;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        <LogoMark size={26} />
        <b>
          Align<span style={{ color: "#5eead4" }}>MD</span>
        </b>
      </Link>

      <nav className="nav">
        <div className="nav-section">Workspace</div>
        {NAV.filter((item) => !item.adminOnly || role === "admin").map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${isActive(item.href) ? " active" : ""}`}
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
          <span>{ROLE_LABELS[role]}</span>
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
