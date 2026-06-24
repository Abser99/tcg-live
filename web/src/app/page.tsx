"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";

const liveAuctions = [
  { id: "1", title: "Charizard VMAX PSA 9", game: "Pokémon", price: "850", viewers: 23, img: "🔥", emoji: "🔥", gradient: "from-orange-500 to-red-600", glow: "rgba(239,68,68,0.4)", name: "Charizard VMAX PSA 9", set: "Pokémon · PSA 9", bid: "$850", timer: "2:34", seller: "tcg_master_mx", verified: true },
  { id: "2", title: "Black Lotus Unlimited", game: "Magic: The Gathering", price: "12,500", viewers: 8, img: "🌸", emoji: "🌸", gradient: "from-violet-600 to-indigo-800", glow: "rgba(139,92,246,0.4)", name: "Black Lotus Unlimited", set: "Magic: The Gathering · NM", bid: "$12,500", timer: "8:12", seller: "mtg_collector", verified: true },
  { id: "3", title: "Exodia the Forbidden One", game: "Yu-Gi-Oh!", price: "2,300", viewers: 15, img: "👁", emoji: "👁", gradient: "from-yellow-400 to-amber-500", glow: "rgba(251,191,36,0.4)", name: "Exodia the Forbidden One", set: "Yu-Gi-Oh! · 1st Ed", bid: "$2,300", timer: "0:58", seller: "yugi_trader", verified: false },
];

const features = [
  { icon: "⚡", title: "Sin lag, en tiempo real", desc: "Streaming de menos de 500ms. Cada puja, cada carta, al instante." },
  { icon: "🔍", title: "IA detecta tus cartas", desc: "Solo apunta la cámara. La IA identifica la carta y su valor sola." },
  { icon: "🔒", title: "Tu dinero está protegido", desc: "Pagos con Mercado Pago. El dinero se libera solo cuando confirmas tu carta." },
];

export default function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{ totalUsers: number; totalAuctions: number; totalBids: number } | null>(null);

  useEffect(() => {
    api.get<{ totalUsers: number; totalAuctions: number; totalBids: number }>("/stats")
      .then(res => setStats(res.data))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white overflow-x-hidden">
      <Navbar />
      <Hero user={user} stats={stats} />
      <LiveNow />
      <Features />
      {!user && <CTASection />}
      <Footer />
    </div>
  );
}

function Hero({ user, stats }: { user: { username: string } | null; stats: { totalUsers: number; totalAuctions: number; totalBids: number } | null }) {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-[#6C3AE8]/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/5 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 grid md:grid-cols-2 gap-12 items-center py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-green-400 mb-8 border border-green-500/20 bg-green-500/5">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            12 subastas en vivo ahora
          </div>

          <h1 className="text-6xl md:text-7xl font-black leading-[1.0] tracking-tight mb-6">
            Compra y vende<br />productos TCG<br />
            <span className="gradient-text">en vivo.</span>
          </h1>

          <p className="text-zinc-400 text-xl leading-relaxed mb-10 max-w-sm">
            Streaming sin lag. IA que detecta tus cartas. Pagos seguros con Mercado Pago.
          </p>

          <div className="flex flex-wrap gap-4 mb-10">
            <Link href="/auctions" className="inline-flex items-center gap-2.5 font-bold px-7 py-4 rounded-2xl text-white transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 8px 30px rgba(108,58,232,0.4)" }}>
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Ver subastas en vivo
            </Link>
            {user ? (
              <Link href="/perfil" className="inline-flex items-center gap-2 font-semibold px-7 py-4 rounded-2xl text-white border border-white/15 hover:border-white/30 hover:bg-white/5 transition-all">
                Mi perfil →
              </Link>
            ) : (
              <Link href="/register" className="inline-flex items-center gap-2 font-semibold px-7 py-4 rounded-2xl text-white border border-white/15 hover:border-white/30 hover:bg-white/5 transition-all">
                Registrarse gratis →
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <div className="flex -space-x-2">
              {["🧑", "👩", "🧑‍💻", "👨‍🦱", "👩‍🦰"].map((e, i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-[#1E1E2A] border-2 border-[#0F0F14] flex items-center justify-center text-sm">{e}</div>
              ))}
            </div>
            {stats && stats.totalUsers > 0 ? (
              <span><span className="text-white font-semibold">+{stats.totalUsers.toLocaleString("es-MX")}</span> coleccionistas registrados</span>
            ) : (
              <span><span className="text-white font-semibold">TCG Live</span> — tu marketplace de cartas en México</span>
            )}
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <div className="float relative w-72">
            <div className="absolute -top-3 -right-3 z-10 flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: "#ef4444", boxShadow: "0 0 16px rgba(239,68,68,0.5)" }}>
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />EN VIVO
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}>
              <div className="relative h-52 bg-[#0d0d1a] flex items-center justify-center">
                <div className="w-28 h-36 rounded-xl flex flex-col items-center justify-center gap-1 shadow-2xl"
                  style={{ background: "linear-gradient(135deg, #fbbf24, #f97316, #ef4444)", boxShadow: "0 0 50px rgba(251,191,36,0.4)" }}>
                  <span className="text-5xl">🔥</span>
                  <span className="text-white text-[10px] font-black tracking-widest opacity-90">CHARIZARD</span>
                </div>
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs text-zinc-300">👁 12 viendo</div>
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-mono font-bold text-white">2:34</div>
              </div>
              <div className="p-4 bg-[#16161E]">
                <p className="font-bold text-white mb-0.5">Charizard VMAX</p>
                <p className="text-xs text-zinc-500 mb-3">12 pujas</p>
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-xs text-zinc-500 mb-0.5">Puja actual</p>
                    <p className="text-2xl font-black text-white">$850 <span className="text-sm text-zinc-500 font-normal">MXN</span></p>
                  </div>
                  <p className="text-sm text-zinc-400">@tcg_master_mx <span className="text-[#a78bfa]">✓</span></p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/auctions" className="font-bold py-2.5 rounded-xl text-sm text-white text-center transition-all"
                    style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}>Pujar →</Link>
                  <Link href="/auctions" className="font-semibold py-2.5 rounded-xl text-sm text-white border border-white/15 hover:bg-white/5 transition-all text-center">Comprar ya</Link>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-6 bg-[#1E1E2A] rounded-xl px-3 py-2 flex items-center gap-2.5"
              style={{ border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
              <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center text-xs">📈</div>
              <div>
                <p className="text-[10px] text-zinc-500">Nueva puja</p>
                <p className="text-xs font-bold text-white">@tcg_master_mx — $850</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveNow() {
  return (
    <section id="live" className="py-20 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-2xl font-bold">En vivo ahora</h2>
          </div>
          <Link href="/auctions" className="text-sm text-[#a78bfa] hover:text-white transition-colors font-medium">Ver todas →</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {liveAuctions.map((a) => (
            <Link key={a.name} href="/auctions" className="rounded-2xl overflow-hidden hover:scale-[1.02] transition-transform cursor-pointer block"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#16161E" }}>
              <div className="relative h-40 flex items-center justify-center" style={{ background: "#0d0d1a" }}>
                <div className={`w-20 h-28 rounded-xl bg-gradient-to-br ${a.gradient} flex items-center justify-center text-3xl shadow-xl`}
                  style={{ boxShadow: `0 0 30px ${a.glow}` }}>{a.emoji}</div>
                <div className="absolute top-3 left-3 flex items-center gap-1.5 text-white text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: "#ef4444" }}>
                  <span className="w-1 h-1 bg-white rounded-full animate-pulse" />EN VIVO
                </div>
                <div className="absolute bottom-3 left-3 text-xs text-zinc-400 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">👁 {a.viewers}</div>
                <div className="absolute bottom-3 right-3 text-xs font-mono font-bold text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">{a.timer}</div>
              </div>
              <div className="p-4">
                <p className="font-semibold text-white text-sm mb-0.5">{a.name}</p>
                <p className="text-xs text-zinc-500 mb-3">{a.set}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-0.5">Puja actual</p>
                    <p className="text-lg font-black text-white">{a.bid} <span className="text-xs text-zinc-500 font-normal">MXN</span></p>
                  </div>
                  <span className="text-sm font-bold text-white px-4 py-2 rounded-xl"
                    style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}>Ver →</span>
                </div>
              </div>
            </Link>
          ))}
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
          <h2 className="text-4xl md:text-5xl font-black mb-4">Todo lo que necesitas,<br /><span className="gradient-text">sin lo que no.</span></h2>
          <p className="text-zinc-500 text-lg max-w-sm mx-auto">Sin complicaciones, sin apps raras, sin sorpresas.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl p-7 hover:border-[#6C3AE8]/40 transition-all group"
              style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-5"
                style={{ background: "rgba(108,58,232,0.15)", border: "1px solid rgba(108,58,232,0.2)" }}>{f.icon}</div>
              <h3 className="text-lg font-bold mb-2 group-hover:text-[#a78bfa] transition-colors">{f.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{f.desc}</p>
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
          style={{ background: "linear-gradient(135deg, rgba(108,58,232,0.25) 0%, rgba(139,92,246,0.08) 100%)", border: "1px solid rgba(108,58,232,0.3)" }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-[#6C3AE8]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <p className="text-5xl mb-5">🃏</p>
            <h2 className="text-4xl md:text-5xl font-black mb-4">Empieza hoy.<br />Es gratis.</h2>
            <p className="text-zinc-400 text-lg mb-8 max-w-xs mx-auto">Crea tu cuenta en segundos y entra a tu primera subasta.</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link href="/register" className="font-bold px-8 py-4 rounded-2xl text-white transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 8px 30px rgba(108,58,232,0.4)" }}>
                Crear cuenta gratis
              </Link>
              <Link href="/auctions" className="font-semibold px-8 py-4 rounded-2xl text-white border border-white/15 hover:border-white/30 hover:bg-white/5 transition-all">
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
  const footerLinks = [
    { label: "Subastas", href: "/auctions" },
    { label: "Shop",     href: "/shop" },
    { label: "Términos", href: "/terminos" },
    { label: "Privacidad", href: "/privacidad" },
    { label: "Soporte",  href: "mailto:tcgsubastas@gmail.com" },
  ];
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#6C3AE8] flex items-center justify-center font-black text-xs"
            style={{ boxShadow: "0 0 12px rgba(108,58,232,0.4)" }}>T</div>
          <span className="font-bold">TCG Live</span>
        </div>
        <div className="flex gap-6 text-sm text-zinc-600">
          {footerLinks.map((l) => (
            <Link key={l.label} href={l.href} className="hover:text-zinc-300 transition-colors">{l.label}</Link>
          ))}
        </div>
        <p className="text-zinc-700 text-sm">© 2026 TCG Live · Hecho en México 🇲🇽</p>
      </div>
    </footer>
  );
}
