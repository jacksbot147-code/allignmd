import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { LicenseChecklist } from "@/components/license-checklist";
import { LicenseWizard } from "@/components/license-wizard";
import { LICENSE_STATUS_LABELS, LICENSE_STATUS_TONE } from "@/lib/constants";
import { parseApplicationPayload } from "@/lib/application";
import {
  parseLicenseBundle,
  licenseChecklistForRole,
  licenseProgress,
  checklistHints,
  prefillSurveyFromProvider,
  prefillFieldCount,
  surveyHasContent,
} from "@/lib/licensing";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type {
  LicenseApplication,
  LicenseApplicationStatus,
  Provider,
  ProviderCredential,
} from "@/lib/types";
import { setLicenseStatus, deleteLicenseApplication } from "../actions";

export const dynamic = "force-dynamic";

const toneClass: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  danger: "badge-danger",
  muted: "badge-muted",
  teal: "badge-teal",
};

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("license_applications")
    .select("state, provider:providers(full_name)")
    .eq("id", params.id)
    .maybeSingle();
  const name = (data?.provider as { full_name?: string } | null)?.full_name;
  return {
    title: data ? `${data.state} license — ${name ?? "Provider"}` : "Licensing",
  };
}

/** A single status-transition button. */
function AdvanceButton({
  applicationId,
  status,
  label,
  primary = false,
  danger = false,
}: {
  applicationId: string;
  status: LicenseApplicationStatus;
  label: string;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <form action={setLicenseStatus}>
      <input type="hidden" name="application_id" value={applicationId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`btn btn-sm${primary ? " btn-primary" : ""}${
          danger ? " btn-danger" : ""
        }`}
      >
        {label}
      </button>
    </form>
  );
}

export default async function LicenseApplicationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; saved?: string; tab?: string };
}) {
  const id = params.id;
  const supabase = createClient();

  const { data: appRow } = await supabase
    .from("license_applications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!appRow) notFound();
  const application = appRow as LicenseApplication;

  const [providerRes, credsRes, appResponseRes] = await Promise.all([
    supabase
      .from("providers")
      .select("*")
      .eq("id", application.provider_id)
      .maybeSingle(),
    supabase
      .from("provider_credentials")
      .select("*")
      .eq("provider_id", application.provider_id),
    supabase
      .from("application_responses")
      .select("*")
      .eq("provider_id", application.provider_id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (!providerRes.data) notFound();
  const provider = providerRes.data as Provider;
  const credentials = (credsRes.data ?? []) as ProviderCredential[];
  const appResponse = appResponseRes.data?.[0] ?? null;

  const role = provider.clinician_role;
  const status = application.status as LicenseApplicationStatus;
  const bundle = parseLicenseBundle(application.document_bundle);
  const checklistItems = licenseChecklistForRole(role);
  const progress = licenseProgress(bundle, role);
  const hints = checklistHints(provider, credentials);

  // Pre-fill — structured profile data feeds the wizard. When nothing has been
  // saved yet, the wizard opens with the pre-filled survey for staff to review.
  const prefill = prefillSurveyFromProvider(
    provider,
    credentials,
    appResponse ? parseApplicationPayload(appResponse.payload) : null,
  );
  const hasSaved = surveyHasContent(bundle.survey);
  const resolvedSurvey = hasSaved ? bundle.survey : prefill;
  const prefillCount = prefillFieldCount(prefill);

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        <Link href="/licensing">Licensing</Link> /{" "}
        <Link href={`/providers/${provider.id}?tab=licensing`}>
          {provider.full_name}
        </Link>{" "}
        / {application.state} license
      </p>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}
      {searchParams.saved && (
        <div className="alert alert-ok">Application wizard saved.</div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div
          className="row-between"
          style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}
        >
          <div>
            <h2 style={{ fontSize: 20 }}>
              {application.state} state license
            </h2>
            <div
              className="row"
              style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}
            >
              <Link
                href={`/providers/${provider.id}`}
                className="badge badge-teal"
              >
                {provider.full_name}
              </Link>
              {role && <span className="badge badge-muted">{role}</span>}
              <span className="muted" style={{ fontSize: 13 }}>
                {provider.specialty || "Specialty not set"}
              </span>
            </div>
          </div>
          <span
            className={`badge ${
              toneClass[LICENSE_STATUS_TONE[status]] ?? "badge-muted"
            }`}
          >
            {LICENSE_STATUS_LABELS[status]}
          </span>
        </div>

        <dl className="def-list" style={{ marginTop: 14 }}>
          <dt>Checklist</dt>
          <dd>
            {progress.complete} of {progress.total} items complete (
            {progress.percent}%)
          </dd>
          <dt>Started</dt>
          <dd>{fmtDate(application.created_at)}</dd>
          <dt>Submitted</dt>
          <dd>
            {application.submitted_at
              ? fmtDateTime(application.submitted_at)
              : "—"}
          </dd>
          <dt>Issued</dt>
          <dd>
            {application.issued_at ? fmtDateTime(application.issued_at) : "—"}
          </dd>
          <dt>Last updated</dt>
          <dd>{fmtDateTime(application.updated_at)}</dd>
        </dl>

        <div
          className="row"
          style={{
            gap: 8,
            flexWrap: "wrap",
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--line)",
          }}
        >
          {status === "draft" && (
            <AdvanceButton
              applicationId={id}
              status="submitted"
              label="Mark submitted to board"
              primary
            />
          )}
          {status === "submitted" && (
            <>
              <AdvanceButton
                applicationId={id}
                status="issued"
                label="Mark license issued"
                primary
              />
              <AdvanceButton
                applicationId={id}
                status="draft"
                label="Back to draft"
              />
            </>
          )}
          {status === "issued" && (
            <AdvanceButton
              applicationId={id}
              status="submitted"
              label="Reopen as submitted"
            />
          )}
          {status === "withdrawn" && (
            <AdvanceButton
              applicationId={id}
              status="draft"
              label="Reopen as draft"
              primary
            />
          )}
          {status !== "withdrawn" && status !== "issued" && (
            <AdvanceButton
              applicationId={id}
              status="withdrawn"
              label="Withdraw"
            />
          )}
          <div className="spacer" />
          <form action={deleteLicenseApplication}>
            <input type="hidden" name="application_id" value={id} />
            <input type="hidden" name="provider_id" value={provider.id} />
            <button type="submit" className="btn btn-sm btn-danger">
              Delete application
            </button>
          </form>
        </div>
      </div>

      <div className="alert alert-info">
        <IconShield width={13} height={13} /> This assistant organizes and
        pre-fills the application — it does not submit to the board. The{" "}
        {application.state} board still receives its own submission.
      </div>

      {/* ── Checklist ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        {checklistItems.length === 0 ? (
          <div className="card">
            <EmptyState
              title="No checklist available"
              hint="Set the clinician's role to generate a role-specific checklist."
            />
          </div>
        ) : (
          <LicenseChecklist
            applicationId={id}
            items={checklistItems}
            checklist={bundle.checklist}
            hints={hints}
          />
        )}
      </div>

      {/* ── Wizard ─────────────────────────────────────────────── */}
      {!hasSaved && prefillCount > 0 && (
        <div className="alert alert-info">
          Pre-filled {prefillCount} field
          {prefillCount === 1 ? "" : "s"} from {provider.full_name}&apos;s
          profile, credentials and intake application. Review every step, then
          save.
        </div>
      )}
      <LicenseWizard applicationId={id} survey={resolvedSurvey} />
    </>
  );
}
