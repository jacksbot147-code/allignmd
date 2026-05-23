"use client";

/** Print / save-as-PDF trigger for the printable CV view. */
export function PrintButton() {
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => window.print()}
    >
      Print / Save as PDF
    </button>
  );
}
