import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProvider, getMyProvider } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { IconDoc, IconShield } from "@/components/icons";
import { DOC_TYPES } from "@/lib/constants";
import { fmtDate, titleCase } from "@/lib/format";
import type { Provider, ProviderDocument } from "@/lib/types";
import { uploadMyDocument, deleteMyDocument } from "../../actions";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function ClinicianDocumentsPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  await requireProvider();
  const provider = await getMyProvider();

  if (!provider) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Documents</h2>
            <p>Your CV, licenses and certification cards.</p>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Your profile isn't linked yet"
            hint="An administrator still needs to connect your account to your clinician profile. Reach out to your AlignMD recruiter."
          />
        </div>
      </>
    );
  }

  const p = provider as Provider;
  const supabase = createClient();
  const { data } = await supabase
    .from("provider_documents")
    .select("*")
    .eq("provider_id", p.id)
    .order("created_at", { ascending: false });
  const docs = (data ?? []) as ProviderDocument[];

  // Short-lived signed URLs — documents are never publicly addressable.
  const signedDocs = await Promise.all(
    docs.map(async (d) => {
      const { data: signed } = await supabase.storage
        .from("provider-documents")
        .createSignedUrl(d.storage_path, 300);
      return { ...d, url: signed?.signedUrl ?? null };
    }),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Documents</h2>
          <p>Upload your CV, licenses, certification cards and IDs.</p>
        </div>
      </div>

      {searchParams.error && (
        <div className="alert alert-danger">{searchParams.error}</div>
      )}
      {searchParams.saved && (
        <div className="alert alert-ok">Document uploaded.</div>
      )}

      <div className="stack">
        <div className="alert alert-info">
          <IconShield width={13} height={13} /> Files are stored privately and
          opened through short-lived signed links — never public URLs.
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Your documents</h3>
          </div>
          {signedDocs.length === 0 ? (
            <EmptyState
              title="No documents uploaded"
              hint="Upload your CV and supporting documents below — it speeds up credentialing."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Sensitivity</th>
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {signedDocs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <IconDoc
                          width={16}
                          height={16}
                          style={{ color: "var(--muted)" }}
                        />
                        <b>{titleCase(d.doc_type)}</b>
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          d.sensitivity === "sensitive"
                            ? "badge-warn"
                            : "badge-muted"
                        }`}
                      >
                        {titleCase(d.sensitivity)}
                      </span>
                    </td>
                    <td className="muted">{fmtDate(d.created_at)}</td>
                    <td>
                      <div
                        className="row"
                        style={{ gap: 4, justifyContent: "flex-end" }}
                      >
                        {d.url ? (
                          <a
                            className="btn btn-sm"
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>
                            Unavailable
                          </span>
                        )}
                        <form action={deleteMyDocument}>
                          <input
                            type="hidden"
                            name="document_id"
                            value={d.id}
                          />
                          <input
                            type="hidden"
                            name="storage_path"
                            value={d.storage_path}
                          />
                          <button
                            className="btn btn-sm btn-danger"
                            type="submit"
                          >
                            Remove
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>

        <details className="card card-pad" open={signedDocs.length === 0}>
          <summary
            style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}
          >
            + Upload a document
          </summary>
          <form action={uploadMyDocument} style={{ marginTop: 16 }}>
            <div className="form-grid">
              <div className="field">
                <label>Document type</label>
                <select className="select" name="doc_type" defaultValue="cv">
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {titleCase(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Sensitivity</label>
                <select
                  className="select"
                  name="sensitivity"
                  defaultValue="standard"
                >
                  <option value="standard">Standard</option>
                  <option value="sensitive">Sensitive (e.g. an ID)</option>
                </select>
              </div>
              <div className="field full">
                <label>File</label>
                <input className="input" type="file" name="file" required />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              Upload
            </button>
          </form>
        </details>
      </div>
    </>
  );
}
