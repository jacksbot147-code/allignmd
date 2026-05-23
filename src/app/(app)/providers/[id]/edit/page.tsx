import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProviderForm } from "@/components/provider-form";
import { createClient } from "@/lib/supabase/server";
import { getAppUser, isPrivileged } from "@/lib/auth";
import { updateProvider } from "../../actions";
import type { Provider } from "@/lib/types";

export const metadata: Metadata = { title: "Edit provider" };
export const dynamic = "force-dynamic";

export default async function EditProviderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const me = await getAppUser();
  const privileged = isPrivileged(me?.role);
  const supabase = createClient();
  const { data } = await supabase
    .from("providers")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!data) notFound();
  const provider = data as Provider;

  // SSN lives in the privileged-only side table — only fetch it if allowed.
  let ssnLast4: string | null = null;
  if (privileged) {
    const { data: priv } = await supabase
      .from("provider_private")
      .select("ssn_last4")
      .eq("provider_id", params.id)
      .maybeSingle();
    ssnLast4 = priv?.ssn_last4 ?? null;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
            <Link href="/providers">Providers</Link> /{" "}
            <Link href={`/providers/${provider.id}`}>{provider.full_name}</Link> /
            Edit
          </p>
          <h2>Edit provider</h2>
        </div>
      </div>

      <div style={{ maxWidth: 720 }}>
        <ProviderForm
          action={updateProvider}
          provider={provider}
          mode="edit"
          canSeeRestricted={privileged}
          ssnLast4={ssnLast4}
          error={searchParams.error}
        />
      </div>
    </>
  );
}
