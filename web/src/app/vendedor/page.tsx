"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
type AuctionStatus = "live" | "ending" | "upcoming" | "ended";
import { useAuth } from "@/contexts/auth";
import { auctionsApi, ordersApi, listingsApi, type ApiAuction, type ApiOrder, type SellerStats, type ApiListing } from "@/lib/api";

const CLOUDINARY_CLOUD  = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dsjhoj5wt";
const CLOUDINARY_PRESET = "tcg_live";

async function uploadToCloudinary(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET);
  form.append("folder", "tcg-live/auction-items");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (!data.secure_url) throw new Error("Error al subir imagen");
  return data.secure_url as string;
}

type Tab = "dashboard" | "subastas" | "crear" | "ventas" | "ordenes";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard"        },
  { key: "subastas",  label: "Mis Subastas"     },
  { key: "crear",     label: "Crear Subasta"    },
  { key: "ventas",    label: "Mis Ventas"        },
  { key: "ordenes",   label: "Órdenes de Venta" },
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


interface AuctionForm {
  name: string;
  set: string;
  condition: string;
  startingBid: string;
  binPrice: string;
  duration: string;
  description: string;
  imageUrl: string;
}

const EMPTY_FORM: AuctionForm = {
  name: "", set: "", condition: "", startingBid: "",
  binPrice: "", duration: "", description: "", imageUrl: "",
};

export default function VendedorPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [form, setForm] = useState<AuctionForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [saleFilter, setSaleFilter] = useState<AuctionStatus | "all">("all");
  const [shippingOrder, setShippingOrder] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [creating,      setCreating]      = useState(false);
  const [createError,   setCreateError]   = useState("");
  const [uploadingImg,  setUploadingImg]  = useState(false);
  const [startingId,    setStartingId]    = useState<string | null>(null);

  // Ventas (listings)
  const [myListings,      setMyListings]      = useState<ApiListing[] | null>(null);
  const [listingForm,     setListingForm]     = useState({ title: "", price: "", game: "", condition: "", description: "", imageUrl: "" });
  const [listingUploading, setListingUploading] = useState(false);
  const [listingCreating,  setListingCreating]  = useState(false);
  const [listingError,     setListingError]     = useState("");
  const [listingDone,      setListingDone]      = useState(false);

  // Real API data
  const [myAuctions,   setMyAuctions]   = useState<ApiAuction[]>([]);
  const [sellerStats,  setSellerStats]  = useState<SellerStats | null>(null);
  const [sellerOrders, setSellerOrders] = useState<ApiOrder[] | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      auctionsApi.my().catch(() => null),
      ordersApi.sellerStats().catch(() => null),
      ordersApi.selling().catch(() => null),
      listingsApi.my().catch(() => null),
    ]).then(([auctionsRes, statsRes, ordersRes, listingsRes]) => {
      if (auctionsRes)  setMyAuctions(auctionsRes.data);
      if (statsRes)     setSellerStats(statsRes.data);
      if (ordersRes)    setSellerOrders(ordersRes.data);
      if (listingsRes)  setMyListings(listingsRes.data);
    });
  }, [user]);

  async function handleImageUpload(file: File) {
    setUploadingImg(true);
    try {
      const url = await uploadToCloudinary(file);
      setForm(f => ({ ...f, imageUrl: url }));
    } catch {
      setCreateError("Error al subir imagen. Intenta de nuevo.");
    } finally {
      setUploadingImg(false);
    }
  }

  const filteredAuctions =
    saleFilter === "all"
      ? myAuctions
      : myAuctions.filter((a) => a.status === saleFilter);

  function handleFormChange(field: keyof AuctionForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    if (!form.name || !form.condition || !form.startingBid) {
      setCreateError("Completa todos los campos obligatorios.");
      return;
    }
    setCreating(true);
    try {
      await auctionsApi.create({
        title: form.name,
        description: form.description || undefined,
        items: [{
          cardName:     form.name,
          cardSet:      form.set || undefined,
          condition:    form.condition || undefined,
          startingPrice: Number(form.startingBid), // MXN pesos
          binPrice:      form.binPrice ? Number(form.binPrice) : undefined,
          imageUrls:     form.imageUrl ? [form.imageUrl] : undefined,
        }],
      });
      setSubmitted(true);
      // Refresh auctions list
      auctionsApi.my().then(r => setMyAuctions(r.data)).catch(() => {});
    } catch (err: any) {
      setCreateError(err?.response?.data?.message ?? "Error al crear la subasta. Verifica tus datos.");
    } finally {
      setCreating(false);
    }
  }

  function handleReset() {
    setForm(EMPTY_FORM);
    setSubmitted(false);
  }

  async function handleListingImageUpload(file: File) {
    setListingUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", CLOUDINARY_PRESET);
      form.append("folder", "tcg-live/listings");
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!data.secure_url) throw new Error();
      setListingForm(f => ({ ...f, imageUrl: data.secure_url }));
    } catch {
      setListingError("Error al subir imagen.");
    } finally {
      setListingUploading(false);
    }
  }

  async function handleListingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setListingError("");
    if (!listingForm.title || !listingForm.price || !listingForm.condition) {
      setListingError("Completa los campos obligatorios.");
      return;
    }
    setListingCreating(true);
    try {
      await listingsApi.create({
        title:       listingForm.title,
        price:       Math.round(Number(listingForm.price) * 100), // pesos → centavos
        game:        listingForm.game || undefined,
        condition:   listingForm.condition || undefined,
        description: listingForm.description || undefined,
        imageUrls:   listingForm.imageUrl ? [listingForm.imageUrl] : undefined,
      });
      setListingDone(true);
      const res = await listingsApi.my().catch(() => null);
      if (res) setMyListings(res.data);
    } catch (err: any) {
      setListingError(err?.response?.data?.message ?? "Error al publicar la venta.");
    } finally {
      setListingCreating(false);
    }
  }

  const totalRevenue = sellerStats?.totalRevenue ?? 0;

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
                <h1 className="text-2xl font-black">{user?.username ?? "—"}</h1>
                {user?.role === "SELLER" && <span className="text-[#a78bfa] text-sm">✓ Verificado</span>}
              </div>
              <p className="text-zinc-500 text-sm mt-0.5">Panel de vendedor</p>

              <div className="flex flex-wrap items-center gap-5 mt-4">
                {[
                  { label: "Subastas activas", value: sellerStats?.activeAuctions ?? myAuctions.filter(a => a.status === "live").length },
                  { label: "Total vendido",    value: `$${totalRevenue.toLocaleString("es-MX")} MXN` },
                  { label: "Pendientes envío", value: sellerStats?.pendingOrders ?? (sellerOrders?.filter(o => o.status === "pending" || o.status === "pendiente_pago").length ?? 0) },
                  { label: "Mis subastas",     value: myAuctions.length },
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
              const pendingOrdersCount = t.key === "ordenes" ? (sellerOrders?.filter(o => o.status === "pending" || o.status === "pendiente_pago").length ?? 0) : 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold whitespace-nowrap transition-all border-b-2"
                  style={active ? { color: "#a78bfa", borderColor: "#6C3AE8", background: "rgba(108,58,232,0.08)" } : { color: "#71717a", borderColor: "transparent" }}
                >
                  {t.label}
                  {pendingOrdersCount > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center" style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}>
                      {pendingOrdersCount}
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
              {[
                {
                  label: "Ingresos totales",
                  value: `$${(totalRevenue).toLocaleString("es-MX")}`,
                  sub: "MXN",
                  icon: "💰",
                },
                {
                  label: "Subastas activas",
                  value: sellerStats?.activeAuctions ?? myAuctions.filter(a => a.status === "live" || a.status === "ending").length,
                  sub: "en curso",
                  icon: "⚡",
                },
                {
                  label: "Pendientes de envío",
                  value: sellerStats?.pendingOrders ?? (sellerOrders?.filter(o => o.status === "pending" || o.status === "confirmed").length ?? 0),
                  sub: "por enviar",
                  icon: "📦",
                },
                {
                  label: "Mis subastas",
                  value: myAuctions.length,
                  sub: "historial total",
                  icon: "🏷",
                },
              ].map((s) => (
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
                      className="mt-4 w-full flex items-center justify-center gap-2 text-xs font-black text-white py-2.5 rounded-xl transition-all"
                      style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", boxShadow: "0 4px 16px rgba(220,38,38,0.35)" }}
                    >
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      Ir al stream →
                    </Link>
                  </div>
                ))}
              </div>

              {/* Órdenes recientes */}
              <div
                className="rounded-2xl p-5"
                style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <h3 className="font-bold text-sm mb-4">Órdenes recientes</h3>
                {(sellerOrders ?? []).length === 0 ? (
                  <p className="text-xs text-zinc-600 text-center py-6">Sin órdenes aún</p>
                ) : (
                  <div className="space-y-3">
                    {(sellerOrders ?? []).slice(0, 5).map((o) => {
                      const statusIcon: Record<string, string> = { pending: "⏳", confirmed: "✓", shipped: "🚚", delivered: "✅" };
                      return (
                        <div key={o.id} className="flex items-start gap-3">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                            {statusIcon[o.status] ?? "📋"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs leading-snug">
                              {o.items?.[0]?.cardName ?? "Carta"} — ${o.totalAmount.toLocaleString("es-MX")} MXN
                            </p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">
                              @{o.buyer?.username ?? "comprador"} · {new Date(o.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Revenue summary */}
            <div
              className="rounded-2xl p-5"
              style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-sm">Resumen de ventas</h3>
                <span className="text-xs text-zinc-500">Total acumulado</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Ingresos totales", value: `$${totalRevenue.toLocaleString("es-MX")} MXN`, color: "#a78bfa" },
                  { label: "Órdenes totales",  value: sellerOrders?.length ?? 0,                       color: "#4ade80" },
                  { label: "Subastas totales", value: myAuctions.length,                               color: "#60a5fa" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[11px] text-zinc-500 mt-1">{s.label}</p>
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
                        {a.status === "upcoming" && (
                          <button
                            disabled={startingId === a.id}
                            onClick={async () => {
                              setStartingId(a.id);
                              try {
                                await auctionsApi.start(a.id);
                                const res = await auctionsApi.my().catch(() => null);
                                if (res) setMyAuctions(res.data);
                              } catch {}
                              finally { setStartingId(null); }
                            }}
                            className="text-xs font-black px-3 py-1.5 rounded-lg text-white text-center disabled:opacity-60"
                            style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}
                          >
                            {startingId === a.id ? "..." : "Iniciar"}
                          </button>
                        )}
                        {(a.status === "live" || a.status === "ending") && (
                          <Link
                            href={`/auctions/${a.id}`}
                            className="text-xs font-black px-3 py-1.5 rounded-lg text-white text-center flex items-center gap-1"
                            style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", boxShadow: "0 0 12px rgba(220,38,38,0.4)" }}
                          >
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                            Stream
                          </Link>
                        )}
                        <Link
                          href={`/auctions/${a.id}`}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-center transition-all"
                          style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.2)" }}
                        >
                          Ver
                        </Link>
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

                {createError && (
                  <div className="px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                    {createError}
                  </div>
                )}

                {/* Upload */}
                <label
                  className="rounded-2xl border-2 border-dashed p-8 flex flex-col items-center gap-3 cursor-pointer transition-all hover:border-[#6C3AE8]/60 block"
                  style={{ borderColor: form.imageUrl ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.1)", background: "#16161E" }}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                  />
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="carta" className="w-24 h-32 object-contain rounded-xl" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "rgba(108,58,232,0.1)" }}>
                      📸
                    </div>
                  )}
                  <div className="text-center">
                    <p className="font-semibold text-sm">
                      {uploadingImg ? "Subiendo imagen..." : form.imageUrl ? "✓ Imagen subida — clic para cambiar" : "Subir foto de la carta"}
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">PNG, JPG hasta 10 MB</p>
                  </div>
                  {!form.imageUrl && !uploadingImg && (
                    <span className="text-xs font-semibold px-4 py-2 rounded-xl" style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}>
                      Seleccionar archivo
                    </span>
                  )}
                </label>

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

        {/* ─── MIS VENTAS ─── */}
        {tab === "ventas" && (
          <div className="space-y-6">

            {/* Crear nueva venta */}
            {!listingDone ? (
              <div className="rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                <h3 className="font-black text-base mb-5">Nueva venta (precio fijo)</h3>

                {listingError && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                    {listingError}
                  </div>
                )}

                <form onSubmit={handleListingSubmit} className="space-y-4">
                  {/* Image upload */}
                  <label className="rounded-xl border-2 border-dashed p-5 flex items-center gap-4 cursor-pointer transition-all hover:border-[#6C3AE8]/50 block"
                    style={{ borderColor: listingForm.imageUrl ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.1)" }}>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleListingImageUpload(f); }} />
                    {listingForm.imageUrl
                      ? <img src={listingForm.imageUrl} alt="" className="w-16 h-20 object-contain rounded-lg shrink-0" />
                      : <div className="w-16 h-20 rounded-lg flex items-center justify-center text-2xl shrink-0" style={{ background: "rgba(108,58,232,0.1)" }}>📸</div>
                    }
                    <div>
                      <p className="text-sm font-semibold">{listingUploading ? "Subiendo..." : listingForm.imageUrl ? "✓ Imagen lista — clic para cambiar" : "Subir foto de la carta"}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">PNG, JPG hasta 10 MB</p>
                    </div>
                  </label>

                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Nombre de la carta *</label>
                    <input required value={listingForm.title} onChange={e => setListingForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Ej. Charizard EX Rainbow Rare"
                      className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60" />
                  </div>

                  {/* Price + Condition */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Precio (MXN) *</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                        <input required type="number" min={1} value={listingForm.price}
                          onChange={e => setListingForm(f => ({ ...f, price: e.target.value }))}
                          placeholder="0"
                          className="w-full bg-[#0F0F14] border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Condición *</label>
                      <select required value={listingForm.condition} onChange={e => setListingForm(f => ({ ...f, condition: e.target.value }))}
                        className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#6C3AE8]/60"
                        style={{ color: listingForm.condition ? "white" : "#52525b" }}>
                        <option value="" disabled>Seleccionar</option>
                        {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Game */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Juego</label>
                    <input value={listingForm.game} onChange={e => setListingForm(f => ({ ...f, game: e.target.value }))}
                      placeholder="Pokémon, Magic, Yu-Gi-Oh!..."
                      className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60" />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Descripción</label>
                    <textarea rows={3} value={listingForm.description} onChange={e => setListingForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Estado, características, incluye sleeve, etc..."
                      className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 resize-none" />
                  </div>

                  <button type="submit" disabled={listingCreating}
                    className="w-full py-3.5 rounded-xl font-black text-white text-sm disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #059669, #10b981)", boxShadow: "0 4px 20px rgba(5,150,105,0.35)" }}>
                    {listingCreating ? "Publicando..." : "Publicar venta →"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="rounded-2xl p-8 text-center" style={{ background: "#16161E", border: "1px solid rgba(74,222,128,0.3)" }}>
                <p className="text-3xl mb-3">✅</p>
                <h3 className="font-black text-lg mb-1">¡Venta publicada!</h3>
                <p className="text-zinc-500 text-sm mb-6">Ya aparece en la tienda para que los compradores la vean.</p>
                <button onClick={() => { setListingDone(false); setListingForm({ title: "", price: "", game: "", condition: "", description: "", imageUrl: "" }); }}
                  className="font-bold text-sm px-6 py-3 rounded-xl text-white"
                  style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                  Publicar otra venta
                </button>
              </div>
            )}

            {/* Mis ventas activas */}
            {(myListings ?? []).length > 0 && (
              <div>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Mis ventas activas</p>
                <div className="space-y-3">
                  {(myListings ?? []).map(l => (
                    <div key={l.id} className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      {l.imageUrls?.[0]
                        ? <img src={l.imageUrls[0]} alt="" className="w-12 h-16 object-contain rounded-xl shrink-0" />
                        : <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0">🃏</div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{l.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{l.game ?? ""} {l.condition ? `· ${l.condition}` : ""}</p>
                        <span className="mt-1.5 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: l.status === "active" ? "rgba(74,222,128,0.12)" : "rgba(113,113,122,0.12)", color: l.status === "active" ? "#4ade80" : "#71717a" }}>
                          {l.status === "active" ? "Activa" : l.status === "sold" ? "Vendida" : "Cancelada"}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-lg">${((l.price ?? 0) / 100).toLocaleString("es-MX")}</p>
                        <p className="text-[10px] text-zinc-600">MXN</p>
                      </div>
                      {l.status === "active" && (
                        <button onClick={async () => {
                          await listingsApi.cancel(l.id).catch(() => {});
                          const res = await listingsApi.my().catch(() => null);
                          if (res) setMyListings(res.data);
                        }} className="text-xs text-zinc-600 hover:text-red-400 transition-colors shrink-0 px-2">
                          Cancelar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── ÓRDENES DE VENTA ─── */}
        {tab === "ordenes" && (
          <div className="space-y-3">
            {sellerOrders === null && (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 rounded-full border-2 border-[#6C3AE8] border-t-transparent animate-spin" />
              </div>
            )}
            {sellerOrders !== null && sellerOrders.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-zinc-400 font-medium">Sin órdenes de venta aún</p>
                <p className="text-xs text-zinc-600 mt-1">Las órdenes aparecerán aquí cuando terminen tus subastas</p>
              </div>
            )}
            {(sellerOrders ?? []).map((order) => {
              const statusKey = order.status as keyof typeof SALE_STATUS_STYLE;
              const s = SALE_STATUS_STYLE[statusKey] ?? { label: order.status, color: "#71717a", icon: "📋" };
              const isShipping = shippingOrder === order.id;
              const cardName = order.items?.[0]?.cardName ?? "Carta";
              const amount   = order.items?.reduce((sum, i) => sum + (i.finalPrice ?? 0), 0) ?? order.totalAmount ?? 0;
              const isPending = order.status === "pending" || order.status === "pendiente_pago" || order.status === "pending_payment";
              const isShipped = order.status === "shipped" || order.status === "en_camino";
              const date = new Date(order.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
              return (
                <div
                  key={order.id}
                  className="rounded-2xl p-5 transition-all"
                  style={{
                    background: "#16161E",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0" style={{ boxShadow: "0 0 16px rgba(139,92,246,0.4)" }}>
                      🃏
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-bold text-sm">{cardName}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Comprador: <span className="text-zinc-400">@{order.buyer?.username ?? "—"}</span> · {date}
                          </p>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-xl shrink-0" style={{ background: "rgba(255,255,255,0.05)", color: "#71717a" }}>
                          {order.id.slice(0, 8)}…
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-base">{s.icon}</span>
                        <span className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</span>
                      </div>

                      {order.trackingNumber && (
                        <p className="text-[11px] text-zinc-600 mt-1.5 font-mono">Rastreo: {order.trackingNumber}</p>
                      )}

                      {/* Marcar como enviado */}
                      {isPending && (
                        isShipping ? (
                          <div className="mt-3 flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Número de guía / rastreo"
                              value={trackingInput}
                              onChange={e => setTrackingInput(e.target.value)}
                              className="flex-1 bg-[#0F0F14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60"
                            />
                            <button
                              onClick={async () => {
                                if (trackingInput.trim()) {
                                  await ordersApi.updateStatus(order.id, "shipped").catch(() => {});
                                  const refreshed = await ordersApi.selling().catch(() => null);
                                  if (refreshed) setSellerOrders(refreshed.data);
                                }
                                setShippingOrder(null);
                                setTrackingInput("");
                              }}
                              className="text-xs font-bold text-white px-4 py-2 rounded-xl"
                              style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                            >
                              Confirmar
                            </button>
                            <button onClick={() => setShippingOrder(null)} className="text-xs text-zinc-600 px-3 py-2">
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShippingOrder(order.id)}
                            className="mt-3 text-xs font-bold text-white px-5 py-2 rounded-xl"
                            style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 4px 16px rgba(108,58,232,0.35)" }}
                          >
                            Marcar como enviado →
                          </button>
                        )
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-black text-lg">${amount.toLocaleString("es-MX")}</p>
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
