"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { ordersApi, auctionsApi, paymentsApi, watchlistApi, messagesApi, sellerApplicationsApi, sellerDocumentsApi, disputesApi, type ApiOrder, type ApiBid, type WatchlistItem, type MessageThread, type SellerApplication, type SellerDocumentRecord, type ApiDispute, type ApiMessage } from "@/lib/api";

// ─── TCG-themed empty state messages ───────────────────────
const TCG_EMPTY = {
  orders:   [
    { icon: "🎒", title: "Tu mochila está vacía", sub: "Gana tu primera subasta para ver tus órdenes aquí" },
    { icon: "🃏", title: "Sin órdenes todavía", sub: "El camino del maestro comienza con la primera carta" },
    { icon: "📦", title: "Nada por aquí aún", sub: "¡Únete a una subasta en vivo y llévate tu primera carta!" },
  ],
  watchlist:[
    { icon: "👁", title: "Tu Pokédex de subastas está vacío", sub: "Guarda subastas para no perderlas" },
    { icon: "⭐", title: "Sin favoritos todavía", sub: "Explora las subastas y guarda las que más te interesen" },
    { icon: "🔖", title: "Lista vacía", sub: "Como un mazo sin cartas clave — ¡agrega subastas!" },
  ],
  messages: [
    { icon: "💬", title: "Sin mensajes todavía", sub: "El primer movimiento siempre es tuyo" },
    { icon: "📨", title: "Bandeja vacía", sub: "Tu próximo intercambio épico comienza aquí" },
    { icon: "🗺️", title: "Silencio en el estadio", sub: "Completa una orden para chatear con el vendedor" },
  ],
  disputes: [
    { icon: "🛡️", title: "Sin disputas", sub: "Todas tus batallas han terminado en paz" },
    { icon: "✨", title: "Historial limpio", sub: "El código del entrenador honorable vive en ti" },
    { icon: "🏆", title: "Sin conflictos", sub: "Raro como un Charizard Shiny — y igual de valioso" },
  ],
};
function pickEmpty(key: keyof typeof TCG_EMPTY) {
  const arr = TCG_EMPTY[key];
  return arr[Math.floor(Math.random() * arr.length)];
}
import type { Order } from "@/lib/mock-data";

type Tab = "ordenes" | "watchlist" | "mensajes" | "disputas";

const TABS: { key: Tab; label: string }[] = [
  { key: "ordenes",   label: "Mis Órdenes" },
  { key: "watchlist", label: "Watchlist"   },
  { key: "mensajes",  label: "Mensajes"    },
  { key: "disputas",  label: "Disputas"    },
];

const DISPUTE_REASON_LABELS: Record<string, string> = {
  not_received:     "No recibí el paquete",
  wrong_item:       "Artículo incorrecto",
  damaged:          "Llegó dañado",
  not_as_described: "No coincide con la descripción",
  other:            "Otro",
};

const DISPUTE_STATUS_STYLE: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  open:         { label: "Abierta",      color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  icon: "🔓" },
  under_review: { label: "En revisión",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: "🔍" },
  resolved:     { label: "Resuelta",     color: "#4ade80", bg: "rgba(74,222,128,0.12)",  icon: "✅" },
  rejected:     { label: "Rechazada",    color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: "❌" },
};

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


const PAYMENTS_ENABLED = true;

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

  // Chat modal
  const [chatThread,    setChatThread]    = useState<MessageThread | null>(null);
  const [chatMessages,  setChatMessages]  = useState<ApiMessage[]>([]);
  const [chatInput,     setChatInput]     = useState("");
  const [chatSending,   setChatSending]   = useState(false);
  const [chatLoading,   setChatLoading]   = useState(false);

  // Rating
  const [ratingOrderId,    setRatingOrderId]    = useState<string | null>(null);
  const [ratingStars,      setRatingStars]      = useState(5);
  const [ratingNote,       setRatingNote]       = useState("");
  const [ratingHover,      setRatingHover]      = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingError,      setRatingError]      = useState("");

  // Disputes
  const [disputes,          setDisputes]          = useState<ApiDispute[] | null>(null);
  const [showDisputeModal,  setShowDisputeModal]  = useState(false);
  const [disputeOrderId,    setDisputeOrderId]    = useState("");
  const [disputeReason,     setDisputeReason]     = useState("");
  const [disputeDesc,       setDisputeDesc]       = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError,      setDisputeError]      = useState("");

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
      disputesApi.my().catch(() => null),
    ]).then(([ordersRes, bidsRes, watchlistRes, messagesRes, appRes, disputesRes]) => {
      if (ordersRes)    setRealOrders(ordersRes.data);
      if (bidsRes)      setRealBids(bidsRes.data);
      if (watchlistRes) setRealWatchlist(watchlistRes.data);
      if (messagesRes)  setRealMessages(messagesRes.data);
      setApplication(appRes?.data ?? null);
      if (disputesRes)  setDisputes(disputesRes.data);
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

  async function handleOpenDispute(e?: React.MouseEvent) {
    e?.stopPropagation();
    setDisputeError("");
    if (!disputeReason) { setDisputeError("Selecciona el motivo"); return; }
    if (disputeDesc.length < 10) { setDisputeError("Describe el problema (mínimo 10 caracteres)"); return; }
    setDisputeSubmitting(true);
    try {
      const { data } = await disputesApi.open({ orderId: disputeOrderId, reason: disputeReason, description: disputeDesc });
      setDisputes(prev => [data, ...(prev ?? [])]);
      setShowDisputeModal(false);
      setDisputeReason("");
      setDisputeDesc("");
      setTab("disputas");
    } catch (err: any) {
      setDisputeError(err?.response?.data?.message ?? "Error al abrir disputa. Intenta de nuevo.");
    } finally {
      setDisputeSubmitting(false);
    }
  }

  async function openChat(thread: MessageThread) {
    setChatThread(thread);
    setChatMessages([]);
    setChatLoading(true);
    try {
      const res = await messagesApi.getMessages(thread.orderId);
      setChatMessages(res.data);
    } catch {}
    finally { setChatLoading(false); }
  }

  async function sendChatMessage() {
    if (!chatThread || !chatInput.trim() || chatSending) return;
    setChatSending(true);
    const body = chatInput.trim();
    setChatInput("");
    try {
      const res = await messagesApi.send(chatThread.orderId, body);
      setChatMessages(prev => [...prev, res.data]);
    } catch {
      setChatInput(body);
    } finally {
      setChatSending(false);
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

  async function handleRateOrder() {
    if (!ratingOrderId) return;
    setRatingSubmitting(true);
    setRatingError("");
    try {
      const { data } = await ordersApi.rateOrder(ratingOrderId, ratingStars, ratingNote || undefined);
      setRealOrders(prev => prev?.map(o => o.id === ratingOrderId ? { ...o, sellerRating: data.sellerRating } : o) ?? prev);
      setRatingOrderId(null);
      setRatingStars(5);
      setRatingNote("");
    } catch (err: any) {
      setRatingError(err?.response?.data?.message ?? "Error al enviar calificación.");
    } finally {
      setRatingSubmitting(false);
    }
  }

  // Stable random empty state messages (chosen once per mount)
  const emptyOrders   = useMemo(() => pickEmpty("orders"),   []);
  const emptyWatch    = useMemo(() => pickEmpty("watchlist"), []);
  const emptyMessages = useMemo(() => pickEmpty("messages"),  []);
  const emptyDisputes = useMemo(() => pickEmpty("disputes"),  []);

  if (authLoading || !user) return null;

  const initials = user.username.slice(0, 2).toUpperCase();
  const orders: Order[] = (realOrders ?? []).map((o) => ({
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
  }));

  const bidsCount = realBids?.length ?? 0;
  const openDisputesCount = disputes?.filter(d => d.status === "open" || d.status === "under_review").length;
  const tabCounts: Record<Tab, number | undefined> = {
    ordenes:   orders.length + bidsCount,
    watchlist: realWatchlist?.length ?? 0,
    mensajes:  realMessages?.reduce((n, m) => n + (m.unreadCount ?? 0), 0) || undefined,
    disputas:  openDisputesCount || undefined,
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

                {/* Órdenes — empty state */}
                {orders.length === 0 && !realBids?.length && (
                  <div className="text-center py-16">
                    <p className="text-4xl mb-3">{emptyOrders.icon}</p>
                    <p className="text-zinc-300 font-bold">{emptyOrders.title}</p>
                    <p className="text-xs text-zinc-600 mt-1">{emptyOrders.sub}</p>
                  </div>
                )}

                {/* Órdenes */}
                {orders.map((order) => {
                  const rawOrder = realOrders?.find(o => o.id === order.id);
                  const s = ORDER_STATUS[order.status] ?? { label: order.status, icon: "📋", color: "#71717a" };
                  const isPending = order.status === "pendiente_pago" || order.status === "pending_payment";
                  const isDelivered = order.status === "entregado" || order.status === "delivered";
                  const alreadyRated = !!rawOrder?.sellerRating;
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
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {!isPending && !isDelivered && (
                              <button
                                onClick={() => {
                                  setDisputeOrderId(order.id);
                                  setDisputeReason("");
                                  setDisputeDesc("");
                                  setDisputeError("");
                                  setShowDisputeModal(true);
                                }}
                                className="text-[11px] font-semibold text-zinc-500 hover:text-red-400 transition-colors"
                              >
                                ⚠ Reportar problema
                              </button>
                            )}
                            {isDelivered && !alreadyRated && (
                              <button
                                onClick={() => { setRatingOrderId(order.id); setRatingStars(5); setRatingNote(""); setRatingError(""); }}
                                className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
                                style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
                              >
                                ⭐ Calificar vendedor
                              </button>
                            )}
                            {isDelivered && alreadyRated && (
                              <div className="flex items-center gap-1">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <span key={i} style={{ color: i < (rawOrder?.sellerRating ?? 0) ? "#fbbf24" : "#3f3f46", fontSize: "12px" }}>★</span>
                                ))}
                                <span className="text-[11px] text-zinc-600 ml-1">Tu calificación</span>
                              </div>
                            )}
                          </div>
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
                    <p className="text-4xl mb-3">{emptyWatch.icon}</p>
                    <p className="text-zinc-300 font-bold">{emptyWatch.title}</p>
                    <p className="text-xs text-zinc-600 mt-1">{emptyWatch.sub}</p>
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

            {/* ── DISPUTAS ── */}
            {tab === "disputas" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-zinc-500">Una disputa protege tus compras cuando algo sale mal con tu pedido.</p>
                </div>
                {(disputes ?? []).length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-4xl mb-3">{emptyDisputes.icon}</p>
                    <p className="text-zinc-300 font-bold">{emptyDisputes.title}</p>
                    <p className="text-xs text-zinc-600 mt-1">{emptyDisputes.sub}</p>
                  </div>
                ) : (disputes ?? []).map(d => {
                  const s = DISPUTE_STATUS_STYLE[d.status] ?? DISPUTE_STATUS_STYLE.open;
                  return (
                    <div key={d.id} className="rounded-2xl p-5" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-start gap-4">
                        <span className="text-2xl mt-1 shrink-0">{s.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="font-bold text-sm">{DISPUTE_REASON_LABELS[d.reason] ?? d.reason}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>
                              {s.label}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">
                            Orden: {d.orderId.slice(0, 8)}… · {new Date(d.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{d.description}</p>
                          {d.resolutionNote && (
                            <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(108,58,232,0.08)", border: "1px solid rgba(108,58,232,0.2)" }}>
                              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Resolución del equipo</p>
                              <p className="text-sm text-zinc-300">{d.resolutionNote}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── MENSAJES ── */}
            {tab === "mensajes" && (
              <div className="space-y-2">
                {(realMessages ?? []).length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-4xl mb-3">{emptyMessages.icon}</p>
                    <p className="text-zinc-300 font-bold">{emptyMessages.title}</p>
                    <p className="text-xs text-zinc-600 mt-1">{emptyMessages.sub}</p>
                  </div>
                ) : (realMessages ?? []).map((msg) => {
                  const msgInitials = (msg.otherUser?.username ?? "?").slice(0, 2).toUpperCase();
                  const hasUnread = (msg.unreadCount ?? 0) > 0;
                  return (
                    <button
                      key={msg.id}
                      onClick={() => openChat(msg)}
                      className="w-full flex items-center gap-4 rounded-2xl p-4 hover:border-[#6C3AE8]/30 transition-all text-left"
                      style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black" style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}>{msgInitials}</div>
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
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── MODAL CHAT ── */}
      {chatThread && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="relative w-full sm:max-w-md flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "85vh" }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5 shrink-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0" style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}>
                {(chatThread.otherUser?.username ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{chatThread.otherUser?.username ?? "Usuario"}</p>
                <p className="text-[11px] text-zinc-500 font-mono truncate">Orden {chatThread.orderId.slice(0, 8)}…</p>
              </div>
              <button onClick={() => setChatThread(null)} className="text-zinc-500 hover:text-white text-xl shrink-0">✕</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
              {chatLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-5 h-5 rounded-full border-2 border-[#6C3AE8] border-t-transparent animate-spin" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">Sin mensajes aún. ¡Sé el primero en escribir!</div>
              ) : chatMessages.map((m) => {
                const mine = m.senderId === user.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                      style={mine
                        ? { background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", color: "#fff" }
                        : { background: "rgba(255,255,255,0.06)", color: "#e4e4e7" }
                      }
                    >
                      {!mine && <p className="text-[10px] font-bold mb-1" style={{ color: "#a78bfa" }}>{m.senderUsername}</p>}
                      <p>{m.body}</p>
                      <p className="text-[10px] mt-1 opacity-60 text-right">
                        {new Date(m.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="px-4 py-4 border-t border-white/5 shrink-0">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                  placeholder="Escribe un mensaje..."
                  maxLength={1000}
                  className="flex-1 bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/50"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatSending}
                  className="px-4 py-2.5 rounded-xl font-black text-white disabled:opacity-50 transition-all"
                  style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                >
                  {chatSending ? "…" : "→"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ABRIR DISPUTA ── */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="relative w-full max-w-md rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}>
            <button onClick={() => setShowDisputeModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white text-xl">✕</button>

            <h2 className="text-xl font-black mb-1">Reportar un problema</h2>
            <p className="text-xs text-zinc-500 mb-5">Orden: <span className="font-mono">{disputeOrderId.slice(0, 8)}…</span></p>

            {disputeError && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {disputeError}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">¿Cuál es el problema?</label>
              <select
                value={disputeReason}
                onChange={e => setDisputeReason(e.target.value)}
                className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#6C3AE8]/60"
              >
                <option value="">Selecciona el motivo</option>
                <option value="not_received">No recibí el paquete</option>
                <option value="wrong_item">Artículo incorrecto</option>
                <option value="damaged">Llegó dañado</option>
                <option value="not_as_described">No coincide con la descripción</option>
                <option value="other">Otro</option>
              </select>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Describe el problema</label>
              <textarea
                value={disputeDesc}
                onChange={e => setDisputeDesc(e.target.value)}
                rows={4}
                placeholder="Explica con detalle qué pasó con tu pedido..."
                maxLength={1000}
                className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 resize-none"
              />
              <p className="text-[11px] text-zinc-600 mt-1 text-right">{disputeDesc.length}/1000</p>
            </div>

            <div className="p-3 rounded-xl mb-5" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)" }}>
              <p className="text-[11px] text-amber-400/80">Al reportar un problema, nuestro equipo revisará el caso y se pondrá en contacto contigo en 1-3 días hábiles.</p>
            </div>

            <button
              onClick={handleOpenDispute}
              disabled={disputeSubmitting}
              className="w-full py-3.5 rounded-xl font-black text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}
            >
              {disputeSubmitting ? "Enviando..." : "Abrir disputa"}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL CALIFICAR VENDEDOR ── */}
      {ratingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="relative w-full max-w-sm rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}>
            <button onClick={() => setRatingOrderId(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white text-xl">✕</button>
            <h2 className="text-xl font-black mb-1">Calificar vendedor</h2>
            <p className="text-xs text-zinc-500 mb-5">¿Cómo fue tu experiencia con esta orden?</p>

            {ratingError && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {ratingError}
              </div>
            )}

            {/* Stars */}
            <div className="flex items-center justify-center gap-2 mb-5">
              {Array.from({ length: 5 }).map((_, i) => {
                const val = i + 1;
                const filled = val <= (ratingHover || ratingStars);
                return (
                  <button
                    key={i}
                    onMouseEnter={() => setRatingHover(val)}
                    onMouseLeave={() => setRatingHover(0)}
                    onClick={() => setRatingStars(val)}
                    className="text-4xl transition-transform hover:scale-110"
                    style={{ color: filled ? "#fbbf24" : "#3f3f46" }}
                  >
                    ★
                  </button>
                );
              })}
            </div>
            <p className="text-center text-sm text-zinc-400 mb-4">
              {["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"][ratingStars]}
            </p>

            <textarea
              value={ratingNote}
              onChange={e => setRatingNote(e.target.value)}
              rows={3}
              placeholder="Comentario opcional (ej: envío rápido, excelente empaque...)"
              maxLength={300}
              className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 resize-none mb-4"
            />

            <button
              onClick={handleRateOrder}
              disabled={ratingSubmitting}
              className="w-full py-3.5 rounded-xl font-black text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #f59e0b, #f97316)", boxShadow: "0 4px 16px rgba(245,158,11,0.3)" }}
            >
              {ratingSubmitting ? "Enviando..." : "Enviar calificación"}
            </button>
          </div>
        </div>
      )}

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
