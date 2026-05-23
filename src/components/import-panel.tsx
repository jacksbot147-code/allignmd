"use client";

import { useFormState, useFormStatus } from "react-dom";
import { runImport } from "@/app/(app)/import/actions";
import { IconImport, IconCheck, IconAlert } from "@/components/icons";
import type { ImportState } from "@/lib/types";

const CLINICIAN_COLUMNS =
  "full_name,clinician_role,specialty,npi,years_experience,languages,travel_radius_miles,telehealth_ok,available_start";
const FACILITY_COLUMNS = "name,setting,emr,city,state";

const CLINICIAN_TEMPLATE =
  CLINICIAN_COLUMNS +
  "\n" +
  "Jordan Avery,NP,Family Medicine,1234567893,8,English; Spanish,100,true,2026-07-01";
const FACILITY_TEMPLATE =
  FACILITY_COLUMNS +
  "\n" +
  "Gulf Coast Regional Medical Center,Inpatient,Epic,Fort Myers,FL";

const initialState: ImportState = { ran: false, outcomes: [], message: null };

function dataUri(csv: string): string {
  return "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      <IconImport width={15} height={15} />
      {pending ? "Importing…" : "Run import"}
    </button>
  );
}

const codeBox: React.CSSProperties = {
  fontSize: 11,
  background: "var(--line-2)",
  padding: "8px 10px",
  borderRadius: 6,
  wordBreak: "break-word",
  margin: "10px 0",
};

export function ImportPanel() {
  const [state, formAction] = useFormState(runImport, initialState);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="alert alert-info">
        Upload a CSV of clinicians, a CSV of facilities, or both. Each row is
        validated independently — valid rows are imported and any rejected rows
        are listed below with the reason, so you can fix and re-upload.
      </div>

      <form action={formAction}>
        <div className="card card-pad">
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="clinicians_csv">Clinicians CSV</label>
              <input
                className="input"
                type="file"
                id="clinicians_csv"
                name="clinicians_csv"
                accept=".csv,text/csv"
              />
            </div>
            <div className="field full">
              <label htmlFor="facilities_csv">Facilities CSV</label>
              <input
                className="input"
                type="file"
                id="facilities_csv"
                name="facilities_csv"
                accept=".csv,text/csv"
              />
            </div>
          </div>

          {state.message && (
            <div className="alert alert-danger" style={{ marginTop: 4 }}>
              {state.message}
            </div>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <SubmitButton />
          </div>
        </div>
      </form>

      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ fontSize: 14, marginBottom: 6 }}>Clinician CSV columns</h3>
          <p className="muted" style={{ fontSize: 12 }}>
            Required: full_name. All others optional. languages can list several,
            separated by ; or , (quote the cell if you use commas).
          </p>
          <div className="mono" style={codeBox}>
            {CLINICIAN_COLUMNS}
          </div>
          <a
            className="btn btn-sm"
            href={dataUri(CLINICIAN_TEMPLATE)}
            download="alignmd-clinicians-template.csv"
          >
            Download template
          </a>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 14, marginBottom: 6 }}>Facility CSV columns</h3>
          <p className="muted" style={{ fontSize: 12 }}>
            Required: name. All others optional. state must be a two-letter US
            postal code.
          </p>
          <div className="mono" style={codeBox}>
            {FACILITY_COLUMNS}
          </div>
          <a
            className="btn btn-sm"
            href={dataUri(FACILITY_TEMPLATE)}
            download="alignmd-facilities-template.csv"
          >
            Download template
          </a>
        </div>
      </div>

      {state.ran && (
        <div className="stack" style={{ gap: 12 }}>
          {state.outcomes.map((o) => (
            <div className="card" key={o.kind}>
              <div className="card-head">
                <h3>
                  <span className="row" style={{ gap: 7 }}>
                    {o.failed === 0 ? (
                      <IconCheck
                        width={15}
                        height={15}
                        style={{ color: "var(--ok)" }}
                      />
                    ) : (
                      <IconAlert
                        width={15}
                        height={15}
                        style={{ color: "var(--warn)" }}
                      />
                    )}
                    {o.kind} import
                  </span>
                </h3>
                <span className="muted" style={{ fontSize: 12 }}>
                  {o.succeeded} of {o.total} row{o.total === 1 ? "" : "s"} imported
                </span>
              </div>
              <div className="card-pad">
                <div className="row" style={{ gap: 22 }}>
                  <div>
                    <div className="kpi-value" style={{ fontSize: 24 }}>
                      {o.succeeded}
                    </div>
                    <div className="kpi-label">Imported</div>
                  </div>
                  <div>
                    <div
                      className="kpi-value"
                      style={{
                        fontSize: 24,
                        color: o.failed > 0 ? "var(--danger)" : "var(--ink)",
                      }}
                    >
                      {o.failed}
                    </div>
                    <div className="kpi-label">Rejected</div>
                  </div>
                  <div>
                    <div className="kpi-value" style={{ fontSize: 24 }}>
                      {o.total}
                    </div>
                    <div className="kpi-label">Rows read</div>
                  </div>
                </div>
              </div>
              {o.errors.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>Row</th>
                      <th>Why it was rejected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="mono">{e.row}</td>
                        <td>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
