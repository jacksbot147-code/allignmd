import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { signIn, signUp } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { mode?: string; error?: string; notice?: string; next?: string };
}) {
  const isSignup = searchParams.mode === "signup";
  const next = searchParams.next || "/dashboard";
  const notice =
    searchParams.notice === "confirm-email"
      ? "Account created. Check your email and click the confirmation link — it brings you straight into your workspace."
      : null;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <Link href="/">
            <Wordmark size={30} />
          </Link>
          <h1>{isSignup ? "Create your workspace" : "Sign in to AlignMD"}</h1>
          <p>
            {isSignup
              ? "Precision matching for modern healthcare staffing."
              : "Welcome back — let's get to your pipeline."}
          </p>
        </div>

        <div className="card">
          {searchParams.error && (
            <div className="alert alert-danger">{searchParams.error}</div>
          )}
          {notice && <div className="alert alert-ok">{notice}</div>}

          <form action={isSignup ? signUp : signIn}>
            <input type="hidden" name="next" value={next} />

            {isSignup && (
              <div className="field">
                <label htmlFor="full_name">Full name</label>
                <input
                  className="input"
                  id="full_name"
                  name="full_name"
                  type="text"
                  placeholder="Jordan Rivera"
                  autoComplete="name"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                className="input"
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@clinic.com"
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                className="input"
                id="password"
                name="password"
                type="password"
                required
                placeholder={isSignup ? "At least 8 characters" : "••••••••"}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block">
              {isSignup ? "Create workspace" : "Sign in"}
            </button>
          </form>

          {!isSignup && (
            <p className="hint" style={{ marginTop: 12, textAlign: "center" }}>
              The first account created becomes the workspace admin.
            </p>
          )}
        </div>

        <div className="auth-foot">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login">Sign in</Link>
            </>
          ) : (
            <>
              New to AlignMD?{" "}
              <Link href="/login?mode=signup">Create a workspace</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
