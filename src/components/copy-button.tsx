"use client";

import { useState } from "react";

/**
 * Copy-to-clipboard button for outreach draft text. Client-only — falls back
 * silently if the Clipboard API is unavailable (e.g. an insecure context).
 */
export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard not available — leave the button state unchanged.
    }
  }

  return (
    <button type="button" className="btn btn-sm" onClick={copy}>
      {copied ? "Copied ✓" : label}
    </button>
  );
}
