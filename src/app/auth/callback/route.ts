import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Auth callback — the landing point for every link Supabase emails out:
 * signup confirmation, magic links, password recovery, email-change.
 *
 * Supabase can arrive here two ways depending on the email template:
 *   • PKCE  → ?code=<uuid>
 *   • OTP   → ?token_hash=<hash>&type=signup|recovery|email_change|...
 *
 * In both cases we establish the session (writing the auth cookies onto
 * the redirect response) and then forward the user to their workspace.
 * `emailRedirectTo` on the signUp call points the confirmation email here.
 */

/** Only ever forward to an in-app path — never an off-site open redirect. */
function safeNext(raw: string | null): string {
  if (
    raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.startsWith("/\\")
  ) {
    return raw;
  }
  return "/dashboard";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  // Honor the real external host when Vercel proxies the request,
  // so the redirect lands on alignmd.vercel.app (not an internal host).
  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin = forwardedHost ? `https://${forwardedHost}` : url.origin;

  const next = safeNext(params.get("next"));

  // Expired or already-used links: Supabase forwards them here with an
  // error already attached. Surface a friendly message on the login page.
  const urlError = params.get("error_description") || params.get("error");
  if (urlError) {
    return NextResponse.redirect(
      `${origin}/login?error=` +
        encodeURIComponent(
          "That link didn't work — it may have expired or already been used. " +
            "Please sign in, or request a new link.",
        ),
    );
  }

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const supabase = createClient();
  let failed: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) failed = error.message;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) failed = error.message;
  } else {
    failed = "This confirmation link is missing its token.";
  }

  if (failed) {
    return NextResponse.redirect(
      `${origin}/login?error=` +
        encodeURIComponent(
          "We couldn't confirm that link — it may have expired. " +
            "Please sign in, or request a new link.",
        ),
    );
  }

  // Session established — send them into the workspace.
  return NextResponse.redirect(`${origin}${next}`);
}
