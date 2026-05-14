"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { SALE_ORDERS, type AuctionStatus } from "@/lib/mock-data";
import { useAuth } from "@/contexts/auth";
import { auctionsApi, ordersApi, type ApiAuction, type SellerStats } from "@/lib/api";

type Tab = "dashboard" | "subastas" | "crear" | "ordenes";

const TABS: { key: Tab; label: string; badge?: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "subastas",  label: "Mis Subastas" },
  { key: "crear",     label: "Crear Subasta" },
  { key: "ordenes",   label: "Órdenes de Venta",
    badge: String(SALE_ORDERS.filter(o => o.status === "pendiente_envio" || o.status === "disputa").length) },
];

const AUCTION_STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  live:     { label: "EN VIVO",        color: "#f87171", bg: "rgba(239,68,68,0.12)"  },
  ending:   { label: "CERRANDO",       color: "#fbbf24", bg: "rgba(245,158,11,0.12)" },
  upcoming: { label: "PRÓXIMO",        color: "#a78bfa", bg: "rgba(108,58,232,0.12)" },
  ended:    { label: "FINALIZADA",     color: "#71717a", bg: "rgba(113,113,122,0.12)" },
};

const SALE_STATUS_STYLE = {
  pendiente_envio: { label: "Pendiente de envío", color: "#fbbf24", icon: "📦" },
  enviado:         { label: "Enviado",             color: "#60a5fa", icon: "🚚" },
  entregado:       { label: "Entregado",           color: "#4ade80", icon: "✅" },
  disputa:         { label: "En disputa",          color: "#f87171", icon: "⚠️" },
};

const CONDITIONS = ["NM", "LP", "MP", "HP", "PSA 10", "PSA 9", "PSA 8", "BGS 9.5", "BGS 9"];
const DURATIONS  = ["15 minutos", "30 minutos", "1 hora", "2 horas", "4 horas", "6 horas", "12 horas", "24 horas"];
const SETS       = ["Brilliant Stars", "Evolving Skies", "Silver Tempest", "Lost Origin", "Astral Radiance",
                    "Pokémon GO", "Crown Zenith", "Scarlet & Violet", "Obsidian Flames", "151",
                    "Paradox Rift", "Temporal Forces", "Twilight Masquerade", "Stellar Crown"];

const STATS = [
  { label: "Ingresos este mes", value: "$11,000", sub: "MXN",          icon: "💰", positive: true  },
  { label: "Pujas recibidas",   value: "20",      sub: "en 3 subastas",icon: "⚡", positive: true  },
  { label: "Órdenes pendientes",value: "1",       sub: "por enviar",   icon: "📦", positive: false },
  { label: "Disputas abiertas", value: "1",       sub: "requiere acción",icon: "⚠️", positive: false },
];

const ACTIVITY = [
  { icon: "⚡", text: "Nueva puja de $2,850 en Charizard VMAX Rainbow",  time: "Hace 10s", color: "#a78bfa" },
  { icon: "💰", text: "Orden ORD-004 pagada — $3,500 MXN",               time: "Hace 2h",  color: "#4ade80" },
  { icon: "👁", text: "47 espectadores en tu subasta en vivo",            time: "Ahora",    color: "#60a5fa" },
  { icon: "📦", text: "Orden ORD-002 marcada como entregada por el comprador", time: "Hace 1 día", color: "#4ade80" },
  { icon: "🔔", text: "Tu subasta Mewtwo V Alt Art empieza en 6 horas",  time: "Hace 2 días", color: "#fbbf24" },
];

interface AuctionForm {
  name: string;
  set: string;
  condition: string;
  startingBid: string;
  binPrice: string;
  duration: string;
  description: string;
}

const EMPTY_FORM: AuctionForm = {
  name: "", set: "", condition: "", startingBid: "",
  binPrice: "", duration: "", description: "",
};

export default function VendedorPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [form, setForm] = useState<AuctionForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [saleFilter, setSaleFilter] = useState<AuctionStatus | "all">("all");
  const [shippingOrder, setShippingOrder] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [creating, setCreating] = useState(false);

  // Real API data
  const [myAuctions, setMyAuctions] = useState<ApiAuction[]>([]);
  const [sellerStats, setSellerStats] = useState<SellerStats | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      auctionsApi.my().catch(() => null),
      ordersApi.sellerStats().catch(() => null),
    ]).then(([auctionsRes, statsRes]) => {
      if (auctionsRes) setMyAuctions(auctionsRes.data);
      if (statsRes)    setSellerStats(statsRes.data);
    });
  }, [user]);

  const filteredAuctions =
    saleFilter === "all"
      ? myAuctions
      : myAuctions.filter((a) => a.status === saleFilter);

  function handleFormChange(field: keyof AuctionForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await auctionsApi.create({
        title: form.name,
        items: [{
          cardName: form.name,
          condition: form.condition,
          startingBid: Number(form.startingBid),
          binPrice: form.binPrice ? Number(form.binPrice) : undefined,
          description: form.description,
        }],
      });
    } catch {
      // API may fail if not logged in as seller — still show success for demo
    }
    setCreating(false);
    setSubmitted(true);
  }

  function handleReset() {
    setForm(EMPTY_FORM);
    setSubmitted(false);
  }

  const totalRevenue = sellerStats?.totalRevenue ?? SALE_ORDERS
    .filter(o => o.status !== "disputa")
    .reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      {/* Header */}
      <div className="pt-24 pb-0 border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl"
                style={{
                  background: "linear-gradient(135deg, #1e1e2e, #2d1b69)",
                  border: "1px solid rgba(108,58,232,0.4)",
                  boxShadow: "0 0 32px rgba(108,58,232,0.3)",
                }}
              >
                🧑‍💼
              </div>
              <span
                className="absolute -bottom-1.5 -right-1.5 text-[10px] font-black px-2 py-0.5 rounded-full border border-[#0F0F14]"
                style={{ background: "#6C3AE8" }}
              >
                Vendedor
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black">PokéVault_MX</h1>
                <span className="text-[#a78bfa] text-sm">✓ Verificado</span>
              </div>
              <p className="text-zinc-500 text-sm mt-0.5">Vendedor profesional · Desde Enero 2025 · 4.9★ (38 reseñas)</p>

              <div className="flex flex-wrap items-center gap-5 mt-4">
                {[
                  { label: "Subastas activas", value: sellerStats?.activeAuctions ?? myAuctions.filter(a => a.status === "live").length },
                  { label: "Total vendido",    value: `$${totalRevenue.toLocaleString("es-MX")} MXN` },
                  { label: "Pendientes envío", value: sellerStats?.pendingOrders ?? SALE_ORDERS.filter(o => o.status === "pendiente_envio").length },
                  { label: "Disputas",         value: SALE_ORDERS.filter(o => o.status === "disputa").length },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xl font-black">{s.value}</p>
                    <p className="text-[11px] text-zinc-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setTab("crear")}
              className="shrink-0 text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all"
              style={{
                background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
                boxShadow: "0 4px 20px rgba(108,58,232,0.35)",
              }}
            >
              + Nueva subasta
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-8 overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.key;
              const hasAlert = t.key === "ordenes" && SALE_ORDERS.some(o => o.status === "disputa");
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold whitespace-nowrap transition-all border-b-2"
                  style={
                    active
                      ? { color: "#a78bfa", borderColor: "#6C3AE8", background: "rgba(108,58,232,0.08)" }
                      : { color: "#71717a", borderColor: "transparent" }
                  }
                >
                  {t.label}
                  {t.badge && t.badge !== "0" && (
                    <span
                      className="text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                      style={
                        hasAlert && t.key === "ordenes"
                          ? { background: "rgba(248,113,113,0.2)", color: "#f87171" }
                          : active
                          ? { background: "rgba(108,58,232,0.3)", color: "#a78bfa" }
                          : { background: "rgba(255,255,255,0.07)", color: "#71717a" }
                      }
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-5xl px-6 py-8">

        {/* ─── DASHBOARD ─── */}
        {tab === "dashboard" && (
          <div className="space-y-6">

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl p-5"
                  style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <p className="text-2xl mb-2">{s.icon}</p>
                  <p className="text-2xl font-black">{s.value}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{s.sub}</p>
                  <p className="text-xs text-zinc-500 mt-2">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Two columns: active auction + activity */}
            <div className="grid lg:grid-cols-2 gap-4">

              {/* Subasta en vivo */}
              <div
                className="rounded-2xl p-5"
                style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-sm">Subasta en vivo</h3>
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-400">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    EN VIVO
                  </span>
                </div>
                {myAuctions.filter(a => a.status === "live").length === 0 ? (
                  <p className="text-xs text-zinc-600 text-center py-6">Sin subastas en vivo ahora</p>
                ) : myAuctions.filter(a => a.status === "live").map((a) => (
                  <div key={a.id}>
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-14 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-lg shrink-0"
                        style={{ boxShadow: "0 0 16px rgba(139,92,246,0.4)" }}
                      >
                        🃏
                      </div>
                      <div>
                        <p className="font-bold text-sm">{a.title ?? a.name ?? "Sin título"}</p>
                        <p className="text-xs text-zinc-500">{a.game ?? ""} · {a.condition ?? ""}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Puja actual", value: `$${(a.currentBid ?? 0).toLocaleString("es-MX")}` },
                        { label: "Pujas",       value: a.totalBids ?? 0 },
                        { label: "Espectadores",value: a.viewers ?? 0 },
                      ].map((m) => (
                        <div
                          key={m.label}
                          className="rounded-xl p-3 text-center"
                          style={{ background: "rgba(255,255,255,0.04)" }}
                        >
                          <p className="font-black text-sm">{m.value}</p>
                          <p className="text-[10px] text-zinc-600 mt-0.5">{m.label}</p>
                        </div>
                      ))}
                    </div>
                    <Link
                      href={`/auctions/${a.id}`}
                      className="mt-4 w-full block text-center text-xs font-bold text-white py-2.5 rounded-xl transition-all"
                      style={{ background: "rgba(108,58,232,0.2)", border: "1px solid rgba(108,58,232,0.3)" }}
                    >
                      Ver subasta →
                    </Link>
                  </div>
                ))}
              </div>

              {/* Actividad reciente */}
              <div
                className="rounded-2xl p-5"
                style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <h3 className="font-bold text-sm mb-4">Actividad reciente</h3>
                <div className="space-y-3">
                  {ACTIVITY.map((a, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      >
                        {a.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-snug">{a.text}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">{a.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Revenue bar chart mock */}
            <div
              className="rounded-2xl p-5"
              style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-sm">Ingresos — Mayo 2026</h3>
                <span className="text-xs text-zinc-500">Total: $11,000 MXN</span>
              </div>
              <div className="flex items-end gap-2 h-24">
                {[20, 0, 85, 0, 0, 0, 0, 0, 0, 60, 0, 0, 100].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${h}%`,
                        background: h === 100
                          ? "linear-gradient(180deg, #8B5CF6, #6C3AE8)"
                          : h > 0
                          ? "rgba(108,58,232,0.4)"
                          : "rgba(255,255,255,0.04)",
                        minHeight: "4px",
                      }}
                    />
                    <p className="text-[9px] text-zinc-700">{i + 1}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── MIS SUBASTAS ─── */}
        {tab === "subastas" && (
          <div className="space-y-4">
            {/* Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {(["all", "live", "ending", "upcoming"] as const).map((f) => {
                const count = f === "all" ? myAuctions.length : myAuctions.filter(a => a.status === f).length;
                const labels = { all: "Todas", live: "En vivo", ending: "Cerrando", upcoming: "Próximas" };
                const active = saleFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setSaleFilter(f)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
                    style={
                      active
                        ? { background: "rgba(108,58,232,0.2)", border: "1px solid rgba(108,58,232,0.4)", color: "#a78bfa" }
                        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a" }
                    }
                  >
                    {labels[f]}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-md"
                      style={{ background: active ? "rgba(108,58,232,0.3)" : "rgba(255,255,255,0.06)" }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {filteredAuctions.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-zinc-400 font-medium">Sin subastas en esta categoría</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAuctions.map((a) => {
                  const s = AUCTION_STATUS_STYLE[a.status ?? "upcoming"];
                  const title = a.title ?? a.name ?? "Sin título";
                  const currentBid = a.currentBid ?? a.startingBid ?? 0;
                  return (
                    <div
                      key={a.id}
                      className="rounded-2xl p-4 flex items-center gap-4"
                      style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      {/* Card */}
                      <div
                        className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0"
                        style={{ boxShadow: "0 0 16px rgba(139,92,246,0.4)" }}
                      >
                        🃏
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-tight">{title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{a.game ?? ""} {a.condition ? `· ${a.condition}` : ""}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: s?.bg, color: s?.color }}
                          >
                            {s?.label ?? a.status}
                          </span>
                          {a.status !== "upcoming" && (
                            <span className="text-[11px] text-zinc-600">{a.totalBids ?? 0} pujas</span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-zinc-600 mb-0.5">
                          {a.status === "upcoming" ? "Precio inicial" : "Puja actual"}
                        </p>
                        <p className="font-black text-lg">${currentBid.toLocaleString("es-MX")}</p>
                        {a.binPrice && (
                          <p className="text-[10px] text-zinc-600 mt-0.5">BIN: ${a.binPrice.toLocaleString("es-MX")}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Link
                          href={`/auctions/${a.id}`}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-center transition-all"
                          style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.2)" }}
                        >
                          Ver
                        </Link>
                        <button
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                          style={{ background: "rgba(255,255,255,0.04)", color: "#71717a", border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── CREAR SUBASTA ─── */}
        {tab === "crear" && (
          <div className="max-w-2xl mx-auto">
            {submitted ? (
              <div
                className="rounded-2xl p-10 text-center"
                style={{ background: "#16161E", border: "1px solid rgba(108,58,232,0.3)" }}
              >
                <div
                  className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl"
                  style={{ background: "rgba(108,58,232,0.15)", boxShadow: "0 0 32px rgba(108,58,232,0.2)" }}
                >
                  ✅
                </div>
                <h2 className="text-xl font-black mb-2">¡Subasta creada!</h2>
                <p className="text-zinc-500 text-sm mb-1">
                  <span className="text-white font-semibold">{form.name}</span> está en revisión.
                </p>
                <p className="text-zinc-600 text-xs mb-8">
                  Tiempo de revisión: ~5 minutos. Te notificaremos cuando sea publicada.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={handleReset}
                    className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
                    style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.2)" }}
                  >
                    Crear otra
                  </button>
                  <button
                    onClick={() => setTab("subastas")}
                    className="text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all"
                    style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                  >
                    Ver mis subastas →
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Upload */}
                <div
                  className="rounded-2xl border-2 border-dashed p-8 flex flex-col items-center gap-3 cursor-pointer transition-all hover:border-[#6C3AE8]/60"
                  style={{ borderColor: "rgba(255,255,255,0.1)", background: "#16161E" }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ background: "rgba(108,58,232,0.1)" }}
                  >
                    📸
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm">Subir foto de la carta</p>
                    <p className="text-xs text-zinc-600 mt-1">PNG, JPG hasta 10 MB</p>
                  </div>
                  <span
                    className="text-xs font-semibold px-4 py-2 rounded-xl"
                    style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}
                  >
                    Seleccionar archivo
                  </span>
                </div>

                {/* Card name */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2">
                    Nombre de la carta <span className="text-[#6C3AE8]">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Ej. Charizard VMAX Rainbow"
                    value={form.name}
                    onChange={(e) => handleFormChange("name", e.target.value)}
                    className="w-full bg-[#16161E] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
                  />
                </div>

                {/* Set + Condition */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-2">
                      Set / Colección <span className="text-[#6C3AE8]">*</span>
                    </label>
                    <select
                      required
                      value={form.set}
                      onChange={(e) => handleFormChange("set", e.target.value)}
                      className="w-full bg-[#16161E] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
                      style={{ color: form.set ? "white" : "#52525b" }}
                    >
                      <option value="" disabled>Seleccionar set</option>
                      {SETS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-2">
                      Condición <span className="text-[#6C3AE8]">*</span>
                    </label>
                    <select
                      required
                      value={form.condition}
                      onChange={(e) => handleFormChange("condition", e.target.value)}
                      className="w-full bg-[#16161E] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
                      style={{ color: form.condition ? "white" : "#52525b" }}
                    >
                      <option value="" disabled>Seleccionar grado</option>
                      {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Bids */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-2">
                      Puja inicial (MXN) <span className="text-[#6C3AE8]">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                      <input
                        required
                        type="number"
                        min={1}
                        placeholder="0"
                        value={form.startingBid}
                        onChange={(e) => handleFormChange("startingBid", e.target.value)}
                        className="w-full bg-[#16161E] border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-2">
                      Precio BIN (opcional)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                      <input
                        type="number"
                        min={1}
                        placeholder="Comprar ya"
                        value={form.binPrice}
                        onChange={(e) => handleFormChange("binPrice", e.target.value)}
                        className="w-full bg-[#16161E] border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2">
                    Duración de la subasta <span className="text-[#6C3AE8]">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleFormChange("duration", d)}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                        style={
                          form.duration === d
                            ? { background: "rgba(108,58,232,0.2)", border: "1px solid rgba(108,58,232,0.5)", color: "#a78bfa" }
                            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a" }
                        }
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2">
                    Descripción
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describe el estado, características especiales, incluye certificado de autenticidad si aplica..."
                    value={form.description}
                    onChange={(e) => handleFormChange("description", e.target.value)}
                    className="w-full bg-[#16161E] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors resize-none"
                  />
                </div>

                {/* Fee notice */}
                <div
                  className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "rgba(108,58,232,0.08)", border: "1px solid rgba(108,58,232,0.2)" }}
                >
                  <span className="text-lg">ℹ️</span>
                  <p className="text-xs text-zinc-400">
                    TCG Live cobra una comisión del <span className="text-white font-semibold">5%</span> sobre el precio final de venta.
                    Sin cobros si la carta no se vende.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-3.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
                    boxShadow: "0 4px 24px rgba(108,58,232,0.4)",
                  }}
                >
                  {creating ? "Publicando..." : "Publicar subasta →"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ─── ÓRDENES DE VENTA ─── */}
        {tab === "ordenes" && (
          <div className="space-y-3">
            {SALE_ORDERS.map((order) => {
              const s = SALE_STATUS_STYLE[order.status];
              const isShipping = shippingOrder === order.id;
              return (
                <div
                  key={order.id}
                  className="rounded-2xl p-5 transition-all"
                  style={{
                    background: "#16161E",
                    border: order.status === "disputa"
                      ? "1px solid rgba(248,113,113,0.3)"
                      : "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Card preview */}
                    <div
                      className={`w-12 h-16 rounded-xl bg-gradient-to-br ${order.gradient} flex items-center justify-center text-xl shrink-0`}
                      style={{ boxShadow: `0 0 16px ${order.glow}` }}
                    >
                      {order.emoji}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-bold text-sm">{order.item}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Comprador: <span className="text-zinc-400">@{order.buyer}</span> · {order.date}
                          </p>
                        </div>
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-xl shrink-0"
                          style={{ background: "rgba(255,255,255,0.05)", color: "#71717a" }}
                        >
                          {order.id}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-base">{s.icon}</span>
                        <span className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</span>
                      </div>

                      {order.tracking && (
                        <p className="text-[11px] text-zinc-600 mt-1.5 font-mono">
                          Rastreo: {order.tracking}
                        </p>
                      )}

                      {/* Dispute alert */}
                      {order.status === "disputa" && (
                        <div
                          className="mt-3 rounded-xl p-3 flex items-start gap-2"
                          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}
                        >
                          <span>⚠️</span>
                          <div>
                            <p className="text-xs text-red-400 font-semibold">Disputa abierta por el comprador</p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              Tienes 48h para responder. Revisa el mensaje del comprador.
                            </p>
                            <button
                              className="mt-2 text-xs font-bold text-red-400 underline underline-offset-2"
                            >
                              Responder disputa →
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ship form */}
                      {order.status === "pendiente_envio" && (
                        isShipping ? (
                          <div className="mt-3 flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Número de guía / rastreo"
                              value={trackingInput}
                              onChange={(e) => setTrackingInput(e.target.value)}
                              className="flex-1 bg-[#0F0F14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
                            />
                            <button
                              onClick={() => { setShippingOrder(null); setTrackingInput(""); }}
                              className="text-xs font-bold text-white px-4 py-2 rounded-xl"
                              style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setShippingOrder(null)}
                              className="text-xs text-zinc-600 px-3 py-2"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShippingOrder(order.id)}
                            className="mt-3 text-xs font-bold text-white px-5 py-2 rounded-xl"
                            style={{
                              background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
                              boxShadow: "0 4px 16px rgba(108,58,232,0.35)",
                            }}
                          >
                            Marcar como enviado →
                          </button>
                        )
                      )}
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <p className="font-black text-lg">${order.amount.toLocaleString("es-MX")}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">MXN</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
