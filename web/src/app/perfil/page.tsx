"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { ordersApi, auctionsApi, paymentsApi, watchlistApi, messagesApi, sellerApplicationsApi, sellerDocumentsApi, type ApiOrder, type ApiBid, type WatchlistItem, type MessageThread, type SellerApplication, type SellerDocumentRecord } from "@/lib/api";
import { MY_ORDERS, type Order } from "@/lib/mock-data";

type Tab = "ordenes" | "watchlist" | "mensajes";

const TABS: { key: Tab; label: string }[] = [
  { key: "ordenes",   label: "Mis Órdenes" },
  { key: "watchlist", label: "Watchlist"   },
  { key: "mensajes",  label: "Mensajes"    },
];

const BID_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  ganando:   { label: "Ganando",   color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  perdiendo: { label: "Perdiendo", color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  ganada:    { label: "Ganada",    color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  perdida:   { label: "Perdida",   color: "#71717a", bg: "rgba(113,113,122,0.1)" },
  active:    { label: "Activa",    color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  won:       { label: "Ganada",    color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  lost:      { label: "Perdida",   color: "#71717a", bg: "rgba(113,113,122,0.1)" },
};

const ORDER_STATUS: Record<string, { label: string; icon: string; color: string }> = {
  pending_payment: { label: "Pendiente de pago", icon: "⏳", color: "#f59e0b" },
  pendiente_pago:  { label: "Pendiente de pago", icon: "⏳", color: "#f59e0b" },
  processing:      { label: "Procesando",         icon: "🔄", color: "#60a5fa" },
  shipped:         { label: "En camino",           icon: "🚚", color: "#a78bfa" },
  en_camino:       { label: "En camino",           icon: "🚚", color: "#a78bfa" },
  delivered:       { label: "Entregado",           icon: "✅", color: "#4ade80" },
  entregado:       { label: "Entregado",           icon: "✅", color: "#4ade80" },
};


const PAYMENTS_ENABLED = false;

const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "dsjhoj5wt";
const CLOUDINARY_PRESET = "tcg_live";

async function uploadToCloudinary(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET);
  form.append("folder", "tcg-live/seller-docs");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (!data.secure_url) throw new Error("Error al subir archivo");
  return data.secure_url as string;
}

const REQUIRED_DOCS: { type: string; label: string; hint: string; needsDate: boolean }[] = [
  { type: "identificacion",       label: "Identificación Oficial",          hint: "INE o Pasaporte vigente",                        needsDate: false },
  { type: "curp",                 label: "CURP",                            hint: "Documento CURP actualizado",                     needsDate: false },
  { type: "constancia_fiscal",    label: "Constancia de Situación Fiscal",  hint: "Del SAT, debe ser del mes en curso",              needsDate: true  },
  { type: "opinion_cumplimiento", label: "Opinión de Cumplimiento SAT",     hint: "Positiva, del mes en curso",                     needsDate: true  },
  { type: "comprobante_domicilio",label: "Comprobante de Domicilio",        hint: "Máximo 3 meses de antigüedad (luz, agua, etc.)", needsDate: true  },
  { type: "cuenta_bancaria",      label: "Cuenta Bancaria / CLABE",         hint: "Estado de cuenta o carátula con CLABE interbancaria", needsDate: false },
];

const ESTADOS_MX = ["Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Ciudad de México","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas"];

async function initiateCheckout(orderId: string) {
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? window.location.origin;
  const { data } = await paymentsApi.checkout(orderId, {
    success: `${webUrl}/pago/exitoso`,
    failure: `${webUrl}/pago/error`,
    pending: `${webUrl}/pago/pendiente`,
  });
  window.location.href = data.initPoint;
}

export default function PerfilPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ordenes");

  // Real data
  const [realOrders,    setRealOrders]    = useState<ApiOrder[]      | null>(null);
  const [realBids,      setRealBids]      = useState<ApiBid[]        | null>(null);
  const [realWatchlist, setRealWatchlist] = useState<WatchlistItem[] | null>(null);
  const [realMessages,  setRealMessages]  = useState<MessageThread[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  // Seller application
  const [application, setApplication]       = useState<SellerApplication | null | undefined>(undefined);
  const [showSellerModal, setShowSellerModal] = useState(false);
  const [sellerStep, setSellerStep]           = useState<1 | 2>(1);
  const [sellerForm, setSellerForm]           = useState({ fullName: "", state: "", description: "" });
  const [docFiles, setDocFiles]               = useState<Record<string, File | null>>({});
  const [docDates, setDocDates]               = useState<Record<string, string>>({});
  const [docUrls, setDocUrls]                 = useState<Record<string, string>>({});
  const [docUploading, setDocUploading]       = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting]           = useState(false);
  const [sellerError, setSellerError]         = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setDataLoading(true);
    Promise.all([
      ordersApi.my().catch(() => null),
      auctionsApi.myBids().catch(() => null),
      watchlistApi.my().catch(() => null),
      messagesApi.threads().catch(() => null),
      sellerApplicationsApi.myApplication().catch(() => null),
    ]).then(([ordersRes, bidsRes, watchlistRes, messagesRes, appRes]) => {
      if (ordersRes)    setRealOrders(ordersRes.data);
      if (bidsRes)      setRealBids(bidsRes.data);
      if (watchlistRes) setRealWatchlist(watchlistRes.data);
      if (messagesRes)  setRealMessages(messagesRes.data);
      setApplication(appRes?.data ?? null);
    }).finally(() => setDataLoading(false));
  }, [user]);

  async function handleDocFile(type: string, file: File) {
    setDocFiles(p => ({ ...p, [type]: file }));
    setDocUploading(p => ({ ...p, [type]: true }));
    try {
      const url = await uploadToCloudinary(file);
      setDocUrls(p => ({ ...p, [type]: url }));
    } catch {
      setSellerError("Error al subir archivo. Intenta de nuevo.");
    } finally {
      setDocUploading(p => ({ ...p, [type]: false }));
    }
  }

  async function handleSellerSubmit() {
    setSellerError("");
    const missing = REQUIRED_DOCS.filter(d => !docUrls[d.type]);
    if (missing.length) { setSellerError(`Falta subir: ${missing.map(d => d.label).join(", ")}`); return; }
    const missingDates = REQUIRED_DOCS.filter(d => d.needsDate && !docDates[d.type]);
    if (missingDates.length) { setSellerError(`Falta la fecha de emisión de: ${missingDates.map(d => d.label).join(", ")}`); return; }
    setSubmitting(true);
    try {
      for (const doc of REQUIRED_DOCS) {
        await sellerDocumentsApi.uploadFromUrl(doc.type, docUrls[doc.type], docDates[doc.type]);
      }
      const { data } = await sellerApplicationsApi.apply(sellerForm);
      setApplication(data);
      setShowSellerModal(false);
    } catch (e: any) {
      setSellerError(e?.response?.data?.message ?? "Error al enviar solicitud. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckout(orderId: string) {
    setCheckingOut(orderId);
    try {
      await initiateCheckout(orderId);
    } catch {
      setCheckingOut(null);
    }
  }

  if (authLoading || !user) return null;

  const initials = user.username.slice(0, 2).toUpperCase();
  const orders: Order[] = realOrders
    ? realOrders.map((o) => ({
        id: o.id,
        item: o.items?.[0]?.cardName ?? "Carta",
        emoji: "🃏",
        gradient: "from-violet-600 to-indigo-800",
        glow: "rgba(139,92,246,0.4)",
        amount: o.totalAmount,
        status: (o.status as Order["status"]) ?? "pendiente_pago",
        date: new Date(o.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }),
        seller: o.seller?.username ?? "—",
        tracking: o.trackingNumber,
      }))
    : MY_ORDERS;

  const bidsCount = realBids?.length ?? 0;
  const tabCounts: Record<Tab, number | undefined> = {
    ordenes:   orders.length + bidsCount,
    watchlist: realWatchlist?.length ?? 0,
    mensajes:  realMessages?.reduce((n, m) => n + (m.unreadCount ?? 0), 0) || undefined,
  };

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      <div className="pt-24 pb-0 border-b border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="relative shrink-0">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black"
                style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 0 32px rgba(108,58,232,0.5)" }}
              >
                {initials}
              </div>
              <span
                className="absolute -bottom-1.5 -right-1.5 text-[10px] font-black px-2 py-0.5 rounded-full border border-[#0F0F14]"
                style={{ background: "#6C3AE8" }}
              >
                {user.role === "SELLER" ? "Vendedor" : "Comprador"}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black">{user.username}</h1>
              <p className="text-zinc-500 text-sm mt-0.5">@{user.username} · {user.email}</p>
              <div className="flex flex-wrap items-center gap-5 mt-4">
                {[
                  { label: "Pujas activas", value: realBids?.filter(b => b.status === "active").length ?? 0 },
                  { label: "Órdenes",       value: orders.length                                            },
                  { label: "Watchlist",     value: realWatchlist?.length ?? 0                               },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xl font-black">{s.value}</p>
                    <p className="text-[11px] text-zinc-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href="/ajustes"
              className="shrink-0 text-sm font-semibold text-zinc-400 hover:text-white px-4 py-2 rounded-xl transition-all border border-white/10 hover:border-white/20"
            >
              ⚙ Ajustes
            </Link>
            {user.role === "SELLER" && (
              <Link
                href="/vendedor"
                className="shrink-0 text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all"
                style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
              >
                Mi tienda →
              </Link>
            )}
            {user.role === "BUYER" && application === null && (
              <button
                onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                className="shrink-0 text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all"
                style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
              >
                Vender en TCG Live →
              </button>
            )}
            {user.role === "BUYER" && application?.status === "pending" && (
              <div className="shrink-0 text-xs font-bold px-4 py-2.5 rounded-xl" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}>
                ⏳ Solicitud en revisión
              </div>
            )}
            {user.role === "BUYER" && application?.status === "rejected" && (
              <button
                onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                className="shrink-0 text-xs font-bold px-4 py-2.5 rounded-xl"
                style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}
              >
                Solicitud rechazada — volver a intentar
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 mt-8 overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.key;
              const count  = tabCounts[t.key];
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
                  {count !== undefined && count > 0 && (
                    <span
                      className="text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                      style={active ? { background: "rgba(108,58,232,0.3)", color: "#a78bfa" } : { background: "rgba(255,255,255,0.07)", color: "#71717a" }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {dataLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-[#6C3AE8] border-t-transparent animate-spin" />
          </div>
        )}

        {/* ── BANNER VENDEDOR ── */}
        {!dataLoading && user.role === "BUYER" && (
          <div className="mb-6">
            {application === null && (
              <div className="rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
                style={{ background: "linear-gradient(135deg, rgba(5,150,105,0.15), rgba(16,185,129,0.08))", border: "1px solid rgba(16,185,129,0.25)" }}>
                <div>
                  <p className="font-black text-base">¿Quieres vender en TCG Live?</p>
                  <p className="text-sm text-zinc-400 mt-0.5">Solicita tu cuenta de vendedor — revisamos tu solicitud en 1-3 días hábiles.</p>
                </div>
                <button onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                  className="shrink-0 font-black text-white px-6 py-3 rounded-xl text-sm"
                  style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                  Solicitar ahora →
                </button>
              </div>
            )}
            {application?.status === "pending" && (
              <div className="rounded-2xl p-4 flex items-center gap-3"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <span className="text-xl">⏳</span>
                <div>
                  <p className="font-bold text-sm">Solicitud de vendedor en revisión</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Te notificaremos cuando sea aprobada.</p>
                </div>
              </div>
            )}
            {application?.status === "rejected" && (
              <div className="rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap"
                style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                <div>
                  <p className="font-bold text-sm text-red-400">Solicitud rechazada</p>
                  {application.reviewNote && <p className="text-xs text-zinc-500 mt-0.5">{application.reviewNote}</p>}
                </div>
                <button onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                  className="shrink-0 text-xs font-bold px-4 py-2 rounded-xl"
                  style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                  Volver a solicitar
                </button>
              </div>
            )}
          </div>
        )}

        {!dataLoading && (
          <>
            {/* ── MIS ÓRDENES + PUJAS ── */}
            {tab === "ordenes" && (
              <div className="space-y-3">

                {/* Pujas activas */}
                {realBids && realBids.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1 pt-2">Mis Pujas</p>
                    {realBids.map((bid) => {
                      const status = BID_STATUS[bid.status ?? "active"];
                      const isActive = bid.status === "active" || bid.status === "ganando";
                      return (
                        <div key={bid.id} className="flex items-center gap-4 rounded-2xl p-4" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0" style={{ boxShadow: "0 0 16px rgba(139,92,246,0.4)" }}>
                            🃏
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{bid.item?.cardName ?? bid.auction?.title ?? "Carta"}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{bid.item?.condition ?? ""}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: status?.bg, color: status?.color }}>
                                {status?.label ?? bid.status}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] text-zinc-600 mb-0.5">Mi puja</p>
                            <p className="font-black text-base">${bid.amount.toLocaleString("es-MX")}</p>
                          </div>
                          {isActive && bid.auction && (
                            <Link href={`/auctions/${bid.auction.id}`} className="shrink-0 text-xs font-bold text-white px-4 py-2 rounded-xl" style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}>
                              Pujar →
                            </Link>
                          )}
                        </div>
                      );
                    })}
                    {orders.length > 0 && (
                      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-1 pt-4">Órdenes</p>
                    )}
                  </>
                )}

                {/* Órdenes */}
                {orders.map((order) => {
                  const s = ORDER_STATUS[order.status] ?? { label: order.status, icon: "📋", color: "#71717a" };
                  const isPending = order.status === "pendiente_pago" || order.status === "pending_payment";
                  return (
                    <div key={order.id} className="rounded-2xl p-5" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-16 rounded-xl bg-gradient-to-br ${order.gradient} flex items-center justify-center text-xl shrink-0`} style={{ boxShadow: `0 0 16px ${order.glow}` }}>
                          {order.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-bold text-sm">{order.item}</p>
                            <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", color: "#71717a" }}>
                              {typeof order.id === "string" && order.id.length > 12 ? order.id.slice(0, 8) + "…" : order.id}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">Vendedor: {order.seller} · {order.date}</p>
                          <div className="flex items-center gap-2 mt-3">
                            <span className="text-base">{s.icon}</span>
                            <span className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</span>
                          </div>
                          {order.tracking && (
                            <p className="text-[11px] text-zinc-600 mt-1.5 font-mono">Rastreo: {order.tracking}</p>
                          )}
                          {isPending && (
                            PAYMENTS_ENABLED ? (
                              <button
                                onClick={() => handleCheckout(order.id)}
                                disabled={checkingOut === order.id}
                                className="mt-3 text-xs font-bold text-white px-4 py-2 rounded-xl disabled:opacity-60"
                                style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 4px 16px rgba(108,58,232,0.35)" }}
                              >
                                {checkingOut === order.id ? "Redirigiendo..." : `Pagar ahora — $${order.amount.toLocaleString("es-MX")} MXN`}
                              </button>
                            ) : (
                              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500 px-1">
                                <span>🔒</span>
                                <span>Pago en línea próximamente — te contactaremos para coordinar</span>
                              </div>
                            )
                          )}
                        </div>
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

            {/* ── WATCHLIST ── */}
            {tab === "watchlist" && (
              <div className="grid sm:grid-cols-2 gap-4">
                {(realWatchlist ?? []).length === 0 ? (
                  <div className="col-span-2 text-center py-16">
                    <p className="text-3xl mb-3">♡</p>
                    <p className="text-zinc-400 font-medium">Sin items en tu watchlist</p>
                    <p className="text-xs text-zinc-600 mt-1">Guarda subastas para no perderlas</p>
                  </div>
                ) : (realWatchlist ?? []).map((w) => {
                  const a = w.auction;
                  if (!a) return null;
                  return (
                    <Link key={w.id} href={`/auctions/${a.id}`}>
                      <div className="rounded-2xl p-4 flex items-center gap-4 hover:border-[#6C3AE8]/30 transition-all cursor-pointer" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0" style={{ boxShadow: "0 0 16px rgba(139,92,246,0.4)" }}>
                          🃏
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{a.title ?? a.name ?? "Subasta"}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{a.game ?? ""}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                              SUBASTA
                            </span>
                            <span className="text-xs font-black">
                              ${(a.currentBid ?? a.startingBid ?? 0).toLocaleString("es-MX")}{" "}
                              <span className="text-zinc-600 font-normal text-[10px]">MXN</span>
                            </span>
                          </div>
                        </div>
                        <button onClick={(e) => e.preventDefault()} className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors text-lg">♡</button>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* ── MENSAJES ── */}
            {tab === "mensajes" && (
              <div className="space-y-2">
                {(realMessages ?? []).length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-3xl mb-3">💬</p>
                    <p className="text-zinc-400 font-medium">Sin mensajes aún</p>
                    <p className="text-xs text-zinc-600 mt-1">Los mensajes con vendedores aparecerán aquí</p>
                  </div>
                ) : (realMessages ?? []).map((msg) => {
                  const initials = (msg.otherUser?.username ?? "?").slice(0, 2).toUpperCase();
                  const hasUnread = (msg.unreadCount ?? 0) > 0;
                  return (
                    <div key={msg.id} className="flex items-center gap-4 rounded-2xl p-4 hover:border-[#6C3AE8]/20 transition-all cursor-pointer" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black" style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}>{initials}</div>
                        {hasUnread && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center" style={{ background: "#6C3AE8" }}>{msg.unreadCount}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{msg.otherUser?.username ?? "Usuario"}</p>
                        <p className="text-xs mt-1 truncate" style={{ color: hasUnread ? "#d4d4d8" : "#71717a" }}>
                          {msg.lastMessage?.content ?? "Sin mensajes"}
                        </p>
                      </div>
                      {msg.lastMessage?.createdAt && (
                        <p className="text-[11px] text-zinc-600 shrink-0">
                          {new Date(msg.lastMessage.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── MODAL SOLICITUD VENDEDOR ── */}
      {showSellerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}>
            <button onClick={() => setShowSellerModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white text-xl">✕</button>

            <h2 className="text-xl font-black mb-1">Solicitar cuenta de vendedor</h2>
            <p className="text-xs text-zinc-500 mb-6">Paso {sellerStep} de 2 — {sellerStep === 1 ? "Datos personales" : "Documentos requeridos"}</p>

            {sellerError && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {sellerError}
              </div>
            )}

            {sellerStep === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Nombre completo</label>
                  <input value={sellerForm.fullName} onChange={e => setSellerForm(p => ({ ...p, fullName: e.target.value }))}
                    placeholder="Como aparece en tu INE" className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Estado</label>
                  <select value={sellerForm.state} onChange={e => setSellerForm(p => ({ ...p, state: e.target.value }))}
                    className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#6C3AE8]/60">
                    <option value="">Selecciona tu estado</option>
                    {ESTADOS_MX.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">¿Qué vendes y cuál es tu experiencia?</label>
                  <textarea value={sellerForm.description} onChange={e => setSellerForm(p => ({ ...p, description: e.target.value }))}
                    rows={4} placeholder="Ej: Vendo cartas de Pokémon y MTG, llevo 3 años comprando y vendiendo colecciones..." maxLength={500}
                    className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 resize-none" />
                  <p className="text-[11px] text-zinc-600 mt-1 text-right">{sellerForm.description.length}/500</p>
                </div>
                <button
                  onClick={() => {
                    if (!sellerForm.fullName || !sellerForm.state || sellerForm.description.length < 20) {
                      setSellerError("Completa todos los campos (descripción mínimo 20 caracteres).");
                      return;
                    }
                    setSellerError("");
                    setSellerStep(2);
                  }}
                  className="w-full py-3.5 rounded-xl font-black text-white mt-2"
                  style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                >
                  Continuar →
                </button>
              </div>
            )}

            {sellerStep === 2 && (
              <div className="flex flex-col gap-4">
                {REQUIRED_DOCS.map(doc => {
                  const uploaded = !!docUrls[doc.type];
                  const uploading = !!docUploading[doc.type];
                  return (
                    <div key={doc.type} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${uploaded ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.07)"}` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-bold">{doc.label}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{doc.hint}</p>
                        </div>
                        {uploaded && <span className="text-[11px] font-black text-green-400 shrink-0">✓ Subido</span>}
                        {uploading && <span className="text-[11px] text-zinc-400 shrink-0 animate-pulse">Subiendo...</span>}
                      </div>
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDocFile(doc.type, f); }}
                        className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-violet-600/20 file:text-violet-300 hover:file:bg-violet-600/30 cursor-pointer" />
                      {doc.needsDate && (
                        <div className="mt-2">
                          <label className="text-[11px] text-zinc-500 block mb-1">Fecha de emisión</label>
                          <input type="date" value={docDates[doc.type] ?? ""} onChange={e => setDocDates(p => ({ ...p, [doc.type]: e.target.value }))}
                            className="bg-[#0F0F14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#6C3AE8]/60" />
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex gap-3 mt-2">
                  <button onClick={() => setSellerStep(1)} className="flex-1 py-3 rounded-xl font-bold text-zinc-400 text-sm" style={{ background: "rgba(255,255,255,0.05)" }}>
                    ← Atrás
                  </button>
                  <button onClick={handleSellerSubmit} disabled={submitting}
                    className="flex-1 py-3 rounded-xl font-black text-white text-sm disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                    {submitting ? "Enviando..." : "Enviar solicitud"}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-600 text-center">Tu solicitud será revisada por el equipo en 1-3 días hábiles</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
