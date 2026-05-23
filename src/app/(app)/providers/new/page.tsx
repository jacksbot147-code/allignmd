import Link from "next/link";
import type { Metadata } from "next";
import { ProviderForm } from "@/components/provider-form";
import { getAppUser, isPrivileged } from "@/lib/auth";
import { createProvider } from "../actions";

export const metadata: Metadata = { title: "New provider" };
export const dynamic = "force-dynamic";

export default async function NewProviderPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const me = await getAppUser();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
            <Link href="/providers">Providers</Link> / New
          </p>
          <h2>Add a provider</h2>
          <p>Create a credential-aware profile for a new clinician.</p>
        </div>
      </div>

      <div style={{ maxWidth: 720 }}>
        <ProviderForm
          action={createProvider}
          mode="new"
          canSeeRestricted={isPrivileged(me?.role)}
          error={searchParams.error}
        />
      </div>
    </>
  );
}
