"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ErrorBoundary from "@/components/ErrorBoundary";
import PokemonCardSearch from "@/components/PokemonCardSearch";
import { useAuth } from "@/contexts/auth";
import { useRouter } from "next/navigation";
import { auctionsApi, ordersApi, listingsApi, shippingApi, type ApiAuction, type ApiOrder, type SellerStats, type ApiListing, type ShippingQuote } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { useAnalytics } from "@/hooks/useAnalytics";
import { gameLabel, usdCentsToMxnCents } from "@/lib/format";

type AuctionStatus = "live" | "ending" | "upcoming" | "scheduled" | "cancelled" | "ended";
type Tab = "dashboard" | "subastas" | "crear" | "ventas" | "ordenes" | "cobros";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Resumen"           },
  { key: "subastas",  label: "Mis Subastas"      },
  { key: "crear",     label: "Crear Subasta"     },
  { key: "ventas",    label: "Mis Ventas"         },
  { key: "ordenes",   label: "Órdenes de Venta"  },
  { key: "cobros",    label: "Cobros"             },
];

const AUCTION_STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  live:      { label: "EN VIVO",    color: "var(--error-text)", bg: "rgba(239,68,68,0.12)"   },
  ending:    { label: "CERRANDO",   color: "#fbbf24", bg: "rgba(245,158,11,0.12)"  },
  upcoming:  { label: "PROGRAMADA", color: "var(--accent-text)", bg: "rgba(37,99,235,0.12)"  },
  scheduled: { label: "PROGRAMADA", color: "var(--accent-text)", bg: "rgba(37,99,235,0.12)"  },
  ended:     { label: "FINALIZADA", color: "#71717a", bg: "rgba(113,113,122,0.12)" },
  cancelled: { label: "CANCELADA",  color: "#71717a", bg: "rgba(113,113,122,0.12)" },
};

const SALE_STATUS_STYLE = {
  pendiente_envio: { label: "Pendiente de envío", color: "#fbbf24", bg: "rgba(245,158,11,0.12)", icon: "📦" },
  enviado:         { label: "Enviado",             color: "#60a5fa", bg: "rgba(96,165,250,0.12)", icon: "🚚" },
  entregado:       { label: "Entregado",           color: "#4ade80", bg: "rgba(74,222,128,0.12)", icon: "✅" },
  disputa:         { label: "En disputa",          color: "var(--error-text)", bg: "rgba(248,113,113,0.12)", icon: "⚠️" },
};

const CONDITIONS = ["NM", "LP", "MP", "HP", "PSA 10", "PSA 9", "PSA 8", "BGS 9.5", "BGS 9"];
const DURATIONS  = ["15 minutos", "30 minutos", "1 hora", "2 horas", "4 horas", "6 horas", "12 horas", "24 horas"];

const DURATION_MS: Record<string, number> = {
  "15 minutos": 15 * 60 * 1000,
  "30 minutos": 30 * 60 * 1000,
  "1 hora":     1  * 60 * 60 * 1000,
  "2 horas":    2  * 60 * 60 * 1000,
  "4 horas":    4  * 60 * 60 * 1000,
  "6 horas":    6  * 60 * 60 * 1000,
  "12 horas":   12 * 60 * 60 * 1000,
  "24 horas":   24 * 60 * 60 * 1000,
};

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

const GAMES = [
  { value: "pokemon",    label: "Pokémon" },
  { value: "onepiece",   label: "One Piece" },
  { value: "yugioh",     label: "Yu-Gi-Oh!" },
  { value: "mtg",        label: "Magic: The Gathering" },
  { value: "lorcana",    label: "Disney Lorcana" },
  { value: "dragonball", label: "Dragon Ball Super" },
  { value: "sports",     label: "Deportes / Sports Cards" },
  { value: "other",      label: "Otro / Mixto" },
];

// Styled input for the form
function FormInput({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const inputCls = "w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 transition-all";
const inputStyle = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" };

export default function VendedorPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { capture } = useAnalytics();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [launchingStream, setLaunchingStream] = useState(false);
  const [showStreamForm, setShowStreamForm] = useState(false);
  const [streamTitle, setStreamTitle] = useState("");
  const [streamCategories, setStreamCategories] = useState<string[]>(["pokemon"]);
  const [streamEmojis, setStreamEmojis] = useState<string[]>(["🔥", "❤️", "💎", "🎯", "😂"]);
  const [form, setForm] = useState<AuctionForm>(EMPTY_FORM);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [saleFilter, setSaleFilter] = useState<AuctionStatus | "all">("all");
  const [shippingOrder, setShippingOrder] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");

  // Shipping quote flow
  const [quoteOrder,       setQuoteOrder]       = useState<string | null>(null);
  const [weightKg,         setWeightKg]         = useState("0.1");
  const [shippingQuotes,   setShippingQuotes]   = useState<ShippingQuote[] | null>(null);
  const [quotesLoading,    setQuotesLoading]    = useState(false);
  const [selectedCarrier,  setSelectedCarrier]  = useState<string | null>(null);
  const [generatingLabel,  setGeneratingLabel]  = useState(false);
  const [labelResult,      setLabelResult]      = useState<{ trackingNumber: string; labelUrl: string; carrier: string } | null>(null);
  const [creating,      setCreating]      = useState(false);
  const [createError,   setCreateError]   = useState("");
  const [uploadingImg,  setUploadingImg]  = useState(false);
  const [startingId,    setStartingId]    = useState<string | null>(null);

  // Ventas (listings)
  const [myListings,       setMyListings]       = useState<ApiListing[] | null>(null);
  const [listingForm,      setListingForm]      = useState({ title: "", price: "", game: "", condition: "", description: "", imageUrl: "" });
  const [listingUploading, setListingUploading] = useState(false);
  const [listingCreating,  setListingCreating]  = useState(false);
  const [listingError,     setListingError]     = useState("");
  const [listingDone,      setListingDone]      = useState(false);

  // Real API data
  const [myAuctions,   setMyAuctions]   = useState<ApiAuction[]>([]);
  const [sellerStats,  setSellerStats]  = useState<SellerStats | null>(null);
  const [sellerOrders, setSellerOrders] = useState<ApiOrder[] | null>(null);
  const [dashboardError, setDashboardError] = useState(false);
  const [tabLoadError,   setTabLoadError]   = useState(false);

  const loadedTabsRef = useRef<Set<string>>(new Set());

  const loadDashboard = useCallback(() => {
    setDashboardError(false);
    Promise.all([
      auctionsApi.my(),
      ordersApi.sellerStats(),
    ]).then(([auctionsRes, statsRes]) => {
      setMyAuctions(auctionsRes.data);
      setSellerStats(statsRes.data);
    }).catch(() => setDashboardError(true));
  }, []);

  const loadTabData = useCallback((t: Tab) => {
    setTabLoadError(false);
    let promise: Promise<unknown> | null = null;
    if (t === "ordenes" || t === "cobros") {
      promise = ordersApi.selling().then(res => setSellerOrders(res.data));
    } else if (t === "ventas") {
      promise = listingsApi.my().then(res => setMyListings(res.data));
    } else if (t === "subastas") {
      promise = auctionsApi.my().then(res => setMyAuctions(res.data));
    }
    promise?.catch(() => setTabLoadError(true));
  }, []);

  useEffect(() => {
    if (!showStreamForm) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setShowStreamForm(false); }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [showStreamForm]);

  useEffect(() => { setTrackingInput(""); }, [shippingOrder]);

  useEffect(() => {
    setShippingQuotes(null);
    setSelectedCarrier(null);
    setLabelResult(null);
    setWeightKg("0.1");
    setShippingError(null);
  }, [quoteOrder]);

  useEffect(() => {
    if (!user) return;
    loadedTabsRef.current.add("dashboard");
    loadDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (loadedTabsRef.current.has(tab)) return;
    loadedTabsRef.current.add(tab);
    loadTabData(tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user]);

  async function handleImageUpload(file: File) {
    setUploadingImg(true);
    try {
      const url = await uploadToCloudinary(file, "tcg-live/auction-items", "image");
      setForm(f => ({ ...f, imageUrl: url }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al subir imagen";
      setCreateError(msg);
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
    if (!form.imageUrl) {
      setCreateError("Sube una foto del producto para continuar.");
      return;
    }
    if (!form.name || !form.condition || !form.startingBid) {
      setCreateError("Completa todos los campos obligatorios.");
      return;
    }
    setCreating(true);
    try {
      const durationMs = form.duration ? DURATION_MS[form.duration] : 30 * 60 * 1000;
      const res = await auctionsApi.create({
        title: form.name,
        description: form.description || undefined,
        items: [{
          cardName:      form.name,
          cardSet:       form.set || undefined,
          condition:     form.condition || undefined,
          startingPrice: Math.round(Number(form.startingBid) * 100),
          binPrice:      form.binPrice ? Math.round(Number(form.binPrice) * 100) : undefined,
          imageUrls:     form.imageUrl ? [form.imageUrl] : undefined,
        }],
      });
      const auctionId = res.data.id;
      await auctionsApi.start(auctionId, durationMs);
      capture("auction_created", { game: form.set || undefined, hasImage: !!form.imageUrl });
      router.push(`/auctions/${auctionId}`);
    } catch (err: any) {
      setCreateError(err?.response?.data?.message ?? "Error al crear la subasta. Verifica tus datos.");
    } finally {
      setCreating(false);
    }
  }

  function handleReset() {
    setForm(EMPTY_FORM);
  }

  async function handleListingImageUpload(file: File) {
    setListingUploading(true);
    try {
      const url = await uploadToCloudinary(file, "tcg-live/listings", "image");
      setListingForm(f => ({ ...f, imageUrl: url }));
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
        price:       Math.round(Number(listingForm.price) * 100),
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

  async function launchLivestream() {
    setShowStreamForm(false);
    setLaunchingStream(true);
    try {
      const res = await auctionsApi.create({ game: (streamCategories[0] ?? "other") as any, categories: streamCategories, isStream: true, reactionEmojis: streamEmojis });
      const auctionId = (res.data as any).id;
      await auctionsApi.start(auctionId);
      router.push(`/auctions/${auctionId}?stream=1`);
    } catch (err: any) {
      setLaunchingStream(false);
      alert(err?.response?.data?.message ?? "No se pudo iniciar el stream.");
    }
  }

  const totalRevenue = sellerStats?.totalRevenue ?? 0;

  return (
    <ErrorBoundary>
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />

      {/* Stream setup modal */}
      {showStreamForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.8)" }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stream-modal-heading"
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "var(--bg-surface)", border: "1px solid rgba(37,99,235,0.3)", boxShadow: "0 0 40px rgba(37,99,235,0.2), var(--card-shadow)" }}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "rgba(220,38,38,0.15)" }}>
                🔴
              </span>
              <h2 id="stream-modal-heading" className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Configura tu directo</h2>
            </div>
            <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>El nombre del live se asigna solo; cada puja dentro tendrá su propio número.</p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-secondary)" }}>Nombre del live</label>
                <div className="w-full rounded-xl px-3.5 py-3 text-sm font-semibold flex items-center justify-between"
                  style={{ background: "var(--bg-elevated)", border: "1px dashed var(--border)", color: "var(--text-secondary)" }}>
                  <span>{`puja #____-${String(new Date().getMonth() + 1).padStart(2, "0")}-${new Date().getFullYear()}`}</span>
                  <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>automático</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
                  <span>Categorías</span>
                  <span style={{ color: "var(--text-muted)" }}>{streamCategories.length} seleccionada{streamCategories.length === 1 ? "" : "s"}</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {GAMES.map(g => {
                    const on = streamCategories.includes(g.value);
                    return (
                      <button key={g.value} type="button"
                        onClick={() => setStreamCategories(prev => prev.includes(g.value) ? prev.filter(x => x !== g.value) : [...prev, g.value])}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                        style={on
                          ? { background: "color-mix(in srgb, var(--brand) 15%, transparent)", border: "1px solid var(--border-brand)", color: "var(--text-primary)" }
                          : { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        {g.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>Elige una o varias — se usan para filtrar en “Todas las subastas”.</p>
              </div>

              {/* Reaction emojis — the seller picks up to 6 for the live view */}
              <div>
                <label className="text-xs font-semibold mb-1.5 flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
                  <span>Emojis de reacción</span>
                  <span style={{ color: "var(--text-muted)" }}>{streamEmojis.length}/6</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {["🔥","❤️","💎","🎯","😂","😮","👏","🙌","💯","⭐","🎉","🃏","⚡","😱","🤩","💰"].map(em => {
                    const on = streamEmojis.includes(em);
                    return (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setStreamEmojis(prev => prev.includes(em) ? prev.filter(x => x !== em) : (prev.length >= 6 ? prev : [...prev, em]))}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all"
                        style={on
                          ? { background: "color-mix(in srgb, var(--brand) 15%, transparent)", border: "1px solid var(--border-brand)" }
                          : { background: "var(--bg-input)", border: "1px solid var(--border)", opacity: streamEmojis.length >= 6 ? 0.4 : 1 }}
                      >
                        {em}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>Estos aparecerán como reacciones flotantes en tu directo.</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowStreamForm(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-colors"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={launchLivestream}
                  disabled={launchingStream}
                  className="flex-1 py-3 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", boxShadow: "0 4px 16px rgba(220,38,38,0.4)" }}
                >
                  Ir en vivo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main id="main">
      {/* Header */}
      <div className="pt-24 pb-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {/* Ambient glow */}
        <div className="absolute left-0 right-0 overflow-hidden pointer-events-none" aria-hidden="true" style={{ top: "80px", height: "200px" }}>
          <div
            className="absolute left-1/4 w-96 h-48 opacity-20 rounded-full"
            style={{ background: "radial-gradient(circle, #2563EB, transparent 70%)", filter: "blur(60px)" }}
          />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 py-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl"
                style={{
                  background: "linear-gradient(135deg, #1e1e2e, #2d1b69)",
                  border: "1px solid rgba(37,99,235,0.4)",
                  boxShadow: "0 0 32px rgba(37,99,235,0.3)",
                }}
              >
                🧑‍💼
              </div>
              <span
                className="absolute -bottom-1.5 -right-1.5 text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{ background: "#2563EB", border: "2px solid var(--bg-base)", color: "#fff" }}
              >
                Vendedor
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>{user?.username ?? "—"}</h1>
                {user?.role === "SELLER" && (
                  <span className="text-sm font-semibold" style={{ color: "var(--accent-text)" }}>✓ Verificado</span>
                )}
              </div>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>Panel de vendedor</p>

              <div className="flex flex-wrap items-center gap-6 mt-4">
                {[
                  { label: "Subastas activas", value: sellerStats?.activeAuctions ?? myAuctions.filter(a => a.status === "live").length, color: "var(--error-text)" },
                  { label: "Total vendido",    value: `$${(totalRevenue / 100).toLocaleString("es-MX")} MXN`, color: "var(--accent-text)" },
                  { label: "Pendientes envío", value: sellerStats?.pendingOrders ?? (sellerOrders?.filter(o => o.status === "pending" || o.status === "pendiente_pago").length ?? 0), color: "#fbbf24" },
                  { label: "Mis subastas",     value: myAuctions.length, color: "#60a5fa" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA buttons */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Go Live button — prominent with pulsing glow */}
              <div className="relative">
                {launchingStream && (
                  <div
                    className="absolute inset-0 rounded-2xl animate-ping opacity-40"
                    style={{ background: "rgba(220,38,38,0.5)" }}
                  />
                )}
                <button
                  onClick={() => setShowStreamForm(true)}
                  disabled={launchingStream}
                  className="relative flex items-center gap-2.5 text-sm font-black text-white px-6 py-3 rounded-2xl transition-all disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #dc2626, #ef4444)",
                    boxShadow: launchingStream
                      ? "0 0 0 4px rgba(220,38,38,0.3), 0 8px 32px rgba(220,38,38,0.6)"
                      : "0 4px 24px rgba(220,38,38,0.5)",
                  }}
                >
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse shrink-0" />
                  {launchingStream ? "Iniciando..." : "Iniciar Directo"}
                </button>
              </div>

              <button
                onClick={() => setTab("crear")}
                className="shrink-0 text-sm font-bold text-white px-5 py-3 rounded-2xl transition-all"
                style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 20px rgba(37,99,235,0.35)" }}
              >
                + Nueva subasta
              </button>
            </div>
          </div>

          {/* Tab bar — pill-shaped */}
          <div className="relative mt-8">
            <div
              className="flex items-center gap-1.5 overflow-x-auto pb-1"
              style={{
                msOverflowStyle: "none",
                scrollbarWidth: "none",
                maskImage: "linear-gradient(to right, transparent 0%, black 3%, black 94%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 3%, black 94%, transparent 100%)",
              }}
            >
              {TABS.map((t) => {
                const active = tab === t.key;
                const pendingOrdersCount = t.key === "ordenes"
                  ? (sellerOrders?.filter(o => o.status === "pending" || o.status === "pendiente_pago").length ?? 0)
                  : 0;
                const isCobros = t.key === "cobros";
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    role="tab"
                    aria-selected={active}
                    className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all"
                    style={
                      active
                        ? {
                            background: "rgba(37,99,235,0.18)",
                            color: "var(--accent-text)",
                            boxShadow: "0 0 16px rgba(37,99,235,0.3)",
                            border: "1px solid rgba(37,99,235,0.4)",
                          }
                        : {
                            color: "var(--text-muted)",
                            background: "transparent",
                            border: "1px solid transparent",
                          }
                    }
                  >
                    {isCobros && <span className="text-base">💰</span>}
                    {t.label}
                    {pendingOrdersCount > 0 && (
                      <span
                        className="text-xs font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                        style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}
                      >
                        {pendingOrdersCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-5xl px-6 py-8">

        {(dashboardError || tabLoadError) && (
          <div
            role="alert"
            className="mb-6 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-3"
            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--error-text)" }}
          >
            <span>No se pudieron cargar tus datos de vendedor. Intenta de nuevo.</span>
            <button
              type="button"
              onClick={() => { if (dashboardError) loadDashboard(); if (tabLoadError) loadTabData(tab); }}
              className="shrink-0 font-semibold underline underline-offset-2"
              style={{ color: "var(--accent-text)" }}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* ─── DASHBOARD ─── */}
        {tab === "dashboard" && (
          <div className="space-y-6">

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Ingresos totales",    value: `$${(totalRevenue / 100).toLocaleString("es-MX")}`, sub: "MXN", icon: "💰", iconBg: "color-mix(in srgb, var(--brand) 15%, transparent)", valueColor: "var(--accent-text)" },
                { label: "Subastas activas",     value: sellerStats?.activeAuctions ?? myAuctions.filter(a => a.status === "live" || a.status === "ending").length, sub: "en curso", icon: "⚡", iconBg: "rgba(239,68,68,0.12)", valueColor: "var(--error-text)" },
                { label: "Pendientes de envío",  value: sellerStats?.pendingOrders ?? (sellerOrders?.filter(o => o.status === "pending" || o.status === "confirmed").length ?? 0), sub: "por enviar", icon: "📦", iconBg: "rgba(245,158,11,0.12)", valueColor: "#fbbf24" },
                { label: "Mis subastas",         value: myAuctions.length, sub: "historial total", icon: "🏷", iconBg: "rgba(96,165,250,0.12)", valueColor: "#60a5fa" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl p-5 transition-all"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3"
                    style={{ background: s.iconBg }}
                  >
                    {s.icon}
                  </div>
                  <p className="text-2xl font-black" style={{ color: s.valueColor }}>{s.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.sub}</p>
                  <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Two columns: active auction + activity */}
            <div className="grid lg:grid-cols-2 gap-4">

              {/* Subasta en vivo */}
              <div
                className="rounded-2xl p-5"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Subasta en vivo</h3>
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--error-text)]">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    EN VIVO
                  </span>
                </div>
                {myAuctions.filter(a => a.status === "live").length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-3xl mb-2">📺</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Sin subastas en vivo ahora</p>
                    <button
                      onClick={() => setShowStreamForm(true)}
                      className="mt-3 text-xs font-bold px-4 py-2 rounded-xl text-white transition-all"
                      style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", boxShadow: "0 4px 12px rgba(220,38,38,0.35)" }}
                    >
                      Iniciar directo
                    </button>
                  </div>
                ) : myAuctions.filter(a => a.status === "live").map((a) => (
                  <div key={a.id}>
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-14 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-lg shrink-0"
                        style={{ boxShadow: "0 0 16px rgba(59,130,246,0.4)" }}
                      >
                        🃏
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{a.title ?? a.name ?? "Sin título"}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{gameLabel(a.game)} · {a.condition ?? ""}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Puja actual", value: `$${((a.currentBid ?? 0) / 100).toLocaleString("es-MX")}` },
                        { label: "Pujas",       value: a.totalBids ?? 0 },
                        { label: "Espectadores",value: a.viewers ?? 0 },
                      ].map((m) => (
                        <div
                          key={m.label}
                          className="rounded-xl p-3 text-center"
                          style={{ background: "var(--bg-elevated)" }}
                        >
                          <p className="font-black text-sm" style={{ color: "var(--text-primary)" }}>{m.value}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{m.label}</p>
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
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
              >
                <h3 className="font-bold text-sm mb-4" style={{ color: "var(--text-primary)" }}>Órdenes recientes</h3>
                {(sellerOrders ?? []).length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Sin órdenes aún</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(sellerOrders ?? []).slice(0, 5).map((o) => {
                      const statusIcon: Record<string, string> = { pending: "⏳", confirmed: "✓", shipped: "🚚", delivered: "✅" };
                      return (
                        <div key={o.id} className="flex items-start gap-3">
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                            style={{ background: "var(--bg-elevated)" }}
                          >
                            {statusIcon[o.status] ?? "📋"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs leading-snug" style={{ color: "var(--text-primary)" }}>
                              {o.items?.[0]?.cardName ?? "Carta"} — ${(o.totalAmount / 100).toLocaleString("es-MX")} MXN
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
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
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Resumen de ventas</h3>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Total acumulado</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Ingresos totales", value: `$${(totalRevenue / 100).toLocaleString("es-MX")} MXN`, color: "var(--accent-text)" },
                  { label: "Órdenes totales",  value: sellerOrders?.length ?? 0,                              color: "#4ade80" },
                  { label: "Subastas totales", value: myAuctions.length,                                      color: "#60a5fa" },
                ].map(s => (
                  <div
                    key={s.label}
                    className="rounded-xl p-4 text-center"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── MIS SUBASTAS ─── */}
        {tab === "subastas" && (
          <div className="space-y-4">
            {/* Filter pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {(["all", "live", "ending", "scheduled", "ended"] as const).map((f) => {
                const count = f === "all" ? myAuctions.length : myAuctions.filter(a => a.status === f || (f === "scheduled" && a.status === "upcoming")).length;
                const labels: Record<string, string> = { all: "Todas", live: "En vivo", ending: "Cerrando", scheduled: "Programadas", ended: "Terminadas" };
                const active = saleFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setSaleFilter(f)}
                    aria-pressed={active}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all"
                    style={
                      active
                        ? { background: "rgba(37,99,235,0.18)", border: "1px solid rgba(37,99,235,0.4)", color: "var(--accent-text)", boxShadow: "0 0 12px rgba(37,99,235,0.25)" }
                        : { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)" }
                    }
                  >
                    {labels[f]}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-md"
                      style={{ background: active ? "rgba(37,99,235,0.3)" : "var(--bg-hover)", color: active ? "var(--accent-text)" : "var(--text-muted)" }}
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
                <p className="font-medium" style={{ color: "var(--text-secondary)" }}>Sin subastas en esta categoría</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAuctions.map((a) => {
                  const s = AUCTION_STATUS_STYLE[a.status ?? "upcoming"];
                  const title = a.title ?? a.name ?? "Sin título";
                  const currentBid = a.currentBid ?? a.startingBid ?? 0;

                  if (a.status === "ended") {
                    const allItems   = a.items ?? [];
                    const soldItems  = allItems.filter(i => i.status === "sold");
                    const totalItems = allItems.length;
                    const revenue    = soldItems.reduce((sum, i) => sum + (i.currentBid ?? 0), 0);
                    return (
                      <div
                        key={a.id}
                        className="rounded-2xl p-4"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: s?.bg, color: s?.color }}>
                                {s?.label ?? "Terminada"}
                              </span>
                              {a.game && (
                                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{gameLabel(a.game)}</span>
                              )}
                            </div>
                            <p className="font-bold text-sm leading-tight truncate" style={{ color: "var(--text-primary)" }}>{title}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Link
                              href={`/auctions/${a.id}`}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-center transition-all"
                              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                            >
                              Ver
                            </Link>
                            <button
                              onClick={async () => {
                                if (!confirm("¿Archivar esta subasta? Desaparecerá de tu panel.")) return;
                                try {
                                  await auctionsApi.archive(a.id);
                                  setMyAuctions(prev => prev.filter(x => x.id !== a.id));
                                } catch (err: any) {
                                  alert(err?.response?.data?.message ?? "Error al archivar");
                                }
                              }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-center transition-all"
                              style={{ background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
                            >
                              Archivar
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-elevated)" }}>
                            <p className="text-base font-black text-green-400">{soldItems.length}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>vendidos</p>
                          </div>
                          <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-elevated)" }}>
                            <p className="text-base font-black" style={{ color: "var(--text-secondary)" }}>{totalItems - soldItems.length}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>sin vender</p>
                          </div>
                          <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-elevated)" }}>
                            <p className="text-base font-black" style={{ color: "var(--accent-text)" }}>
                              {revenue > 0 ? `$${(revenue / 100).toLocaleString("es-MX")}` : `$${(currentBid / 100).toLocaleString("es-MX")}`}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>recaudado</p>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={a.id}
                      className="rounded-2xl p-4 flex items-center gap-4 transition-all"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
                    >
                      {/* Card image */}
                      {a.items?.[0]?.imageUrls?.[0] ? (
                        <img
                          src={a.items[0].imageUrls![0]}
                          alt={a.title ?? a.name ?? "Carta"}
                          width={48}
                          height={64}
                          className="w-12 h-16 object-contain rounded-xl shrink-0"
                        />
                      ) : (
                        <div
                          className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0"
                          style={{ boxShadow: "0 0 16px rgba(59,130,246,0.4)" }}
                        >
                          🃏
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>{title}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {gameLabel(a.game)} {a.condition ? `· ${a.condition}` : ""}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: s?.bg, color: s?.color }}>
                            {s?.label ?? a.status}
                          </span>
                          {a.status !== "upcoming" && a.status !== "scheduled" && (
                            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{a.totalBids ?? 0} pujas</span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-right shrink-0">
                        <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>
                          {(a.status === "upcoming" || a.status === "scheduled") ? "Precio inicial" : "Puja actual"}
                        </p>
                        <p className="font-black text-lg" style={{ color: "var(--text-primary)" }}>
                          ${(currentBid / 100).toLocaleString("es-MX")}
                        </p>
                        {a.binPrice && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>BIN: ${(a.binPrice / 100).toLocaleString("es-MX")}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {(a.status === "upcoming" || a.status === "scheduled") && (
                          <>
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
                              className="text-xs font-black px-3 py-1.5 rounded-lg text-white text-center disabled:opacity-60 transition-all"
                              style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}
                            >
                              {startingId === a.id ? "..." : "Iniciar"}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm("¿Cancelar esta subasta? Esta acción no se puede deshacer.")) return;
                                try {
                                  await auctionsApi.cancel(a.id);
                                  setMyAuctions(prev => prev.filter(x => x.id !== a.id));
                                } catch (err: any) {
                                  alert(err?.response?.data?.message ?? "Error al cancelar");
                                }
                              }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-center transition-all"
                              style={{ background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
                            >
                              Cancelar
                            </button>
                          </>
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
                          style={{ background: "rgba(37,99,235,0.12)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.2)" }}
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
            <form onSubmit={handleSubmit} className="space-y-5">

              {createError && (
                <div className="px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                  {createError}
                </div>
              )}

              {/* Image upload — big drop zone */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
              >
                <div className="px-5 pt-5 pb-2">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                    Foto del producto
                  </p>
                </div>
                <label
                  className="block cursor-pointer"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                  />
                  <div
                    className="m-4 rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-4 transition-all"
                    style={{
                      borderColor: form.imageUrl ? "rgba(74,222,128,0.5)" : "var(--border)",
                      background: form.imageUrl ? "rgba(74,222,128,0.04)" : "var(--bg-elevated)",
                    }}
                  >
                    {uploadingImg ? (
                      <>
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(37,99,235,0.12)" }}>
                          <div className="w-6 h-6 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
                        </div>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Subiendo imagen...</p>
                      </>
                    ) : form.imageUrl ? (
                      <>
                        <img src={form.imageUrl} alt={form.name ? `Carta: ${form.name}` : "Foto de la carta subida"} width={96} height={128} className="w-24 h-32 object-contain rounded-xl" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }} />
                        <div className="text-center">
                          <p className="text-sm font-semibold text-green-400">✓ Imagen lista</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Clic para cambiar la foto</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: "rgba(37,99,235,0.10)" }}>
                          📸
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                            Subir foto del producto{" "}
                            <span style={{ color: "var(--brand)" }}>*</span>
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Obligatorio · PNG, JPG hasta 10 MB</p>
                        </div>
                        <span
                          className="text-xs font-semibold px-5 py-2.5 rounded-xl"
                          style={{ background: "rgba(37,99,235,0.12)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.2)" }}
                        >
                          Seleccionar archivo
                        </span>
                      </>
                    )}
                  </div>
                </label>
              </div>

              {/* Card details section */}
              <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
                <p className="text-xs font-bold uppercase tracking-widest pb-3" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
                  Detalles de la carta
                </p>

                {/* Card name */}
                <div>
                  <label htmlFor="auction-card-name" className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    Nombre de la carta <span style={{ color: "var(--brand)" }}>*</span>
                  </label>
                  <PokemonCardSearch
                    id="auction-card-name"
                    value={form.name}
                    onChange={(v) => handleFormChange("name", v)}
                    onSelectCard={(card) => {
                      setForm(f => ({
                        ...f,
                        name: card.name,
                        set: card.set,
                        imageUrl: card.imageLarge || card.image || f.imageUrl,
                        startingBid: card.marketPriceCents != null
                          ? String(Math.round(usdCentsToMxnCents(card.marketPriceCents) / 100))
                          : f.startingBid,
                      }));
                    }}
                    placeholder="Ej. Charizard VMAX Rainbow"
                  />
                  <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                    Busca en la base de datos de Pokémon para autocompletar nombre, set, imagen y precio de mercado — convertido a MXN a un tipo de cambio de referencia (editable, revisa antes de publicar).
                  </p>
                </div>

                {/* Set + Condition */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="auction-set" className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                      Set / Colección
                    </label>
                    <input
                      id="auction-set"
                      type="text"
                      value={form.set}
                      onChange={(e) => handleFormChange("set", e.target.value)}
                      placeholder="Ej: Scarlet & Violet, Kamigawa..."
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="auction-condition" className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                      Condición <span style={{ color: "var(--brand)" }}>*</span>
                    </label>
                    <select
                      id="auction-condition"
                      required
                      value={form.condition}
                      onChange={(e) => handleFormChange("condition", e.target.value)}
                      className={inputCls}
                      style={{ ...inputStyle, color: form.condition ? "var(--text-primary)" : "var(--text-muted)" }}
                    >
                      <option value="" disabled>Seleccionar grado</option>
                      {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="auction-description" className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                    Descripción
                  </label>
                  <textarea
                    id="auction-description"
                    rows={3}
                    placeholder="Describe el estado, características especiales, incluye certificado de autenticidad si aplica..."
                    value={form.description}
                    onChange={(e) => handleFormChange("description", e.target.value)}
                    className={`${inputCls} resize-none`}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Pricing section */}
              <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
                <p className="text-xs font-bold uppercase tracking-widest pb-3" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
                  Precio y duración
                </p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="auction-starting-bid" className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                      Puja inicial (MXN) <span style={{ color: "var(--brand)" }}>*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                      <input
                        id="auction-starting-bid"
                        required
                        type="number"
                        min={1}
                        placeholder="0"
                        value={form.startingBid}
                        onChange={(e) => handleFormChange("startingBid", e.target.value)}
                        className={`${inputCls} pl-8`}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="auction-bin-price" className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                      Precio BIN (opcional)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                      <input
                        id="auction-bin-price"
                        type="number"
                        min={1}
                        placeholder="Comprar ya"
                        value={form.binPrice}
                        onChange={(e) => handleFormChange("binPrice", e.target.value)}
                        className={`${inputCls} pl-8`}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                    Duración de la subasta <span style={{ color: "var(--brand)" }}>*</span>
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
                            ? { background: "rgba(37,99,235,0.18)", border: "1px solid rgba(37,99,235,0.5)", color: "var(--accent-text)", boxShadow: "0 0 12px rgba(37,99,235,0.2)" }
                            : { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)" }
                        }
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fee notice */}
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: "rgba(37,99,235,0.06)", border: "1px solid var(--border-brand)" }}
              >
                <span className="text-lg shrink-0">ℹ️</span>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  TCG Live cobra una comisión del{" "}
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>5%</span>{" "}
                  sobre el precio final de venta. Sin cobros si la carta no se vende.
                </p>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full py-4 rounded-xl text-sm font-black text-white transition-all disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                  boxShadow: "0 4px 24px rgba(37,99,235,0.45)",
                }}
              >
                {creating ? "Publicando..." : "Publicar subasta →"}
              </button>
            </form>
          </div>
        )}

        {/* ─── MIS VENTAS ─── */}
        {tab === "ventas" && (
          <div className="space-y-6">

            {/* Crear nueva venta */}
            {!listingDone ? (
              <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
                <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
                  <h3 className="font-black text-base" style={{ color: "var(--text-primary)" }}>Nueva venta (precio fijo)</h3>
                </div>
                <div className="p-6">
                  {listingError && (
                    <div className="mb-4 px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                      {listingError}
                    </div>
                  )}

                  <form onSubmit={handleListingSubmit} className="space-y-4">
                    {/* Image upload */}
                    <label
                      className="rounded-xl border-2 border-dashed p-5 flex items-center gap-4 cursor-pointer transition-all block"
                      style={{
                        borderColor: listingForm.imageUrl ? "rgba(74,222,128,0.5)" : "var(--border)",
                        background: listingForm.imageUrl ? "rgba(74,222,128,0.04)" : "var(--bg-elevated)",
                      }}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleListingImageUpload(f); }}
                      />
                      {listingForm.imageUrl
                        ? <img src={listingForm.imageUrl} alt="" width={64} height={80} className="w-16 h-20 object-contain rounded-lg shrink-0" style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }} />
                        : (
                          <div className="w-16 h-20 rounded-lg flex items-center justify-center text-2xl shrink-0" style={{ background: "rgba(37,99,235,0.10)" }}>
                            📸
                          </div>
                        )
                      }
                      <div>
                        <p className="text-sm font-semibold" style={{ color: listingForm.imageUrl ? "#4ade80" : "var(--text-primary)" }}>
                          {listingUploading ? "Subiendo..." : listingForm.imageUrl ? "✓ Imagen lista — clic para cambiar" : "Subir foto de la carta"}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>PNG, JPG hasta 10 MB</p>
                      </div>
                    </label>

                    {/* Title */}
                    <div>
                      <label htmlFor="listing-title" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                        Nombre de la carta *
                      </label>
                      <PokemonCardSearch
                        id="listing-title"
                        value={listingForm.title}
                        onChange={(v) => setListingForm(f => ({ ...f, title: v }))}
                        onSelectCard={(card) => {
                          setListingForm(f => ({
                            ...f,
                            title: card.name,
                            game: f.game || "pokemon",
                            imageUrl: card.imageLarge || card.image || f.imageUrl,
                            price: card.marketPriceCents != null
                              ? String(Math.round(usdCentsToMxnCents(card.marketPriceCents) / 100))
                              : f.price,
                          }));
                        }}
                        placeholder="Ej. Charizard EX Rainbow Rare"
                      />
                    </div>

                    {/* Price + Condition */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="listing-price" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Precio (MXN) *</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                          <input
                            id="listing-price"
                            required
                            type="number"
                            min={1}
                            value={listingForm.price}
                            onChange={e => setListingForm(f => ({ ...f, price: e.target.value }))}
                            placeholder="0"
                            className={`${inputCls} pl-8`}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="listing-condition" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Condición *</label>
                        <select
                          id="listing-condition"
                          required
                          value={listingForm.condition}
                          onChange={e => setListingForm(f => ({ ...f, condition: e.target.value }))}
                          className={inputCls}
                          style={{ ...inputStyle, color: listingForm.condition ? "var(--text-primary)" : "var(--text-muted)" }}
                        >
                          <option value="" disabled>Seleccionar</option>
                          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Game */}
                    <div>
                      <label htmlFor="listing-game" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Juego</label>
                      <input
                        id="listing-game"
                        value={listingForm.game}
                        onChange={e => setListingForm(f => ({ ...f, game: e.target.value }))}
                        placeholder="Pokémon, Magic, Yu-Gi-Oh!..."
                        className={inputCls}
                        style={inputStyle}
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label htmlFor="listing-description" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Descripción</label>
                      <textarea
                        id="listing-description"
                        rows={3}
                        value={listingForm.description}
                        onChange={e => setListingForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Estado, características, incluye sleeve, etc..."
                        className={`${inputCls} resize-none`}
                        style={inputStyle}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={listingCreating}
                      className="w-full py-3.5 rounded-xl font-black text-white text-sm disabled:opacity-60 transition-all"
                      style={{ background: "linear-gradient(135deg, #059669, #10b981)", boxShadow: "0 4px 20px rgba(5,150,105,0.35)" }}
                    >
                      {listingCreating ? "Publicando..." : "Publicar venta →"}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div
                className="rounded-2xl p-10 text-center"
                style={{ background: "var(--bg-surface)", border: "1px solid rgba(74,222,128,0.3)", boxShadow: "0 0 32px rgba(74,222,128,0.08)" }}
              >
                <p className="text-4xl mb-3">✅</p>
                <h3 className="font-black text-xl mb-1" style={{ color: "var(--text-primary)" }}>¡Venta publicada!</h3>
                <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                  Ya aparece en la tienda para que los compradores la vean.
                </p>
                <button
                  onClick={() => {
                    setListingDone(false);
                    setListingForm({ title: "", price: "", game: "", condition: "", description: "", imageUrl: "" });
                  }}
                  className="font-bold text-sm px-8 py-3 rounded-xl text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #059669, #10b981)", boxShadow: "0 4px 16px rgba(5,150,105,0.3)" }}
                >
                  Publicar otra venta
                </button>
              </div>
            )}

            {/* Mis ventas activas */}
            {(myListings ?? []).length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                  Mis ventas activas
                </p>
                <div className="space-y-3">
                  {(myListings ?? []).map(l => (
                    <div
                      key={l.id}
                      className="rounded-2xl p-4 flex items-center gap-4 transition-all"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
                    >
                      {l.imageUrls?.[0]
                        ? <img src={l.imageUrls[0]} alt="" width={48} height={64} className="w-12 h-16 object-contain rounded-xl shrink-0" />
                        : <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0">🃏</div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{l.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {gameLabel(l.game)} {l.condition ? `· ${l.condition}` : ""}
                        </p>
                        <span
                          className="mt-1.5 inline-block text-xs font-bold px-2.5 py-1 rounded-full"
                          style={{
                            background: l.status === "active" ? "rgba(74,222,128,0.12)" : "var(--bg-elevated)",
                            color: l.status === "active" ? "#4ade80" : "var(--text-muted)",
                          }}
                        >
                          {l.status === "active" ? "Activa" : l.status === "sold" ? "Vendida" : "Cancelada"}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-xl" style={{ color: "var(--text-primary)" }}>
                          ${((l.price ?? 0) / 100).toLocaleString("es-MX")}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>MXN</p>
                      </div>
                      {l.status === "active" && (
                        <button
                          onClick={async () => {
                            await listingsApi.cancel(l.id).catch(() => {});
                            const res = await listingsApi.my().catch(() => null);
                            if (res) setMyListings(res.data);
                          }}
                          className="text-xs shrink-0 px-3 py-2 rounded-lg transition-colors"
                          style={{ color: "var(--text-muted)", background: "var(--bg-hover)" }}
                        >
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
                <div className="w-6 h-6 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
              </div>
            )}
            {sellerOrders !== null && sellerOrders.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">📭</p>
                <p className="font-medium" style={{ color: "var(--text-secondary)" }}>Sin órdenes de venta aún</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Las órdenes aparecerán aquí cuando terminen tus subastas
                </p>
              </div>
            )}
            {(sellerOrders ?? []).map((order) => {
              const statusKey = order.status as keyof typeof SALE_STATUS_STYLE;
              const s = SALE_STATUS_STYLE[statusKey] ?? { label: order.status, color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "📋" };
              const isShipping = shippingOrder === order.id;
              const cardName = order.items?.[0]?.cardName ?? "Carta";
              const amount   = order.items?.reduce((sum, i) => sum + (i.finalPrice ?? 0), 0) ?? order.totalAmount ?? 0;
              const isPending = order.status === "pending" || order.status === "pendiente_pago" || order.status === "pending_payment";
              const isShipped = order.status === "shipped" || order.status === "en_camino";
              const date = new Date(order.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

              return (
                <div
                  key={order.id}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
                >
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Card image — prominent */}
                      {order.items?.[0]?.imageUrls?.[0] ? (
                        <img
                          src={order.items[0].imageUrls[0]}
                          alt={order.items[0].cardName ?? "Carta"}
                          width={56}
                          height={76}
                          className="w-14 h-[76px] object-contain rounded-xl shrink-0"
                          style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.25)" }}
                        />
                      ) : (
                        <div
                          className="w-14 h-[76px] rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-2xl shrink-0"
                          style={{ boxShadow: "0 0 20px rgba(59,130,246,0.4)" }}
                        >
                          🃏
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="font-bold text-base" style={{ color: "var(--text-primary)" }}>{cardName}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                              Comprador: <span style={{ color: "var(--text-secondary)" }}>@{order.buyer?.username ?? "—"}</span> · {date}
                            </p>
                          </div>
                          <span
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 font-mono"
                            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                          >
                            {order.id.slice(0, 8)}…
                          </span>
                        </div>

                        {/* Status badge — colored pill */}
                        <div className="flex items-center justify-between gap-2 mt-3">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                            style={{ background: s.bg, color: s.color }}
                          >
                            {s.icon} {s.label}
                          </span>

                          {/* Amount — large text */}
                          <div className="text-right shrink-0">
                            <p className="font-black text-xl" style={{ color: "var(--text-primary)" }}>
                              ${(amount / 100).toLocaleString("es-MX")}
                            </p>
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>MXN</p>
                          </div>
                        </div>

                        {order.trackingNumber && (
                          <p className="text-[11px] mt-2 font-mono" style={{ color: "var(--text-muted)" }}>
                            Rastreo: {order.trackingNumber}
                          </p>
                        )}

                        {/* Shipping flow */}
                        {isPending && order.paymentStatus === "paid" && (
                          <div className="mt-4">
                            {quoteOrder === order.id ? (
                              // Shipping flow
                              <div className="rounded-xl p-4 space-y-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-brand)" }}>

                                {/* Step 1 — Weight + quote */}
                                {!shippingQuotes && !labelResult && (
                                  <div>
                                    <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>Cotizar envío</p>
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1">
                                        <label htmlFor="shipping-weight" className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Peso del paquete (kg)</label>
                                        <input
                                          id="shipping-weight"
                                          type="number"
                                          step="0.1"
                                          min="0.1"
                                          value={weightKg}
                                          onChange={e => setWeightKg(e.target.value)}
                                          className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 transition-all"
                                          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                                          placeholder="0.1"
                                        />
                                      </div>
                                      <button
                                        disabled={quotesLoading || !weightKg || Number(weightKg) <= 0}
                                        onClick={async () => {
                                          if (!user?.zipCode) {
                                            setShippingError("Completa tu dirección en Ajustes antes de generar cotizaciones de envío.");
                                            return;
                                          }
                                          if (!order.buyerZip) {
                                            setShippingError("Este comprador no tiene una dirección registrada — no se puede cotizar el envío.");
                                            return;
                                          }
                                          setQuotesLoading(true);
                                          try {
                                            const quotes = await shippingApi.quote({
                                              originZip: user.zipCode,
                                              destinationZip: order.buyerZip,
                                              weightKg: Number(weightKg),
                                              items: order.items?.length ?? 1,
                                            });
                                            setShippingQuotes(quotes);
                                          } catch {
                                            setShippingError("Error al obtener cotizaciones. Intenta de nuevo.");
                                          } finally {
                                            setQuotesLoading(false);
                                          }
                                        }}
                                        className="shrink-0 text-xs font-bold text-white px-4 py-2.5 rounded-xl disabled:opacity-50 mt-4 transition-all"
                                        style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                                      >
                                        {quotesLoading ? "Cotizando…" : "Ver cotizaciones"}
                                      </button>
                                    </div>
                                    {shippingError && (
                                      <p className="text-xs text-[var(--error-text)] mt-2">{shippingError}</p>
                                    )}
                                  </div>
                                )}

                                {/* Step 2 — Carrier selection — radio-feel cards */}
                                {shippingQuotes && !labelResult && (
                                  <div>
                                    <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                                      Elige el servicio de envío
                                    </p>
                                    <div className="space-y-2">
                                      {shippingQuotes.map(q => {
                                        const selected = selectedCarrier === q.carrierId;
                                        return (
                                          <button
                                            key={q.carrierId}
                                            onClick={() => setSelectedCarrier(selected ? null : q.carrierId)}
                                            className="w-full flex items-center gap-4 px-4 py-4 rounded-xl transition-all text-left"
                                            style={{
                                              background: selected ? "rgba(37,99,235,0.10)" : "var(--bg-input)",
                                              border: `2px solid ${selected ? "#2563EB" : "var(--border)"}`,
                                              boxShadow: selected ? "0 0 16px rgba(37,99,235,0.2)" : "none",
                                            }}
                                          >
                                            {/* Radio indicator */}
                                            <div
                                              className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                                              style={{ borderColor: selected ? "#2563EB" : "var(--border)" }}
                                            >
                                              {selected && (
                                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#2563EB" }} />
                                              )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{q.carrier}</p>
                                              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                                {q.service} · {q.estimatedDays} día{q.estimatedDays !== 1 ? "s" : ""} hábil{q.estimatedDays !== 1 ? "es" : ""}
                                              </p>
                                            </div>
                                            <p className="text-base font-black shrink-0" style={{ color: selected ? "var(--accent-text)" : "var(--text-primary)" }}>
                                              ${(q.priceCents / 100).toLocaleString("es-MX")} MXN
                                            </p>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {selectedCarrier && (
                                      <button
                                        disabled={generatingLabel}
                                        onClick={async () => {
                                          if (!user?.zipCode) {
                                            setShippingError("Completa tu dirección en Ajustes antes de generar la guía.");
                                            return;
                                          }
                                          if (!order.buyerZip) {
                                            setShippingError("Este comprador no tiene una dirección registrada — no se puede generar la guía.");
                                            return;
                                          }
                                          setGeneratingLabel(true);
                                          try {
                                            const updated = await shippingApi.generateLabel(order.id, {
                                              carrierId: selectedCarrier,
                                              originZip: user.zipCode,
                                              destinationZip: order.buyerZip,
                                              weightKg: Number(weightKg),
                                            });
                                            capture("label_generated", { orderId: order.id, carrier: selectedCarrier });
                                            setLabelResult({
                                              trackingNumber: updated.trackingNumber ?? "",
                                              labelUrl:       updated.labelUrl ?? "",
                                              carrier:        updated.carrier ?? selectedCarrier,
                                            });
                                            const refreshed = await ordersApi.selling().catch(() => null);
                                            if (refreshed) setSellerOrders(refreshed.data);
                                          } catch {
                                            setShippingError("Error al generar la guía. Intenta de nuevo.");
                                          } finally {
                                            setGeneratingLabel(false);
                                          }
                                        }}
                                        className="mt-4 w-full text-sm font-bold text-white py-3 rounded-xl disabled:opacity-50 transition-all"
                                        style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}
                                      >
                                        {generatingLabel ? "Generando guía…" : "Generar guía de envío →"}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => { setShippingQuotes(null); setSelectedCarrier(null); }}
                                      className="mt-2 text-xs w-full text-center py-1 transition-colors"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      ← Cambiar peso
                                    </button>
                                  </div>
                                )}

                                {/* Step 3 — Label result */}
                                {labelResult && (
                                  <div className="text-center space-y-3">
                                    <div className="text-3xl">✅</div>
                                    <p className="text-sm font-bold text-green-400">¡Guía generada!</p>
                                    <div
                                      className="rounded-xl px-4 py-3 text-left"
                                      style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)" }}
                                    >
                                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                        Transportista: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{labelResult.carrier}</span>
                                      </p>
                                      <p className="text-xs mt-1 font-mono" style={{ color: "var(--text-muted)" }}>
                                        Rastreo: <span style={{ color: "var(--text-primary)" }}>{labelResult.trackingNumber}</span>
                                      </p>
                                    </div>
                                    {labelResult.labelUrl && (
                                      <a
                                        href={labelResult.labelUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block text-sm font-bold text-white py-3 rounded-xl transition-all"
                                        style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
                                      >
                                        Descargar guía PDF
                                      </a>
                                    )}
                                    <button
                                      onClick={() => setQuoteOrder(null)}
                                      className="text-xs transition-colors"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      Cerrar
                                    </button>
                                  </div>
                                )}

                                {!labelResult && (
                                  <button
                                    onClick={() => setQuoteOrder(null)}
                                    className="text-xs w-full text-center transition-colors"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    Cancelar
                                  </button>
                                )}
                              </div>
                            ) : (
                              // Initial buttons
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => { setQuoteOrder(order.id); setShippingOrder(null); }}
                                  className="text-xs font-bold text-white px-5 py-2.5 rounded-xl transition-all"
                                  style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}
                                >
                                  Cotizar y generar envío
                                </button>
                                <button
                                  onClick={() => { setShippingOrder(order.id); setQuoteOrder(null); }}
                                  className="text-xs px-4 py-2.5 rounded-xl transition-all"
                                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                                >
                                  Ya tengo mi guía
                                </button>
                              </div>
                            )}

                            {/* Manual tracking fallback */}
                            {isShipping && quoteOrder !== order.id && (
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Número de guía / rastreo"
                                  value={trackingInput}
                                  onChange={e => setTrackingInput(e.target.value)}
                                  className="flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 transition-all"
                                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                                />
                                <button
                                  onClick={async () => {
                                    if (trackingInput.trim()) {
                                      await ordersApi.updateStatus(order.id, "shipped").catch(() => {});
                                      await ordersApi.updateTracking(order.id, trackingInput.trim()).catch(() => {});
                                      const refreshed = await ordersApi.selling().catch(() => null);
                                      if (refreshed) setSellerOrders(refreshed.data);
                                    }
                                    setShippingOrder(null);
                                  }}
                                  className="text-xs font-bold text-white px-4 py-2 rounded-xl"
                                  style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => setShippingOrder(null)}
                                  className="text-xs px-3 py-2 transition-colors"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── COBROS ─── */}
        {tab === "cobros" && (() => {
          const cobrosOrders = (sellerOrders ?? []).filter(
            o => o.payoutStatus === "pending" || o.payoutStatus === "released"
          );
          const pendingSum  = cobrosOrders
            .filter(o => o.payoutStatus === "pending")
            .reduce((sum, o) => sum + (o.payoutAmount ?? 0), 0);
          const releasedSum = cobrosOrders
            .filter(o => o.payoutStatus === "released")
            .reduce((sum, o) => sum + (o.payoutAmount ?? 0), 0);

          return (
            <div className="space-y-6">
              {sellerOrders === null && (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
                </div>
              )}

              {sellerOrders !== null && (
                <>
                  {/* Summary cards */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div
                      className="rounded-2xl p-6"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        boxShadow: "0 4px 24px rgba(245,158,11,0.06)",
                      }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: "rgba(245,158,11,0.12)" }}>
                        ⏳
                      </div>
                      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Pendiente de cobro</p>
                      <p className="text-3xl font-black" style={{ color: "#fbbf24" }}>
                        ${(pendingSum / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>MXN — en espera de entrega confirmada</p>
                    </div>
                    <div
                      className="rounded-2xl p-6"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid rgba(74,222,128,0.2)",
                        boxShadow: "0 4px 24px rgba(74,222,128,0.06)",
                      }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: "rgba(74,222,128,0.12)" }}>
                        ✅
                      </div>
                      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Total cobrado</p>
                      <p className="text-3xl font-black" style={{ color: "#4ade80" }}>
                        ${(releasedSum / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>MXN — ya liberado a tu cuenta</p>
                    </div>
                  </div>

                  {cobrosOrders.length === 0 ? (
                    <div className="text-center py-16">
                      <p className="text-4xl mb-3">💰</p>
                      <p className="font-medium" style={{ color: "var(--text-secondary)" }}>Sin cobros aún</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        Los cobros aparecerán aquí cuando tus órdenes tengan pago registrado
                      </p>
                    </div>
                  ) : (
                    <div
                      className="rounded-2xl overflow-hidden"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
                    >
                      {/* Table header */}
                      <div
                        className="grid grid-cols-5 gap-3 px-5 py-3"
                        style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}
                      >
                        {["Orden", "Artículos", "Total vendido", "Tu cobro (92%)", "Estado"].map(h => (
                          <p key={h} className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{h}</p>
                        ))}
                      </div>

                      {cobrosOrders.map(order => {
                        const totalPesos   = (order.totalCents ?? order.totalAmount ?? 0) / 100;
                        const cobro        = (order.payoutAmount ?? 0) / 100;
                        const commission   = totalPesos - cobro;
                        const cardName     = order.items?.[0]?.cardName ?? "Carta";
                        const itemCount    = order.items?.length ?? 1;
                        const isReleased   = order.payoutStatus === "released";
                        const releasedDate = order.payoutReleasedAt
                          ? new Date(order.payoutReleasedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
                          : null;

                        return (
                          <div
                            key={order.id}
                            className="grid grid-cols-5 gap-3 px-5 py-4 items-center"
                            style={{ borderBottom: "1px solid var(--border-subtle)" }}
                          >
                            {/* Orden ID */}
                            <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{order.id.slice(0, 8)}…</p>

                            {/* Artículos */}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{cardName}</p>
                              {itemCount > 1 && (
                                <p className="text-xs" style={{ color: "var(--text-muted)" }}>+{itemCount - 1} más</p>
                              )}
                            </div>

                            {/* Total vendido */}
                            <div>
                              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                                ${totalPesos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                Comisión: ${commission.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                              </p>
                            </div>

                            {/* Tu cobro */}
                            <p className="text-base font-black" style={{ color: "#4ade80" }}>
                              ${cobro.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </p>

                            {/* Estado */}
                            <div>
                              {isReleased ? (
                                <>
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                                    style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}
                                  >
                                    ✅ Liberado
                                  </span>
                                  {releasedDate && (
                                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{releasedDate}</p>
                                  )}
                                </>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                                  style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}
                                >
                                  ⏳ Pendiente entrega
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

      </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}
