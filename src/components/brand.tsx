type MarkProps = { size?: number; className?: string };

/** AlignMD logo mark — two aligned segments forming a precision match. */
export function LogoMark({ size = 28, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#0d9488" />
      <rect x="7" y="9.5" width="13" height="4.2" rx="2.1" fill="#fff" />
      <rect x="7" y="18.3" width="13" height="4.2" rx="2.1" fill="#99f6e4" />
      <circle cx="23" cy="11.6" r="2.6" fill="#fff" />
      <circle cx="23" cy="20.4" r="2.6" fill="#99f6e4" />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <LogoMark size={size} />
      <b style={{ fontSize: size * 0.62, letterSpacing: "-0.02em" }}>
        Align<span style={{ color: "#0d9488" }}>MD</span>
      </b>
    </span>
  );
}
