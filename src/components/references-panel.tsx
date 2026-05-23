import { EmptyState } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";
import { REFERENCE_RELATIONSHIPS } from "@/lib/constants";
import type { ProviderReference } from "@/lib/types";
import {
  addReference,
  updateReference,
  setReferenceVerified,
  deleteReference,
} from "@/app/(app)/providers/actions";

function RelationshipList() {
  return (
    <datalist id="reference-relationship-list">
      {REFERENCE_RELATIONSHIPS.map((r) => (
        <option key={r} value={r} />
      ))}
    </datalist>
  );
}

function ReferenceCard({
  providerId,
  reference: r,
}: {
  providerId: string;
  reference: ProviderReference;
}) {
  return (
    <div className="card card-pad" style={{ margin: 0 }}>
      <div className="row-between" style={{ alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>{r.name}</b>
            {r.relationship && (
              <span className="badge badge-teal">{r.relationship}</span>
            )}
            <span
              className={`badge ${r.verified ? "badge-ok" : "badge-muted"}`}
            >
              {r.verified ? "Verified" : "Unverified"}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {r.contact || "No contact on file"}
            {r.called_at ? ` · called ${fmtDateTime(r.called_at)}` : ""}
          </div>
          {r.notes && (
            <div style={{ fontSize: 13, marginTop: 6 }}>{r.notes}</div>
          )}
        </div>
        <div className="row" style={{ gap: 4, flexShrink: 0 }}>
          <form action={setReferenceVerified}>
            <input type="hidden" name="reference_id" value={r.id} />
            <input type="hidden" name="provider_id" value={providerId} />
            <input
              type="hidden"
              name="verified"
              value={r.verified ? "false" : "true"}
            />
            <button type="submit" className="btn btn-sm">
              {r.verified ? "Mark unverified" : "Mark verified"}
            </button>
          </form>
          <form action={deleteReference}>
            <input type="hidden" name="reference_id" value={r.id} />
            <input type="hidden" name="provider_id" value={providerId} />
            <button type="submit" className="btn btn-sm btn-danger">
              Remove
            </button>
          </form>
        </div>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary
          className="muted"
          style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}
        >
          Edit reference
        </summary>
        <form action={updateReference} style={{ marginTop: 12 }}>
          <input type="hidden" name="reference_id" value={r.id} />
          <input type="hidden" name="provider_id" value={providerId} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`ref-name-${r.id}`}>Name *</label>
              <input
                className="input"
                id={`ref-name-${r.id}`}
                name="name"
                required
                defaultValue={r.name}
              />
            </div>
            <div className="field">
              <label htmlFor={`ref-rel-${r.id}`}>Relationship</label>
              <input
                className="input"
                id={`ref-rel-${r.id}`}
                name="relationship"
                list="reference-relationship-list"
                defaultValue={r.relationship ?? ""}
              />
            </div>
            <div className="field full">
              <label htmlFor={`ref-contact-${r.id}`}>Contact</label>
              <input
                className="input"
                id={`ref-contact-${r.id}`}
                name="contact"
                defaultValue={r.contact ?? ""}
                placeholder="Phone or email"
              />
            </div>
            <div className="field full">
              <label htmlFor={`ref-notes-${r.id}`}>Notes</label>
              <textarea
                className="textarea"
                id={`ref-notes-${r.id}`}
                name="notes"
                defaultValue={r.notes ?? ""}
                placeholder="Reference-call notes and outcome"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Save reference
          </button>
        </form>
      </details>
    </div>
  );
}

export function ReferencesPanel({
  providerId,
  references,
}: {
  providerId: string;
  references: ProviderReference[];
}) {
  const verifiedCount = references.filter((r) => r.verified).length;

  return (
    <div className="stack">
      <RelationshipList />
      <div className="alert alert-info">
        <IconShield width={13} height={13} /> References are structured for the
        hospital to call. Record the outcome and mark each one verified once the
        reference call is complete.
      </div>

      <div className="card">
        <div className="card-head">
          <h3>References ({references.length})</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {verifiedCount} verified
          </span>
        </div>
        {references.length === 0 ? (
          <EmptyState
            title="No references yet"
            hint="Add the clinician's professional references below — name, contact, and relationship."
          />
        ) : (
          <div className="stack" style={{ padding: 14, gap: 10 }}>
            {references.map((r) => (
              <ReferenceCard
                key={r.id}
                providerId={providerId}
                reference={r}
              />
            ))}
          </div>
        )}
      </div>

      <details className="card card-pad">
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          + Add a reference
        </summary>
        <form action={addReference} style={{ marginTop: 16 }}>
          <input type="hidden" name="provider_id" value={providerId} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-ref-name">Name *</label>
              <input
                className="input"
                id="new-ref-name"
                name="name"
                required
                placeholder="Dr. Morgan Lee"
              />
            </div>
            <div className="field">
              <label htmlFor="new-ref-rel">Relationship</label>
              <input
                className="input"
                id="new-ref-rel"
                name="relationship"
                list="reference-relationship-list"
                placeholder="Supervising Physician"
              />
            </div>
            <div className="field full">
              <label htmlFor="new-ref-contact">Contact</label>
              <input
                className="input"
                id="new-ref-contact"
                name="contact"
                placeholder="Phone or email"
              />
            </div>
            <div className="field full">
              <label htmlFor="new-ref-notes">Notes</label>
              <textarea
                className="textarea"
                id="new-ref-notes"
                name="notes"
                placeholder="Context, best time to reach, call outcome…"
              />
            </div>
            <div className="field">
              <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name="verified"
                  style={{ width: 16, height: 16 }}
                />
                Already verified by phone
              </label>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            Add reference
          </button>
        </form>
      </details>
    </div>
  );
}
