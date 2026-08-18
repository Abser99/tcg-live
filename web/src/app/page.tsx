"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import AmbientBackground from "@/components/AmbientBackground";
import { useAuth } from "@/contexts/auth";

/* Text that sits on a brand-filled button (both themes). */
const INK = "var(--brand-ink)";
/* Subtle film-grain overlay (inline SVG noise). */
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* ── Reveal — scroll-triggered entrance as PROGRESSIVE ENHANCEMENT.
   Base/SSR state is fully visible. We only ever hide-then-reveal after a
   requestAnimationFrame actually fires — proving the tab's render loop is
   alive. In a frozen/background tab rAF never fires, so we never hide and
   content stays visible. IntersectionObserver drives the reveal, with a timer
   safety net. Result: the nice effect in real browsers, never hidden content. ── */
function Reveal({ children, delay = 0, y = 20, className = "" }: {
  children: React.ReactNode; delay?: number; y?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    const el = ref.current;
    if (!el) return;
    let io: IntersectionObserver | null = null;
    let safety = 0;
    // Gate the whole effect on rAF firing — if the render loop is frozen we
    // bail before ever hiding anything.
    const raf = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.85) return; // already in view → no animation, no flash
      setHidden(true); // instant hide (no transition yet), then animate in
      io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { setHidden(false); io?.disconnect(); clearTimeout(safety); }
      }, { threshold: 0.15, rootMargin: "0px 0px -5% 0px" });
      io.observe(el);
      safety = window.setTimeout(() => { setHidden(false); io?.disconnect(); }, 2200);
    });
    return () => { cancelAnimationFrame(raf); io?.disconnect(); clearTimeout(safety); };
  }, []);
  return (
    <div ref={ref} className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translateY(${y}px)` : "none",
        // No transition while hidden → the initial hide is instant (imperceptible,
        // it's below the fold). Transition applies on reveal → it animates in.
        transition: hidden ? "none" : `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
        willChange: "opacity, transform",
      }}>
      {children}
    </div>
  );
}

/* ── Line icons (1.5px stroke, currentColor) — premium/minimal ── */
function IconBolt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" />
    </svg>
  );
}
function IconScan({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
      <path d="M3 12h18" />
    </svg>
  );
}
function IconShield({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" />
      <path d="m9.2 12 1.9 1.9 3.7-3.8" />
    </svg>
  );
}
function IconArrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const features = [
  { Icon: IconBolt,   title: "Tiempo real, sin lag",   desc: "Streaming de menos de 500 ms. Cada puja y cada carta aparecen al instante, sin recargar." },
  { Icon: IconScan,   title: "Identificación con IA",  desc: "Apunta la cámara y la IA reconoce la carta y estima su valor de mercado automáticamente." },
  { Icon: IconShield, title: "Pagos protegidos",       desc: "Cobros con Mercado Pago. El dinero se libera al vendedor solo cuando confirmas tu carta." },
];

const steps = [
  { n: "01", title: "Explora en vivo",   desc: "Entra a una subasta transmitiendo y mira al vendedor mostrar cada carta en tiempo real." },
  { n: "02", title: "Puja al instante",  desc: "Oferta con un toque. El precio sube en vivo y el anti-sniping evita robos de último segundo." },
  { n: "03", title: "Recibe tu carta",   desc: "Pagas protegido con Mercado Pago y confirmas al recibir. El dinero se libera solo entonces." },
];

export default function Home() {
  const { user } = useAuth();
  return (
    <>
      <style>{`
        .lift { transition: transform 0.25s cubic-bezier(0.22,1,0.36,1), border-color 0.25s ease; }
        .lift:hover { transform: translateY(-4px); border-color: var(--border-brand); }
        .u-link { position: relative; }
        .u-link::after { content: ""; position: absolute; left: 0; bottom: -2px; width: 100%; height: 1px; background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform 0.3s cubic-bezier(0.22,1,0.36,1); }
        .u-link:hover::after { transform: scaleX(1); }
        .btn-brand { transition: transform 0.15s ease, box-shadow 0.25s ease, filter 0.2s ease; }
        .btn-brand:hover { box-shadow: 0 10px 34px color-mix(in srgb, var(--brand) 32%, transparent); filter: brightness(1.04); }
        .btn-brand:active { transform: scale(0.985); }
        .tilt { transform: perspective(1400px) rotateY(-7deg) rotateX(2deg); transition: transform 0.6s cubic-bezier(0.22,1,0.36,1); }
        .tilt:hover { transform: perspective(1400px) rotateY(0deg) rotateX(0deg) translateY(-6px); }
        @keyframes cue { 0% { transform: translateY(-5px); opacity: 0; } 45% { opacity: 1; } 100% { transform: translateY(11px); opacity: 0; } }
        .cue-dot { animation: cue 1.9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .tilt, .tilt:hover { transform: none; } .cue-dot { animation: none; } }
      `}</style>
      <div className="min-h-screen overflow-x-hidden relative" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <AmbientBackground top={520} />
        <Navbar minimal />
        {/* Above the ambient layer, which sits at z-0 */}
        <main id="main" className="relative z-[1]">
          <Hero user={user} />
          <HowItWorks />
          <Features />
        </main>
        <Footer />
      </div>
    </>
  );
}

/* ── Eyebrow: uppercase tracked label used across sections ── */
function Eyebrow({ children, dot }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase"
      style={{ letterSpacing: "0.18em", color: "var(--text-muted)" }}>
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent-text)" }} />}
      {children}
    </div>
  );
}

function Hero({ user }: { user: { username: string } | null }) {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient light + film grain — restrained, positioned to pull the eye toward the card */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[14%] right-[6%] w-[560px] h-[560px] rounded-full blur-[150px]" style={{ background: "color-mix(in srgb, var(--brand) 10%, transparent)" }} />
        <div className="absolute top-1/2 -left-24 w-[420px] h-[420px] rounded-full blur-[150px]" style={{ background: "rgba(37,99,235,0.07)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: GRAIN, opacity: 0.028, mixBlendMode: "overlay" }} />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-12 lg:pt-32 lg:pb-16 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
        {/* Left copy */}
        <div className="slide-up">
          <Eyebrow dot>Marketplace de TCG en vivo · México</Eyebrow>

          <h1 className="mt-7 text-5xl md:text-[4.5rem] font-medium leading-[1.0] tracking-[-0.035em]"
            style={{ color: "var(--text-primary)" }}>
            Compra y vende<br />cartas TCG,<br />
            <span style={{ color: "var(--accent-text)" }}>en vivo.</span>
          </h1>

          <p className="mt-8 text-lg leading-relaxed max-w-md" style={{ color: "var(--text-secondary)" }}>
            La comunidad de venta en streaming más confiable de México, con IA y pagos protegidos.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link href={user ? "/auctions" : "/login"}
              className="btn-brand inline-flex items-center gap-2 font-semibold px-6 py-3.5 rounded-full"
              style={{ background: "var(--brand-light)", color: INK }}>
              Ver subastas en vivo <IconArrow className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Right: example (upcoming) auction card with an illustrated TCG-sale background */}
        <div className="flex justify-center lg:justify-end slide-up">
          <HeroSampleCard />
        </div>
      </div>
    </section>
  );
}

/* Illustrated "TCG product sale" scene — used as the background of the hero
   example auction (crafted inline SVG, no external assets). */
function TcgSaleScene() {
  return (
    <svg viewBox="0 0 400 500" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="hs-warm" cx="50%" cy="16%" r="62%">
          <stop offset="0%" stopColor="#ffd66b" stopOpacity="0.38" />
          <stop offset="45%" stopColor="#ffb347" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hs-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#151d34" />
          <stop offset="55%" stopColor="#0e1526" />
          <stop offset="100%" stopColor="#0a1120" />
        </linearGradient>
        <linearGradient id="hs-felt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c3c6f" />
          <stop offset="100%" stopColor="#0f2247" />
        </linearGradient>
        <linearGradient id="hs-holo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd86b" />
          <stop offset="45%" stopColor="#ff8a3d" />
          <stop offset="100%" stopColor="#e0522b" />
        </linearGradient>
        <linearGradient id="hs-holo2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8fd3ff" />
          <stop offset="100%" stopColor="#3b7be0" />
        </linearGradient>
        <linearGradient id="hs-foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3f6ff" />
          <stop offset="50%" stopColor="#b9c6e8" />
          <stop offset="100%" stopColor="#7f8fbf" />
        </linearGradient>
      </defs>

      <rect width="400" height="500" fill="url(#hs-bg)" />
      <rect width="400" height="500" fill="url(#hs-warm)" />

      {/* felt table */}
      <path d="M0 300 Q200 262 400 300 L400 500 L0 500 Z" fill="url(#hs-felt)" />
      <path d="M0 300 Q200 262 400 300" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="2" />

      {/* booster packs on the table */}
      <g transform="translate(58 356) rotate(-8)">
        <rect x="0" y="0" width="72" height="102" rx="9" fill="url(#hs-foil)" />
        <rect x="0" y="0" width="72" height="27" rx="9" fill="#e0522b" opacity="0.92" />
        <circle cx="36" cy="62" r="16" fill="#fff" opacity="0.5" />
      </g>
      <g transform="translate(252 372) rotate(9)">
        <rect x="0" y="0" width="68" height="96" rx="9" fill="url(#hs-foil)" />
        <rect x="0" y="0" width="68" height="25" rx="9" fill="#3b7be0" opacity="0.92" />
        <circle cx="34" cy="58" r="15" fill="#fff" opacity="0.5" />
      </g>

      {/* fanned cards */}
      <g transform="translate(200 208)">
        <g transform="rotate(-16) translate(-42 2)"><rect x="-46" y="-66" width="92" height="132" rx="10" fill="url(#hs-holo2)" stroke="#fff" strokeWidth="3" /></g>
        <g transform="rotate(16) translate(42 2)"><rect x="-46" y="-66" width="92" height="132" rx="10" fill="url(#hs-holo2)" stroke="#fff" strokeWidth="3" /></g>
        <g>
          <rect x="-52" y="-74" width="104" height="148" rx="12" fill="url(#hs-holo)" stroke="#fff" strokeWidth="4" />
          <rect x="-40" y="-58" width="80" height="60" rx="6" fill="rgba(255,255,255,0.18)" />
          <path d="M0 -30 C 11 -15 19 -8 8 5 C 4 10 -4 10 -8 5 C -19 -8 -11 -15 0 -30 Z" fill="#fff" opacity="0.85" />
          <rect x="-40" y="14" width="80" height="8" rx="4" fill="rgba(255,255,255,0.26)" />
          <rect x="-40" y="28" width="58" height="6" rx="3" fill="rgba(255,255,255,0.18)" />
        </g>
      </g>

      {/* sparkles */}
      <g fill="#ffe08a">
        <circle cx="92" cy="118" r="2.6" opacity="0.9" />
        <circle cx="322" cy="150" r="2" opacity="0.8" />
        <circle cx="300" cy="88" r="1.6" opacity="0.7" />
        <circle cx="120" cy="66" r="1.8" opacity="0.7" />
      </g>
    </svg>
  );
}

/* Example (upcoming, not live) auction card shown in the hero. */
function HeroSampleCard() {
  return (
    <div className="w-full max-w-[380px] rounded-3xl overflow-hidden" style={{ border: "1px solid var(--border)", boxShadow: "0 30px 70px rgba(0,0,0,0.35)" }}>
      <div className="relative" style={{ aspectRatio: "4 / 5" }}>
        <TcgSaleScene />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.72) 100%)" }} />

        <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent-text)" }} /> Próximo
        </div>
        <div className="absolute top-4 right-4 text-[11px] font-medium px-2.5 py-1 rounded-full tabular-nums"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff" }}>Inicia en 2 h</div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-white font-medium tracking-tight">Charizard VMAX — Sellado</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>Champions Path · Sellado de fábrica</p>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase font-medium" style={{ letterSpacing: "0.12em", color: "rgba(255,255,255,0.55)" }}>Precio inicial</p>
              <p className="text-2xl font-semibold text-white tabular-nums">$850 <span className="text-sm font-normal" style={{ color: "rgba(255,255,255,0.6)" }}>MXN</span></p>
            </div>
            <span className="text-sm font-semibold px-4 py-2 rounded-full" style={{ background: "var(--brand-light)", color: INK }}>Recordarme</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="py-16" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="max-w-xl mb-10">
          <Eyebrow>Cómo funciona</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-[2.75rem] font-medium leading-[1.08] tracking-[-0.025em]" style={{ color: "var(--text-primary)" }}>
            De la sala en vivo a tu colección.
          </h2>
        </Reveal>

        {/* Horizontal stepper — connecting line leads the eye left → right */}
        <div className="relative">
          <div className="hidden md:block absolute top-[7px] left-0 right-0 h-px" style={{ background: "var(--border)" }} />
          <div className="grid md:grid-cols-3 gap-x-10 gap-y-12">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 110}>
                <div className="relative">
                  {/* node on the line */}
                  <span className="hidden md:block absolute -top-[1px] left-0 w-3.5 h-3.5 rounded-full"
                    style={{ background: "var(--brand-light)", boxShadow: "0 0 0 4px var(--bg-base)" }} />
                  <div className="md:pt-9">
                    <span className="text-sm font-medium tabular-nums" style={{ color: "var(--accent-text)" }}>{s.n}</span>
                    <h3 className="mt-3 text-lg font-medium tracking-tight" style={{ color: "var(--text-primary)" }}>{s.title}</h3>
                    <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="py-16" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="max-w-xl mb-10">
          <Eyebrow>Por qué TCG Live</Eyebrow>
          <h2 className="mt-4 text-3xl md:text-[2.75rem] font-medium leading-[1.08] tracking-[-0.025em]" style={{ color: "var(--text-primary)" }}>
            Lo esencial, resuelto con cuidado.
          </h2>
          <p className="mt-5 text-lg leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Sin apps raras ni pasos de más. Una experiencia pensada para que comprar y vender se sienta simple y seguro.
          </p>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-px rounded-2xl overflow-hidden"
          style={{ background: "var(--border-subtle)", border: "1px solid var(--border-subtle)" }}>
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 90} className="h-full">
              <div className="p-8 h-full" style={{ background: "var(--bg-surface)" }}>
                <div className="flex items-center justify-between mb-7">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ border: "1px solid var(--border)", color: "var(--accent-text)" }}>
                    <f.Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>0{i + 1}</span>
                </div>
                <h3 className="text-base font-medium tracking-tight mb-2.5" style={{ color: "var(--text-primary)" }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const links = [
    { label: "Subastas", href: "/auctions" },
    { label: "Términos", href: "/terminos" }, { label: "Privacidad", href: "/privacidad" },
    { label: "Soporte",  href: "mailto:tcgsubastas@gmail.com" },
  ];
  return (
    <footer style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <div className="mx-auto max-w-6xl px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md flex items-center justify-center font-semibold text-xs" style={{ background: "var(--brand-light)", color: INK }}>T</div>
          <span className="font-medium tracking-tight" style={{ color: "var(--text-primary)" }}>TCG Live</span>
        </div>
        <nav className="flex flex-wrap justify-center gap-6 text-sm">
          {links.map((l) => (
            <Link key={l.label} href={l.href} className="u-link transition-opacity"
              style={{ color: "var(--text-muted)" }}>{l.label}</Link>
          ))}
        </nav>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>© 2026 TCG Live · Hecho en México</p>
      </div>
    </footer>
  );
}
