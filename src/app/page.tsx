import Link from "next/link";
import { Wordmark } from "@/components/brand";
import {
  IconShield,
  IconCredentials,
  IconActivity,
  IconPipeline,
  IconProviders,
  IconCheck,
  IconArrowRight,
} from "@/components/icons";
import { getAppUser, isStaff } from "@/lib/auth";
import { homePathForRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: <IconActivity />,
    title: "A rule-based match score you can defend",
    body: "Every clinician–job pair gets a transparent fit percentage across licensure, specialty, schedule and procedures — explainable, never a black box.",
    lead: true,
  },
  {
    icon: <IconCredentials />,
    title: "Credential-aware profiles",
    body: "Licenses, DEA, board certs and procedure competencies are first-class structured data — not free-text notes.",
  },
  {
    icon: <IconShield />,
    title: "Compliance from day one",
    body: "Field-level permissions and a full audit trail are the foundation — built before a single sensitive record is stored.",
  },
  {
    icon: <IconCredentials />,
    title: "Expiry tracking",
    body: "Automatic 30/60/90-day alerts on every license and certification so a placement never lapses.",
  },
  {
    icon: <IconPipeline />,
    title: "Placement pipeline",
    body: "From first screen to placed — a clear board that shows exactly where every clinician stands.",
  },
  {
    icon: <IconProviders />,
    title: "Verified references",
    body: "Structured, callable references and primary-source verification status, ready for the facility's review.",
  },
];

const STEPS = [
  { n: 1, t: "Build the profile", d: "Credentials, licensure and procedure competencies captured as structured data." },
  { n: 2, t: "Define the job", d: "Facilities set hard requirements — license states, certs, minimum procedures." },
  { n: 3, t: "Score the match", d: "A rule-based engine ranks fit as a clear, explainable percentage." },
  { n: 4, t: "Place with confidence", d: "Track credentialing to placement with alerts that keep it compliant." },
];

export default async function LandingPage() {
  const user = await getAppUser();
  // Logged-in users go to their own home — CRM dashboard or self-service
  // portal — depending on role.
  const home = user ? homePathForRole(user.role) : "/login?mode=signup";
  const homeLabel = user
    ? isStaff(user.role)
      ? "Open dashboard"
      : "Open portal"
    : null;

  return (
    <div className="lp">
      <div className="lp-nav-wrap">
        <header>
          <nav className="lp-nav">
            <Link href="/" aria-label="AlignMD home">
              <Wordmark size={26} />
            </Link>
            <div className="lp-nav-links">
              <a href="#features" className="hide-sm">Features</a>
              <a href="#clinicians" className="hide-sm">For Clinicians</a>
              <a href="#facilities" className="hide-sm">For Facilities</a>
              <a href="#how" className="hide-sm">How it works</a>
              {user ? (
                <Link href={home} className="btn btn-primary btn-sm">
                  {homeLabel}
                </Link>
              ) : (
                <>
                  <Link href="/login" className="hide-sm">Sign in</Link>
                  <Link href="/login?mode=signup" className="btn btn-primary btn-sm">
                    Get started
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
      </div>

      {/* ── Hero — asymmetric two-column, layered match-preview visual ─── */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-hero-copy reveal reveal-1">
            <span className="pill-note">
              <IconShield width={12} height={12} /> Built compliance-first
            </span>
            <h1>
              Precision matching for{" "}
              <span className="accent">modern healthcare</span> staffing.
            </h1>
            <p className="sub">
              AlignMD treats credentialing, licensure and procedure competency
              as first-class data — so every clinician–job match is one you can
              actually place.
            </p>
            <div className="cta-row">
              <Link href={home} className="btn btn-primary btn-lg">
                {user ? homeLabel : "Start free"}{" "}
                <IconArrowRight width={16} height={16} />
              </Link>
              <a href="#how" className="btn btn-lg">See how it works</a>
            </div>
            <div className="lp-hero-proof">
              <div className="stat">
                <div className="n">5 roles</div>
                <div className="l">NP · PA · MD · DO · CRNA</div>
              </div>
              <div className="stat">
                <div className="n">30/60/90</div>
                <div className="l">Expiry alerts, automatic</div>
              </div>
              <div className="stat">
                <div className="n">100%</div>
                <div className="l">Audited from day one</div>
              </div>
            </div>
          </div>

          {/* Layered "match" preview — concrete, premium, on-brand */}
          <div className="lp-hero-visual reveal reveal-3">
            <div className="match-card">
              <div className="match-card-head">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>
                    Match score
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "var(--t-md)", letterSpacing: "-0.02em" }}>
                    Locum Hospitalist · TX
                  </div>
                </div>
                <div className="match-score-ring" aria-hidden="true">
                  <span>94</span>
                </div>
              </div>
              <div className="match-row">
                <div className="mr-ico">
                  <IconCredentials width={16} height={16} />
                </div>
                <div className="mr-text">
                  <b>Licensure</b>
                  <span>TX active · compact eligible</span>
                </div>
                <span className="badge badge-ok">
                  <span className="dot" /> Pass
                </span>
              </div>
              <div className="match-row">
                <div className="mr-ico">
                  <IconActivity width={16} height={16} />
                </div>
                <div className="mr-text">
                  <b>Specialty fit</b>
                  <span>Internal Medicine · 8 yrs</span>
                </div>
                <span className="badge badge-ok">
                  <span className="dot" /> Strong
                </span>
              </div>
              <div className="match-row">
                <div className="mr-ico">
                  <IconShield width={16} height={16} />
                </div>
                <div className="mr-text">
                  <b>Credentialing</b>
                  <span>Packet 11 / 12 complete</span>
                </div>
                <span className="badge badge-warn">
                  <span className="dot" /> Review
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features — varied grid, one wide focal feature ─────────────── */}
      <section className="lp-section" id="features">
        <div className="lp-section-head">
          <span className="eyebrow">Why AlignMD</span>
          <h2>Depth where generic recruiting CRMs are shallow</h2>
          <p className="lead">
            A placement works because the credentials, the licensure and the
            procedure mix line up. AlignMD is built around exactly that.
          </p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div
              className={`feature${f.lead ? " feature-lead" : ""}`}
              key={f.title}
            >
              <div className="f-ico">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Two-sided value prop ───────────────────────────────────────── */}
      <section className="lp-section alt">
        <div>
          <div className="lp-section-head center">
            <span className="eyebrow">Two sides, one match</span>
            <h2>Made for both ends of the placement</h2>
            <p className="lead">
              Clinicians get a credential profile that travels. Facilities get
              candidates that actually clear requirements.
            </p>
          </div>
          <div className="split">
            <div className="split-card" id="clinicians">
              <span className="sc-tag">For clinicians</span>
              <h3>One profile, every submission</h3>
              <p>NP · PA · MD · DO · CRNA</p>
              <ul className="check-list">
                {[
                  "One credential-aware profile, reused for every submission",
                  "Multi-state and compact licensure tracked properly",
                  "Procedure competencies rated and surfaced to facilities",
                  "Expiry alerts so a license never quietly lapses",
                ].map((x) => (
                  <li key={x}>
                    <span className="ck"><IconCheck width={12} height={12} /></span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="split-card dark" id="facilities">
              <span className="sc-tag">For facilities</span>
              <h3>Candidates that clear the bar</h3>
              <p>Hospitals · clinics · surgical centers</p>
              <ul className="check-list">
                {[
                  "Jobs carry hard requirements — states, certs, procedures",
                  "Ranked, explainable match scores for every candidate",
                  "Credentialing status visible before the interview",
                  "Rate cards and schedule fit built into the match",
                ].map((x) => (
                  <li key={x}>
                    <span className="ck"><IconCheck width={12} height={12} /></span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="lp-section" id="how">
        <div className="lp-section-head center">
          <span className="eyebrow">How it works</span>
          <h2>From profile to placement</h2>
          <p className="lead">
            Four steps, each backed by structured data the match engine can
            actually reason about.
          </p>
        </div>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="step-n">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ────────────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="cta-band">
          <h2>Ready to align your placements?</h2>
          <p>
            Spin up your workspace and start building credential-aware
            clinician profiles in minutes.
          </p>
          <Link href={home} className="btn btn-primary btn-lg">
            {user ? homeLabel : "Get started"}{" "}
            <IconArrowRight width={16} height={16} />
          </Link>
        </div>
      </section>

      <footer>
        <div className="lp-foot">
          <Wordmark size={22} />
          <span>
            © {new Date().getFullYear()} AlignMD · Precision Matching for Modern
            Healthcare · A Day14 company
          </span>
        </div>
      </footer>
    </div>
  );
}
