import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { ImportPanel } from "@/components/import-panel";

export const metadata: Metadata = { title: "Import" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireStaff();

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Bulk import</h2>
          <p>Add existing clinicians and facilities from CSV files in one pass.</p>
        </div>
      </div>

      <ImportPanel />
    </>
  );
}
