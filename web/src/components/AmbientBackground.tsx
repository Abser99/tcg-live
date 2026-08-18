"use client";

/* Ambient background adopted from SugarCo TCG: a slow brush-stroke wave with
   drifting silhouettes and colour-cycling TCG energy glyphs, parallaxing behind
   the content so the page feels layered rather than flat.

   Purely decorative (aria-hidden, pointer-events none) and it never paints over
   content — it renders at z-index 0 inside a positioned ancestor. */

import { useEffect, useRef } from "react";

/** Amorphous "creature shadow" — reused at different scales/rotations. */
const BLOBS = [
  { x: 120, y: 70, s: 0.6, r: -12, delay: "0s", dur: "9s" },
  { x: 170, y: 340, s: 0.5, r: 24, delay: "2.3s", dur: "10s" },
  { x: 130, y: 620, s: 0.7, r: -16, delay: "1.1s", dur: "11s" },
  { x: 300, y: 200, s: 0.9, r: 20, delay: "1.4s", dur: "11s" },
  { x: 480, y: 40, s: 0.45, r: 8, delay: "0.6s", dur: "8s" },
  { x: 620, y: 260, s: 1.1, r: -25, delay: "2.1s", dur: "12s" },
  { x: 780, y: 120, s: 0.7, r: 15, delay: "0.9s", dur: "10s" },
  { x: 940, y: 30, s: 0.5, r: -8, delay: "1.7s", dur: "9s" },
  { x: 1080, y: 220, s: 0.85, r: 30, delay: "0.3s", dur: "11s" },
  { x: 1250, y: 90, s: 0.6, r: -18, delay: "2.4s", dur: "10s" },
  { x: 1400, y: 200, s: 0.75, r: 10, delay: "1.1s", dur: "12s" },
  { x: 200, y: 460, s: 0.65, r: -20, delay: "0.5s", dur: "10s" },
  { x: 680, y: 460, s: 1.0, r: -30, delay: "0.8s", dur: "13s" },
  { x: 900, y: 560, s: 0.65, r: 22, delay: "2.6s", dur: "10s" },
  { x: 1140, y: 480, s: 0.8, r: -14, delay: "1.3s", dur: "11s" },
  { x: 240, y: 700, s: 0.9, r: -22, delay: "1.6s", dur: "12s" },
  { x: 800, y: 700, s: 1.05, r: -10, delay: "2.2s", dur: "13s" },
  { x: 1300, y: 720, s: 0.55, r: -16, delay: "1.8s", dur: "9s" },
];

/** Generic TCG energy symbols — flame, drop, leaf, spark, moon. */
const ENERGY = [
  { id: "energy-flame", x: 150, y: 140, s: 1.05, delay: "0s", dur: "22s" },
  { id: "energy-drop", x: 560, y: 320, s: 1.3, delay: "3s", dur: "26s" },
  { id: "energy-leaf", x: 900, y: 160, s: 1.2, delay: "6s", dur: "24s" },
  { id: "energy-spark", x: 1240, y: 300, s: 1.0, delay: "9s", dur: "20s" },
  { id: "energy-moon", x: 380, y: 640, s: 1.15, delay: "4.5s", dur: "25s" },
  { id: "energy-flame", x: 1020, y: 660, s: 0.95, delay: "12s", dur: "23s" },
  { id: "energy-spark", x: 130, y: 780, s: 0.9, delay: "5s", dur: "24s" },
  { id: "energy-moon", x: 150, y: 460, s: 0.85, delay: "14s", dur: "25s" },
];

export default function AmbientBackground({ top = 420 }: { top?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Parallax: drifts slower than the page so it reads as "behind" the content.
  // Driven by a ref + direct style (not state) so scrolling doesn't re-render.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ticking = false;
    const FACTOR = 0.28;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (wrapRef.current) wrapRef.current.style.transform = `translateY(${window.scrollY * FACTOR}px)`;
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        top,
        // Wider than the page and offset left by the same overflow it adds on the
        // right, so the wave's own ±18px drift never exposes a straight edge.
        // <body> already clips horizontally, so this adds no sideways scroll.
        left: -30,
        width: "calc(100% + 60px)",
        height: 900,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        willChange: "transform",
      }}
    >
      <svg className="brush-wave" viewBox="0 0 1600 220" preserveAspectRatio="none"
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 220 }}>
        <path
          d="M-20,120 C120,60 220,170 360,100 C480,45 560,165 700,110
             C830,55 900,175 1040,105 C1170,50 1250,170 1390,100
             C1480,60 1560,90 1620,80
             L1620,130 C1560,145 1480,115 1390,150
             C1250,215 1170,100 1040,150
             C900,220 830,105 700,155
             C560,210 480,95 360,145
             C220,215 120,105 -20,165 Z"
          fill="var(--text-primary)"
          opacity={0.11}
        />
      </svg>

      <svg viewBox="0 0 1600 900" preserveAspectRatio="none"
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 900 }}>
        <defs>
          <path id="shadow-blob"
            d="M0,42 C-14,18 4,-10 34,-14 C64,-18 92,2 96,30
               C100,58 82,82 54,86 C26,90 -4,76 -10,56 C-13,50 -6,48 0,42 Z" />
          <path id="energy-flame" d="M14,0 C9,7 4,10 4,16 C4,21.5 8.5,26 14,26 C19.5,26 24,21.5 24,16 C24,11.5 20,9 17,5.5 C17,10 14.5,11.5 13,9 C11.5,6.5 13,3 14,0 Z" />
          <path id="energy-drop" d="M13,0 C13,0 3,13 3,19 A10,10 0 0020,19 C20,13 13,0 13,0 Z" />
          <path id="energy-leaf" d="M2,24 C2,11 11,2 24,2 C24,15 15,24 2,24 Z" />
          <path id="energy-spark" d="M13,0 L16,10 L26,13 L16,16 L13,26 L10,16 L0,13 L10,10 Z" />
          <path id="energy-moon" d="M18,1 A12,12 0 100,23 A8.4,8.4 0 000,1 Z" />
        </defs>

        {BLOBS.map((b, i) => (
          <use key={`blob-${i}`} href="#shadow-blob" className="shadow-blob"
            transform={`translate(${b.x} ${b.y}) rotate(${b.r}) scale(${b.s})`}
            fill="var(--text-primary)" opacity={0.055}
            style={{ animationDelay: b.delay, animationDuration: b.dur, transformOrigin: "center" }} />
        ))}

        {ENERGY.map((e, i) => (
          <use key={`energy-${i}`} href={`#${e.id}`} className="energy-glyph"
            transform={`translate(${e.x} ${e.y}) scale(${e.s})`} opacity={0.4}
            style={{ animationDelay: e.delay, animationDuration: e.dur, transformOrigin: "center" }} />
        ))}
      </svg>
    </div>
  );
}
