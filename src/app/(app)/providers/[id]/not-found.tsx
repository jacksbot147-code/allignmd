import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function ProviderNotFound() {
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <EmptyState
        title="Provider not found"
        hint="This clinician may have been removed, or the link is incorrect."
        action={
          <Link href="/providers" className="btn btn-primary">
            Back to providers
          </Link>
        }
      />
    </div>
  );
}
