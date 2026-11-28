"use client";
import { useEffect, useState } from "react";

/** One-off celebratory bubble burst. Hidden for users who prefer reduced motion (see CSS). */
export function Burst() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="burst" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => {
        const size = 14 + ((i * 29) % 50);
        return (
          <i
            key={i}
            style={{ left: `${(i * 47) % 100}%`, width: size, height: size, animationDelay: `${(i % 12) * 0.08}s` }}
          />
        );
      })}
    </div>
  );
}
