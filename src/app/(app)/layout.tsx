import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { IconPlus } from "@/components/icons";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStaff();

  return (
    <div className="shell">
      <Sidebar
        name={user.full_name || ""}
        email={user.email}
        role={user.role}
      />
      <div className="main">
        <header className="topbar">
          <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
            Healthcare staffing workspace
          </span>
          <Link href="/providers/new" className="btn btn-primary btn-sm">
            <IconPlus width={14} height={14} /> New provider
          </Link>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
