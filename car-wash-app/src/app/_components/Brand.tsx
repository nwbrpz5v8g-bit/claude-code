import Link from "next/link";

/** Logo: a droplet with a foam highlight. Inline SVG so it inherits theme colours. */
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="SUDS home">
      <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3c5 6.5 9 11.4 9 16a9 9 0 1 1-18 0c0-4.6 4-9.5 9-16Z" fill="var(--aqua)" />
        <circle cx="12.5" cy="19" r="3.2" fill="#fff" opacity=".9" />
        <circle cx="18.5" cy="23" r="1.8" fill="#fff" opacity=".7" />
        <circle cx="25" cy="7" r="3" fill="var(--pink)" />
      </svg>
      suds
    </Link>
  );
}

/** Decorative rising bubbles. Positions are deterministic so server and client render identically. */
export function Bubbles({ count = 14 }: { count?: number }) {
  return (
    <div className="bubbles" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const size = 12 + ((i * 37) % 46);
        return (
          <span
            key={i}
            className="bubble"
            style={{
              left: `${(i * 61) % 100}%`,
              width: size,
              height: size,
              animationDuration: `${7 + ((i * 13) % 9)}s`,
              animationDelay: `${-((i * 17) % 11)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

/** Foam level indicator: more bubbles = more thorough wash. */
export function Foam({ level }: { level: number }) {
  return (
    <span className="foam" aria-label={`Foam level ${level} of 3`}>
      {[8, 12, 16, 20, 14, 10].map((s, i) => (
        <i key={i} className={i < level * 2 ? "on" : ""} style={{ width: s, height: s }} />
      ))}
    </span>
  );
}
