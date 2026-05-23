// AlignMD — outreach draft generation (Phase 6).
//
// Pure text builders. Given a clinician and (optionally) a job, produce email
// and SMS DRAFT copy for a recruiter to review, edit and send themselves.
//
// AlignMD never sends anything. There is no email / SMS provider wired in —
// these functions only return strings. The /outreach page displays them for
// copy/paste and logs them to outreach_drafts.

import type { OutreachChannel } from "./types";

/** Everything the draft builders need, already resolved by the caller. */
export interface OutreachContext {
  providerName: string;
  providerRole: string | null;
  providerSpecialty: string | null;
  recruiterName: string;
  // Optional job context — the copy adapts when a job is selected.
  jobTitle: string | null;
  facilityName: string | null;
  facilityLocation: string | null;
  rateHourly: number | null;
  isPermanent: boolean | null;
}

export interface OutreachDraftText {
  channel: OutreachChannel;
  subject: string | null; // null for SMS
  body: string;
}

/** First word of a name, with a friendly fallback. */
function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || "there";
}

/** Build an email DRAFT. Adapts to whether a job is in context. */
export function buildEmailDraft(ctx: OutreachContext): OutreachDraftText {
  const first = firstNameOf(ctx.providerName);
  const specialtyPhrase = ctx.providerSpecialty
    ? `${ctx.providerSpecialty} `
    : "";
  const lines: string[] = [];

  if (ctx.jobTitle) {
    const where = ctx.facilityName
      ? ` at ${ctx.facilityName}${
          ctx.facilityLocation ? ` (${ctx.facilityLocation})` : ""
        }`
      : "";
    const subject = `${ctx.jobTitle}${
      ctx.facilityName ? ` at ${ctx.facilityName}` : ""
    } — a fit for your profile`;

    lines.push(`Hi ${first},`);
    lines.push("");
    lines.push(
      `I'm ${ctx.recruiterName} with AlignMD. A role just opened that lines up well with your ${specialtyPhrase}background: ${ctx.jobTitle}${where}.`,
    );

    const highlights: string[] = [
      ctx.isPermanent
        ? "Permanent placement"
        : "Locum / temporary coverage",
    ];
    if (ctx.providerSpecialty) {
      highlights.push(`${ctx.providerSpecialty} focus`);
    }
    if (ctx.rateHourly != null) {
      highlights.push(`Compensation around $${ctx.rateHourly}/hr`);
    }
    lines.push("");
    lines.push("A few highlights:");
    for (const h of highlights) lines.push(`- ${h}`);

    lines.push("");
    lines.push(
      "If this sounds like a fit, reply here or let me know a good time to talk and I'll walk you through the full details.",
    );
  } else {
    lines.push(`Hi ${first},`);
    lines.push("");
    lines.push(
      `I'm ${ctx.recruiterName} with AlignMD. I'm reaching out because a few new roles have come up that may suit your ${specialtyPhrase}background.`,
    );
    lines.push("");
    lines.push(
      "If you're open to hearing what's available, reply here or let me know a good time to connect and I'll share the details.",
    );
  }

  lines.push("");
  lines.push("Best,");
  lines.push(ctx.recruiterName);
  lines.push("AlignMD");

  const subject = ctx.jobTitle
    ? `${ctx.jobTitle}${
        ctx.facilityName ? ` at ${ctx.facilityName}` : ""
      } — a fit for your profile`
    : "New opportunities that match your profile";

  return { channel: "email", subject, body: lines.join("\n") };
}

/** Build an SMS DRAFT — short, plain, no links. */
export function buildSmsDraft(ctx: OutreachContext): OutreachDraftText {
  const first = firstNameOf(ctx.providerName);
  let body: string;

  if (ctx.jobTitle) {
    const where = ctx.facilityName ? ` at ${ctx.facilityName}` : "";
    body =
      `Hi ${first}, it's ${ctx.recruiterName} at AlignMD. We have a ` +
      `${ctx.jobTitle} role${where} that fits your ` +
      `${ctx.providerSpecialty || "clinical"} background. Interested in ` +
      `hearing more? Reply here and I can call with details.`;
  } else {
    body =
      `Hi ${first}, it's ${ctx.recruiterName} at AlignMD. A few new roles ` +
      `just came up that match your profile. Want me to send the details? ` +
      `Reply YES and I'll follow up.`;
  }

  return { channel: "sms", subject: null, body };
}
