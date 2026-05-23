import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const IconDashboard = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);
export const IconProviders = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3.3 2.6-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
    <path d="M17 11l1.8 1.8L22 9.5" />
  </svg>
);
export const IconPipeline = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="5" height="16" rx="1.5" />
    <rect x="9.5" y="4" width="5" height="11" rx="1.5" />
    <rect x="16" y="4" width="5" height="14" rx="1.5" />
  </svg>
);
export const IconCredentials = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 3h6l1 3H8l1-3z" />
    <rect x="4" y="6" width="16" height="15" rx="2" />
    <path d="M8.5 13.5l2.2 2.2 4.8-5" />
  </svg>
);
export const IconJobs = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
export const IconFacilities = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 21h18" />
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <path d="M12 7v6M9 10h6" />
    <path d="M9 21v-3.5h6V21" />
  </svg>
);
export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l9 16H3L12 3z" />
    <path d="M12 9v5M12 17.5v.01" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
export const IconArrowRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
);
export const IconLogout = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);
export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l8 3v6c0 5-3.4 8.3-8 9.5C7.4 20.3 4 17 4 12V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
export const IconActivity = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 12h4l3 8 4-16 3 8h4" />
  </svg>
);
export const IconDoc = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 3v5h5" />
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5z" />
  </svg>
);
export const IconImport = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v12" />
    <path d="M8 11l4 4 4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);
export const IconLicensing = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
    <path d="M13 3v5h5" />
    <path d="M8 12h3.5M8 16h2.5" />
    <circle cx="17.3" cy="15.3" r="3.3" />
    <path d="M15.2 18l-.7 3.6 2.8-1.5 2.8 1.5-.7-3.6" />
  </svg>
);
export const IconReports = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 3v18h18" />
    <rect x="7" y="11" width="3" height="7" rx="0.5" />
    <rect x="12.5" y="7" width="3" height="11" rx="0.5" />
    <rect x="18" y="13" width="3" height="5" rx="0.5" />
  </svg>
);
export const IconOutreach = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 7.5l8.5 6 8.5-6" />
  </svg>
);
// Outline by default; pass fill="currentColor" to render it filled (saved).
export const IconBookmark = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
  </svg>
);
// Clipboard with a check — placement readiness.
export const IconReadiness = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="4" width="14" height="17" rx="1.8" />
    <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5H9z" />
    <path d="M8.5 13.5l2.4 2.4 4.6-4.8" />
  </svg>
);
