"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { api, auctionsApi, type ApiAuction } from "@/lib/api";
import { formatTimer, gameLabel } from "@/lib/format";

const CARD_GRADIENTS = [
  { emoji: "🔥", gradient: "from-orange-500 to-red-600",    glow: "rgba(239,68,68,0.45)" },
  { emoji: "🌸", gradient: "from-violet-600 to-indigo-800", glow: "rgba(59,130,246,0.45)" },
  { emoji: "👁",  gradient: "from-yellow-400 to-amber-500", glow: "rgba(251,191,36,0.45)" },
];

const features = [
  { icon: "⚡", title: "Sin lag, en tiempo real",  desc: "Streaming de menos de 500ms. Cada puja, cada carta, al instante."           },
  { icon: "🔍", title: "IA detecta tus cartas",    desc: "Solo apunta la cámara. La IA identifica la carta y su valor sola."           },
  { icon: "🔒", title: "Tu dinero está protegido", desc: "Pagos con Mercado Pago. El dinero se libera solo cuando confirmas tu carta." },
];

export default function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{ totalUsers: number; totalAuctions: number; totalBids: number } | null>(null);
  const [liveAuctions, setLiveAuctions] = useState<ApiAuction[]>([]);

  useEffect(() => {
    api.get<{ totalUsers: number; totalAuctions: number; totalBids: number }>("/stats")
      .then(r => setStats(r.data))
      .catch(() => {});
    auctionsApi.list({ limit: 24 })
      .then(r => setLiveAuctions(r.data.data.filter(a => a.status === "live").slice(0, 3)))
      .catch(() => {});
  }, []);

  return (
    <>
      <style>{`
        .auction-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .auction-card:hover { transform: scale(1.025); box-shadow: 0 0 0 1px rgba(37,99,235,0.45), 0 8px 40px rgba(37,99,235,0.18); }
        .feature-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .feature-card:hover { transform: translateY(-4px) scale(1.015); box-shadow: 0 16px 48px rgba(37,99,235,0.18); }
        .ghost-btn:hover { background: var(--bg-hover); border-color: var(--border-brand); }
      `}</style>
      <div className="min-h-screen overflow-x-hidden" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <Navbar />
        <main id="main">
          <Hero user={user} stats={stats} liveCount={liveAuctions.length} />
          <LiveNow auctions={liveAuctions} />
          <Features />
          {!user && <CTASection />}
        </main>
        <Footer />
      </div>
    </>
  );
}

function Hero({ user, stats, liveCount }: {
  user: { username: string } | null;
  stats: { totalUsers: number; totalAuctions: number; totalBids: number } | null;
  liveCount: number;
}) {
  const pill = { background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", color: "var(--text-secondary)" } as const;
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[700px] h-[700px] rounded-full blur-[150px]" style={{ background: "rgba(37,99,235,0.18)" }} />
        <div className="absolute bottom-1/4 right-1/5 w-96 h-96 rounded-full blur-3xl" style={{ background: "rgba(59,130,246,0.09)" }} />
        <div className="absolute inset-0" style={{ opacity: 0.035, backgroundImage: "radial-gradient(circle, var(--text-primary) 1px, transparent 1px)", backgroundSize: "38px 38px" }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 grid md:grid-cols-2 gap-12 items-center py-24">
        {/* Left copy */}
        <div className="slide-up">
          {liveCount > 0 ? (
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-green-400 mb-8"
              style={{ border: "1px solid rgba(74,222,128,0.28)", background: "rgba(74,222,128,0.07)", boxShadow: "0 0 24px rgba(74,222,128,0.14), 0 0 60px rgba(74,222,128,0.06)" }}>
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              {liveCount === 1 ? "1 subasta en vivo ahora" : `${liveCount} subastas en vivo ahora`}
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold mb-8"
              style={{ border: "1px solid var(--border-brand)", background: "rgba(37,99,235,0.06)", color: "var(--text-secondary)" }}>
              🎴 El marketplace de TCG en vivo de México
            </div>
          )}
          <h1 className="text-7xl md:text-8xl font-black leading-[0.92] tracking-tight mb-6">
            Compra y<br />vende TCG<br /><span className="gradient-text">en vivo.</span>
          </h1>
          <p className="text-xl leading-relaxed mb-10 max-w-sm" style={{ color: "var(--text-secondary)" }}>
            Streaming sin lag. IA que detecta tus cartas. Pagos seguros con Mercado Pago.
          </p>
          <div className="flex flex-wrap gap-4 mb-10">
            <Link href="/auctions" className="inline-flex items-center gap-2.5 font-bold px-7 py-4 rounded-2xl text-white transition-all active:scale-95 hover:scale-[1.03]"
              style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 8px 32px rgba(37,99,235,0.45)" }}>
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />Ver subastas en vivo
            </Link>
            <Link href={user ? "/perfil" : "/register"} className="ghost-btn inline-flex items-center gap-2 font-semibold px-7 py-4 rounded-2xl transition-all"
              style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              {user ? "Mi perfil →" : "Registrarse gratis →"}
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="flex -space-x-2">
              {["🧑", "👩", "🧑‍💻", "👨‍🦱", "👩‍🦰"].map((e, i) => (
                <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                  style={{ background: "var(--bg-elevated)", border: "2px solid var(--bg-base)" }}>{e}</div>
              ))}
            </div>
            {stats && stats.totalUsers > 0
              ? <span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>+{stats.totalUsers.toLocaleString("es-MX")}</span> coleccionistas registrados</span>
              : <span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>TCG Live</span> — tu marketplace de cartas en México</span>
            }
          </div>
        </div>

        {/* Right: floating card widget */}
        <div className="flex justify-center md:justify-end">
          <div className="float relative w-72">
            {/* Second badge — top left */}
            {stats && stats.totalAuctions > 0 && (
              <div className="absolute -top-7 -left-8 z-10 rounded-xl px-3 py-2 flex items-center gap-2"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-brand)", boxShadow: "var(--card-shadow)" }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ background: "rgba(37,99,235,0.2)" }}>🃏</div>
                <p className="text-[10px] font-semibold" style={{ color: "var(--accent-text)" }}>+{stats.totalAuctions.toLocaleString("es-MX")} subastas</p>
              </div>
            )}
            {/* EN VIVO — pulsing glow */}
            <div className="absolute -top-3 -right-3 z-10 flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-full pulse-glow"
              style={{ background: "#ef4444" }}>
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />EN VIVO
            </div>
            {/* Card frame */}
            <div className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid var(--border-brand)", boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(37,99,235,0.10)" }}>
              {/* Image */}
              <div className="relative h-52 flex items-center justify-center"
                style={{ background: "linear-gradient(160deg, var(--bg-base) 0%, rgba(37,99,235,0.12) 100%)" }}>
                <div className="w-28 h-36 rounded-xl flex flex-col items-center justify-center gap-1"
                  style={{ background: "linear-gradient(135deg, #fbbf24, #f97316, #ef4444)", boxShadow: "0 0 50px rgba(251,191,36,0.45)" }}>
                  <span className="text-5xl">🔥</span>
                  <span className="text-white text-[10px] font-black tracking-widest opacity-90">CHARIZARD</span>
                </div>
                <div className="absolute bottom-0 inset-x-0 h-14 pointer-events-none" style={{ background: "linear-gradient(to top, var(--bg-surface), transparent)" }} />
                <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs rounded-full px-2.5 py-1 font-medium" style={pill}>
                  👁 <span className="text-white font-bold ml-0.5">12</span> viendo
                </div>
                <div className="absolute bottom-3 right-3 font-mono font-bold text-xs rounded-full px-2.5 py-1" style={{ ...pill, color: "#fff" }}>2:34</div>
              </div>
              {/* Info */}
              <div className="p-4" style={{ background: "var(--bg-surface)" }}>
                <p className="font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>Charizard VMAX</p>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>12 pujas · PSA 9</p>
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>Puja actual</p>
                    <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>$850 <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>MXN</span></p>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>@tcg_master_mx <span style={{ color: "var(--accent-text)" }}>✓</span></p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/auctions" className="font-bold py-2.5 rounded-xl text-sm text-white text-center transition-all hover:brightness-110"
                    style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}>Pujar →</Link>
                  <Link href="/auctions" className="ghost-btn font-semibold py-2.5 rounded-xl text-sm text-center transition-all"
                    style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>Comprar ya</Link>
                </div>
              </div>
            </div>
            {/* Bid notification */}
            <div className="absolute -bottom-5 -left-6 rounded-xl px-3 py-2 flex items-center gap-2.5"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.25)" }}>📈</div>
              <div>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Nueva puja</p>
                <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>@tcg_master_mx — $850</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveNow({ auctions }: { auctions: ApiAuction[] }) {
  if (auctions.length === 0) return null;

  return (
    <section id="live" className="py-20" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>En vivo ahora</h2>
          </div>
          <Link href="/auctions" className="text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ color: "var(--accent-text)" }}>Ver todas →</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {auctions.map((a, idx) => {
            const art = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
            const item = a.items?.[0];
            const currentBid = a.currentBid ?? item?.currentBid ?? item?.startingBid ?? a.startingBid ?? 0;
            const timer = formatTimer(a.endTime ?? item?.closesAt);
            const cardName = item?.cardName ?? a.title ?? a.name ?? "Carta sin nombre";
            const setLabel = [gameLabel(a.game), item?.cardSet].filter(Boolean).join(" · ");
            return (
              <Link key={a.id} href={`/auctions/${a.id}`} className="auction-card rounded-2xl overflow-hidden block"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                aria-label={`${cardName}, puja actual $${(currentBid / 100).toLocaleString("es-MX")} MXN, ${timer}`}>
                <div className="relative h-44 flex items-center justify-center"
                  style={{ background: "linear-gradient(160deg, var(--bg-base) 0%, rgba(37,99,235,0.08) 100%)" }}>
                  {item?.imageUrls?.[0] ? (
                    <img src={item.imageUrls[0]} alt="" className="h-full w-auto object-contain py-3" />
                  ) : (
                    <div className={`w-20 h-28 rounded-xl bg-gradient-to-br ${art.gradient} flex items-center justify-center text-3xl`}
                      style={{ boxShadow: `0 0 32px ${art.glow}` }} aria-hidden="true">{art.emoji}</div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 h-12 pointer-events-none"
                    style={{ background: "linear-gradient(to top, var(--bg-surface), transparent)" }} />
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 text-white text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: "#ef4444" }}>
                    <span className="w-1 h-1 bg-white rounded-full animate-pulse" />EN VIVO
                  </div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs rounded-full px-2.5 py-1"
                    style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", color: "var(--text-secondary)" }}>
                    👁 <span className="font-semibold text-white ml-0.5">{a.viewers ?? 0}</span>
                  </div>
                  <div className="absolute bottom-3 right-3 font-mono font-bold text-sm rounded-full px-2.5 py-1"
                    style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", color: timer.startsWith("0:") ? "var(--error-text)" : "#fff" }}>
                    {timer}
                  </div>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-sm mb-0.5" style={{ color: "var(--text-primary)" }}>{cardName}</p>
                  <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{setLabel}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>Puja actual</p>
                      <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>
                        ${(currentBid / 100).toLocaleString("es-MX")} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>MXN</span>
                      </p>
                    </div>
                    <span className="text-sm font-bold text-white px-4 py-2 rounded-xl"
                      style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}>Ver →</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ color: "var(--text-primary)" }}>
            Todo lo que necesitas,<br /><span className="gradient-text">sin lo que no.</span>
          </h2>
          <p className="text-lg max-w-sm mx-auto" style={{ color: "var(--text-muted)" }}>Sin complicaciones, sin apps raras, sin sorpresas.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={f.title} className="feature-card glass rounded-2xl p-7 relative overflow-hidden"
              style={{ border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
              <div className="absolute top-0 inset-x-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(37,99,235,0.5), transparent)" }} />
              <p className="absolute top-5 right-6 text-4xl font-black tabular-nums leading-none select-none"
                style={{ color: "var(--border)" }}>{["01","02","03"][i]}</p>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-5"
                style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.22)" }}>{f.icon}</div>
              <h3 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="rounded-3xl p-14 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.28) 0%, rgba(59,130,246,0.12) 60%, rgba(79,70,229,0.22) 100%)", border: "1px solid var(--border-brand)" }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(37,99,235,0.22)" }} />
          <span className="absolute top-5 left-6 text-3xl opacity-30 select-none">🃏</span>
          <span className="absolute top-5 right-6 text-3xl opacity-30 select-none">✨</span>
          <span className="absolute bottom-5 left-6 text-3xl opacity-25 select-none">🔥</span>
          <span className="absolute bottom-5 right-6 text-3xl opacity-25 select-none">🌸</span>
          <div className="relative">
            <p className="text-5xl mb-5">🃏</p>
            <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ color: "var(--text-primary)" }}>
              Empieza hoy.<br />Es gratis.
            </h2>
            <p className="text-lg mb-8 max-w-xs mx-auto" style={{ color: "var(--text-secondary)" }}>
              Crea tu cuenta en segundos y entra a tu primera subasta.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href="/register" className="font-bold px-8 py-4 rounded-2xl text-white transition-all active:scale-95 hover:scale-[1.03]"
                style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 8px 32px rgba(37,99,235,0.45)" }}>
                Crear cuenta gratis
              </Link>
              <Link href="/auctions" className="ghost-btn font-semibold px-8 py-4 rounded-2xl transition-all"
                style={{ color: "var(--text-primary)", border: "1px solid var(--border-brand)" }}>
                Ver subastas →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const links = [
    { label: "Subastas", href: "/auctions" }, { label: "Shop", href: "/shop" },
    { label: "Términos", href: "/terminos" }, { label: "Privacidad", href: "/privacidad" },
    { label: "Soporte",  href: "mailto:tcgsubastas@gmail.com" },
  ];
  return (
    <footer className="relative" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(37,99,235,0.35), transparent)" }} />
      <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center font-black text-xs text-white"
            style={{ background: "var(--brand)", boxShadow: "0 0 14px rgba(37,99,235,0.4)" }}>T</div>
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>TCG Live</span>
        </div>
        <nav className="flex flex-wrap justify-center gap-5 text-sm">
          {links.map((l) => (
            <Link key={l.label} href={l.href} className="opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: "var(--text-muted)" }}>{l.label}</Link>
          ))}
        </nav>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>© 2026 TCG Live · Hecho en México 🇲🇽</p>
      </div>
    </footer>
  );
}
