"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useAuth } from "@/contexts/auth";
import { ordersApi, auctionsApi, paymentsApi, watchlistApi, messagesApi, sellerApplicationsApi, sellerDocumentsApi, disputesApi, type ApiOrder, type ApiBid, type WatchlistItem, type MessageThread, type SellerApplication, type SellerDocumentRecord, type ApiDispute, type ApiMessage } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { useAnalytics } from "@/hooks/useAnalytics";
import { gameLabel, liveName } from "@/lib/format";

interface Order {
  id: string;
  item: string;
  emoji: string;
  gradient: string;
  glow: string;
  amount: number;
  status: string;
  date: string;
  seller: string;
  tracking?: string;
}

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

// ─── Inline error banner for failed data loads (distinct from "empty") ───────
function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm"
      style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--error-text)" }}
    >
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2">
        Reintentar
      </button>
    </div>
  );
}

type Tab = "ordenes" | "watchlist" | "mensajes" | "disputas";

const TABS: { key: Tab; label: string }[] = [
  { key: "ordenes",   label: "Mis Órdenes" },
  { key: "watchlist", label: "Seguimiento" },
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
  rejected:     { label: "Rechazada",    color: "var(--error-text)", bg: "rgba(248,113,113,0.12)", icon: "❌" },
};

const BID_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  ganando:   { label: "Ganando",   color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  perdiendo: { label: "Perdiendo", color: "var(--error-text)", bg: "rgba(248,113,113,0.1)" },
  ganada:    { label: "Ganada",    color: "var(--accent-text)", bg: "color-mix(in srgb, var(--brand) 10%, transparent)" },
  perdida:   { label: "Perdida",   color: "#71717a", bg: "rgba(113,113,122,0.1)" },
  active:    { label: "Activa",    color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  won:       { label: "Ganada",    color: "var(--accent-text)", bg: "color-mix(in srgb, var(--brand) 10%, transparent)" },
  lost:      { label: "Perdida",   color: "#71717a", bg: "rgba(113,113,122,0.1)" },
};

const ORDER_STATUS: Record<string, { label: string; icon: string; color: string }> = {
  pending_payment: { label: "Pendiente de pago", icon: "⏳", color: "#f59e0b" },
  pendiente_pago:  { label: "Pendiente de pago", icon: "⏳", color: "#f59e0b" },
  processing:      { label: "Procesando",         icon: "🔄", color: "#60a5fa" },
  shipped:         { label: "En camino",           icon: "🚚", color: "var(--accent-text)" },
  en_camino:       { label: "En camino",           icon: "🚚", color: "var(--accent-text)" },
  delivered:       { label: "Entregado",           icon: "✅", color: "#4ade80" },
  entregado:       { label: "Entregado",           icon: "✅", color: "#4ade80" },
};


const PAYMENTS_ENABLED = true;

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
  const searchParams = useSearchParams();
  const { capture } = useAnalytics();
  // Section is chosen from the ?sec= query (driven by the profile dropdown menu) — no tabs.
  const [tab, setTab] = useState<Tab>("ordenes");
  useEffect(() => {
    const s = searchParams.get("sec");
    if (s && ["ordenes", "watchlist", "mensajes", "disputas"].includes(s)) setTab(s as Tab);
  }, [searchParams]);

  // Real data
  const [realOrders,    setRealOrders]    = useState<ApiOrder[]      | null>(null);
  const [realBids,      setRealBids]      = useState<ApiBid[]        | null>(null);
  const [realWatchlist, setRealWatchlist] = useState<WatchlistItem[] | null>(null);
  const [realMessages,  setRealMessages]  = useState<MessageThread[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState<{ orders: boolean; bids: boolean; watchlist: boolean; messages: boolean; disputes: boolean; application: boolean }>({
    orders: false, bids: false, watchlist: false, messages: false, disputes: false, application: false,
  });
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

  const chatModalRef    = useRef<HTMLDivElement>(null);
  const disputeModalRef = useRef<HTMLDivElement>(null);
  const ratingModalRef  = useRef<HTMLDivElement>(null);
  const sellerModalRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatThread) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setChatThread(null); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    chatModalRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [chatThread]);

  useEffect(() => {
    if (!showDisputeModal) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setShowDisputeModal(false); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    disputeModalRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [showDisputeModal]);

  useEffect(() => {
    if (!ratingOrderId) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setRatingOrderId(null); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ratingModalRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [ratingOrderId]);

  useEffect(() => {
    if (!showSellerModal) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setShowSellerModal(false); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    sellerModalRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [showSellerModal]);

  function loadProfileData() {
    if (!user) return;
    setDataLoading(true);
    setLoadErrors({ orders: false, bids: false, watchlist: false, messages: false, disputes: false, application: false });
    Promise.all([
      ordersApi.my().catch(() => { setLoadErrors(p => ({ ...p, orders: true })); return null; }),
      auctionsApi.myBids().catch(() => { setLoadErrors(p => ({ ...p, bids: true })); return null; }),
      watchlistApi.my().catch(() => { setLoadErrors(p => ({ ...p, watchlist: true })); return null; }),
      messagesApi.threads().catch(() => { setLoadErrors(p => ({ ...p, messages: true })); return null; }),
      sellerApplicationsApi.myApplication().catch(() => { setLoadErrors(p => ({ ...p, application: true })); return undefined; }),
      disputesApi.my().catch(() => { setLoadErrors(p => ({ ...p, disputes: true })); return null; }),
    ]).then(([ordersRes, bidsRes, watchlistRes, messagesRes, appRes, disputesRes]) => {
      if (ordersRes)    setRealOrders(ordersRes.data);
      if (bidsRes)      setRealBids(bidsRes.data);
      if (watchlistRes) setRealWatchlist(watchlistRes.data);
      if (messagesRes)  setRealMessages(messagesRes.data);
      if (appRes !== undefined) setApplication(appRes?.data ?? null);
      if (disputesRes)  setDisputes(disputesRes.data);
    }).finally(() => setDataLoading(false));
  }

  useEffect(() => {
    loadProfileData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleDocFile(type: string, file: File) {
    setDocFiles(p => ({ ...p, [type]: file }));
    setDocUploading(p => ({ ...p, [type]: true }));
    try {
      const url = await uploadToCloudinary(file, "tcg-live/seller-docs", "auto");
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
      capture("dispute_opened", { orderId: disputeOrderId });
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
      capture("rating_submitted", { orderId: ratingOrderId, rating: ratingStars });
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
    glow: "rgba(59,130,246,0.4)",
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
    <ErrorBoundary>
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />

      <main id="main">
      {/* ── PROFILE HEADER ── */}
      <div
        className="pt-24 pb-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">

            {/* Avatar with gradient ring */}
            <div className="relative shrink-0">
              <div
                className="w-[88px] h-[88px] rounded-[22px] p-[2.5px]"
                style={{
                  background: "linear-gradient(135deg, var(--brand), var(--accent-text), #3B82F6)",
                  boxShadow: "0 0 32px rgba(37,99,235,0.45)",
                }}
              >
                <div
                  className="w-full h-full rounded-[18px] flex items-center justify-center text-2xl font-black"
                  style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}
                >
                  {initials}
                </div>
              </div>
              <span
                className="absolute -bottom-1.5 -right-1.5 text-xs font-black px-2 py-0.5 rounded-full text-white"
                style={{ background: "var(--brand)", border: "2px solid var(--bg-base)" }}
              >
                {user.role === "SELLER" ? "Vendedor" : "Comprador"}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>{user.username}</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>@{user.username} · {user.email}</p>

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-6 mt-4">
                {[
                  { label: "Pujas activas", value: realBids?.filter(b => b.status === "active").length ?? 0 },
                  { label: "Órdenes",       value: orders.length                                            },
                  { label: "Seguimiento",   value: realWatchlist?.length ?? 0                               },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{s.value}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <Link
              href="/ajustes"
              className="shrink-0 text-sm font-semibold px-4 py-2 rounded-xl transition-all"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              ⚙ Ajustes
            </Link>
            {user.role === "SELLER" && (
              <Link
                href="/vendedor"
                className="shrink-0 text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all"
                style={{ background: "linear-gradient(135deg, var(--brand), #3B82F6)" }}
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
                style={{ background: "rgba(248,113,113,0.12)", color: "var(--error-text)", border: "1px solid rgba(248,113,113,0.2)" }}
              >
                Solicitud rechazada — volver a intentar
              </button>
            )}
          </div>

          {/* Section heading — navigation now lives in the profile ▾ menu (no tabs). */}
          <div className="flex items-center justify-between gap-3 mt-8">
            <h2 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>
              {TABS.find((t) => t.key === tab)?.label ?? "Mi actividad"}
              {tabCounts[tab] !== undefined && tabCounts[tab]! > 0 && (
                <span className="ml-2 text-xs font-black px-2 py-0.5 rounded-full align-middle" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{tabCounts[tab]}</span>
              )}
            </h2>
            <Link href="/compras" className="shrink-0 text-sm font-semibold px-3.5 py-2 rounded-full" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
              Mis compras →
            </Link>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="mx-auto max-w-4xl px-6 py-8">

        {/* ── SHIMMER LOADING STATE ── */}
        {dataLoading && (
          <div className="flex flex-col gap-4 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-24 rounded-2xl" />
            ))}
            <div className="shimmer h-16 rounded-2xl" style={{ opacity: 0.6 }} />
            <div className="shimmer h-20 rounded-2xl" style={{ opacity: 0.35 }} />
          </div>
        )}

        {/* ── BANNER VENDEDOR ── */}
        {!dataLoading && user.role === "BUYER" && (
          <div className="mb-6">
            {loadErrors.application && application === undefined && (
              <ErrorBanner
                message="No se pudo cargar el estado de tu solicitud de vendedor."
                onRetry={loadProfileData}
              />
            )}
            {application === null && (
              <div className="rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
                style={{ background: "linear-gradient(135deg, rgba(5,150,105,0.15), rgba(16,185,129,0.08))", border: "1px solid rgba(16,185,129,0.25)" }}>
                <div>
                  <p className="font-black text-base" style={{ color: "var(--text-primary)" }}>¿Quieres vender en TCG Live?</p>
                  <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Solicita tu cuenta de vendedor — revisamos tu solicitud en 1-3 días hábiles.</p>
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
                  <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Solicitud de vendedor en revisión</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Te notificaremos cuando sea aprobada.</p>
                </div>
              </div>
            )}
            {application?.status === "rejected" && (
              <div className="rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap"
                style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                <div>
                  <p className="font-bold text-sm text-[var(--error-text)]">Solicitud rechazada</p>
                  {application.reviewNote && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{application.reviewNote}</p>}
                </div>
                <button onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                  className="shrink-0 text-xs font-bold px-4 py-2 rounded-xl"
                  style={{ background: "rgba(248,113,113,0.15)", color: "var(--error-text)", border: "1px solid rgba(248,113,113,0.3)" }}>
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

                {(loadErrors.orders || loadErrors.bids) && (
                  <ErrorBanner
                    message="No se pudieron cargar tus órdenes o pujas. Puede que el servidor esté fuera de línea."
                    onRetry={loadProfileData}
                  />
                )}

                {/* Pujas activas */}
                {realBids && realBids.length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-widest px-1 pt-2" style={{ color: "var(--text-muted)" }}>Mis Pujas</p>
                    {realBids.map((bid) => {
                      const status = BID_STATUS[bid.status ?? "active"];
                      const isActive = bid.status === "active" || bid.status === "ganando";
                      return (
                        <div
                          key={bid.id}
                          className="flex items-center gap-4 rounded-2xl p-4"
                          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                        >
                          {bid.item?.imageUrls?.[0] ? (
                            <img
                              src={bid.item.imageUrls[0]}
                              alt={bid.item?.cardName ?? "Carta"}
                              className="w-12 h-16 object-contain rounded-lg shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0" style={{ boxShadow: "0 0 16px rgba(59,130,246,0.4)" }}>
                              🃏
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{bid.item?.cardName ?? bid.auction?.title ?? "Carta"}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{bid.item?.condition ?? ""}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: status?.bg, color: status?.color }}>
                                {status?.label ?? bid.status}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Mi puja</p>
                            <p className="font-black text-base" style={{ color: "var(--text-primary)" }}>${(bid.amount / 100).toLocaleString("es-MX")}</p>
                          </div>
                          {isActive && bid.auction && (
                            <Link href={`/auctions/${bid.auction.id}`} className="shrink-0 text-xs font-bold text-white px-4 py-2 rounded-xl" style={{ background: "linear-gradient(135deg, var(--brand), #3B82F6)" }}>
                              Pujar →
                            </Link>
                          )}
                        </div>
                      );
                    })}
                    {orders.length > 0 && (
                      <p className="text-xs font-bold uppercase tracking-widest px-1 pt-4" style={{ color: "var(--text-muted)" }}>Órdenes</p>
                    )}
                  </>
                )}

                {/* Órdenes — empty state */}
                {orders.length === 0 && !realBids?.length && (
                  <div className="text-center py-16">
                    <p className="text-4xl mb-3">{emptyOrders.icon}</p>
                    <p className="font-bold" style={{ color: "var(--text-secondary)" }}>{emptyOrders.title}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{emptyOrders.sub}</p>
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
                    <div
                      key={order.id}
                      className="rounded-2xl p-5"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-start gap-4">
                        {realOrders?.find(o => o.id === order.id)?.items?.[0]?.imageUrls?.[0] ? (
                          <img
                            src={realOrders.find(o => o.id === order.id)!.items![0].imageUrls![0]}
                            alt={order.item}
                            className="w-12 h-16 object-contain rounded-lg shrink-0"
                          />
                        ) : (
                          <div className={`w-12 h-16 rounded-xl bg-gradient-to-br ${order.gradient} flex items-center justify-center text-xl shrink-0`} style={{ boxShadow: `0 0 16px ${order.glow}` }}>
                            {order.emoji}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{order.item}</p>
                            <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-xl" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                              {typeof order.id === "string" && order.id.length > 12 ? order.id.slice(0, 8) + "…" : order.id}
                            </span>
                          </div>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Vendedor: {order.seller} · {order.date}</p>
                          <div className="flex items-center gap-2 mt-3">
                            <span className="text-base">{s.icon}</span>
                            <span className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</span>
                          </div>
                          {order.tracking && (
                            <p className="text-[11px] mt-1.5 font-mono" style={{ color: "var(--text-muted)" }}>Rastreo: {order.tracking}</p>
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
                                className="text-[11px] font-semibold transition-colors hover:text-[var(--error-text)]"
                                style={{ color: "var(--text-muted)" }}
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
                                  <span key={i} style={{ color: i < (rawOrder?.sellerRating ?? 0) ? "#fbbf24" : "var(--text-muted)", fontSize: "12px" }}>★</span>
                                ))}
                                <span className="text-[11px] ml-1" style={{ color: "var(--text-muted)" }}>Tu calificación</span>
                              </div>
                            )}
                          </div>
                          {isPending && (
                            PAYMENTS_ENABLED ? (
                              <button
                                onClick={() => handleCheckout(order.id)}
                                disabled={checkingOut === order.id}
                                className="mt-3 text-xs font-bold text-white px-4 py-2 rounded-xl disabled:opacity-60"
                                style={{ background: "linear-gradient(135deg, var(--brand), #3B82F6)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}
                              >
                                {checkingOut === order.id ? "Redirigiendo..." : `Pagar ahora — $${(order.amount / 100).toLocaleString("es-MX")} MXN`}
                              </button>
                            ) : (
                              <div className="mt-3 flex items-center gap-2 text-xs px-1" style={{ color: "var(--text-muted)" }}>
                                <span>🔒</span>
                                <span>Pago en línea próximamente — te contactaremos para coordinar</span>
                              </div>
                            )
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-lg" style={{ color: "var(--text-primary)" }}>${(order.amount / 100).toLocaleString("es-MX")}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>MXN</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── WATCHLIST ── */}
            {tab === "watchlist" && (
              <div>
                {loadErrors.watchlist && (
                  <ErrorBanner
                    message="No se pudo cargar tu seguimiento. Puede que el servidor esté fuera de línea."
                    onRetry={loadProfileData}
                  />
                )}
              <div className="grid sm:grid-cols-2 gap-4">
                {(realWatchlist ?? []).length === 0 ? (
                  <div className="col-span-2 text-center py-16">
                    <p className="text-4xl mb-3">{emptyWatch.icon}</p>
                    <p className="font-bold" style={{ color: "var(--text-secondary)" }}>{emptyWatch.title}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{emptyWatch.sub}</p>
                  </div>
                ) : (realWatchlist ?? []).map((w) => {
                  const a = w.auction;
                  if (!a) return null;
                  return (
                    <Link key={w.id} href={`/auctions/${a.id}`}>
                      <div
                        className="rounded-2xl p-4 flex items-center gap-4 transition-all cursor-pointer hover:scale-[1.01]"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                      >
                        {a.items?.[0]?.imageUrls?.[0] ? (
                          <img
                            src={a.items[0].imageUrls[0]}
                            alt={liveName(a)}
                            className="w-12 h-16 object-contain rounded-lg shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0" style={{ boxShadow: "0 0 16px rgba(59,130,246,0.4)" }}>
                            🃏
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{liveName(a)}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{gameLabel(a.game)}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.12)", color: "var(--error-text)" }}>
                              SUBASTA
                            </span>
                            <span className="text-xs font-black" style={{ color: "var(--text-primary)" }}>
                              ${((a.currentBid ?? a.startingBid ?? 0) / 100).toLocaleString("es-MX")}{" "}
                              <span className="font-normal text-xs" style={{ color: "var(--text-muted)" }}>MXN</span>
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            try {
                              await watchlistApi.remove(a.id);
                              setRealWatchlist(prev => prev?.filter(item => item.id !== w.id) ?? prev);
                            } catch {}
                          }}
                          className="shrink-0 transition-colors hover:text-[var(--error-text)] text-lg"
                          style={{ color: "var(--text-muted)" }}
                        >♡</button>
                      </div>
                    </Link>
                  );
                })}
              </div>
              </div>
            )}

            {/* ── DISPUTAS ── */}
            {tab === "disputas" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Una disputa protege tus compras cuando algo sale mal con tu pedido.</p>
                </div>
                {loadErrors.disputes && (
                  <ErrorBanner
                    message="No se pudieron cargar tus disputas. Puede que el servidor esté fuera de línea."
                    onRetry={loadProfileData}
                  />
                )}
                {(disputes ?? []).length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-4xl mb-3">{emptyDisputes.icon}</p>
                    <p className="font-bold" style={{ color: "var(--text-secondary)" }}>{emptyDisputes.title}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{emptyDisputes.sub}</p>
                  </div>
                ) : (disputes ?? []).map(d => {
                  const s = DISPUTE_STATUS_STYLE[d.status] ?? DISPUTE_STATUS_STYLE.open;
                  return (
                    <div key={d.id} className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                      <div className="flex items-start gap-4">
                        <span className="text-2xl mt-1 shrink-0">{s.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{DISPUTE_REASON_LABELS[d.reason] ?? d.reason}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>
                              {s.label}
                            </span>
                          </div>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                            Orden: {d.orderId.slice(0, 8)}… · {new Date(d.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{d.description}</p>
                          {d.resolutionNote && (
                            <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(37,99,235,0.08)", border: "1px solid var(--border-brand)" }}>
                              <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Resolución del equipo</p>
                              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{d.resolutionNote}</p>
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
                {loadErrors.messages && (
                  <ErrorBanner
                    message="No se pudieron cargar tus mensajes. Puede que el servidor esté fuera de línea."
                    onRetry={loadProfileData}
                  />
                )}
                {(realMessages ?? []).length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-4xl mb-3">{emptyMessages.icon}</p>
                    <p className="font-bold" style={{ color: "var(--text-secondary)" }}>{emptyMessages.title}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{emptyMessages.sub}</p>
                  </div>
                ) : (realMessages ?? []).map((msg) => {
                  const msgInitials = (msg.otherUser?.username ?? "?").slice(0, 2).toUpperCase();
                  const hasUnread = (msg.unreadCount ?? 0) > 0;
                  return (
                    <button
                      key={msg.id}
                      onClick={() => openChat(msg)}
                      className="w-full flex items-center gap-4 rounded-2xl p-4 transition-all text-left"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black" style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)" }}>{msgInitials}</div>
                        {hasUnread && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white" style={{ background: "var(--brand)" }}>{msg.unreadCount}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{msg.otherUser?.username ?? "Usuario"}</p>
                        <p className="text-xs mt-1 truncate" style={{ color: hasUnread ? "var(--text-secondary)" : "var(--text-muted)" }}>
                          {msg.lastMessage?.content ?? "Sin mensajes"}
                        </p>
                      </div>
                      {msg.lastMessage?.createdAt && (
                        <p className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>
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
          <div ref={chatModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="chat-modal-title" className="relative w-full sm:max-w-md flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", maxHeight: "85vh" }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0" style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)" }}>
                {(chatThread.otherUser?.username ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p id="chat-modal-title" className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{chatThread.otherUser?.username ?? "Usuario"}</p>
                <p className="text-[11px] font-mono truncate" style={{ color: "var(--text-muted)" }}>Orden {chatThread.orderId.slice(0, 8)}…</p>
              </div>
              <button onClick={() => setChatThread(null)} aria-label="Cerrar" className="text-xl shrink-0 transition-colors hover:opacity-70" style={{ color: "var(--text-muted)" }}>✕</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
              {chatLoading ? (
                <div className="flex flex-col gap-3 py-4">
                  <div className="shimmer h-10 w-2/3 rounded-2xl" />
                  <div className="shimmer h-10 w-1/2 rounded-2xl ml-auto" />
                  <div className="shimmer h-10 w-3/4 rounded-2xl" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>Sin mensajes aún. ¡Sé el primero en escribir!</div>
              ) : chatMessages.map((m) => {
                const mine = m.senderId === user.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                      style={mine
                        ? { background: "linear-gradient(135deg, var(--brand), #3B82F6)", color: "#fff" }
                        : { background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" }
                      }
                    >
                      {!mine && <p className="text-xs font-bold mb-1" style={{ color: "var(--accent-text)" }}>{m.senderUsername}</p>}
                      <p>{m.body}</p>
                      <p className="text-xs mt-1 opacity-60 text-right">
                        {new Date(m.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="px-4 py-4 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex gap-2">
                <label htmlFor="chat-message-input" className="sr-only">Mensaje</label>
                <input
                  id="chat-message-input"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                  placeholder="Escribe un mensaje..."
                  maxLength={1000}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm placeholder:opacity-40"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.5)")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatSending}
                  className="px-4 py-2.5 rounded-xl font-black text-white disabled:opacity-50 transition-all"
                  style={{ background: "linear-gradient(135deg, var(--brand), #3B82F6)" }}
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
          <div ref={disputeModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dispute-modal-title" className="relative w-full max-w-md rounded-2xl p-6" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <button onClick={() => setShowDisputeModal(false)} aria-label="Cerrar" className="absolute top-4 right-4 text-xl transition-opacity hover:opacity-60" style={{ color: "var(--text-muted)" }}>✕</button>

            <h2 id="dispute-modal-title" className="text-xl font-black mb-1" style={{ color: "var(--text-primary)" }}>Reportar un problema</h2>
            <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>Orden: <span className="font-mono">{disputeOrderId.slice(0, 8)}…</span></p>

            {disputeError && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {disputeError}
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="dispute-reason" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>¿Cuál es el problema?</label>
              <select
                id="dispute-reason"
                value={disputeReason}
                onChange={e => setDisputeReason(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
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
              <label htmlFor="dispute-description" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Describe el problema</label>
              <textarea
                id="dispute-description"
                value={disputeDesc}
                onChange={e => setDisputeDesc(e.target.value)}
                rows={4}
                placeholder="Explica con detalle qué pasó con tu pedido..."
                maxLength={1000}
                className="w-full rounded-xl px-4 py-3 text-sm resize-none placeholder:opacity-40"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
              />
              <p className="text-[11px] mt-1 text-right" style={{ color: "var(--text-muted)" }}>{disputeDesc.length}/1000</p>
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
          <div ref={ratingModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rating-modal-title" className="relative w-full max-w-sm rounded-2xl p-6" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <button onClick={() => setRatingOrderId(null)} aria-label="Cerrar" className="absolute top-4 right-4 text-xl transition-opacity hover:opacity-60" style={{ color: "var(--text-muted)" }}>✕</button>
            <h2 id="rating-modal-title" className="text-xl font-black mb-1" style={{ color: "var(--text-primary)" }}>Calificar vendedor</h2>
            <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>¿Cómo fue tu experiencia con esta orden?</p>

            {ratingError && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {ratingError}
              </div>
            )}

            {/* Stars */}
            <div role="radiogroup" aria-label="Calificación en estrellas" className="flex items-center justify-center gap-2 mb-5">
              {Array.from({ length: 5 }).map((_, i) => {
                const val = i + 1;
                const filled = val <= (ratingHover || ratingStars);
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={ratingStars === val}
                    aria-label={`${val} estrella${val > 1 ? "s" : ""}`}
                    onMouseEnter={() => setRatingHover(val)}
                    onMouseLeave={() => setRatingHover(0)}
                    onClick={() => setRatingStars(val)}
                    className="text-4xl transition-transform hover:scale-110"
                    style={{ color: filled ? "#fbbf24" : "var(--text-muted)" }}
                  >
                    ★
                  </button>
                );
              })}
            </div>
            <p className="text-center text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              {["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"][ratingStars]}
            </p>

            <label htmlFor="rating-note" className="sr-only">Comentario (opcional)</label>
            <textarea
              id="rating-note"
              value={ratingNote}
              onChange={e => setRatingNote(e.target.value)}
              rows={3}
              placeholder="Comentario opcional (ej: envío rápido, excelente empaque...)"
              maxLength={300}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none mb-4 placeholder:opacity-40"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
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
          <div ref={sellerModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="seller-modal-title" className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <button onClick={() => setShowSellerModal(false)} aria-label="Cerrar" className="absolute top-4 right-4 text-xl transition-opacity hover:opacity-60" style={{ color: "var(--text-muted)" }}>✕</button>

            <h2 id="seller-modal-title" className="text-xl font-black mb-1" style={{ color: "var(--text-primary)" }}>Solicitar cuenta de vendedor</h2>
            <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>Paso {sellerStep} de 2 — {sellerStep === 1 ? "Datos personales" : "Documentos requeridos"}</p>

            {sellerError && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {sellerError}
              </div>
            )}

            {sellerStep === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="seller-fullname" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Nombre completo</label>
                  <input
                    id="seller-fullname"
                    value={sellerForm.fullName}
                    onChange={e => setSellerForm(p => ({ ...p, fullName: e.target.value }))}
                    placeholder="Como aparece en tu INE"
                    className="w-full rounded-xl px-4 py-3 text-sm placeholder:opacity-40"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                  />
                </div>
                <div>
                  <label htmlFor="seller-state" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Estado</label>
                  <select
                    id="seller-state"
                    value={sellerForm.state}
                    onChange={e => setSellerForm(p => ({ ...p, state: e.target.value }))}
                    className="w-full rounded-xl px-4 py-3 text-sm"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                  >
                    <option value="">Selecciona tu estado</option>
                    {ESTADOS_MX.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="seller-description" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>¿Qué vendes y cuál es tu experiencia?</label>
                  <textarea
                    id="seller-description"
                    value={sellerForm.description}
                    onChange={e => setSellerForm(p => ({ ...p, description: e.target.value }))}
                    rows={4}
                    placeholder="Ej: Vendo cartas de Pokémon y MTG, llevo 3 años comprando y vendiendo colecciones..."
                    maxLength={500}
                    className="w-full rounded-xl px-4 py-3 text-sm resize-none placeholder:opacity-40"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                  />
                  <p className="text-[11px] mt-1 text-right" style={{ color: "var(--text-muted)" }}>{sellerForm.description.length}/500</p>
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
                  style={{ background: "linear-gradient(135deg, var(--brand), #3B82F6)" }}
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
                  const fileId = `doc-file-${doc.type}`;
                  const dateId = `doc-date-${doc.type}`;
                  return (
                    <div
                      key={doc.type}
                      className="rounded-xl p-4"
                      style={{
                        background: "var(--bg-hover)",
                        border: `1px solid ${uploaded ? "rgba(74,222,128,0.3)" : "var(--border)"}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <label htmlFor={fileId} className="text-sm font-bold block" style={{ color: "var(--text-primary)" }}>{doc.label}</label>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{doc.hint}</p>
                        </div>
                        {uploaded && <span className="text-[11px] font-black text-green-400 shrink-0">✓ Subido</span>}
                        {uploading && <span className="text-[11px] shrink-0 animate-pulse" style={{ color: "var(--text-secondary)" }}>Subiendo...</span>}
                      </div>
                      <input
                        id={fileId}
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDocFile(doc.type, f); }}
                        className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-600/20 file:text-blue-300 hover:file:bg-blue-600/30 cursor-pointer"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      {doc.needsDate && (
                        <div className="mt-2">
                          <label htmlFor={dateId} className="text-[11px] block mb-1" style={{ color: "var(--text-muted)" }}>Fecha de emisión</label>
                          <input
                            id={dateId}
                            type="date"
                            value={docDates[doc.type] ?? ""}
                            onChange={e => setDocDates(p => ({ ...p, [doc.type]: e.target.value }))}
                            className="rounded-lg px-3 py-1.5 text-xs"
                            style={{
                              background: "var(--bg-input)",
                              border: "1px solid var(--border)",
                              color: "var(--text-primary)",
                            }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                            onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => setSellerStep(1)}
                    className="flex-1 py-3 rounded-xl font-bold text-sm"
                    style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                  >
                    ← Atrás
                  </button>
                  <button
                    onClick={handleSellerSubmit}
                    disabled={submitting}
                    className="flex-1 py-3 rounded-xl font-black text-white text-sm disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
                  >
                    {submitting ? "Enviando..." : "Enviar solicitud"}
                  </button>
                </div>
                <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>Tu solicitud será revisada por el equipo en 1-3 días hábiles</p>
              </div>
            )}
          </div>
        </div>
      )}
      </main>
    </div>
    </ErrorBoundary>
  );
}
