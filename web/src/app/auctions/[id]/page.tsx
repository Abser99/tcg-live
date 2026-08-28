"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { WhatsAppIcon, InstagramIcon, NativeShareIcon, LinkIcon, usePlatform } from "@/components/ShareIcons";
import ErrorBoundary from "@/components/ErrorBoundary";
import PokemonCardSearch from "@/components/PokemonCardSearch";
import { Room, RoomEvent, Track, createLocalVideoTrack } from "livekit-client";
import { auctionsApi, watchlistApi, usersApi, paymentMethodsApi, listingsApi, bidIncrement, type ApiAuction, type ApiAuctionItem, type ApiPaymentMethod, type ApiListing, type BidMode, type ApiRaffle, type ApiLiveStats, fileUrl, incidentsApi } from "@/lib/api";
import { createLiveRecorder } from "@/lib/live-recorder";
import { getAuctionsCache } from "@/lib/live-back-cache";
import { useFavoriteSeller } from "@/lib/seller-favorites";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { censorText } from "@/lib/profanity";
import { formatTimer, gameLabel, liveName, apiMessage } from "@/lib/format";
import { useAuth } from "@/contexts/auth";
import { useAnalytics } from "@/hooks/useAnalytics";

const STATUS_LABEL: Record<string, { text: string; bg: string }> = {
  live:      { text: "EN VIVO",        bg: "#ef4444" },
  ending:    { text: "TERMINA PRONTO", bg: "#f59e0b" },
  upcoming:  { text: "PROGRAMADA",     bg: "#2563EB" },
  scheduled: { text: "PROGRAMADA",     bg: "#2563EB" },
  ended:     { text: "TERMINADA",      bg: "#52525b" },
  cancelled: { text: "CANCELADA",      bg: "#52525b" },
};

const GRADIENTS = [
  "from-orange-500 to-red-600",
  "from-violet-600 to-indigo-800",
  "from-blue-500 to-cyan-400",
  "from-yellow-400 to-amber-500",
];

const GLOWS = [
  "rgba(239,68,68,0.4)",
  "rgba(59,130,246,0.4)",
  "rgba(59,130,246,0.4)",
  "rgba(251,191,36,0.4)",
];


interface BidRow {
  user: string;
  amount: number;
  time: string;
}

function AuctionDetailPageInner() {
  const { id } = useParams() as { id: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  // Edge-swipe (from the left edge, swipe right) → go back, for the full-screen live view
  /* Drag from the left edge to dismiss the live view. Native non-passive listeners
     (attached in the effect below) so preventDefault reliably claims the gesture —
     React's onTouchMove is passive, which made this flaky. */
  const edgeRef = useRef<HTMLDivElement>(null);
  const edgeStartX = useRef<number | null>(null);
  const edgeStartY = useRef(0);
  const edgeActive = useRef(false); // this drag has committed to horizontal
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/auctions");
  };

  const autoStream = searchParams.get("stream") === "1";
  const [auction, setAuction] = useState<ApiAuction | null>(null);

  useEffect(() => {
    const el = edgeRef.current;
    if (!el) return;
    const EDGE_ZONE = 48;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      edgeActive.current = false;
      if (t && t.clientX <= EDGE_ZONE) { edgeStartX.current = t.clientX; edgeStartY.current = t.clientY; setDragging(true); }
      else { edgeStartX.current = null; setDragging(false); }
    };
    const onMove = (e: TouchEvent) => {
      if (edgeStartX.current == null) return;
      const t = e.touches[0]; if (!t) return;
      const dx = t.clientX - edgeStartX.current;
      const dy = Math.abs(t.clientY - edgeStartY.current);
      if (!edgeActive.current) {
        if (dx > 6 && dx > dy) edgeActive.current = true;       // committed: horizontal drag
        else if (dy > 12 && dy > dx) { edgeStartX.current = null; setDragging(false); return; } // it's a scroll
      }
      if (edgeActive.current) { if (e.cancelable) e.preventDefault(); setDragX(Math.max(0, dx)); }
    };
    const onEnd = (e: TouchEvent) => {
      if (edgeStartX.current == null) { setDragging(false); return; }
      const dx = (e.changedTouches[0]?.clientX ?? 0) - edgeStartX.current;
      edgeStartX.current = null;
      setDragging(false);
      const threshold = Math.min(120, window.innerWidth * 0.25);
      if (edgeActive.current && dx > threshold) {
        setDragX(window.innerWidth);
        setTimeout(goBack, 200);
      } else {
        setDragX(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false }); // non-passive → preventDefault works
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  // Re-run once the fullscreen container actually mounts (auction loads after this component)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auction?.id, auction?.isStream]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // All hooks must be called unconditionally before any early returns
  // (React Rules of Hooks). useAuth must come before the loading/null guards.
  const { user } = useAuth();

  const loadRequestIdRef = useRef(0);

  function loadAuction() {
    const myRequestId = ++loadRequestIdRef.current;
    setLoading(true);
    setFetchError(false);
    auctionsApi.get(id)
      .then((r) => {
        if (myRequestId !== loadRequestIdRef.current) return;
        setAuction(r.data);
      })
      .catch((err) => {
        if (myRequestId !== loadRequestIdRef.current) return;
        setAuction(null);
        // Only genuine 404s render the "no existe" state; network/5xx errors
        // get a distinct retry state so an active bidder isn't told their
        // auction was deleted during a transient outage.
        if (err?.response?.status !== 404) setFetchError(true);
      })
      .finally(() => {
        if (myRequestId !== loadRequestIdRef.current) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    loadAuction();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const auctionStatusRef = useRef(auction?.status);
  useEffect(() => { auctionStatusRef.current = auction?.status; }, [auction?.status]);

  useEffect(() => {
    const intervalRef = { id: undefined as ReturnType<typeof setInterval> | undefined };
    function schedule() {
      clearInterval(intervalRef.id);
      const status = auctionStatusRef.current;
      const ms = (status === 'live' || status === 'ending') ? 2000 : 5000;
      intervalRef.id = setInterval(() => {
        auctionsApi.get(id).then(r => setAuction(r.data)).catch(() => {});
      }, ms);
    }
    schedule();
    return () => clearInterval(intervalRef.id);
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <Navbar />
        <main id="main" className="pt-24 mx-auto max-w-[1800px] px-6">
          <div className="grid lg:grid-cols-[1fr_380px] gap-8 animate-pulse">
            <div className="space-y-4">
              <div className="rounded-2xl aspect-video" style={{ background: "var(--bg-surface)" }} />
              <div className="rounded-2xl h-48" style={{ background: "var(--bg-surface)" }} />
            </div>
            <div className="rounded-2xl h-96" style={{ background: "var(--bg-surface)" }} />
          </div>
        </main>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <Navbar />
        <main id="main" className="min-h-[70vh] flex items-center justify-center">
          <div role="alert" className="text-center">
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl text-4xl mb-4"
              style={{ background: "var(--bg-elevated)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              ⚠️
            </div>
            <p className="text-xl font-black mb-1" style={{ color: "var(--text-primary)" }}>No se pudo cargar la subasta</p>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Ocurrió un problema de conexión. Intenta de nuevo.</p>
            <button
              onClick={loadAuction}
              className="text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-brand)", color: "var(--accent-text)" }}
            >
              Reintentar
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <Navbar />
        <main id="main" className="min-h-[70vh] flex items-center justify-center">
          <div className="text-center">
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl text-4xl mb-4"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              🔍
            </div>
            <p className="text-xl font-black mb-1" style={{ color: "var(--text-primary)" }}>Subasta no encontrada</p>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Esta subasta no existe o fue eliminada.</p>
            <Link
              href="/auctions"
              className="text-sm font-semibold hover:underline transition-colors"
              style={{ color: "var(--accent-text)" }}
            >
              ← Volver a subastas
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const isSeller = !!user && (
    user.id === (auction as any).sellerId ||
    user.id === auction.seller?.id
  );

  const hashIdx = auction.id.charCodeAt(0) % GRADIENTS.length;
  const gradient = GRADIENTS[hashIdx];
  const glow = GLOWS[hashIdx];

  // Use the active item during live auctions, fall back to first item
  const item: ApiAuctionItem | undefined =
    auction.items?.find(i => i.status === "active") ?? auction.items?.[0];
  const currentBid = item?.currentBid ?? auction.currentBid ?? auction.startingBid ?? 0;
  const startingBid = item?.startingBid ?? auction.startingBid ?? 0;
  const totalBids = item?.bids?.length ?? auction.totalBids ?? 0;
  const itemId = item?.id;

  const initialBids: BidRow[] = (item?.bids ?? []).map((b) => ({
    user: b.bidder?.username ?? "—",
    amount: b.amount,
    time: new Date(b.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  }));

  // Live stream → full-screen immersive view: no navbar, no back button.
  // Go back by swiping right from the left edge.
  if (auction.isStream) {
    return (
      <>
      {/* The auctions list behind — revealed as you drag the live away */}
      <LiveBackdrop />
      <div
        ref={edgeRef}
        data-fullscreen-live
        className="fixed inset-0 z-50 overflow-hidden"
        style={{
          background: "#000",
          color: "#fff",
          transform: `translateX(${dragX}px) scale(${1 - Math.min(dragX, 500) / 5000})`,
          transformOrigin: "right center",
          transition: dragging ? "none" : "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
          borderTopLeftRadius: dragX > 0 ? 18 : 0,
          borderBottomLeftRadius: dragX > 0 ? 18 : 0,
          boxShadow: dragX > 0 ? "-24px 0 70px rgba(0,0,0,0.65)" : "none",
          willChange: "transform",
          touchAction: "pan-y",
        }}
      >
        {/* Back button — web only (mobile goes back with the left-edge swipe) */}
        <button
          type="button"
          onClick={goBack}
          aria-label="Regresar"
          className="hidden lg:flex items-center gap-2 absolute top-5 left-5 z-[60] px-3.5 py-2 rounded-full text-sm font-semibold transition-colors hover:bg-white/10"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          Regresar
        </button>

        <div className="h-full w-full flex">
          {/* Left: seller / about — desktop only (pt clears the Regresar button) */}
          <aside className="hidden lg:block w-[300px] xl:w-[360px] shrink-0 p-8 pt-20 overflow-y-auto" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
            <SellerAbout auction={auction} />
          </aside>

          {/* Center: the live video (mobile format, centered on desktop) */}
          <div className="flex-1 min-w-0 flex justify-center">
            <div className="w-full lg:max-w-[520px]">
              <StreamPanel auction={auction} gradient={gradient} glow={glow} autoStream={autoStream} onAuctionUpdate={setAuction} fullScreen />
            </div>
          </div>

          {/* Right: card in auction — desktop only */}
          <aside className="hidden lg:block w-[300px] xl:w-[360px] shrink-0 p-8 overflow-y-auto" style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
            <LiveCardInfo auction={auction} item={item} currentBid={currentBid} />
          </aside>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />
      <main id="main" className="pt-20">
        <div className="mx-auto max-w-[1800px] px-4 sm:px-6 py-4">
          <Link
            href="/auctions"
            className="inline-flex items-center gap-2 text-sm transition-colors hover:underline"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            ← Subastas
          </Link>
        </div>

        <div className="mx-auto max-w-[1800px] px-4 sm:px-6 pb-16">
          <div className="grid lg:grid-cols-[1fr_420px] gap-6 items-start">
            {/* Product card */}
            <div className="order-1 lg:col-start-1 lg:row-start-1">
              <ProductPanel auction={auction} gradient={gradient} glow={glow} activeItem={item} isSeller={isSeller} onAuctionUpdate={setAuction} />
            </div>
            {/* Bid panel — sticky on desktop */}
            <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-20">
              <BidPanel
                auction={auction}
                initialBids={initialBids}
                currentBid={currentBid}
                startingBid={startingBid}
                totalBids={totalBids}
                itemId={itemId}
                isSeller={isSeller}
                activeItem={item}
              />
            </div>
            {/* Card info */}
            <div className="order-3 lg:col-start-1 lg:row-start-2">
              <CardInfo auction={auction} isSeller={isSeller} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AuctionDetailPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--bg-base)" }} />}>
        <AuctionDetailPageInner />
      </Suspense>
    </ErrorBoundary>
  );
}

/* ─── Product Panel (subastas normales sin stream) ─────── */
function ProductPanel({ auction: a, gradient, glow, activeItem, isSeller, onAuctionUpdate }: {
  auction: ApiAuction;
  gradient: string;
  glow: string;
  activeItem?: ApiAuctionItem;
  isSeller: boolean;
  onAuctionUpdate?: (a: ApiAuction) => void;
}) {
  const { capture } = useAnalytics();
  const [endingAuction, setEndingAuction] = useState(false);
  const [confirmEnd,    setConfirmEnd]    = useState(false);
  const title      = liveName(a);
  const sellerName = a.seller?.username ?? a.sellerName ?? "—";
  const verified   = a.seller?.verified;
  const imageUrl   = activeItem?.imageUrls?.[0] ?? (a.items ?? [])[0]?.imageUrls?.[0];
  const localStatus: Record<string, { text: string; bg: string }> = {
    live:      { text: "EN VIVO",        bg: "#ef4444" },
    ending:    { text: "TERMINA PRONTO", bg: "#f59e0b" },
    upcoming:  { text: "PROGRAMADA",     bg: "#2563EB" },
    scheduled: { text: "PROGRAMADA",     bg: "#2563EB" },
    ended:     { text: "TERMINADA",      bg: "#52525b" },
    cancelled: { text: "CANCELADA",      bg: "#52525b" },
  };
  const status = localStatus[a.status ?? "upcoming"];

  const [startingAuction, setStartingAuction] = useState(false);
  const [cancellingAuction, setCancellingAuction] = useState(false);

  async function endAuction() {
    setEndingAuction(true);
    try {
      const res = await auctionsApi.end(a.id);
      onAuctionUpdate?.(res.data as any);
      capture("auction_ended", { auctionId: a.id });
    } catch {}
    finally { setEndingAuction(false); setConfirmEnd(false); }
  }

  async function startAuction() {
    setStartingAuction(true);
    try {
      const res = await auctionsApi.start(a.id);
      onAuctionUpdate?.(res.data as any);
    } catch {}
    finally { setStartingAuction(false); }
  }

  async function cancelAuction() {
    if (!confirm("¿Cancelar esta subasta? Esta acción no se puede deshacer.")) return;
    setCancellingAuction(true);
    try {
      await auctionsApi.cancel(a.id);
      window.location.href = "/vendedor";
    } catch {}
    finally { setCancellingAuction(false); }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
    >
      {/* Product image area */}
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(180deg, #0A0E1A 0%, #050810 100%)", minHeight: 580 }}
      >
        {imageUrl ? (
          <>
            {/* Blurred backdrop echo of the card art — fills the frame without stretching the real image */}
            <div
              className="absolute inset-0 scale-110"
              style={{
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(40px) saturate(1.4) brightness(0.55)",
                opacity: 0.6,
              }}
            />
            <img
              src={imageUrl}
              alt={title}
              className="relative w-full h-full object-contain max-h-[560px] py-6 drop-shadow-2xl"
              style={{ filter: "drop-shadow(0 20px 60px rgba(0,0,0,0.6))" }}
            />
          </>
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 50%, ${glow} 0%, transparent 65%)`,
                opacity: 0.5,
              }}
            />
            <div
              className={`relative w-44 h-60 rounded-2xl bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-3 shadow-2xl`}
              style={{ boxShadow: `0 0 60px ${glow}` }}
            >
              <span className="text-7xl">🃏</span>
              <span className="text-white text-sm font-black tracking-widest opacity-90 text-center px-2">
                {title.toUpperCase().slice(0, 14)}
              </span>
            </div>
          </>
        )}

        {/* Status badge */}
        <div className="absolute top-4 left-4 z-10">
          <div
            className="flex items-center gap-1.5 text-white text-xs font-black px-3 py-1.5 rounded-full"
            style={{ background: status?.bg, boxShadow: `0 2px 14px ${status?.bg ?? "#2563EB"}80` }}
          >
            {a.status === "live" && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
            {status?.text ?? a.status}
          </div>
        </div>

        {/* Bottom seller overlay */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent z-10" />
        <div className="absolute bottom-3 left-4 flex items-center gap-2 z-10">
          <Link
            href={`/tienda/${sellerName}`}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(37,99,235,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          >
            🧑
          </Link>
          <div>
            <Link
              href={`/tienda/${sellerName}`}
              className="text-white text-sm font-bold leading-none transition-colors hover:underline"
              style={{ color: "var(--text-primary)" }}
            >
              {sellerName} {verified && <span style={{ color: "var(--accent-text)" }}>✓</span>}
            </Link>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Vendedor</p>
          </div>
        </div>
      </div>

      {/* Title + condition */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="font-black text-lg leading-tight" style={{ color: "var(--text-primary)" }}>{title}</h2>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {a.game && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{gameLabel(a.game)}</span>}
          {activeItem?.condition && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.2)" }}
            >
              {activeItem.condition}
            </span>
          )}
          {a.description && (
            <p className="text-xs w-full mt-1" style={{ color: "var(--text-secondary)" }}>{a.description}</p>
          )}
        </div>
      </div>

      {/* Seller: end button */}
      {isSeller && a.status === "live" && (
        <div className="px-5 py-3">
          {!confirmEnd ? (
            <button
              onClick={() => setConfirmEnd(true)}
              className="w-full py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                background: "transparent",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)";
                e.currentTarget.style.color = "var(--error-text)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              Terminar subasta
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={endAuction}
                disabled={endingAuction}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}
              >
                {endingAuction ? "Terminando..." : "Confirmar"}
              </button>
              <button
                onClick={() => setConfirmEnd(false)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", background: "transparent" }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {isSeller && (a.status === "scheduled" || a.status === "upcoming") && (
        <div className="px-5 py-3 flex gap-2">
          <button
            onClick={startAuction}
            disabled={startingAuction}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}
          >
            {startingAuction ? "Iniciando..." : "Iniciar subasta"}
          </button>
          <button
            onClick={cancelAuction}
            disabled={cancellingAuction}
            className="py-2 px-4 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)", background: "transparent" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--error-text)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            {cancellingAuction ? "..." : "Cancelar"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Stream Panel ──────────────────────────────────────── */
/* ─── Desktop side panels for the full-screen live view ─────────────── */
function SellerAbout({ auction: a }: { auction: ApiAuction }) {
  const s = (a.seller ?? {}) as { username?: string; verified?: boolean; avatarUrl?: string; reputationScore?: number; totalRatings?: number };
  const name = s.username ?? a.sellerName ?? "Vendedor";
  return (
    <div className="text-white">
      <h2 className="text-lg font-semibold mb-6">Sobre el vendedor</h2>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-xl shrink-0" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
          {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" /> : "🧑"}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{name} {s.verified && <span style={{ color: "var(--brand-light)" }}>✓</span>}</p>
          {typeof s.reputationScore === "number" && (s.totalRatings ?? 0) > 0
            ? <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>★ {s.reputationScore.toFixed(1)} · {s.totalRatings} reseñas</p>
            : <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>Vendedor en TCG Live</p>}
        </div>
      </div>
      {a.description && <p className="text-sm leading-relaxed mb-6" style={{ color: "rgba(255,255,255,0.72)" }}>{a.description}</p>}
      <Link href={`/tienda/${encodeURIComponent(name)}`}
        className="inline-flex items-center justify-center w-full py-2.5 rounded-full text-sm font-semibold transition-colors"
        style={{ border: "1px solid rgba(255,255,255,0.25)", color: "#fff" }}>
        Ver tienda del vendedor
      </Link>
    </div>
  );
}

/* Dutch descending price at `now` (ms since epoch). The price falls LINEARLY from the
   item's start price to the floor across the whole lot window (dutchStartedAt → closesAt),
   landing on the floor exactly when the timer ends. Mirrors the backend's dutchPriceAt so
   every surface shows the same falling number. */
function computeDutchPrice(item: ApiAuctionItem | undefined, a: ApiAuction, now: number): number {
  const start = item?.startingBid ?? a.startingBid ?? 0;
  if (!item?.dutchStartedAt) return start;
  const floor = Math.min(a.dutchFloorCents ?? 0, start); // floor can't exceed the start
  const startedAt = new Date(item.dutchStartedAt).getTime();
  const closes = item.closesAt ? new Date(item.closesAt).getTime() : 0;
  const total = closes - startedAt;
  if (total <= 0) return floor;
  const progress = Math.min(1, Math.max(0, (now - startedAt) / total));
  const raw = start - (start - floor) * progress;
  return Math.max(floor, Math.round(raw / 100) * 100); // snap to whole pesos
}

function LiveCardInfo({ auction: a, item, currentBid }: { auction: ApiAuction; item?: ApiAuctionItem; currentBid: number }) {
  const img = item?.imageUrls?.[0];
  const sub = [gameLabel(a.game), item?.cardSet, item?.condition].filter(Boolean).join(" · ");

  // Dutch mode: the price falls on its own, so recompute it every second here too
  // (this "En subasta ahora" panel used to show only the static current bid).
  const isDutch = a.bidMode === "dutch" && item?.status === "active";
  const [dutchNow, setDutchNow] = useState(Date.now());
  useEffect(() => {
    if (!isDutch) return;
    const t = setInterval(() => setDutchNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isDutch]);
  const shownPrice = isDutch ? computeDutchPrice(item, a, dutchNow) : currentBid;

  // Desktop-only: other auctions, two per row (replaces the mobile pull-down drawer)
  const [others, setOthers] = useState<ApiAuction[]>([]);
  useEffect(() => {
    auctionsApi.list({ limit: 12 })
      .then(r => setOthers(
        r.data.data
          .filter(x => x.id !== a.id && x.status !== "ended" && x.status !== "cancelled")
          .sort((p, q) => (p.status === "live" ? 0 : 1) - (q.status === "live" ? 0 : 1))
          .slice(0, 6)
      ))
      .catch(() => {});
  }, [a.id]);

  return (
    <div className="text-white">
      <h2 className="text-lg font-semibold mb-6">En subasta ahora</h2>
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="h-60 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)" }}>
          {img
            ? <img src={img} alt="" className="h-full w-auto object-contain py-5" />
            : <div className="w-24 h-32 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.2}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round"/></svg>
              </div>}
        </div>
        <div className="p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="font-semibold">{item?.cardName ?? a.title}</p>
          {sub && <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>{sub}</p>}
          <div className="mt-4">
            <p className="text-[11px] uppercase font-medium flex items-center gap-1.5" style={{ letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)" }}>
              {isDutch ? "📉 Precio ahora" : "Puja actual"}
              {isDutch && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black tracking-normal" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>BAJANDO</span>}
            </p>
            <p className="text-2xl font-bold tabular-nums mt-0.5" style={isDutch ? { color: "var(--brand-light)" } : undefined}>${(shownPrice / 100).toLocaleString("es-MX")} <span className="text-sm font-normal" style={{ color: "rgba(255,255,255,0.6)" }}>MXN</span></p>
            {item?.binPrice && <p className="text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>Comprar ya: ${(item.binPrice / 100).toLocaleString("es-MX")} MXN</p>}
          </div>
        </div>
      </div>

      {/* Other auctions — two per row (desktop replacement for the pull-down drawer) */}
      {others.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Otras subastas</h2>
            <Link href="/auctions" className="text-xs font-semibold" style={{ color: "var(--brand-light)" }}>Ver todas →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {others.map(o => {
              const oname = o.seller?.username ?? o.sellerName ?? "?";
              const olive = o.status === "live";
              const oimg = o.items?.[0]?.imageUrls?.[0];
              return (
                <Link key={o.id} href={`/auctions/${o.id}`} className="rounded-xl overflow-hidden block transition-transform hover:scale-[1.03]"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div className="relative w-full" style={{ aspectRatio: "4/5", background: "linear-gradient(160deg,#1e293b,#0f172a)" }}>
                    {oimg
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={oimg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      : <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-70">🃏</div>}
                    {olive && (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-[1px] rounded-full text-[9px] font-black text-white uppercase live-ring"
                        style={{ background: "#f43f5e" }}>Live</span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[12px] font-semibold truncate">{o.title}</p>
                    <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{oname}</p>
                    <p className="text-[12px] font-bold mt-0.5" style={{ color: "var(--brand-light)" }}>${(((o.currentBid ?? o.startingBid ?? 0)) / 100).toLocaleString("es-MX")}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* Static backdrop shown behind the live view (the auctions list we came from),
   so dragging the live away reveals where you're going back to. */
function LiveBackdrop() {
  const auctions = getAuctionsCache();
  return (
    <div className="fixed inset-0 z-40 overflow-hidden pointer-events-none" style={{ background: "var(--bg-base)" }} aria-hidden="true">
      <div className="h-16 flex items-center px-5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="font-semibold text-lg tracking-tight" style={{ color: "var(--text-primary)" }}>TCG<span style={{ color: "var(--accent-text)" }}>Live</span></span>
      </div>
      <div className="px-6 pt-8">
        <h1 className="text-3xl md:text-4xl font-medium tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>Subastas</h1>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {auctions.map((a) => {
            const item = a.items?.[0];
            const img = item?.imageUrls?.[0];
            const bid = (a.currentBid ?? item?.currentBid ?? item?.startingBid ?? a.startingBid ?? 0) / 100;
            return (
              <div key={a.id} className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="relative overflow-hidden" style={{ aspectRatio: "3 / 4" }}>
                  {img && <div className="absolute inset-0" style={{ backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(22px) brightness(0.45)", transform: "scale(1.2)" }} />}
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.62) 100%)" }} />
                  {img && <div className="absolute inset-0 flex items-center justify-center px-4 pt-4 pb-16"><img src={img} alt="" className="max-h-full w-auto object-contain" /></div>}
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="text-white text-sm font-medium line-clamp-1">{item?.cardName ?? a.title}</p>
                    <p className="text-white text-base font-semibold tabular-nums">${bid.toLocaleString("es-MX")} <span className="text-xs font-normal opacity-70">MXN</span></p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* Reaction emojis — 5 examples for now. Will be configurable by the seller
   in the auction settings before going live. */
/** How the seller's face feed sits over the main one. */
type SelfieLayout = "round" | "corner";
/** Track name that marks the second camera; viewers key off it to place the feed. */
const SELFIE_TRACK = "selfie";

const REACTION_EMOJIS = ["🔥", "❤️", "💎", "🎯", "😂"];

function StreamPanel({ auction: a, gradient, glow, autoStream = false, onAuctionUpdate, fullScreen = false }: {
  auction: ApiAuction;
  gradient: string;
  glow: string;
  autoStream?: boolean;
  onAuctionUpdate?: (a: ApiAuction) => void;
  fullScreen?: boolean;
}) {
  const { user } = useAuth();
  const { capture } = useAnalytics();
  const router = useRouter();
  const isSeller = !!user && (
    user.id === (a as any).sellerId ||
    user.id === a.seller?.id
  );
  const isLive   = a.status === "live" || a.status === "ending";

  const roomRef        = useRef<Room | null>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  // Captures the seller's own outgoing stream so the session can be replayed later.
  const recorderRef    = useRef<ReturnType<typeof createLiveRecorder> | null>(null);

  // ── Second camera ("selfie") ──
  // The main camera points at the cards; this one shows the seller's face, published as
  // its own track so viewers can place it independently instead of cropping one feed.
  const selfieRef      = useRef<HTMLVideoElement>(null);
  const selfieTrackRef = useRef<any>(null);
  const [selfieOn, setSelfieOn] = useState(false);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [selfieLayout, setSelfieLayout] = useState<SelfieLayout>("round");
  const [hasSelfieVideo, setHasSelfieVideo] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selfieDeviceId, setSelfieDeviceId] = useState<string>("");

  // ── Raffles: entries come from watch time, so the page reports it while open ──
  const [myMinutes, setMyMinutes] = useState(0);
  const [myEntries, setMyEntries] = useState(0);
  const [friendBoost, setFriendBoost] = useState({ multiplier: 1, connectedFriends: 0 });
  const [showShare, setShowShare] = useState(false);
  // Reporting from inside the live. The moment is marked against the recording, so
  // there's no video buffer to keep — see IncidentsService.
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reporting, setReporting] = useState(false);
  const sharePlatform = usePlatform();
  const [raffles, setRaffles] = useState<ApiRaffle[]>([]);
  const [rafflePrize, setRafflePrize] = useState("");
  const [raffleListing, setRaffleListing] = useState("");
  const [raffleMin, setRaffleMin] = useState("5");
  const [raffleBusy, setRaffleBusy] = useState(false);
  // The prize photo is uploaded the moment it's picked, so creating the raffle stays
  // a plain JSON post and the seller sees the thumbnail before committing.
  const [rafflePhoto, setRafflePhoto] = useState<string | null>(null);
  const [rafflePhotoBusy, setRafflePhotoBusy] = useState(false);
  // The seller's own scoreboard. Money and lots come from the server; the clock is
  // local, counting from startedAt, so it moves every second without polling for it.
  const [liveStats, setLiveStats] = useState<ApiLiveStats | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // Renaming the show. The lot numbers stay automatic — only this name is the seller's.
  const [nameDraft, setNameDraft] = useState(a.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const startingRef    = useRef(false);
  const [streaming,      setStreaming]      = useState(false);
  const [connecting,     setConnecting]     = useState(false);
  const [roomConnected,  setRoomConnected]  = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [micMuted,       setMicMuted]       = useState(false);
  const [camOff,         setCamOff]         = useState(false);
  const [streamError,    setStreamError]    = useState<string | null>(null);
  const [connectError,   setConnectError]   = useState<string | null>(null);
  const [connectRetryTick, setConnectRetryTick] = useState(0);
  const [endingAuction,  setEndingAuction]  = useState(false);
  const [confirmEnd,     setConfirmEnd]     = useState(false);

  // Panel agregar carta
  const [cardName,      setCardName]      = useState("");
  const [cardImageUrl,  setCardImageUrl]  = useState("");
  const [cardPrice,     setCardPrice]     = useState("");
  const [cardDuration,  setCardDuration]  = useState("60");
  const [cardCategory,  setCardCategory]  = useState("carta");
  const [addingCard,    setAddingCard]    = useState(false);
  const [addCardError,  setAddCardError]  = useState("");
  const [closingItem,   setClosingItem]   = useState(false);
  const [closeItemMsg,  setCloseItemMsg]  = useState("");

  // Panel minijuego
  const [streamWinners,   setStreamWinners]   = useState<{ username: string; category: string; itemName: string }[]>([]);
  const [mgCategory,      setMgCategory]      = useState("todos");
  const [mgSpinning,      setMgSpinning]      = useState(false);
  const [mgWinner,        setMgWinner]        = useState<string | null>(null);
  const mgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mgType,             setMgType]             = useState<"ruleta"|"carrera"|"chat"|"relampago"|"precio">("ruleta");
  const [chatRaffleWinner,   setChatRaffleWinner]   = useState<string | null>(null);
  const [chatRaffleSpinning, setChatRaffleSpinning] = useState(false);
  const chatRaffleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lightningDuration,  setLightningDuration]  = useState(60);
  const [lightningEndsAt,    setLightningEndsAt]    = useState<number | null>(null);
  const [lightningLeft,      setLightningLeft]      = useState(0);
  const [priceInput,         setPriceInput]         = useState("");
  const [priceRevealed,      setPriceRevealed]      = useState(false);
  const [revealedPrice,      setRevealedPrice]      = useState("");

  // Chat en vivo
  const [chatMessages, setChatMessages] = useState<{ username: string; text: string; ts: number; join?: boolean }[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [bidding, setBidding] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false); // tap video to hide chat + bids
  const [viewerCount, setViewerCount] = useState(0);
  const [participants, setParticipants] = useState<string[]>([]);
  // Track identities so we can sanction by userId, not just display name
  const [participantList, setParticipantList] = useState<{ id: string; name: string }[]>([]);

  // ── Moderation ──
  const moderatorIds = a.moderatorIds ?? [];
  const isMod = isSeller || (!!user && moderatorIds.includes(user.id));
  const sanctions = a.sanctions ?? [];
  const pendingBans = a.pendingBans ?? [];
  const myMute = !!user && sanctions.find(s => s.kind === "mute" && s.targetUserId === user.id);
  const myBan  = !!user && sanctions.find(s => s.kind === "ban"  && s.targetUserId === user.id);
  const [showModPanel, setShowModPanel] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinnedMsg, setPinnedMsg] = useState<{ text: string; by: string } | null>(null);
  const pinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dismissedPendingBans, setDismissedPendingBans] = useState<Set<string>>(new Set());

  async function sanctionUser(targetUserId: string, targetUsername: string, kind: "mute" | "ban", hours?: number) {
    try {
      await auctionsApi.createSanction(a.id, { targetUserId, targetUsername, kind, hours });
      const fresh = await auctionsApi.get(a.id); onAuctionUpdate?.(fresh.data);
      flashToast(kind === "mute" ? `🔇 ${targetUsername} silenciado ${hours}h` : hours ? `🚫 ${targetUsername} baneado ${hours}h` : `⏳ Ban permanente de ${targetUsername} enviado a aprobación`);
    } catch (e: any) { flashToast(e?.response?.data?.message ?? "No se pudo aplicar."); }
  }
  async function toggleModerator(userId: string, add: boolean) {
    try { const { data } = await auctionsApi.setModerator(a.id, userId, add ? "add" : "remove"); onAuctionUpdate?.(data); }
    catch (e: any) { flashToast(e?.response?.data?.message ?? "No se pudo cambiar el moderador."); }
  }
  async function approveBan(sid: string) {
    try { await auctionsApi.approveSanction(a.id, sid); const fresh = await auctionsApi.get(a.id); onAuctionUpdate?.(fresh.data); flashToast("Ban aprobado 🚫"); }
    catch { flashToast("No se pudo aprobar."); }
  }
  async function rejectBan(sid: string) {
    try { await auctionsApi.liftSanction(a.id, sid); const fresh = await auctionsApi.get(a.id); onAuctionUpdate?.(fresh.data); }
    catch {}
  }
  async function liftSanction(sid: string) {
    try { await auctionsApi.liftSanction(a.id, sid); const fresh = await auctionsApi.get(a.id); onAuctionUpdate?.(fresh.data); }
    catch {}
  }
  function pinMessage(text: string, by: string) {
    setPinnedMsg({ text, by });
    if (pinTimerRef.current) clearTimeout(pinTimerRef.current);
    pinTimerRef.current = setTimeout(() => setPinnedMsg(null), 10_000); // pins live for 10s
  }

  // Got banned mid-session → cut the connection so they can't watch/interact
  useEffect(() => {
    if (myBan && roomRef.current) { try { roomRef.current.disconnect(); } catch {} }
  }, [myBan]);

  // ── Seller controls: bidding format + live games ──
  const [showControls, setShowControls] = useState(false);
  const [controlsTab, setControlsTab] = useState<"subir" | "ruleta">("subir");
  const bidMode: BidMode = a.bidMode ?? "normal";
  const [savingMode, setSavingMode] = useState(false);
  // Dutch config is just the floor now — the drop rate is derived from the lot timer.
  const [dutchFloor, setDutchFloor] = useState(String((a.dutchFloorCents ?? 0) / 100));

  // Roulette game
  const [rouletteNames, setRouletteNames] = useState<string[]>([]);
  const [rouletteManual, setRouletteManual] = useState("");
  const [roulettePrize, setRoulettePrize] = useState<string>(""); // listing id, optional
  const [spinning, setSpinning] = useState(false);
  const [spinHighlight, setSpinHighlight] = useState<string | null>(null);
  const [rouletteWinner, setRouletteWinner] = useState<{ name: string; prize?: string } | null>(null);
  // Full-screen spinning wheel shown to everyone (seller + viewers)
  const [rouletteShow, setRouletteShow] = useState<RouletteShow | null>(null);
  const [rouletteLanded, setRouletteLanded] = useState(false);

  // ── The other two games of chance. All three share the participant list and the
  //    prize selector; only the theatre on screen differs. ──
  const [gameKind, setGameKind] = useState<"ruleta" | "dados" | "volado">("ruleta");
  /* ── Break mode ──
     A break isn't a raffle: the wheel holds the slots being handed out — characters,
     energy types, packs — and each one leaves the wheel once it's drawn, so a run of
     spins deals the whole list out without ever repeating. */
  const [breakMode, setBreakMode] = useState(false);
  const [breakItems, setBreakItems] = useState<string[]>([]);
  const [breakDrawn, setBreakDrawn] = useState<{ item: string; to?: string }[]>([]);
  const [breakManual, setBreakManual] = useState("");
  const [breakAssignTo, setBreakAssignTo] = useState("");
  const [coinHeads, setCoinHeads] = useState("");   // whoever is riding on águila
  const [coinTails, setCoinTails] = useState("");   // …and on sol
  const [coinShow, setCoinShow] = useState<CoinShow | null>(null);
  const [coinLanded, setCoinLanded] = useState(false);
  const [diceShow, setDiceShow] = useState<DiceShow | null>(null);
  const [diceLanded, setDiceLanded] = useState(false);
  const [viewerMuted, setViewerMuted] = useState(true); // start muted so autoplay works; viewer can unmute

  // Wallet (saved cards) — synced with the main wallet via the payment-methods API
  const [showWallet, setShowWallet] = useState(false);
  const [cards, setCards] = useState<ApiPaymentMethod[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [cardForm, setCardForm] = useState({ number: "", expiry: "", name: "" });

  const loadCards = () => {
    setWalletLoading(true);
    paymentMethodsApi.my().then(r => setCards(r.data)).catch(() => {}).finally(() => setWalletLoading(false));
  };
  function openWallet() { setShowWallet(true); setWalletError(""); loadCards(); }

  async function savePaymentCard() {
    const number = cardForm.number.replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(number)) { setWalletError("Número de tarjeta inválido (13–19 dígitos)."); return; }
    if (!/^\d{2}\/\d{2}$/.test(cardForm.expiry)) { setWalletError("Expiración inválida (MM/YY)."); return; }
    setSavingCard(true);
    setWalletError("");
    try {
      await paymentMethodsApi.create({ type: "card", cardNumber: number, expiry: cardForm.expiry, cardholderName: cardForm.name || undefined });
      setCardForm({ number: "", expiry: "", name: "" });
      loadCards();
    } catch {
      setWalletError("No se pudo guardar la tarjeta. Intenta de nuevo.");
    } finally { setSavingCard(false); }
  }

  // More menu (⋮): mute + share.  Peek drawer: other live auctions.  Buy-now catalog.
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [peekAuctions, setPeekAuctions] = useState<ApiAuction[]>(() => getAuctionsCache().filter(x => x.id !== a.id).slice(0, 10));
  const [showBuyNow, setShowBuyNow] = useState(false);
  const [buyNowItems, setBuyNowItems] = useState<ApiListing[]>([]);
  const [buyNowLoaded, setBuyNowLoaded] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [dismissedPromos, setDismissedPromos] = useState<Set<string>>(new Set());
  const EMPTY_LISTING_FORM = { title: "", description: "", price: "", discountPercent: "", promoted: false, imageUrl: "" };
  const [listingForm, setListingForm] = useState<{ title: string; description: string; price: string; discountPercent: string; promoted: boolean; imageUrl: string }>(EMPTY_LISTING_FORM);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [savingListing, setSavingListing] = useState(false);
  const [listingErr, setListingErr] = useState("");
  const MAX_LISTINGS = 25;
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const PEEK_H = 132; // px the live screen slides down to reveal other auctions

  function flashToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }

  /** The live's link carrying my invite code, so friends who arrive count as mine. */
  function myShareUrl(): string {
    if (typeof window === "undefined") return "";
    const u = new URL(window.location.href);
    u.searchParams.delete("stream");
    if (user?.username) u.searchParams.set("ref", user.username);
    return u.toString();
  }

  const shareText = () => `Estoy en el live de @${sellerName} en TCG Live 🔥`;

  function shareTo(where: "whatsapp" | "instagram" | "copy" | "native") {
    const url = myShareUrl();
    setShowShare(false);
    if (where === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText()} ${url}`)}`, "_blank", "noopener");
      return;
    }
    if (where === "instagram") {
      // Instagram has no web share target, so the useful move is the OS share sheet
      // (which lists Instagram when it's installed) and a copied link as the fallback.
      if (typeof navigator !== "undefined" && navigator.share) {
        navigator.share({ title: `Live de ${sellerName}`, text: shareText(), url }).catch(() => {});
        return;
      }
      navigator.clipboard?.writeText(url).then(
        () => flashToast("Enlace copiado — pégalo en tu historia de Instagram"),
        () => flashToast(url),
      );
      return;
    }
    if (where === "native" && typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: `Live de ${sellerName}`, text: shareText(), url }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(url).then(
      () => flashToast("Enlace copiado — si tus amigos entran, suben tus entradas"),
      () => flashToast(url),
    );
  }

  async function sendReport() {
    if (!reportText.trim() || reporting) return;
    setReporting(true);
    try {
      const { data } = await incidentsApi.create({
        kind: "live", auctionId: a.id, description: reportText.trim(),
      });
      setShowReport(false);
      setReportText("");
      const at = data.atOffsetSec;
      flashToast(
        at !== null
          ? `Reporte enviado — se marcó el minuto ${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")} de la grabación`
          : "Reporte enviado a soporte",
      );
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo enviar el reporte.");
    } finally { setReporting(false); }
  }

  async function shareLive() {
    setShowMoreMenu(false);
    setShowShare(true);
  }

  const [favSeller, toggleFavSeller] = useFavoriteSeller(a.seller?.username ?? a.sellerName ?? "", a.seller?.id);

  // Fixed-price catalog ("Compra ahora") for THIS seller. Loaded on mount so a
  // promoted item can surface as an on-screen banner without opening the panel.
  function loadBuyNow() {
    listingsApi.list()
      .then(r => setBuyNowItems(r.data.filter(l =>
        l.status === "active" && (l.seller?.id === a.seller?.id || l.seller?.username === (a.seller?.username ?? a.sellerName))
      )))
      .catch(() => {})
      .finally(() => setBuyNowLoaded(true));
  }
  function openBuyNow() {
    setShowBuyNow(true);
    setShowMoreMenu(false);
    if (!buyNowLoaded) loadBuyNow();
  }

  function discountedPrice(l: ApiListing) {
    const d = l.discountPercent ?? 0;
    return d > 0 ? Math.round(l.price * (1 - d / 100)) : l.price;
  }

  async function buyListing(id: string) {
    const l = buyNowItems.find(x => x.id === id);
    setBuyingId(id);
    try {
      await listingsApi.buy(id);
      setBuyNowItems(prev => prev.filter(x => x.id !== id));
      if (l) setDismissedPromos(prev => new Set(prev).add(id));
      flashToast("¡Compra realizada! 🎉");
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo completar la compra.");
    } finally { setBuyingId(null); }
  }

  /* The promo banner is for buyers; on the seller's own screen it just flashes for
     2s so they can confirm it went out, then gets out of the way. */
  const promoId = buyNowItems.find(l => l.promoted && !dismissedPromos.has(l.id))?.id ?? null;
  const [sellerPromoVisible, setSellerPromoVisible] = useState(true);
  useEffect(() => {
    if (!isSeller || !promoId) return;
    setSellerPromoVisible(true);
    const t = setTimeout(() => setSellerPromoVisible(false), 2000);
    return () => clearTimeout(t);
  }, [isSeller, promoId]);

  // ── End the live (seller), behind a confirmation ──
  const [confirmEndLive, setConfirmEndLive] = useState(false);
  const [endingLive, setEndingLive] = useState(false);
  async function endLive() {
    setEndingLive(true);
    try {
      // Release the second camera before anything else — otherwise its indicator can
      // stay lit after the live is over.
      if (selfieTrackRef.current) {
        try { await roomRef.current?.localParticipant.unpublishTrack(selfieTrackRef.current, true); } catch { /* already gone */ }
        selfieTrackRef.current = null;
        setSelfieOn(false);
      }
      // Upload first: ending the live tears this view down, taking the recorder with it.
      if (recorderRef.current?.recording) {
        flashToast("Guardando la grabación…");
        try { await recorderRef.current.stopAndUpload(a.id); }
        catch { flashToast("No se pudo guardar la grabación, pero el live sí terminó."); }
        recorderRef.current = null;
      }
      const { data } = await auctionsApi.end(a.id);
      onAuctionUpdate?.(data as any);
      setConfirmEndLive(false);
      flashToast("Live terminado");
      router.push("/vendedor");
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo terminar el live.");
    } finally { setEndingLive(false); }
  }

  // ── Timer control (seller): presets or a custom value rounded to tens ──
  const [showTimerBox, setShowTimerBox] = useState(false);
  const [timerCustom, setTimerCustom] = useState("");
  const [savingTimer, setSavingTimer] = useState(false);

  async function applyTimer(seconds: number) {
    const item = a.items?.find(i => i.status === "active") ?? a.items?.[0];
    if (!item) { flashToast("No hay carta activa."); return; }
    const secs = Math.min(60, Math.max(10, Math.round(seconds / 10) * 10)); // 1 min cap
    setSavingTimer(true);
    try {
      await auctionsApi.setItemTimer(item.id, secs);
      const fresh = await auctionsApi.get(a.id);
      onAuctionUpdate?.(fresh.data);
      setShowTimerBox(false);
      setTimerCustom("");
      flashToast(`⏱ Reloj en ${secs}s`);
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo ajustar el reloj.");
    } finally { setSavingTimer(false); }
  }

  // ── Bid mode (seller switches the format live) ──
  async function changeMode(mode: BidMode) {
    setSavingMode(true);
    try {
      const dto: any = { bidMode: mode };
      if (mode === "dutch") {
        dto.dutchFloorCents  = Math.max(0, Math.round(Number(dutchFloor) * 100));
      }
      const { data } = await auctionsApi.update(a.id, dto);
      onAuctionUpdate?.(data);
      // Dutch needs its descending clock started on the active item
      if (mode === "dutch") {
        const activeItem = data.items?.find(i => i.status === "active") ?? data.items?.[0];
        if (activeItem) { await auctionsApi.dutchStart(activeItem.id); const fresh = await auctionsApi.get(a.id); onAuctionUpdate?.(fresh.data); }
      }
      flashToast(mode === "normal" ? "Modo normal" : mode === "sudden_death" ? "⚡ Muerte súbita activada" : "📉 Subasta holandesa activada");
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo cambiar el modo.");
    } finally { setSavingMode(false); }
  }

  // Dutch: recompute the descending price locally every second (server re-checks on accept)
  const [dutchNow, setDutchNow] = useState(Date.now());
  useEffect(() => {
    if (bidMode !== "dutch") return;
    const t = setInterval(() => setDutchNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [bidMode]);

  function dutchPrice(item?: ApiAuctionItem): number {
    return computeDutchPrice(item, a, dutchNow);
  }

  /* The live pauses when the seller leaves and closes itself if they don't come
     back within 10 minutes. The grace period restarts on every exit. */
  const isPaused = !!a.pausedAt;
  // The seller is on the page, so any pause we observe is stale (e.g. the pagehide
  // from a reload landing after this page already loaded) — clear it.
  useEffect(() => {
    if (!isSeller || !isLive || !a.pausedAt) return;
    auctionsApi.resumeLive(a.id).then(r => onAuctionUpdate?.(r.data)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller, isLive, a.pausedAt, a.id]);

  useEffect(() => {
    if (!isSeller || !isLive) return;
    // Resume unconditionally on mount: the snapshot we rendered with may predate a
    // pause that is still in flight. The server no-ops when it isn't paused.
    auctionsApi.resumeLive(a.id).then(r => onAuctionUpdate?.(r.data)).catch(() => {});

    const token = typeof window !== "undefined" ? localStorage.getItem("tcg_token") : null;
    const pause = () => {
      // keepalive so the request survives the page going away
      try {
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/auctions/${a.id}/pause`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          keepalive: true,
        });
      } catch {}
    };
    window.addEventListener("pagehide", pause);
    window.addEventListener("beforeunload", pause);
    return () => {
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("beforeunload", pause);
      pause(); // leaving the live view (client-side nav) also pauses it
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller, isLive, a.id]);

  /* Winner of the last closed lot. The big splash shows for 2s; the name then
     lives on as a chip in the bid row until the new lot gets its first bid. */
  // Most recently closed lot — ordered by when it actually closed (closesAt is a
  // reliable instant that round-trips correctly, unlike the TZ-shifted updatedAt).
  const soldItems = [...(a.items ?? [])]
    .filter(i => i.status === "sold" && i.winner)
    .sort((x, y) => {
      const tx = x.closesAt ? Date.parse(x.closesAt) : 0;
      const ty = y.closesAt ? Date.parse(y.closesAt) : 0;
      return tx - ty;
    });
  const lastWinner = soldItems[soldItems.length - 1] ?? null;
  /* The splash fires when we FIRST SEE a lot's winner and that lot closed recently. We
     de-dupe per lot in localStorage so a page refresh never re-announces an old winner,
     and the "recent" window is generous enough to cover the close cron + poll delay
     between the timer hitting 0 and the client seeing status:sold. */
  const SPLASH_MS = 4000;         // how long the banner stays on screen
  const SPLASH_RECENT_MS = 15000; // only announce a close we're seeing within this window
  const [splashItem, setSplashItem] = useState<ApiAuctionItem | null>(null);
  useEffect(() => {
    if (!lastWinner?.closesAt || typeof window === "undefined") return;
    const key = "tcg_splash_" + lastWinner.id;
    if (localStorage.getItem(key)) return;               // already announced (survives refresh)
    const closedAgo = Date.now() - Date.parse(lastWinner.closesAt);
    if (closedAgo < 0 || closedAgo >= SPLASH_RECENT_MS) return; // too old (or a stale refresh)
    localStorage.setItem(key, "1");
    setSplashItem(lastWinner);
    const t = setTimeout(() => setSplashItem(null), SPLASH_MS);
    return () => clearTimeout(t);
  }, [lastWinner?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const winnerSplash = splashItem;

  /* Countdown for the active card. The auction row has no endTime — the real clock
     lives on the active item's closesAt — so we tick locally once a second. */
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* Sales figures for the seller running the show. Every 15s is plenty — a lot closing
     is the only thing that moves them, and the clock beside them ticks on its own. */
  useEffect(() => {
    if (!isSeller || !isLive) return;
    let cancelled = false;
    const pull = () => {
      auctionsApi.liveStats(a.id)
        .then(r => { if (!cancelled) setLiveStats(r.data); })
        .catch(() => {});
    };
    pull();
    const t = setInterval(() => { if (!document.hidden) pull(); }, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isSeller, isLive, a.id]);

  /* Optimistic bid: the price on screen jumps the instant the slider fires, so the
     UI never waits on the round-trip. Cleared once the server value catches up. */
  const [optimisticBid, setOptimisticBid] = useState<number | null>(null);
  const activeItemId = a.items?.find(i => i.status === "active")?.id ?? a.items?.[0]?.id;
  // A max bid is per-lot: when the lot changes, clear the local max-bid overlay so a new
  // lot never inherits the previous lot's max bid.
  useEffect(() => { setOptimisticBid(null); setMaxBidOv(0); setMaxKeypad(""); }, [activeItemId]);

  // Bidder chip: flash "who just bid" for 2s on every human bid, then hide it. We key off
  // lastBidder (the last human bid) + price, so a signature change means a real new push —
  // whether it's a challenger battling the leader or the leader raising their own bid.
  const _chalItem = a.items?.find(i => i.status === "active");
  const challengerSig = _chalItem?.lastBidder?.username
    ? `${_chalItem.id}|${_chalItem.lastBidder.username}|${_chalItem.currentBid ?? _chalItem.startingBid ?? 0}`
    : "";
  const [challengerFlash, setChallengerFlash] = useState(false);
  useEffect(() => {
    if (!challengerSig) { setChallengerFlash(false); return; }
    setChallengerFlash(true);
    const t = setTimeout(() => setChallengerFlash(false), 2000);
    return () => clearTimeout(t);
  }, [challengerSig]);
  // Seller opens a queued lot for bidding (PENDING → ACTIVE, fresh clock)
  const [openingLot, setOpeningLot] = useState(false);
  async function openLot(itemId: string) {
    if (openingLot) return;
    setOpeningLot(true);
    try {
      await auctionsApi.openItem(itemId);
      const fresh = await auctionsApi.get(a.id);
      onAuctionUpdate?.(fresh.data);
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo abrir la puja.");
    } finally { setOpeningLot(false); }
  }

  const [accepting, setAccepting] = useState(false);
  async function acceptDutch(itemId: string) {
    if (accepting) return;
    setAccepting(true);
    try {
      const { data } = await auctionsApi.dutchAccept(itemId);
      flashToast(`¡Es tuyo por $${(data.price / 100).toLocaleString("es-MX")}! 🎉`);
      const fresh = await auctionsApi.get(a.id);
      onAuctionUpdate?.(fresh.data);
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo aceptar el precio.");
    } finally { setAccepting(false); }
  }

  // ── Roulette game ──
  function broadcast(payload: any) {
    const room = roomRef.current;
    if (room && room.state === "connected") {
      try { room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true }); } catch {}
    }
  }

  const gamePool = () => (rouletteNames.length ? rouletteNames : participants);

  /* Hand the prize over for real. Until this existed the games were theatre: a name
     appeared and the winner had to chase the seller off-platform for their card. */
  function awardWinner(winner: string, note?: string) {
    auctionsApi.awardGiveaway(a.id, { winnerUsername: winner, listingId: roulettePrize || undefined })
      .then(({ data }) => {
        if (data.awarded) {
          flashToast(note ?? `🎁 Premio entregado a @${winner} — ya aparece en sus compras`);
          setBuyNowItems(prev => prev.filter(l => l.id !== roulettePrize));
          setRoulettePrize("");
        }
      })
      .catch((e: unknown) => {
        // It already played out in front of everyone; say plainly that the prize
        // didn't register rather than letting the seller assume it did.
        flashToast(apiMessage(e, "El juego terminó, pero no se pudo registrar el premio."));
      });
  }

  /** Two dice each; highest total wins. A tie sends only the tied players back in. */
  function rollDice() {
    const pool = gamePool();
    if (!pool.length || spinning) { if (!pool.length) flashToast("No hay participantes para los dados."); return; }
    const d6 = () => 1 + Math.floor(Math.random() * 6);
    const rounds: DiceRound[] = [];
    let contenders = pool;
    // Real dice, real ties: the tied players simply roll again. Uniform among equals,
    // and the tiebreak is on screen instead of being resolved out of sight.
    // do/while, not while: a lone participant still deserves a throw to watch.
    do {
      const round: DiceRound = contenders.map(name => ({ name, a: d6(), b: d6() }));
      const best = Math.max(...round.map(r => r.a + r.b));
      rounds.push(round);
      contenders = round.filter(r => r.a + r.b === best).map(r => r.name);
    } while (contenders.length > 1 && rounds.length < 8);
    const winner = contenders[0] ?? pool[Math.floor(Math.random() * pool.length)];
    const prizeTitle = buyNowItems.find(l => l.id === roulettePrize)?.title;
    setSpinning(true);
    setShowControls(false);
    setDiceLanded(false);
    setDiceShow({ rounds, winner, prize: prizeTitle });
    broadcast({ type: "dice_roll", rounds, winner, prize: prizeTitle });
    awardWinner(winner);
  }

  /** Volado: águila or sol. With a name on each side the coin picks a winner. */
  function flipCoin() {
    if (spinning) return;
    const heads = coinHeads.trim(), tails = coinTails.trim();
    const side: "aguila" | "sol" = Math.random() < 0.5 ? "aguila" : "sol";
    const winner = side === "aguila" ? heads || null : tails || null;
    const prizeTitle = buyNowItems.find(l => l.id === roulettePrize)?.title;
    setSpinning(true);
    setShowControls(false);
    setCoinLanded(false);
    setCoinShow({ side, heads, tails, winner, prize: prizeTitle });
    broadcast({ type: "coin_flip", side, heads, tails, winner, prize: prizeTitle });
    // A coin with no names is just a yes/no call — nothing to hand over.
    if (winner) awardWinner(winner);
  }

  /** What's still on the wheel in break mode — everything not yet drawn. */
  const breakRemaining = breakItems.filter(i => !breakDrawn.some(d => d.item === i));

  function spinRoulette() {
    const pool = breakMode ? breakRemaining : gamePool();
    if (!pool.length || spinning) {
      if (!pool.length) flashToast(breakMode ? "Ya se repartió todo. Agrega más o devuelve todo." : "No hay participantes para la ruleta.");
      return;
    }
    const winner = pool[Math.floor(Math.random() * pool.length)];
    const prizeTitle = breakMode ? undefined : buyNowItems.find(l => l.id === roulettePrize)?.title;
    setSpinning(true);
    setRouletteWinner(null);
    setShowControls(false);
    // Show the real spinning wheel for everyone — the winner rides in the spin message
    // so every screen's wheel lands on the same name.
    setRouletteLanded(false);
    setRouletteShow({ names: pool, winner, prize: prizeTitle, label: breakMode ? "🎁 BREAK" : undefined });
    broadcast({ type: "roulette_spin", pool, winner, prize: prizeTitle, label: breakMode ? "🎁 BREAK" : undefined });

    if (breakMode) {
      // Off the wheel it comes, so the next spin can't hand out the same slot twice.
      const to = breakAssignTo.trim();
      setBreakDrawn(prev => [...prev, { item: winner, to: to || undefined }]);
      setBreakAssignTo("");
      if (to) awardWinner(to, `🎁 ${winner} → @${to}`);
    } else {
      awardWinner(winner);
    }
  }

  // ── Seller catalog management (in-panel) ──
  /* Photo capture uses a plain file input with `capture` — the OS camera UI hands
     back a still image and never touches the LiveKit MediaStream, so the stream
     keeps publishing uninterrupted while the seller snaps the product photo. */
  /** Photo for the auction lot (separate from the buy-now catalog photo). */
  const cardPhotoInputRef = useRef<HTMLInputElement>(null);
  const [cardPhotoUploading, setCardPhotoUploading] = useState(false);
  async function onCardPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCardPhotoUploading(true);
    setAddCardError("");
    try {
      const url = await uploadToCloudinary(file, "tcg-live/auction-items", "image");
      setCardImageUrl(url);
    } catch {
      setAddCardError("No se pudo subir la foto. Intenta de nuevo.");
    } finally { setCardPhotoUploading(false); }
  }

  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setPhotoUploading(true);
    setListingErr("");
    try {
      const url = await uploadToCloudinary(file, "tcg-live/listings", "image");
      setListingForm(f => ({ ...f, imageUrl: url }));
    } catch {
      setListingErr("No se pudo subir la foto. Intenta de nuevo.");
    } finally { setPhotoUploading(false); }
  }

  async function submitListing() {
    const priceCents = Math.round(Number(listingForm.price) * 100);
    if (!listingForm.title.trim() || !priceCents || priceCents < 100) { setListingErr("Pon un título y un precio válido (mínimo $1)."); return; }
    const disc = Math.min(95, Math.max(0, Math.round(Number(listingForm.discountPercent) || 0)));
    setSavingListing(true); setListingErr("");
    try {
      const imgs = listingForm.imageUrl ? [listingForm.imageUrl] : undefined;
      if (editingListingId) {
        const { data } = await listingsApi.update(editingListingId, { title: listingForm.title.trim(), description: listingForm.description.trim(), price: priceCents, discountPercent: disc, ...(imgs ? { imageUrls: imgs } : {}) });
        setBuyNowItems(prev => prev.map(x => x.id === editingListingId ? data : x));
      } else {
        const { data } = await listingsApi.create({ title: listingForm.title.trim(), description: listingForm.description.trim() || undefined, price: priceCents, discountPercent: disc, game: a.game, imageUrls: imgs });
        setBuyNowItems(prev => [data, ...prev]);
      }
      setListingForm(EMPTY_LISTING_FORM);
      setEditingListingId(null);
    } catch (e: any) {
      setListingErr(e?.response?.data?.message ?? "No se pudo guardar el artículo.");
    } finally { setSavingListing(false); }
  }
  function editListing(l: ApiListing) {
    setEditingListingId(l.id);
    setListingErr("");
    setListingForm({ title: l.title, description: l.description ?? "", price: String(l.price / 100), discountPercent: l.discountPercent ? String(l.discountPercent) : "", promoted: !!l.promoted, imageUrl: l.imageUrls?.[0] ?? "" });
  }
  function cancelEditListing() { setEditingListingId(null); setListingForm(EMPTY_LISTING_FORM); setListingErr(""); }
  async function deleteListing(id: string) {
    try { await listingsApi.cancel(id); setBuyNowItems(prev => prev.filter(x => x.id !== id)); if (editingListingId === id) cancelEditListing(); } catch { flashToast("No se pudo eliminar."); }
  }
  async function togglePromote(l: ApiListing) {
    const next = !l.promoted;
    setBuyNowItems(prev => prev.map(x => x.id === l.id ? { ...x, promoted: next } : x)); // optimistic
    try { await listingsApi.update(l.id, { promoted: next }); }
    catch { setBuyNowItems(prev => prev.map(x => x.id === l.id ? { ...x, promoted: !next } : x)); flashToast("No se pudo actualizar."); }
  }

  // Load the seller's fixed-price catalog on mount (drives the promoted banner).
  useEffect(() => {
    loadBuyNow();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always refresh the "other live auctions" peek from the API (cache is only the instant first paint).
  useEffect(() => {
    auctionsApi.list({ limit: 12 })
      .then(r => setPeekAuctions(
        r.data.data
          .filter(x => x.id !== a.id && x.status !== "ended" && x.status !== "cancelled")
          .sort((p, q) => (p.status === "live" ? 0 : 1) - (q.status === "live" ? 0 : 1)) // live first
          .slice(0, 10)
      ))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // close the ⋮ menu when clicking outside
  useEffect(() => {
    if (!showMoreMenu) return;
    const onDown = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showMoreMenu]);

  // Floating emoji reactions — seller-configured list (fallback to defaults)
  const reactionEmojis = a.reactionEmojis && a.reactionEmojis.length ? a.reactionEmojis : REACTION_EMOJIS;
  const [reactions, setReactions] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(reactionEmojis[0]);
  const reactionIdRef = useRef(0);
  const lpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const pressMovedRef = useRef(false);
  const pressStartRef = useRef({ x: 0, y: 0 });
  const pickerWasOpenRef = useRef(false);
  const emojiWrapRef = useRef<HTMLDivElement>(null);

  function spawnReaction(emoji: string) {
    const id = reactionIdRef.current++;
    const x = 2 + Math.floor(Math.random() * 26); // horizontal jitter (px from right)
    setReactions(prev => [...prev.slice(-14), { id, emoji, x }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2300);
  }

  function sendReaction(emoji: string) {
    spawnReaction(emoji);
    const room = roomRef.current;
    if (room && room.state === "connected") {
      try {
        room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: "reaction", emoji })),
          { reliable: true },
        );
      } catch {}
    }
  }

  const onEmojiDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    didLongPressRef.current = false;
    pressMovedRef.current = false;
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    pickerWasOpenRef.current = showEmojiPicker;               // remember if the picker was already open
    lpTimerRef.current = setTimeout(() => { didLongPressRef.current = true; setShowEmojiPicker(true); }, 300);
  };
  const onEmojiMove = (e: React.PointerEvent) => {
    if (Math.abs(e.clientX - pressStartRef.current.x) > 10 || Math.abs(e.clientY - pressStartRef.current.y) > 10) {
      pressMovedRef.current = true;
    }
  };
  const onEmojiUp = () => {
    const wasLong = didLongPressRef.current;
    const moved = pressMovedRef.current;
    const wasOpen = pickerWasOpenRef.current;
    if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; }
    didLongPressRef.current = false;
    // Tapping while the picker is open just closes it — never sends.
    if (wasOpen) { setShowEmojiPicker(false); return; }
    // Held (long-press → picker) or dragged: do NOT send. Only a clean tap sends.
    if (wasLong || moved) return;
    sendReaction(selectedEmoji);
  };
  const onEmojiCancel = () => {
    if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; }
    didLongPressRef.current = false;
  };

  useEffect(() => {
    if (!showEmojiPicker) return;
    const onDoc = (e: MouseEvent) => { if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target as Node)) setShowEmojiPicker(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showEmojiPicker]);
  const [showMaxBidOv, setShowMaxBidOv] = useState(false);
  const [maxBidOv, setMaxBidOv] = useState(0);
  const [settingMaxOv, setSettingMaxOv] = useState(false);
  const [maxKeypad, setMaxKeypad] = useState(""); // typed pesos string, e.g. "150" or "150.50"
  // The box opens pre-filled with the minimum; the FIRST keypress clears it so the
  // user types their own amount from scratch (a plain backspace just deletes a digit).
  const maxFresh = useRef(false);
  const maxBidOvRef = useRef<HTMLDivElement>(null);

  function pressKey(k: string) {
    if (maxFresh.current && k !== "back") { maxFresh.current = false; setMaxKeypad(k === "." ? "0." : k); return; }
    maxFresh.current = false;
    setMaxKeypad(prev => {
      if (k === "back") return prev.slice(0, -1);
      if (k === ".") return prev.includes(".") ? prev : (prev === "" ? "0." : prev + ".");
      // limit to 2 decimals
      if (prev.includes(".") && prev.split(".")[1]?.length >= 2) return prev;
      if (prev === "0" && k !== ".") return k; // replace leading zero
      return (prev + k).slice(0, 9);
    });
  }

  async function enterPip() {
    setShowMoreMenu(false);
    const v = videoRef.current as any;
    try {
      if (document.pictureInPictureElement) { await (document as any).exitPictureInPicture(); return; }
      if (v && v.requestPictureInPicture && !v.disablePictureInPicture) { await v.requestPictureInPicture(); }
      else { flashToast("PiP no disponible aquí."); }
    } catch { flashToast("No se pudo abrir Picture-in-Picture."); }
  }

  useEffect(() => {
    if (!showMaxBidOv) return;
    const onDoc = (e: MouseEvent) => { if (maxBidOvRef.current && !maxBidOvRef.current.contains(e.target as Node)) setShowMaxBidOv(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowMaxBidOv(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [showMaxBidOv]);

  useEffect(() => {
    if (!isLive || !user || !a.isStream) return;
    let alive = true;
    const room = new Room();
    roomRef.current = room;

    if (!isSeller) {
      room.on(RoomEvent.TrackSubscribed, (track: any, pub: any) => {
        if (!alive || track.kind !== Track.Kind.Video) return;
        // The seller may publish two cameras; the named one is their face and gets
        // its own element so it can sit over the main feed.
        if (pub?.trackName === SELFIE_TRACK) {
          if (selfieRef.current) track.attach(selfieRef.current);
          setHasSelfieVideo(true);
        } else if (videoRef.current) {
          track.attach(videoRef.current);
          setHasRemoteVideo(true);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: any, pub: any) => {
        if (track.kind !== Track.Kind.Video) return;
        track.detach();
        if (!alive) return;
        if (pub?.trackName === SELFIE_TRACK) setHasSelfieVideo(false);
        else setHasRemoteVideo(false);
      });
    }

    // A viewer who arrives later missed the original announcement, so repeat it.
    room.on(RoomEvent.ParticipantConnected, () => {
      if (isSeller && selfieTrackRef.current) broadcastSelfieLayout(selfieLayout, true);
    });

    room.on(RoomEvent.Reconnecting, () => { if (alive) setRoomConnected(false); });
    room.on(RoomEvent.Reconnected,  () => { if (alive) setRoomConnected(true); });

    const updateViewers = () => {
      if (!alive) return;
      setViewerCount(room.numParticipants);
      // Keep a roster for the roulette + moderation: everyone except the seller (host)
      const names: string[] = [];
      const roster: { id: string; name: string }[] = [];
      room.remoteParticipants?.forEach((p: any) => {
        const n = p?.name || p?.identity;
        if (n && n !== sellerName) { names.push(n); roster.push({ id: p?.identity, name: n }); }
      });
      setParticipants(names);
      setParticipantList(roster);
    };
    const addJoin = (name: string) => {
      if (!alive || !name) return;
      setChatMessages(prev => [...prev, { username: name, text: "", ts: Date.now(), join: true }]);
    };
    room.on(RoomEvent.ParticipantConnected, (p: any) => { updateViewers(); addJoin(p?.name || p?.identity); });
    room.on(RoomEvent.ParticipantDisconnected, updateViewers);
    room.on(RoomEvent.Connected, () => { updateViewers(); addJoin(user?.username || "Alguien"); });

    attachChatListener(room);
    setConnectError(null);

    auctionsApi.livekitToken(a.id)
      .then(({ data }) => {
        if (!alive) return;
        return room.connect(data.wsUrl, data.token).then(() => { if (alive) setRoomConnected(true); });
      })
      .catch(() => {
        if (alive) setConnectError("No se pudo conectar al stream. Revisa tu conexión.");
      });

    return () => {
      alive = false;
      setRoomConnected(false);
      room.disconnect();
      roomRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, a.id, connectRetryTick]);

  useEffect(() => () => { roomRef.current?.disconnect(); }, []);

  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;
    // Only auto-stick to the newest message if the user is already near the bottom.
    // If they've scrolled up to read history, leave their position alone.
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }, [chatMessages]);

  function attachChatListener(room: Room) {
    room.on(RoomEvent.DataReceived, (data: Uint8Array, participant?: any) => {
      try {
        if (participant?.identity === room.localParticipant?.identity) return;
        const msg = JSON.parse(new TextDecoder().decode(data));
        if (msg.type === "chat") {
          setChatMessages(prev => [...prev, { username: msg.username, text: censorText(msg.text), ts: msg.ts }]);
        } else if (msg.type === "lightning") {
          setLightningEndsAt(msg.startsAt + msg.duration * 1000);
        } else if (msg.type === "price_reveal") {
          setRevealedPrice(String(msg.price));
          setPriceRevealed(true);
        } else if (msg.type === "reaction" && typeof msg.emoji === "string") {
          spawnReaction(msg.emoji);
        } else if (msg.type === "raffle_drawn") {
          flashToast(`🎉 Sorteo: ganó @${msg.winner}`);
          loadRaffles();
        } else if (msg.type === "selfie_layout") {
          // The seller decides where their face feed sits; viewers can't infer it.
          if (msg.mode === "round" || msg.mode === "corner") setSelfieLayout(msg.mode);
          if (typeof msg.on === "boolean" && !msg.on) setHasSelfieVideo(false);
        } else if (msg.type === "roulette_spin") {
          // Viewers see the same spinning wheel, landing on the same winner
          const pool: string[] = Array.isArray(msg.pool) ? msg.pool : [];
          if (pool.length && msg.winner) {
            setRouletteLanded(false);
            setRouletteShow({ names: pool, winner: msg.winner, prize: msg.prize, label: msg.label });
          }
        } else if (msg.type === "dice_roll") {
          // Every screen replays the seller's rolls — the result travels with the message
          // so nobody re-rolls their own outcome.
          if (Array.isArray(msg.rounds) && msg.rounds.length && msg.winner) {
            setDiceLanded(false);
            setDiceShow({ rounds: msg.rounds, winner: msg.winner, prize: msg.prize });
          }
        } else if (msg.type === "coin_flip") {
          if (msg.side === "aguila" || msg.side === "sol") {
            setCoinLanded(false);
            setCoinShow({ side: msg.side, heads: msg.heads ?? "", tails: msg.tails ?? "", winner: msg.winner ?? null, prize: msg.prize });
          }
        } else if (msg.type === "roulette_winner") {
          setRouletteWinner({ name: msg.winner, prize: msg.prize });
        } else if (msg.type === "pin" && typeof msg.text === "string") {
          pinMessage(msg.text, msg.by || "Mod");
        }
      } catch {}
    });
  }

  async function sendChat() {
    if (!chatInput.trim() || !roomRef.current || !user) return;
    if (myMute) { flashToast("Estás silenciado por un moderador."); setChatInput(""); return; }
    if (roomRef.current.state !== "connected") {
      setChatMessages(prev => [...prev, { username: "sistema", text: "Sin conexión, intenta de nuevo", ts: Date.now() }]);
      return;
    }
    const clean = censorText(chatInput.trim().slice(0, 200));
    if (!clean) { setChatInput(""); return; }
    const msg = { type: "chat", username: user.username, text: clean, ts: Date.now() };
    try {
      await roomRef.current.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(msg)),
        { reliable: true }
      );
      setChatMessages(prev => [...prev, { username: user.username, text: clean, ts: Date.now() }]);
    } catch {}
    setChatInput("");
  }

  useEffect(() => {
    if (autoStream && isSeller && isLive && !streaming) {
      startStream();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStream, isSeller, isLive]);

  /** Preview of the number the server will assign to the next lot. */
  async function addCard() {
    if (!cardPrice) return;
    setAddingCard(true);
    setAddCardError("");
    try {
      const res = await auctionsApi.addItem(a.id, {
        startingPrice:   Math.round(Number(cardPrice) * 100),
        durationSeconds: Number(cardDuration),
      });
      onAuctionUpdate?.(res.data);
      setCardPrice("");
      setShowControls(false); // drop the panel once the lot is up
      flashToast("Puja publicada 🃏");
    } catch (err: any) {
      setAddCardError(err?.response?.data?.message ?? "Error al agregar la carta");
    } finally {
      setAddingCard(false);
    }
  }

  useEffect(() => {
    if (!isLive || !isSeller) return;
    const items = a.items ?? [];
    const newWinners: typeof streamWinners = [];
    for (const item of items) {
      if (item.winnerId && item.bids && item.bids.length > 0) {
        const topBid = [...item.bids].sort((x, y) => y.amount - x.amount)[0];
        const username = topBid?.bidder?.username;
        if (username && !streamWinners.find(w => w.username === username && w.itemName === item.cardName)) {
          newWinners.push({ username, category: (item as any).category ?? "carta", itemName: item.cardName });
        }
      }
    }
    if (newWinners.length > 0) {
      setStreamWinners(prev => {
        const combined = [...prev];
        for (const w of newWinners) {
          if (!combined.find(c => c.username === w.username && c.itemName === w.itemName)) {
            combined.push(w);
          }
        }
        return combined;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.items]);

  async function closeActiveItem(itemId: string) {
    setClosingItem(true);
    setCloseItemMsg("");
    try {
      await auctionsApi.closeItem(itemId);
      const { data } = await auctionsApi.get(a.id);
      onAuctionUpdate?.(data);
      setCloseItemMsg("✓ Carta cerrada — pasando a la siguiente");
      setTimeout(() => setCloseItemMsg(""), 3000);
    } catch (err: any) {
      setCloseItemMsg(err?.response?.data?.message ?? "Error al cerrar el artículo");
      setTimeout(() => setCloseItemMsg(""), 4000);
    } finally {
      setClosingItem(false);
    }
  }

  useEffect(() => {
    return () => {
      if (mgIntervalRef.current) clearInterval(mgIntervalRef.current);
      if (chatRaffleRef.current) clearInterval(chatRaffleRef.current);
    };
  }, []);

  useEffect(() => {
    if (!lightningEndsAt) { setLightningLeft(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((lightningEndsAt - Date.now()) / 1000));
      setLightningLeft(left);
      if (left === 0) setLightningEndsAt(null);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [lightningEndsAt]);

  function spinMinigame() {
    const pool = mgCategory === "todos"
      ? streamWinners
      : streamWinners.filter(w => w.category === mgCategory);
    if (pool.length === 0) return;
    setMgSpinning(true);
    setMgWinner(null);
    let ticks = 0;
    const total = 20 + Math.floor(Math.random() * 15);
    if (mgIntervalRef.current) clearInterval(mgIntervalRef.current);
    mgIntervalRef.current = setInterval(() => {
      const random = pool[Math.floor(Math.random() * pool.length)];
      setMgWinner(random.username);
      ticks++;
      if (ticks >= total) {
        clearInterval(mgIntervalRef.current!);
        mgIntervalRef.current = null;
        setMgSpinning(false);
      }
    }, 80);
  }

  function spinChatRaffle() {
    const pool = Array.from(new Set(chatMessages.map(m => m.username)))
      .filter(u => u !== "sistema");
    if (pool.length === 0) return;
    setChatRaffleSpinning(true);
    setChatRaffleWinner(null);
    let ticks = 0;
    const total = 20 + Math.floor(Math.random() * 15);
    if (chatRaffleRef.current) clearInterval(chatRaffleRef.current);
    chatRaffleRef.current = setInterval(() => {
      setChatRaffleWinner(pool[Math.floor(Math.random() * pool.length)]);
      ticks++;
      if (ticks >= total) {
        clearInterval(chatRaffleRef.current!);
        chatRaffleRef.current = null;
        setChatRaffleSpinning(false);
      }
    }, 80);
  }

  async function launchLightning() {
    if (!roomRef.current) return;
    const startsAt = Date.now();
    setLightningEndsAt(startsAt + lightningDuration * 1000);
    try {
      await roomRef.current.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: "lightning", duration: lightningDuration, startsAt })),
        { reliable: true }
      );
    } catch {}
  }

  async function revealHiddenPrice() {
    if (!priceInput.trim()) return;
    const p = priceInput.trim();
    setRevealedPrice(p);
    setPriceRevealed(true);
    if (roomRef.current) {
      try {
        await roomRef.current.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: "price_reveal", price: p })),
          { reliable: true }
        );
      } catch {}
    }
  }

  async function startStream() {
    if (startingRef.current || streaming) return;
    startingRef.current = true;
    setConnecting(true);
    setStreamError(null);
    try {
      let room = roomRef.current;
      if (!room) {
        const { data } = await auctionsApi.livekitToken(a.id);
        room = new Room();
        roomRef.current = room;
        attachChatListener(room);
        await room.connect(data.wsUrl, data.token);
      }

      room.on(RoomEvent.LocalTrackPublished, (pub: any) => {
        if (pub.track?.kind === Track.Kind.Video && videoRef.current) {
          pub.track.attach(videoRef.current);
        }
      });

      let camOk = false;
      try {
        await room.localParticipant.setCameraEnabled(true);
        camOk = true;
      } catch (camErr: any) {
        const n = camErr?.name ?? "";
        if (n === "NotAllowedError") {
          setStreamError("El navegador bloqueó la cámara. Permite el acceso en la barra de direcciones.");
        } else if (n === "NotReadableError") {
          setStreamError("La cámara está en uso por otra aplicación. Ciérrala y vuelve a intentarlo.");
        } else {
          setStreamError("No se encontró cámara. Conecta una cámara y vuelve a intentarlo, o transmite solo con audio.");
        }
      }

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch { /* mic unavailable — continue anyway */ }

      if (camOk) {
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track && videoRef.current) camPub.track.attach(videoRef.current);

        // Record what we're broadcasting so the session can be replayed later.
        // Best-effort: a browser that can't record still streams normally, it just
        // leaves no video behind.
        try {
          const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
          const tracks = [camPub?.track?.mediaStreamTrack, micPub?.track?.mediaStreamTrack]
            .filter(Boolean) as MediaStreamTrack[];
          if (tracks.length) {
            recorderRef.current = createLiveRecorder();
            recorderRef.current.start(new MediaStream(tracks));
          }
        } catch { /* recording is optional; the live matters more */ }
      }

      setStreaming(true);
      capture("stream_started", { auctionId: a.id });
    } catch (err: any) {
      console.error("Stream error:", err);
      const msg: string = err?.message ?? err?.name ?? String(err);
      setStreamError(`Error al conectar: ${msg}`);
    } finally {
      setConnecting(false);
      startingRef.current = false;
    }
  }

  async function stopStream() {
    if (roomRef.current) {
      try {
        await roomRef.current.localParticipant.setCameraEnabled(false);
        await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      } catch {}
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }

  async function endAuction() {
    if (endingAuction) return;
    if (!confirmEnd) {
      setConfirmEnd(true);
      setTimeout(() => setConfirmEnd(false), 3000);
      return;
    }
    setConfirmEnd(false);
    setEndingAuction(true);
    try {
      await stopStream();
      const { data } = await auctionsApi.end(a.id);
      onAuctionUpdate?.(data as any);
      capture("auction_ended", { auctionId: a.id });
    } catch (err: any) {
      setStreamError(err?.response?.data?.message ?? "Error al terminar la subasta.");
    } finally {
      setEndingAuction(false);
    }
  }

  // ── Second camera: publish the seller's face as its own track ──

  /** Which cameras this device has, so the seller can pick the face-facing one. */
  const loadCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === "videoinput");
      setCameras(cams);
      // Default to a camera that isn't the one already streaming the cards.
      if (!selfieDeviceId && cams.length > 1) {
        const inUse = roomRef.current?.localParticipant
          ?.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack
          ?.getSettings()?.deviceId;
        setSelfieDeviceId((cams.find(c => c.deviceId !== inUse) ?? cams[0]).deviceId);
      }
    } catch { /* the browser may withhold the list until permission is granted */ }
  }, [selfieDeviceId]);

  /** Tell viewers how to place the face feed (they can't infer it from the track). */
  const broadcastSelfieLayout = useCallback((mode: SelfieLayout, on: boolean) => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") return;
    try {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: "selfie_layout", mode, on })),
        { reliable: true },
      );
    } catch { /* best effort — the layout is cosmetic */ }
  }, []);

  // Tell the server we're here. The credit is capped server-side, so a sleeping tab
  // stops earning rather than banking hours it didn't watch.
  useEffect(() => {
    if (!user || !isLive) return;
    let alive = true;
    // Whoever's link brought us here, if any. Sent on every beat; the server only
    // records it once, so a refresh can't re-credit the same friend.
    const ref = new URLSearchParams(window.location.search).get("ref") ?? undefined;
    const beat = () => {
      auctionsApi.heartbeat(a.id, ref)
        .then(r => {
          if (!alive) return;
          setMyMinutes(r.data.minutes);
          setMyEntries(r.data.entries);
          setFriendBoost({ multiplier: r.data.multiplier, connectedFriends: r.data.connectedFriends });
        })
        .catch(() => {});
    };
    beat();
    const id = setInterval(() => { if (!document.hidden) beat(); }, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [user, isLive, a.id]);

  const loadRaffles = useCallback(() => {
    auctionsApi.raffles(a.id).then(r => setRaffles(r.data)).catch(() => {});
  }, [a.id]);

  useEffect(() => { loadRaffles(); }, [loadRaffles]);

  async function pickRafflePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file twice still fires
    if (!file) return;
    setRafflePhotoBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await auctionsApi.uploadRaffleImage(a.id, form);
      setRafflePhoto(data.url);
    } catch (e: unknown) {
      flashToast(apiMessage(e, "No se pudo subir la foto."));
    } finally { setRafflePhotoBusy(false); }
  }

  async function createRaffle() {
    if (!rafflePrize.trim() || raffleBusy) return;
    setRaffleBusy(true);
    try {
      await auctionsApi.createRaffle(a.id, {
        prizeTitle: rafflePrize.trim(),
        prizeListingId: raffleListing || undefined,
        minMinutes: Math.max(0, Number(raffleMin) || 0),
        prizeImageUrl: rafflePhoto ?? undefined,
      });
      setRafflePrize(""); setRaffleListing(""); setRafflePhoto(null);
      loadRaffles();
      flashToast("Sorteo creado — se anuncia a quienes están viendo");
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo crear el sorteo.");
    } finally { setRaffleBusy(false); }
  }

  async function drawRaffle(raffleId: string) {
    if (raffleBusy) return;
    setRaffleBusy(true);
    try {
      const { data } = await auctionsApi.drawRaffle(a.id, raffleId);
      const r = data.raffle;
      flashToast(`🎉 Ganó @${r.winnerUsername} con ${r.winnerEntries} de ${r.totalEntries} entradas`);
      loadRaffles();
      if (data.order) setBuyNowItems(prev => prev.filter(l => l.id !== r.prizeListingId));
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo sortear.");
    } finally { setRaffleBusy(false); }
  }

  async function saveLiveName() {
    if (savingName) return;
    setSavingName(true);
    try {
      const { data } = await auctionsApi.update(a.id, { displayName: nameDraft });
      onAuctionUpdate?.(data);
      flashToast(nameDraft.trim() ? "Nombre del live actualizado" : "Se restauró el número del live");
    } catch (e: any) {
      flashToast(e?.response?.data?.message ?? "No se pudo cambiar el nombre.");
    } finally { setSavingName(false); }
  }

  async function toggleSelfie() {
    const room = roomRef.current;
    if (!room || selfieBusy) return;
    setSelfieBusy(true);
    try {
      if (selfieOn) {
        if (selfieTrackRef.current) {
          await room.localParticipant.unpublishTrack(selfieTrackRef.current, true);
          selfieTrackRef.current = null;
        }
        setSelfieOn(false);
        broadcastSelfieLayout(selfieLayout, false);
      } else {
        // A distinct deviceId is what makes this a second feed rather than a copy of
        // the first; without one some browsers hand back the same camera.
        const track = await createLocalVideoTrack({
          ...(selfieDeviceId ? { deviceId: { exact: selfieDeviceId } } : { facingMode: "user" }),
          resolution: { width: 640, height: 640 },
        });
        await room.localParticipant.publishTrack(track, {
          name: SELFIE_TRACK,
          source: Track.Source.Unknown, // Camera is taken by the main feed
          simulcast: false,
        });
        selfieTrackRef.current = track;
        if (selfieRef.current) track.attach(selfieRef.current);
        setSelfieOn(true);
        setHasSelfieVideo(true);
        broadcastSelfieLayout(selfieLayout, true);
      }
    } catch (e: any) {
      flashToast(
        e?.name === "NotReadableError"
          ? "Esa cámara ya está en uso por el video principal. Elige otra."
          : "No se pudo abrir la segunda cámara.",
      );
    } finally {
      setSelfieBusy(false);
    }
  }

  function changeSelfieLayout(mode: SelfieLayout) {
    setSelfieLayout(mode);
    broadcastSelfieLayout(mode, selfieOn);
  }

  async function toggleMic() {
    if (!roomRef.current) return;
    const next = micMuted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(next);
    setMicMuted(!next);
  }

  async function toggleCam() {
    if (!roomRef.current) return;
    const next = camOff;
    await roomRef.current.localParticipant.setCameraEnabled(next);
    if (!next && videoRef.current) {
      const pub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
      if (pub?.track) pub.track.attach(videoRef.current);
    }
    setCamOff(!next);
  }

  const status     = STATUS_LABEL[a.status ?? "upcoming"];
  const title      = liveName(a);
  const sellerName = a.seller?.username ?? a.sellerName ?? "—";
  const verified   = a.seller?.verified;
  // Clock comes from the active card's closesAt (nowTick forces the re-render each second)
  const activeItem = a.items?.find(i => i.status === "active") ?? a.items?.[0];
  const closesAt   = activeItem?.closesAt ?? a.endTime;
  const secsLeft   = closesAt ? Math.max(0, Math.floor((new Date(closesAt).getTime() - nowTick) / 1000)) : null;
  // Keep the badge narrow so it never collides with the seller row ("Finalizada" is too wide)
  const timer      = !closesAt ? "—" : secsLeft === 0 ? "0:00" : formatTimer(closesAt);
  const showVideo  = streaming || hasRemoteVideo;

  return (
    <div
      className={fullScreen ? "relative overflow-hidden" : "rounded-2xl overflow-hidden"}
      style={fullScreen ? { background: "#000" } : { background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
    >

      {/* ── Other live auctions peek — mobile drawer (desktop uses the right panel) ── */}
      {fullScreen && (
        <div className="lg:hidden absolute top-0 inset-x-0 z-0 flex flex-col justify-end px-3 pb-2" style={{ height: PEEK_H, background: "#08080c" }}>
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.6)" }}>Otras subastas activas</span>
            <Link href="/auctions" className="text-[11px] font-semibold" style={{ color: "var(--brand-light)" }}>Ver todas →</Link>
          </div>
          {peekAuctions.length === 0 ? (
            <p className="text-xs px-1 pb-3" style={{ color: "rgba(255,255,255,0.45)" }}>No hay otras subastas activas por ahora.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 px-1" style={{ scrollbarWidth: "none" }}>
              {peekAuctions.map(pa => {
                const pname = pa.seller?.username ?? pa.sellerName ?? "?";
                const live = pa.status === "live";
                return (
                  <Link key={pa.id} href={`/auctions/${pa.id}`} className="shrink-0 flex flex-col items-center gap-1 w-[58px]" title={`${pa.title} · $${(((pa.currentBid ?? pa.startingBid ?? 0)) / 100).toLocaleString("es-MX")}`}>
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black text-white ${live ? "live-ring" : ""}`}
                        style={{ background: "linear-gradient(150deg,#3b3f52,#1a1d29)", border: live ? "2px solid #f43f5e" : "1.5px solid rgba(255,255,255,0.18)" }}>
                        {pname.slice(0, 2).toUpperCase()}
                      </div>
                      {live && (
                        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded-full text-[8px] font-black text-white uppercase tracking-wide"
                          style={{ background: "#f43f5e", boxShadow: "0 0 8px rgba(244,63,94,0.8)" }}>Live</span>
                      )}
                    </div>
                    <span className="text-[10px] text-white/85 truncate max-w-full leading-tight">{pname}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Video area (full-frame vertical, like a phone live) ── */}
      <div className={`relative z-10 w-full flex items-center justify-center overflow-hidden lg:!transform-none ${fullScreen ? "h-[100dvh]" : "h-[78vh] max-h-[840px]"}`}
        style={{ background: "#050508", transform: fullScreen && peekOpen ? `translateY(${PEEK_H}px)` : "none", transition: "transform 0.4s cubic-bezier(0.22,1,0.36,1)" }}>

        {/* Tap anywhere without controls to toggle the immersive (video-only) view */}
        <button
          type="button"
          aria-label={chromeHidden ? "Mostrar chat y pujas" : "Ocultar chat y pujas"}
          onClick={() => setChromeHidden(v => !v)}
          className="absolute inset-0 z-[5] cursor-default"
          style={{ background: "transparent" }}
        />

        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSeller || viewerMuted}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: showVideo ? "block" : "none" }}
        />

        {/* Second camera: the seller's face over the card feed.
            "round" is a small circle framing the face; "corner" is a quarter-width
            rectangle. Kept mounted whenever a face track exists so switching layout
            never detaches the element and drops the stream. */}
        <div
          className="absolute z-[8] overflow-hidden pointer-events-none"
          style={{
            display: hasSelfieVideo && !chromeHidden ? "block" : "none",
            bottom: selfieLayout === "round" ? 96 : 92,
            right: 12,
            width: selfieLayout === "round" ? 96 : "25%",
            aspectRatio: selfieLayout === "round" ? "1 / 1" : "3 / 4",
            borderRadius: selfieLayout === "round" ? "9999px" : 14,
            border: "2px solid rgba(255,255,255,0.35)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
            background: "#000",
            transition: "width 0.25s ease, border-radius 0.25s ease",
          }}
        >
          <video ref={selfieRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        </div>

        {/* Placeholder when no video */}
        {!showVideo && (
          <>
            {/* CRT scanlines */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)",
                opacity: 0.5,
              }}
            />
            {/* Radial glow */}
            <div
              className="absolute inset-0"
              style={{ background: `radial-gradient(circle at 50% 40%, ${glow} 0%, transparent 60%)`, opacity: 0.35 }}
            />
            {/* Card art */}
            <div
              className={`relative w-32 h-44 rounded-2xl bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-3 shadow-2xl`}
              style={{ boxShadow: `0 0 60px ${glow}` }}
            >
              <span className="text-6xl">🃏</span>
              <span className="text-white text-[10px] font-black tracking-widest opacity-90 text-center px-2">
                {title.toUpperCase().slice(0, 12)}
              </span>
            </div>
          </>
        )}

        {/* Stream connection error */}
        {connectError && (
          <div
            role="alert"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs"
            style={{ background: "rgba(0,0,0,0.75)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5" }}
          >
            <span>{connectError}</span>
            <button
              type="button"
              onClick={() => { setConnectError(null); setConnectRetryTick(t => t + 1); }}
              className="font-bold underline underline-offset-2 shrink-0"
              style={{ color: "#fff" }}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* (the countdown now lives inline, to the left of "Puja actual") */}

        {/* ── Paused: the seller stepped out of the live ── */}
        {isPaused && isLive && !chromeHidden && (
          <div className="absolute inset-0 z-[35] flex items-center justify-center px-8 pointer-events-none" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}>
            <div className="text-center rounded-2xl px-6 py-5" style={{ background: "rgba(15,15,20,0.95)", border: "1px solid rgba(255,255,255,0.16)" }}>
              <p className="text-3xl mb-1">⏸</p>
              <p className="text-base font-black text-white">Transmisión en pausa</p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>
                {isSeller ? "Vuelve al live para reanudar las pujas." : "El vendedor salió un momento. Las pujas están congeladas."}
              </p>
              <p className="text-[11px] mt-2" style={{ color: "rgba(255,255,255,0.45)" }}>Se cierra sola si no regresa en 10 minutos.</p>
            </div>
          </div>
        )}

        {/* ── Banned from this live ── */}
        {myBan && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center px-8" style={{ background: "rgba(0,0,0,0.92)" }}>
            <div className="text-center">
              <p className="text-4xl mb-2">🚫</p>
              <p className="text-lg font-black text-white">Fuiste expulsado del live</p>
              <p className="text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                {myBan.expiresAt ? "El acceso se restaura cuando expire la restricción." : "Un moderador te retiró el acceso a esta transmisión."}
              </p>
              <button type="button" onClick={() => router.push("/auctions")}
                className="mt-4 px-5 py-2.5 rounded-full text-sm font-bold" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                Ver otras subastas
              </button>
            </div>
          </div>
        )}

        {/* ── Pinned message (any mod) — sits at the very top for 10s ── */}
        {pinnedMsg && !chromeHidden && (
          <div className="absolute top-14 inset-x-3 z-[38] rounded-xl px-3 py-2 flex items-start gap-2"
            style={{ opacity: 1, background: "#2563EB", border: "1px solid rgba(255,255,255,0.3)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
            <span className="text-sm shrink-0">📌</span>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-wide text-white/70">Mensaje fijado · {pinnedMsg.by}</p>
              <p className="text-[13px] font-semibold text-white leading-snug break-words">{pinnedMsg.text}</p>
            </div>
          </div>
        )}

        {/* ── Ban approval — the seller must OK a moderator's permanent ban ── */}
        {isSeller && pendingBans.filter(b => !dismissedPendingBans.has(b.id)).map(b => (
          <div key={b.id} className="absolute inset-x-4 top-24 z-[45] rounded-2xl p-3.5"
            style={{ opacity: 1, background: "rgba(20,10,10,0.96)", border: "1px solid #f43f5e", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "#f87171" }}>⚠️ Aprobación requerida</p>
            <p className="text-sm text-white mt-1"><strong>{b.createdByUsername}</strong> quiere <strong>banear permanentemente</strong> a <strong>{b.targetUsername}</strong>.</p>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => { rejectBan(b.id); setDismissedPendingBans(p => new Set(p).add(b.id)); }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}>Rechazar</button>
              <button type="button" onClick={() => approveBan(b.id)}
                className="flex-1 py-2 rounded-lg text-sm font-bold text-white" style={{ background: "#dc2626" }}>Aprobar ban</button>
            </div>
          </div>
        ))}

        {/* ── Roulette wheel — a real spinning wheel with the entered names, for everyone ── */}
        {rouletteShow && (
          <div className="game-in absolute inset-0 z-[68] flex flex-col items-center justify-center gap-4 px-4 pointer-events-auto"
            style={{ background: "rgba(0,0,0,0.78)" }}>
            {rouletteLanded && <Confetti />}
            <p className="text-white font-black tracking-[0.15em] text-sm">{rouletteShow.label ?? "🎡 RULETA"}</p>
            <RouletteWheel names={rouletteShow.names} winner={rouletteShow.winner}
              onDone={() => { setRouletteLanded(true); setSpinning(false); }} />
            {rouletteLanded && (
              <div className="text-center">
                <p className="pop-in text-3xl font-black text-white">🎉 {rouletteShow.winner}</p>
                {rouletteShow.prize && (
                  <p className="text-sm font-bold mt-1" style={{ color: "var(--brand-light)" }}>Premio: {rouletteShow.prize}</p>
                )}
              </div>
            )}
            {(isSeller || rouletteLanded) && (
              <button type="button" onClick={() => { setRouletteShow(null); setRouletteLanded(false); }}
                className="mt-1 px-5 py-2 rounded-full text-sm font-bold"
                style={{ background: rouletteLanded ? "var(--brand-light)" : "rgba(255,255,255,0.14)", color: rouletteLanded ? "var(--brand-ink)" : "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                {rouletteLanded ? "Cerrar" : "Saltar"}
              </button>
            )}
          </div>
        )}

        {/* ── Dados — everyone watches the same throw, tiebreaks included ── */}
        {diceShow && (
          <div className="game-in absolute inset-0 z-[68] flex flex-col items-center justify-center gap-4 px-4 pointer-events-auto"
            style={{ background: "rgba(0,0,0,0.78)" }}>
            {diceLanded && <Confetti />}
            <p className="text-white font-black tracking-[0.15em] text-sm">🎲 DADOS</p>
            <DiceRoll rounds={diceShow.rounds} winner={diceShow.winner}
              onDone={() => { setDiceLanded(true); setSpinning(false); }} />
            {diceLanded && (
              <div className="text-center">
                <p className="pop-in text-3xl font-black text-white">🎉 {diceShow.winner}</p>
                {diceShow.prize && (
                  <p className="text-sm font-bold mt-1" style={{ color: "var(--brand-light)" }}>Premio: {diceShow.prize}</p>
                )}
              </div>
            )}
            {(isSeller || diceLanded) && (
              <button type="button" onClick={() => { setDiceShow(null); setDiceLanded(false); setSpinning(false); }}
                className="mt-1 px-5 py-2 rounded-full text-sm font-bold"
                style={{ background: diceLanded ? "var(--brand-light)" : "rgba(255,255,255,0.14)", color: diceLanded ? "var(--brand-ink)" : "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                {diceLanded ? "Cerrar" : "Saltar"}
              </button>
            )}
          </div>
        )}

        {/* ── Volado ── */}
        {coinShow && (
          <div className="game-in absolute inset-0 z-[68] flex flex-col items-center justify-center gap-5 px-4 pointer-events-auto"
            style={{ background: "rgba(0,0,0,0.78)" }}>
            {coinLanded && coinShow.winner && <Confetti />}
            <p className="text-white font-black tracking-[0.15em] text-sm">🪙 VOLADO</p>
            <CoinFlip side={coinShow.side} heads={coinShow.heads} tails={coinShow.tails}
              onDone={() => { setCoinLanded(true); setSpinning(false); }} />
            {coinLanded && (
              <div className="text-center">
                <p className="pop-in text-xl font-black" style={{ color: "#FACC15" }}>
                  {coinShow.side === "aguila" ? "🦅 Águila" : "☀️ Sol"}
                </p>
                {coinShow.winner && <p className="pop-in text-3xl font-black text-white mt-1" style={{ animationDelay: "0.18s" }}>🎉 {coinShow.winner}</p>}
                {coinShow.prize && coinShow.winner && (
                  <p className="text-sm font-bold mt-1" style={{ color: "var(--brand-light)" }}>Premio: {coinShow.prize}</p>
                )}
              </div>
            )}
            {(isSeller || coinLanded) && (
              <button type="button" onClick={() => { setCoinShow(null); setCoinLanded(false); setSpinning(false); }}
                className="mt-1 px-5 py-2 rounded-full text-sm font-bold"
                style={{ background: coinLanded ? "var(--brand-light)" : "rgba(255,255,255,0.14)", color: coinLanded ? "var(--brand-ink)" : "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                {coinLanded ? "Cerrar" : "Saltar"}
              </button>
            )}
          </div>
        )}

        {/* ── Winner splash — flashes for 2s, then it lives as a chip in the bid row ── */}
        {(() => {
          if (!winnerSplash) return null;
          const lastWon = winnerSplash;
          const anyPanelOpen = showMaxBidOv || showControls || showBuyNow || showWallet || showTimerBox;
          if (chromeHidden || anyPanelOpen) return null;
          const w = lastWon.winner!;
          return (
            <div className="absolute inset-x-0 top-1/3 z-30 flex justify-center px-6 pointer-events-none">
              <div className="winner-splash flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: "rgba(15,15,20,0.94)", border: "1px solid var(--brand-light)", backdropFilter: "blur(10px)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
                {w.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" style={{ border: "2px solid var(--brand-light)" }} />
                ) : (
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
                    style={{ background: "linear-gradient(150deg,#3b3f52,#1a1d29)", border: "2px solid var(--brand-light)" }}>
                    {w.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--brand-light)" }}>🏆 Ganador</p>
                  <p className="text-base font-black text-white truncate leading-tight">{w.username}</p>
                  <p className="text-sm font-bold leading-tight" style={{ color: "var(--brand-light)" }}>
                    ${((lastWon.currentBid ?? 0) / 100).toLocaleString("es-MX")}
                    <span className="text-[11px] font-normal ml-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>{lastWon.cardName}</span>
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Seller info — top left (raised; live shown by the red ring, not a badge) */}
        <div className="absolute top-4 left-3 flex items-center gap-1.5 z-20"
          style={{ opacity: chromeHidden ? 0 : 1, visibility: chromeHidden ? "hidden" : "visible", transition: "opacity 0.45s ease, visibility 0.45s ease" }}>
          <Link href={`/tienda/${sellerName}`}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${isLive ? "live-ring" : ""}`}
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: isLive ? "1.5px solid #f43f5e" : "1px solid rgba(255,255,255,0.18)" }}>🧑</Link>
          <div className="px-1.5 py-0.5 rounded-lg" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}>
            <Link href={`/tienda/${sellerName}`} className="text-white text-[13px] font-bold leading-tight hover:underline">
              {sellerName} {verified && <span style={{ color: "var(--accent-text)" }}>✓</span>}
            </Link>
          </div>
          {/* Live viewer count. Only the seller can tap it — it opens the full
             spectator list to pick moderators and moderate. Everyone else just sees it. */}
          {isSeller ? (
            <button type="button" onClick={() => setShowModPanel(true)} aria-label="Ver espectadores y moderar"
              className="relative flex items-center gap-1 px-2 h-8 rounded-full shrink-0 active:scale-95 transition-transform"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.18)" }} title="Espectadores y moderación">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              <span className="text-white text-[12px] font-semibold tabular-nums">{viewerCount}</span>
              {pendingBans.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: "#dc2626", border: "1px solid #000" }}>{pendingBans.length}</span>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-1 px-2 h-8 rounded-full shrink-0" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.18)" }} title={`${viewerCount} viendo`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              <span className="text-white text-[12px] font-semibold tabular-nums">{viewerCount}</span>
            </div>
          )}
          {/* Favorite this seller */}
          {!isSeller && (
            <button type="button" onClick={toggleFavSeller} aria-label={favSeller ? "Quitar de favoritos" : "Agregar a favoritos"} aria-pressed={favSeller}
              className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.18)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill={favSeller ? "#f43f5e" : "none"} stroke={favSeller ? "#f43f5e" : "#fff"} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
            </button>
          )}
        </div>

        {/* Seller's scoreboard: takings, lots gone, time on air. Only he sees it —
            viewers get the raffle card in this same slot. */}
        {isSeller && isLive && !chromeHidden && (() => {
          const startedMs = liveStats?.startedAt ? new Date(liveStats.startedAt).getTime() : null;
          const onAirSec = startedMs ? Math.max(0, Math.floor((nowTick - startedMs) / 1000)) : null;
          const clock = onAirSec === null ? "—"
            : onAirSec >= 3600
              ? `${Math.floor(onAirSec / 3600)}:${String(Math.floor(onAirSec / 60) % 60).padStart(2, "0")}:${String(onAirSec % 60).padStart(2, "0")}`
              : `${Math.floor(onAirSec / 60)}:${String(onAirSec % 60).padStart(2, "0")}`;
          return (
            <div className="absolute top-14 left-3 z-[36] flex items-stretch rounded-xl overflow-hidden"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.16)" }}>
              {([
                ["Vendido", `$${((liveStats?.soldCents ?? 0) / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`, "var(--accent-text)"],
                ["Lotes", String(liveStats?.lotsSold ?? 0), "#fff"],
                ["En vivo", clock, "#fff"],
              ] as const).map(([label, value, color], i) => (
                <div key={label} className="px-2.5 py-1.5"
                  style={i > 0 ? { borderLeft: "1px solid rgba(255,255,255,0.14)" } : undefined}>
                  <p className="text-[9px] font-bold uppercase tracking-wider leading-none" style={{ color: "rgba(255,255,255,0.6)" }}>{label}</p>
                  <p className="text-[13px] font-black tabular-nums leading-tight mt-0.5" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Right-side icon stack (compact): buy-now, wallet, more (⋮), peek-arrow ── */}
        <div className="absolute top-4 right-3 z-30 flex flex-col items-end gap-1.5"
          style={{ opacity: chromeHidden ? 0 : 1, visibility: chromeHidden ? "hidden" : "visible", transition: "opacity 0.45s ease, visibility 0.45s ease" }}>

          {/* Row 1: peek arrow sits to the LEFT of the cart */}
          <div className="flex items-center gap-1.5">
            {/* Peek arrow — mobile only; on desktop the right panel lists other auctions */}
            <button type="button" onClick={() => setPeekOpen(v => !v)} aria-label={peekOpen ? "Ocultar otras subastas" : "Ver otras subastas"} aria-expanded={peekOpen}
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-full"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                style={{ transform: peekOpen ? "rotate(180deg)" : "none", transition: "transform 0.35s ease" }}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* Buy-now (compra ahora) — seller catalog of in-stock products */}
            <button type="button" onClick={openBuyNow} aria-label="Compra ahora"
              className="flex items-center justify-center w-9 h-9 rounded-full"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="21" r="1.4" /><circle cx="19" cy="21" r="1.4" />
                <path d="M2.5 3h2l2.2 12.4a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.5-1.2L21.5 7H6" />
              </svg>
            </button>
          </div>

          {/* Wallet */}
          <button type="button" onClick={openWallet} aria-label="Billetera"
            className="flex items-center justify-center w-9 h-9 rounded-full"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Z" />
              <circle cx="16.5" cy="13" r="1.3" fill="currentColor" stroke="none" />
            </svg>
          </button>

          {/* More (⋮) — opens a popup with mute + share */}
          <div className="relative" ref={moreMenuRef}>
            <button type="button" onClick={() => setShowMoreMenu(v => !v)} aria-label="Más opciones" aria-expanded={showMoreMenu}
              className="flex items-center justify-center w-9 h-9 rounded-full"
              style={{ background: showMoreMenu ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" />
              </svg>
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-2 flex flex-col gap-1 p-1.5 rounded-2xl z-40"
                style={{ background: "rgba(15,15,20,0.92)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.14)", minWidth: "10.5rem" }}>
                {!isSeller && (
                  <button type="button" onClick={() => { setViewerMuted(m => !m); setShowMoreMenu(false); }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white text-left hover:bg-white/10">
                    {viewerMuted ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>
                    )}
                    <span>{viewerMuted ? "Activar sonido" : "Silenciar"}</span>
                  </button>
                )}
                <button type="button" onClick={shareLive}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white text-left hover:bg-white/10">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /></svg>
                  <span>Compartir enlace</span>
                </button>
                <button type="button" onClick={enterPip}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white text-left hover:bg-white/10">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2" /><rect x="12" y="10" width="7" height="6" rx="1" fill="currentColor" stroke="none" /></svg>
                  <span>Picture in picture</span>
                </button>
                {isSeller && (
                  <button type="button" onClick={() => { setShowMoreMenu(false); setShowTimerBox(true); }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white text-left hover:bg-white/10">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9 2h6" />
                    </svg>
                    <span>Ajustar reloj</span>
                  </button>
                )}
                {user && (
                  <button type="button" onClick={() => { setShowMoreMenu(false); setShowReport(true); }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white text-left hover:bg-white/10">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                    </svg>
                    <span>Reportar incidencia</span>
                  </button>
                )}
                {isSeller && isLive && (
                  <button type="button" onClick={() => { setShowMoreMenu(false); setConfirmEndLive(true); }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left hover:bg-white/10"
                    style={{ color: "#f87171" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="4" y="4" width="16" height="16" rx="3" /><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
                    </svg>
                    <span>Terminar live</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Moderator tools — designated mods only; the seller enters via the eye */}
          {isMod && !isSeller && (
            <button type="button" onClick={() => setShowModPanel(true)} aria-label="Moderación"
              className="relative flex items-center justify-center w-9 h-9 rounded-full text-[10px] font-black"
              style={{ background: pendingBans.length ? "#f43f5e" : "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}>
              MOD
              {pendingBans.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: "#dc2626", border: "1px solid #000" }}>{pendingBans.length}</span>
              )}
            </button>
          )}

          {/* Seller-only: bidding format + live games (roulette) */}
          {isSeller && (
            <button type="button" onClick={() => { setShowControls(true); void loadCameras(); }} aria-label="Formato y juegos"
              className="flex items-center justify-center w-9 h-9 rounded-full"
              style={{ background: bidMode === "normal" ? "rgba(0,0,0,0.5)" : "var(--brand-light)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.2)", color: bidMode === "normal" ? "#fff" : "var(--brand-ink)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
              </svg>
            </button>
          )}

        </div>

        {/* Wallet popup — add a card, saved & synced with the main wallet */}
        {showWallet && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowWallet(false)}>
            <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)", maxHeight: "88vh" }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Billetera</p>
                <button onClick={() => setShowWallet(false)} aria-label="Cerrar" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base leading-none" style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>✕</button>
              </div>
              <div className="p-5 space-y-4">
                {walletLoading ? (
                  <div className="h-12 rounded-xl shimmer" />
                ) : cards.length > 0 && (
                  <div className="space-y-2">
                    {cards.map(c => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20" strokeLinecap="round"/></svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{(c.brand || "Tarjeta")} •••• {c.last4}</p>
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.expiry}{c.isDefault ? " · Predeterminada" : ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2.5">
                  <p className="text-[11px] font-medium uppercase" style={{ letterSpacing: "0.12em", color: "var(--text-muted)" }}>Agregar tarjeta</p>
                  <input inputMode="numeric" autoComplete="off" placeholder="Número de tarjeta" value={cardForm.number}
                    onChange={e => setCardForm(f => ({ ...f, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) }))}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  <div className="flex gap-2">
                    <input inputMode="numeric" placeholder="MM/YY" value={cardForm.expiry}
                      onChange={e => setCardForm(f => ({ ...f, expiry: e.target.value.replace(/[^\d/]/g, "").slice(0, 5) }))}
                      className="w-24 rounded-xl px-3.5 py-2.5 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    <input placeholder="Nombre (opcional)" value={cardForm.name}
                      onChange={e => setCardForm(f => ({ ...f, name: e.target.value }))}
                      className="flex-1 rounded-xl px-3.5 py-2.5 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  </div>
                  {walletError && <p className="text-xs" style={{ color: "var(--error-text)" }}>{walletError}</p>}
                  <button onClick={savePaymentCard} disabled={savingCard}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                    {savingCard ? "Guardando…" : "Guardar tarjeta"}
                  </button>
                  <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>Se guarda en tu billetera y se sincroniza con tus ajustes de pago. Solo se almacenan los últimos 4 dígitos.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm ending the live ── */}
        {confirmEndLive && isSeller && (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.68)" }} onClick={() => setConfirmEndLive(false)}>
            <div className="w-full max-w-[19rem] rounded-2xl p-5 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }} onClick={e => e.stopPropagation()}>
              <p className="text-3xl mb-1">🛑</p>
              <p className="font-black text-base" style={{ color: "var(--text-primary)" }}>¿Terminar el live?</p>
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                Se cierra la transmisión y ya no se podrá pujar. Los lotes vendidos se mantienen.
              </p>
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => setConfirmEndLive(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  Cancelar
                </button>
                <button type="button" onClick={endLive} disabled={endingLive}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "#dc2626" }}>
                  {endingLive ? "Terminando…" : "Sí, terminar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Timer box (seller): presets or a custom value rounded to tens ── */}
        {showTimerBox && isSeller && (
          <div className="fixed inset-0 z-[58] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowTimerBox(false)}>
            <div className="w-full sm:max-w-[20rem] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)", maxHeight: "88vh" }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>⏱ Timer subasta</p>
                <button onClick={() => setShowTimerBox(false)} aria-label="Cerrar" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base leading-none" style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>✕</button>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Con cuántos segundos empieza la cuenta regresiva.</p>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 20, 30, 60].map(s => ( // 60s is the cap — a lot never runs longer
                    <button key={s} type="button" disabled={savingTimer} onClick={() => applyTimer(s)}
                      className="py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      {s}s
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Personalizado (10–60 s, múltiplos de 10)</label>
                  <div className="flex gap-2">
                    <input inputMode="numeric" value={timerCustom} placeholder="ej. 90"
                      onChange={e => setTimerCustom(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                      onKeyDown={e => { if (e.key === "Enter" && timerCustom) applyTimer(Number(timerCustom)); }}
                      className="flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    <button type="button" disabled={savingTimer || !timerCustom} onClick={() => applyTimer(Number(timerCustom))}
                      className="px-4 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                      {savingTimer ? "…" : "Aplicar"}
                    </button>
                  </div>
                  {timerCustom && Number(timerCustom) > 0 && (
                    <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                      Se aplica <strong>{Math.min(60, Math.max(10, Math.round(Number(timerCustom) / 10) * 10))}s</strong>
                      {Number(timerCustom) > 60 && " (máximo 1 minuto)"}.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Seller controls: bidding format + live games ── */}
        {showControls && isSeller && (
          <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowControls(false)}>
            <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)", maxHeight: "85vh" }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Formato y juegos</p>
                <button onClick={() => setShowControls(false)} aria-label="Cerrar" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base leading-none" style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>✕</button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-4 pt-3 shrink-0">
                {([["subir", "🃏 Subastar"], ["ruleta", "🎲 Juegos"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setControlsTab(k)}
                    className="px-3 py-1.5 rounded-full text-[13px] font-semibold"
                    style={controlsTab === k
                      ? { background: "var(--brand-light)", color: "var(--brand-ink)" }
                      : { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-4 overflow-y-auto">
                {controlsTab === "subir" ? (
                  /* ── Put a card up for auction (the seller's upload area) ── */
                  <div className="space-y-2.5">
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      La carta entra a la cola y sale a subasta en cuanto termine la actual.
                    </p>
                    {addCardError && <p className="text-xs" style={{ color: "var(--error-text)" }}>{addCardError}</p>}

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "var(--text-muted)" }}>$</span>
                        <input inputMode="decimal" value={cardPrice} onChange={e => setCardPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Precio inicial"
                          className="w-full rounded-lg pl-6 pr-2 py-2.5 text-sm font-semibold" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                      </div>
                      <select value={cardDuration} onChange={e => setCardDuration(e.target.value)}
                        className="w-32 rounded-lg px-2 py-2.5 text-sm appearance-none"
                        style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }}>
                        {[["30","30 seg"],["60","1 min"],["120","2 min"],["300","5 min"],["600","10 min"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>

                    <button type="button" onClick={addCard} disabled={addingCard || !cardPrice}
                      className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                      {addingCard ? "Subiendo…" : "Poner en subasta"}
                    </button>

                    {/* Queue */}
                    {(a.items ?? []).filter(i => i.status === "pending").length > 0 && (
                      <div className="pt-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>En cola</p>
                        <div className="space-y-1.5">
                          {(a.items ?? []).filter(i => i.status === "pending").map((i, idx) => (
                            <div key={i.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                              <span className="text-[11px] font-bold w-4" style={{ color: "var(--text-muted)" }}>{idx + 1}</span>
                              <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>{i.cardName}</span>
                              <span className="text-xs font-bold" style={{ color: "var(--accent-text)" }}>${((i.startingBid ?? 0) / 100).toLocaleString("es-MX")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* ── Nombre del live (editable; los lotes siguen numerándose solos) ── */}
                    <div className="pt-3 mt-1 space-y-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Nombre del live</p>
                      <div className="flex gap-2">
                        <input
                          value={nameDraft}
                          onChange={e => setNameDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveLiveName(); }}
                          placeholder={a.title ?? "Nombre del live"}
                          maxLength={80}
                          className="flex-1 rounded-lg px-3 py-2 text-sm"
                          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }}
                        />
                        <button type="button" onClick={saveLiveName} disabled={savingName}
                          className="px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-60"
                          style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                          {savingName ? "…" : "Guardar"}
                        </button>
                      </div>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        Déjalo vacío para volver a <span style={{ color: "var(--text-secondary)" }}>{a.title}</span>.
                        El nombre de cada puja se asigna solo y no se puede cambiar.
                      </p>
                    </div>

                    {/* ── Sorteos por minutos vistos ── */}
                    <div className="pt-3 mt-1 space-y-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Sorteos</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        Cada minuto que alguien lleva viendo cuenta como una entrada. Puedes crear
                        varios por live, antes de abrirlo o en plena transmisión.
                      </p>

                      <input value={rafflePrize} onChange={e => setRafflePrize(e.target.value)}
                        placeholder="¿Qué se sortea?" maxLength={120}
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }} />

                      {/* Two inputs, not one: `capture` opens the camera straight away,
                          and its absence lets the OS offer the photo library. */}
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                        onChange={pickRafflePhoto} className="hidden" />
                      <input ref={libraryInputRef} type="file" accept="image/*"
                        onChange={pickRafflePhoto} className="hidden" />

                      {rafflePhoto ? (
                        <div className="flex items-center gap-2.5 rounded-lg p-2"
                          style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fileUrl(rafflePhoto)} alt="Premio del sorteo"
                            className="w-14 h-14 rounded-lg object-cover shrink-0" style={{ border: "1px solid var(--border)" }} />
                          <p className="text-[11px] flex-1" style={{ color: "var(--text-muted)" }}>
                            Se muestra a quienes están viendo el live.
                          </p>
                          <button type="button" onClick={() => setRafflePhoto(null)}
                            className="shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
                            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--error-text)" }}>
                            Quitar
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={rafflePhotoBusy}
                            className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                            {rafflePhotoBusy ? "Subiendo…" : "📷 Tomar foto"}
                          </button>
                          <button type="button" onClick={() => libraryInputRef.current?.click()} disabled={rafflePhotoBusy}
                            className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                            {rafflePhotoBusy ? "Subiendo…" : "🖼️ Biblioteca"}
                          </button>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <select value={raffleListing} onChange={e => setRaffleListing(e.target.value)}
                          className="flex-1 rounded-lg px-2 py-2 text-sm min-w-0"
                          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }}>
                          <option value="">— Solo anuncio, sin premio —</option>
                          {buyNowItems.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                        </select>
                        <div className="w-24 shrink-0">
                          <input inputMode="numeric" value={raffleMin}
                            onChange={e => setRaffleMin(e.target.value.replace(/[^\d]/g, ""))}
                            className="w-full rounded-lg px-2 py-2 text-sm"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }} />
                          <p className="text-[10px] mt-0.5 text-center" style={{ color: "var(--text-muted)" }}>min. mínimos</p>
                        </div>
                      </div>

                      <button type="button" onClick={createRaffle} disabled={raffleBusy || !rafflePrize.trim()}
                        className="w-full py-2.5 rounded-xl text-sm font-black disabled:opacity-50"
                        style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                        {raffleBusy ? "…" : "Crear sorteo"}
                      </button>

                      {raffles.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {raffles.filter(r => r.status !== "cancelled").map(r => (
                            <div key={r.id} className="rounded-lg px-2.5 py-2 flex items-center gap-2"
                              style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                              {r.prizeImageUrl && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={fileUrl(r.prizeImageUrl)} alt="" className="w-9 h-9 rounded object-cover shrink-0"
                                  style={{ border: "1px solid var(--border)" }} />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.prizeTitle}</p>
                                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                  {r.status === "drawn"
                                    ? `Ganó @${r.winnerUsername} · ${r.winnerEntries}/${r.totalEntries} entradas`
                                    : `Mínimo ${r.minMinutes} min de vista`}
                                </p>
                              </div>
                              {r.status === "pending" && (
                                <button type="button" onClick={() => drawRaffle(r.id)} disabled={raffleBusy}
                                  className="shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                                  style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                                  Sortear
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Segunda cámara: la cara del vendedor sobre el video de las cartas ── */}
                    <div className="pt-3 mt-1 space-y-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Segunda cámara</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        La cámara principal enfoca las cartas; ésta muestra tu cara encima.
                      </p>

                      {cameras.length > 1 && (
                        <select
                          value={selfieDeviceId}
                          onChange={e => setSelfieDeviceId(e.target.value)}
                          disabled={selfieOn}
                          className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }}
                        >
                          {cameras.map((c, i) => (
                            <option key={c.deviceId || i} value={c.deviceId}>
                              {c.label || `Cámara ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      )}

                      <button type="button" onClick={toggleSelfie} disabled={selfieBusy}
                        className="w-full py-2.5 rounded-xl text-sm font-black disabled:opacity-60"
                        style={selfieOn
                          ? { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }
                          : { background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                        {selfieBusy ? "…" : selfieOn ? "Apagar segunda cámara" : "Encender segunda cámara"}
                      </button>

                      {/* Where it sits. Disabled until there's something to place. */}
                      <div className="flex gap-2">
                        {([["round", "⬤ Círculo (cara)"], ["corner", "▭ Esquina 25%"]] as const).map(([mode, label]) => (
                          <button key={mode} type="button" disabled={!selfieOn}
                            onClick={() => changeSelfieLayout(mode)}
                            className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
                            style={selfieLayout === mode
                              ? { background: "rgba(168,85,247,0.14)", border: "1.5px solid var(--brand-light)", color: "var(--accent-text)" }
                              : { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Formato de la subasta (fusionado; antes era una pestaña aparte) ── */}
                    <div className="pt-3 mt-1 space-y-2.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Formato de la subasta</p>
                    {([
                      { key: "normal",       icon: "🔨", title: "Subasta normal",   desc: "El reloj se extiende si alguien puja en los últimos segundos." },
                      { key: "sudden_death", icon: "⚡", title: "Muerte súbita",     desc: "Las pujas suben el precio pero el reloj NO se reinicia: corre fijo hasta cero." },
                      { key: "dutch",        icon: "📉", title: "Subasta holandesa", desc: "El precio baja solo, parejo, hasta el piso al terminar el tiempo. El primero que acepta se la lleva." },
                    ] as const).map(m => (
                      <button key={m.key} type="button" disabled={savingMode} onClick={() => changeMode(m.key)}
                        className="w-full text-left rounded-xl p-3 disabled:opacity-60"
                        style={bidMode === m.key
                          ? { background: "color-mix(in srgb, var(--brand) 12%, transparent)", border: "1.5px solid var(--brand-light)" }
                          : { background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{m.icon}</span>
                          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{m.title}</span>
                          {bidMode === m.key && <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>ACTIVO</span>}
                        </div>
                        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{m.desc}</p>
                      </button>
                    ))}

                    {/* Dutch settings — only the floor. The drop rate is derived: the price
                        falls evenly from the lot's starting price to this floor over the lot timer. */}
                    <div className="rounded-xl p-3 mt-1" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Ajustes de la holandesa</p>
                      <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
                        El precio baja solo, parejo, desde el precio inicial hasta el piso, y llega al piso justo cuando termina el tiempo del lote.
                      </p>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>Piso $ (precio mínimo)</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "var(--text-muted)" }}>$</span>
                          <input inputMode="numeric" value={dutchFloor}
                            onChange={e => setDutchFloor(e.target.value.replace(/[^\d.]/g, ""))}
                            placeholder="0"
                            className="w-full rounded-lg pl-6 pr-2 py-2 text-sm font-semibold"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                        </div>
                      </div>
                      {bidMode === "dutch" && (
                        <button type="button" onClick={() => changeMode("dutch")} disabled={savingMode}
                          className="w-full mt-2.5 py-2 rounded-lg text-xs font-bold disabled:opacity-50" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                          {savingMode ? "…" : "Aplicar y reiniciar el descenso"}
                        </button>
                      )}
                    </div>
                    </div>
                  </div>
                ) : (
                  /* ── Games of chance: same participants and same prize, three ways to draw ── */
                  <div className="space-y-3">
                    <div className="flex gap-1.5">
                      {([
                        ["ruleta", "🎡", "Ruleta"],
                        ["dados",  "🎲", "Dados"],
                        ["volado", "🪙", "Volado"],
                      ] as const).map(([k, icon, label]) => (
                        <button key={k} type="button" onClick={() => setGameKind(k)}
                          className="flex-1 py-2 rounded-lg text-xs font-bold"
                          style={gameKind === k
                            ? { background: "rgba(168,85,247,0.16)", border: "1.5px solid var(--brand-light)", color: "var(--accent-text)" }
                            : { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                          <span className="mr-1" aria-hidden="true">{icon}</span>{label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {gameKind === "ruleta" ? "La rueda gira con todos los participantes y cae en uno."
                        : gameKind === "dados" ? "Cada participante tira dos dados; gana el total más alto. Si empatan, sólo ellos vuelven a tirar."
                        : "Cara o cruz entre dos personas. Sin nombres es simplemente un volado al aire."}
                    </p>

                    {gameKind === "ruleta" && (
                      <div className="flex gap-1.5">
                        {([[false, "👥 Participantes"], [true, "🎁 Break"]] as const).map(([v, label]) => (
                          <button key={label} type="button" onClick={() => setBreakMode(v)}
                            className="flex-1 py-1.5 rounded-lg text-[11px] font-bold"
                            style={breakMode === v
                              ? { background: "rgba(168,85,247,0.16)", border: "1.5px solid var(--brand-light)", color: "var(--accent-text)" }
                              : { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {gameKind === "ruleta" && breakMode ? (
                      <div className="space-y-2">
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          Pon aquí lo que vas a repartir — personajes, energías, sobres. Cada giro
                          saca uno <span style={{ color: "var(--text-secondary)" }}>y lo quita de la rueda</span>,
                          así repartes la lista completa sin repetir.
                        </p>

                        <div className="flex gap-2">
                          <button type="button"
                            onClick={() => setBreakItems(p => [...new Set([...p, ...ENERGIAS])])}
                            className="flex-1 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                            ⚡ Energías
                          </button>
                          <button type="button" onClick={() => { setBreakItems([]); setBreakDrawn([]); }}
                            className="px-3 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                            Limpiar
                          </button>
                        </div>

                        <div className="flex gap-2">
                          <input value={breakManual} onChange={e => setBreakManual(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && breakManual.trim()) { setBreakItems(p => [...new Set([...p, breakManual.trim()])]); setBreakManual(""); } }}
                            placeholder="Charizard, Sobre 3, Fuego…" maxLength={24}
                            className="flex-1 rounded-lg px-3 py-2 text-sm"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }} />
                          <button type="button" onClick={() => { if (breakManual.trim()) { setBreakItems(p => [...new Set([...p, breakManual.trim()])]); setBreakManual(""); } }}
                            className="px-3 py-2 rounded-lg text-sm font-bold" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>+</button>
                        </div>

                        {breakItems.length > 0 && (
                          <>
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                                Quedan {breakRemaining.length} de {breakItems.length}
                              </p>
                              {breakDrawn.length > 0 && (
                                <button type="button" onClick={() => setBreakDrawn([])}
                                  className="text-[11px] font-bold px-2 py-1 rounded-lg"
                                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                                  Devolver todo
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {breakItems.map(it => {
                                const drawn = breakDrawn.find(d => d.item === it);
                                return (
                                  <span key={it} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                                    style={drawn
                                      ? { background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", textDecoration: "line-through" }
                                      : { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                                    {it}{drawn?.to && <span style={{ color: "var(--accent-text)", textDecoration: "none" }}> → @{drawn.to}</span>}
                                    <button type="button" onClick={() => { setBreakItems(p => p.filter(x => x !== it)); setBreakDrawn(p => p.filter(d => d.item !== it)); }}
                                      aria-label={`Quitar ${it}`} className="opacity-60 hover:opacity-100">✕</button>
                                  </span>
                                );
                              })}
                            </div>
                          </>
                        )}

                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
                            Este giro es para (opcional)
                          </label>
                          <input list="break-participantes" value={breakAssignTo} onChange={e => setBreakAssignTo(e.target.value)}
                            placeholder="Usuario que se lo lleva" maxLength={30}
                            className="w-full rounded-lg px-3 py-2 text-sm"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }} />
                          <datalist id="break-participantes">
                            {participants.map(pn => <option key={pn} value={pn} />)}
                          </datalist>
                          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                            Si lo llenas queda anotado junto a lo que salga, y le avisamos.
                          </p>
                        </div>
                      </div>
                    ) : gameKind === "volado" ? (
                      <div className="space-y-2">
                        {([["🦅 Águila", coinHeads, setCoinHeads], ["☀️ Sol", coinTails, setCoinTails]] as const).map(([label, val, set]) => (
                          <div key={label}>
                            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
                            <input list="volado-participantes" value={val} onChange={e => set(e.target.value)}
                              placeholder="Nombre (opcional)" maxLength={30}
                              className="w-full rounded-lg px-3 py-2 text-sm"
                              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }} />
                          </div>
                        ))}
                        <datalist id="volado-participantes">
                          {participants.map(pn => <option key={pn} value={pn} />)}
                        </datalist>
                      </div>
                    ) : (
                    <>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setRouletteNames(participants)}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        Todos los del live ({participants.length})
                      </button>
                      <button type="button" onClick={() => setRouletteNames([])}
                        className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        Limpiar
                      </button>
                    </div>

                    {/* Manual add */}
                    <div className="flex gap-2">
                      <input value={rouletteManual} onChange={e => setRouletteManual(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && rouletteManual.trim()) { setRouletteNames(p => [...new Set([...p, rouletteManual.trim()])]); setRouletteManual(""); } }}
                        placeholder="Agregar participante…" maxLength={30}
                        className="flex-1 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                      <button type="button" onClick={() => { if (rouletteManual.trim()) { setRouletteNames(p => [...new Set([...p, rouletteManual.trim()])]); setRouletteManual(""); } }}
                        className="px-3 py-2 rounded-lg text-sm font-bold" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>+</button>
                    </div>

                    {/* Participant chips */}
                    <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
                      {(rouletteNames.length ? rouletteNames : participants).length === 0 ? (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nadie en el live todavía. Agrega participantes a mano para probar.</p>
                      ) : (rouletteNames.length ? rouletteNames : participants).map(n => (
                        <span key={n} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={spinHighlight === n
                            ? { background: "var(--brand-light)", color: "var(--brand-ink)" }
                            : { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                          {n}
                          <button type="button" onClick={() => setRouletteNames(p => (p.length ? p : participants).filter(x => x !== n))} aria-label={`Quitar ${n}`} className="opacity-60 hover:opacity-100">✕</button>
                        </span>
                      ))}
                    </div>

                    </>
                    )}

                    {/* Prize product — a break hands out the list itself, not a catalogue item */}
                    <div style={{ display: gameKind === "ruleta" && breakMode ? "none" : undefined }}>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Producto en juego (opcional)</label>
                      <select value={roulettePrize} onChange={e => setRoulettePrize(e.target.value)}
                        className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                        <option value="">— Sin producto —</option>
                        {buyNowItems.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                      </select>
                      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Se toman de tu catálogo de Compra ahora, donde puedes agregar y quitar productos.</p>
                    </div>

                    <button type="button"
                      onClick={gameKind === "ruleta" ? spinRoulette : gameKind === "dados" ? rollDice : flipCoin}
                      disabled={spinning || (gameKind === "ruleta" && breakMode && breakRemaining.length === 0)}
                      className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-60" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                      {spinning ? "Va…"
                        : gameKind === "dados" ? "🎲 Tirar los dados"
                        : gameKind === "volado" ? "🪙 Lanzar el volado"
                        : breakMode
                          ? (breakRemaining.length === 0 ? "Ya se repartió todo" : `🎁 Sacar uno (${breakRemaining.length})`)
                          : "🎡 Girar la ruleta"}
                    </button>

                    {rouletteWinner && (
                      <div className="rounded-xl p-3 text-center" style={{ background: "color-mix(in srgb, var(--brand) 12%, transparent)", border: "1px solid var(--brand-light)" }}>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Ganador</p>
                        <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>🎉 {rouletteWinner.name}</p>
                        {rouletteWinner.prize && <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{rouletteWinner.prize}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Roulette result — shown to everyone watching. `spinning` is shared by all three
            games now, so this legacy box has to stay out of the dice and coin overlays. */}
        {(spinning || rouletteWinner) && !showControls && !diceShow && !coinShow && (
          <div className="absolute inset-x-0 top-1/4 z-40 flex justify-center pointer-events-none px-6">
            <div className="rounded-2xl px-6 py-4 text-center" style={{ background: "rgba(15,15,20,0.94)", border: "1px solid var(--brand-light)", backdropFilter: "blur(10px)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--brand-light)" }}>🎡 Ruleta</p>
              {spinning ? (
                <p className="text-2xl font-black text-white mt-1.5 tabular-nums">{spinHighlight ?? "…"}</p>
              ) : (
                <>
                  <p className="text-2xl font-black text-white mt-1.5">🎉 {rouletteWinner?.name}</p>
                  {rouletteWinner?.prize && <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>gana: {rouletteWinner.prize}</p>}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Moderation panel ── */}
        {showModPanel && isMod && (() => {
          const bannedIds = new Set(sanctions.filter(s => s.kind === "ban").map(s => s.targetUserId));
          const mutedIds = new Set(sanctions.filter(s => s.kind === "mute").map(s => s.targetUserId));
          return (
            <div className="fixed inset-0 z-[56] flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowModPanel(false)}>
              <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)", maxHeight: "85vh" }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{isSeller ? "Espectadores y moderación" : "Moderación"}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{isSeller ? `${viewerCount} en el live · elige mods y modera` : "Eres moderador"}</p>
                  </div>
                  <button onClick={() => setShowModPanel(false)} aria-label="Cerrar" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base leading-none" style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>✕</button>
                </div>

                <div className="p-4 overflow-y-auto space-y-4">
                  {/* Pin a message */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>📌 Fijar mensaje (10 s)</p>
                    <div className="flex gap-2">
                      <input value={pinDraft} onChange={e => setPinDraft(e.target.value)} maxLength={140} placeholder="Ej. ¡Envío gratis en pujas de hoy!"
                        onKeyDown={e => { if (e.key === "Enter" && pinDraft.trim()) { pinMessage(pinDraft.trim(), user?.username || "Mod"); broadcast({ type: "pin", text: pinDraft.trim(), by: user?.username || "Mod" }); setPinDraft(""); } }}
                        className="flex-1 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                      <button type="button" disabled={!pinDraft.trim()} onClick={() => { pinMessage(pinDraft.trim(), user?.username || "Mod"); broadcast({ type: "pin", text: pinDraft.trim(), by: user?.username || "Mod" }); setPinDraft(""); }}
                        className="px-3 rounded-lg text-sm font-bold disabled:opacity-40" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>Fijar</button>
                    </div>
                  </div>

                  {/* Participants */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>En el live ({participantList.length})</p>
                    {participantList.length === 0 ? (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nadie más conectado ahora.</p>
                    ) : (
                      <div className="space-y-2">
                        {participantList.map(p => {
                          const isP_mod = moderatorIds.includes(p.id);
                          const isP_muted = mutedIds.has(p.id);
                          const isP_banned = bannedIds.has(p.id);
                          return (
                            <div key={p.id} className="rounded-xl p-2.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                                  {p.name}{isP_mod && <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>MOD</span>}
                                </span>
                                {isSeller && (
                                  <button type="button" onClick={() => toggleModerator(p.id, !isP_mod)}
                                    className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                                    {isP_mod ? "Quitar mod" : "Hacer mod"}
                                  </button>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {isP_muted ? (
                                  <button type="button" onClick={() => { const s = sanctions.find(x => x.kind === "mute" && x.targetUserId === p.id); if (s) liftSanction(s.id); }}
                                    className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>🔊 Reactivar</button>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => sanctionUser(p.id, p.name, "mute", 1)} className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>🔇 1 h</button>
                                    <button type="button" onClick={() => sanctionUser(p.id, p.name, "mute", 24)} className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>🔇 24 h</button>
                                  </>
                                )}
                                {isP_banned ? (
                                  <button type="button" onClick={() => { const s = sanctions.find(x => x.kind === "ban" && x.targetUserId === p.id); if (s) liftSanction(s.id); }}
                                    className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>Quitar ban</button>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => sanctionUser(p.id, p.name, "ban", 24)} className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "rgba(244,63,94,0.12)", color: "#f87171" }}>🚫 24 h</button>
                                    <button type="button" onClick={() => sanctionUser(p.id, p.name, "ban")} className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "rgba(244,63,94,0.12)", color: "#f87171" }}>🚫 Permanente</button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Active sanctions */}
                  {sanctions.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Sanciones activas</p>
                      <div className="space-y-1.5">
                        {sanctions.map(s => (
                          <div key={s.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                            <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                              {s.kind === "mute" ? "🔇" : "🚫"} {s.targetUsername} · {s.expiresAt ? "temporal" : "permanente"}
                            </span>
                            <button type="button" onClick={() => liftSanction(s.id)} className="text-[11px] font-semibold" style={{ color: "var(--accent-text)" }}>Quitar</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Buy-now (compra ahora) — vertical catalog; seller manages up to 25 items ── */}
        {showBuyNow && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowBuyNow(false)}>
            <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)", maxHeight: "85vh" }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div>
                  <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Compra ahora</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {isSeller ? `${buyNowItems.length}/${MAX_LISTINGS} artículos · precio fijo` : `Productos de ${sellerName} · precio fijo`}
                  </p>
                </div>
                <button onClick={() => setShowBuyNow(false)} aria-label="Cerrar" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base leading-none" style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>✕</button>
              </div>

              {/* Seller: add / edit form */}
              {isSeller && (
                <div className="px-4 py-3 shrink-0 space-y-2" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{editingListingId ? "Editar artículo" : "Agregar artículo"}</p>
                  <input value={listingForm.title} onChange={e => setListingForm(f => ({ ...f, title: e.target.value }))} placeholder="Título del producto" maxLength={80}
                    className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  <textarea value={listingForm.description} onChange={e => setListingForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción (opcional)" rows={2} maxLength={300}
                    className="w-full rounded-lg px-3 py-2 text-sm resize-none" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "var(--text-muted)" }}>$</span>
                      <input inputMode="decimal" value={listingForm.price} onChange={e => setListingForm(f => ({ ...f, price: e.target.value.replace(/[^\d.]/g, "") }))} placeholder="Precio"
                        className="w-full rounded-lg pl-6 pr-2 py-2 text-sm font-semibold" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    </div>
                    <div className="relative w-28">
                      <input inputMode="numeric" value={listingForm.discountPercent} onChange={e => setListingForm(f => ({ ...f, discountPercent: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))} placeholder="Descuento"
                        className="w-full rounded-lg pl-3 pr-6 py-2 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "var(--text-muted)" }}>%</span>
                    </div>
                  </div>
                  {/* Photo — OS camera capture; the live stream keeps running */}
                  <div className="flex items-center gap-2">
                    <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={onPhotoPicked} className="hidden" />
                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                      </svg>
                      {photoUploading ? "Subiendo…" : listingForm.imageUrl ? "Volver a tomar" : "Tomar foto"}
                    </button>
                    {listingForm.imageUrl && (
                      <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={listingForm.imageUrl} alt="Foto del artículo" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setListingForm(f => ({ ...f, imageUrl: "" }))} aria-label="Quitar foto"
                          className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-[10px] text-white" style={{ background: "rgba(0,0,0,0.7)" }}>✕</button>
                      </div>
                    )}
                  </div>
                  {listingErr && <p className="text-xs" style={{ color: "var(--error-text)" }}>{listingErr}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={submitListing} disabled={savingListing || (!editingListingId && buyNowItems.length >= MAX_LISTINGS)}
                      className="flex-1 py-2 rounded-lg text-sm font-bold disabled:opacity-50" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                      {savingListing ? "Guardando…" : editingListingId ? "Guardar cambios" : "+ Agregar artículo"}
                    </button>
                    {editingListingId && (
                      <button type="button" onClick={cancelEditListing} className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Cancelar</button>
                    )}
                  </div>
                  {!editingListingId && buyNowItems.length >= MAX_LISTINGS && (
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Alcanzaste el máximo de {MAX_LISTINGS} artículos. Elimina alguno para agregar más.</p>
                  )}
                </div>
              )}

              {/* Vertical list */}
              <div className="p-3 overflow-y-auto flex flex-col gap-2.5">
                {!buyNowLoaded ? (
                  [0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl shimmer" />)
                ) : buyNowItems.length === 0 ? (
                  <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>{isSeller ? "Aún no tienes artículos de compra directa. Agrega el primero arriba." : "Este vendedor no tiene productos de compra directa por ahora."}</p>
                ) : (
                  buyNowItems.map(l => {
                    const disc = l.discountPercent ?? 0;
                    const finalPrice = discountedPrice(l);
                    return (
                      <div key={l.id} className="flex gap-3 rounded-xl p-2.5" style={{ background: "var(--bg-input)", border: `1px solid ${l.promoted ? "var(--brand-light)" : "var(--border)"}` }}>
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0" style={{ background: "linear-gradient(160deg,#1e293b,#0f172a)" }}>
                          {l.imageUrls && l.imageUrls[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.imageUrls[0]} alt={l.title} className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-2xl opacity-70">🃏</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{l.title}</p>
                            {l.promoted && <span className="text-[9px] font-black px-1.5 py-[1px] rounded-full shrink-0" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>📣</span>}
                          </div>
                          {l.description && <p className="text-[11px] line-clamp-2 mt-0.5" style={{ color: "var(--text-muted)" }}>{l.description}</p>}
                          <div className="flex items-center gap-1.5 mt-auto pt-1">
                            {disc > 0 && <span className="text-[11px] line-through" style={{ color: "var(--text-muted)" }}>${(l.price / 100).toLocaleString("es-MX")}</span>}
                            <span className="text-sm font-black" style={{ color: "var(--accent-text)" }}>${(finalPrice / 100).toLocaleString("es-MX")}</span>
                            {disc > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full" style={{ background: "rgba(244,63,94,0.15)", color: "#f43f5e" }}>-{disc}%</span>}
                          </div>
                        </div>
                        <div className="flex flex-col justify-center gap-1.5 shrink-0">
                          {isSeller ? (
                            <>
                              <button type="button" onClick={() => togglePromote(l)} aria-label={l.promoted ? "Quitar promoción" : "Promocionar"}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: l.promoted ? "var(--brand-light)" : "var(--bg-elevated)", border: "1px solid var(--border)" }}>📣</button>
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => editListing(l)} aria-label="Editar" className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                </button>
                                <button type="button" onClick={() => deleteListing(l.id)} aria-label="Eliminar" className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--error-text)" }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                                </button>
                              </div>
                            </>
                          ) : (
                            <button type="button" onClick={() => buyListing(l.id)} disabled={buyingId === l.id}
                              className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50 self-center" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                              {buyingId === l.id ? "…" : "Comprar"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Toast (share / buy feedback) */}
        {toast && (
          <div className="absolute left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-full text-sm font-semibold text-white pointer-events-none"
            style={{ bottom: "6.5rem", background: "rgba(20,20,26,0.94)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(8px)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
            {toast}
          </div>
        )}

        {/* Report sheet. Pressing send marks this instant in the live's own recording,
            so support reviews the real minute instead of a description of it. */}
        {showReport && (
          <div className="fixed inset-0 z-[72] flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ background: "rgba(0,0,0,0.65)" }} onClick={() => setShowReport(false)}>
            <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Reportar incidencia</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Se marca el minuto anterior de la transmisión para que soporte lo revise.
                  </p>
                </div>
                <button onClick={() => setShowReport(false)} aria-label="Cerrar"
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base leading-none"
                  style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>✕</button>
              </div>
              <div className="p-5 space-y-3">
                <textarea
                  value={reportText}
                  onChange={e => setReportText(e.target.value)}
                  placeholder="¿Qué pasó? Cuéntanos lo que viste."
                  rows={4}
                  maxLength={2000}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }}
                />
                <button type="button" onClick={sendReport} disabled={reporting || !reportText.trim()}
                  className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
                  style={{ background: "var(--error-text)", color: "#fff" }}>
                  {reporting ? "Enviando…" : "Enviar a soporte"}
                </button>
                <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
                  Un administrador lo revisa y te avisa qué pasó.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Share sheet. The link carries the sharer's code, so friends who arrive
            through it raise their odds in whatever raffle is running. */}
        {showShare && (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowShare(false)}>
            <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Compartir el live</p>
                  {user && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Tu enlace lleva tu código: cada amigo que entre y se quede duplica tus entradas.
                    </p>
                  )}
                </div>
                <button onClick={() => setShowShare(false)} aria-label="Cerrar"
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base leading-none"
                  style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>✕</button>
              </div>
              <div className="p-4 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => shareTo("whatsapp")}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl transition-transform active:scale-95"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                  <span style={{ color: "#25D366" }}><WhatsAppIcon /></span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>WhatsApp</span>
                </button>

                <button type="button" onClick={() => shareTo("instagram")}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl transition-transform active:scale-95"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                  <InstagramIcon />
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Instagram</span>
                </button>

                {/* The system's own share glyph on a phone, a link icon on desktop —
                    each labelled for what it actually does there. */}
                <button type="button" onClick={() => shareTo(sharePlatform === "other" ? "copy" : "native")}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl transition-transform active:scale-95"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--brand)" }}>
                    {sharePlatform === "other" ? <LinkIcon /> : <NativeShareIcon />}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                    {sharePlatform === "other" ? "Copiar" : "Compartir"}
                  </span>
                </button>
              </div>
              {friendBoost.connectedFriends > 0 && (
                <p className="px-5 pb-4 text-xs" style={{ color: "var(--accent-text)" }}>
                  {friendBoost.connectedFriends} {friendBoost.connectedFriends === 1 ? "amigo conectado" : "amigos conectados"} · tus entradas van ×{friendBoost.multiplier}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Raffle status for the viewer: what's up for grabs and what they've earned.
            Only while a raffle is actually open — otherwise it's noise over the video. */}
        {!isSeller && user && raffles.some(r => r.status === "pending") && !chromeHidden && (
          <div className="absolute top-14 left-3 z-[36] rounded-xl px-3 py-2 max-w-[62%]"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.16)" }}>
            {raffles.filter(r => r.status === "pending").slice(0, 1).map(r => (
              <div key={r.id}>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--accent-text)" }}>🎁 Sorteo</p>
                <div className="flex items-start gap-2">
                  {r.prizeImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={fileUrl(r.prizeImageUrl)} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 mt-0.5"
                      style={{ border: "1px solid rgba(255,255,255,0.22)" }} />
                  )}
                  <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white leading-tight truncate">{r.prizeTitle}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>
                  {myMinutes >= r.minMinutes
                    ? `Llevas ${myMinutes} min · ${myEntries} ${myEntries === 1 ? "entrada" : "entradas"}`
                    : `Necesitas ${r.minMinutes} min viendo · llevas ${myMinutes}`}
                </p>
                {friendBoost.multiplier > 1 && (
                  <p className="text-[11px] font-semibold" style={{ color: "var(--accent-text)" }}>
                    ×{friendBoost.multiplier} por {friendBoost.connectedFriends} {friendBoost.connectedFriends === 1 ? "amigo" : "amigos"} en el live
                  </p>
                )}
                  </div>
                </div>
                <button type="button" onClick={() => setShowShare(true)}
                  className="mt-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                  Invitar amigos
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Live chat overlay (bottom, blurred gradient for legibility) ── */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 42%, rgba(0,0,0,0) 100%)", paddingTop: 72, opacity: chromeHidden ? 0 : 1, visibility: chromeHidden ? "hidden" : "visible", transform: chromeHidden ? "translateY(8px)" : "none", transition: "opacity 0.45s ease, transform 0.45s ease, visibility 0.45s ease" }}>
          {isLive && !roomConnected && roomRef.current && (
            <p className="text-xs text-amber-300 text-center mb-1 animate-pulse">Reconectando…</p>
          )}
          {/* Chat: username on top, the message text below it. Capped to ~8 lines
             (name + text). Scroll up/down inside the box for history; top edge fades. */}
          <div ref={chatBoxRef} className="overflow-y-auto overscroll-contain flex flex-col gap-1 pl-4 mb-2 pointer-events-auto"
            style={{ maxHeight: "9rem", paddingRight: "1rem", scrollbarWidth: "none", touchAction: "pan-y", WebkitOverflowScrolling: "touch", WebkitMaskImage: "linear-gradient(to top, black 84%, transparent 100%)", maskImage: "linear-gradient(to top, black 84%, transparent 100%)" }}>
            {chatMessages.slice(-50).map((m, i) => (
              m.join ? (
                <p key={i} className="text-[13px] leading-snug shrink-0" style={{ color: "rgba(255,255,255,0.72)", textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}>
                  <span className="font-semibold text-white">@{m.username}</span> se ha unido 👋
                </p>
              ) : (
                <div key={i} className="shrink-0" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}>
                  <p className="text-[12px] font-bold leading-tight" style={{ color: m.username === user?.username ? "var(--brand-light)" : "#93c5fd" }}>{m.username}</p>
                  <p className="text-sm text-white break-words leading-snug">{m.text}</p>
                </div>
              )
            ))}
          </div>

          {/* Promoted product banner — sits between the chat box and the input so it
             stays put while the chat scrolls. Edge-to-edge, dismissible, non-invasive. */}
          {(() => {
            const promo = buyNowItems.find(l => l.promoted && !dismissedPromos.has(l.id));
            // The seller already knows what they promoted — flash it for 2s, then hide.
            if (!promo || (isSeller && !sellerPromoVisible)) return null;
            const pf = discountedPrice(promo);
            const pd = promo.discountPercent ?? 0;
            return (
              <div className="slide-in mb-2 pointer-events-auto flex items-center gap-2.5 px-3 py-2"
                style={{ background: "linear-gradient(90deg, rgba(20,20,26,0.96), rgba(30,26,10,0.96))", borderTop: "1px solid color-mix(in srgb, var(--brand) 50%, transparent)", borderBottom: "1px solid color-mix(in srgb, var(--brand) 50%, transparent)" }}>
                <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: "linear-gradient(160deg,#1e293b,#0f172a)" }}>
                  {promo.imageUrls && promo.imageUrls[0]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={promo.imageUrls[0]} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 flex items-center justify-center text-lg">🃏</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-wide leading-none" style={{ color: "var(--brand-light)" }}>📣 Promocionado · Compra ahora</p>
                  <p className="text-[13px] font-semibold text-white truncate leading-tight mt-0.5">{promo.title}</p>
                </div>
                <div className="text-right shrink-0">
                  {pd > 0 && <p className="text-[10px] line-through leading-none" style={{ color: "rgba(255,255,255,0.5)" }}>${(promo.price / 100).toLocaleString("es-MX")}</p>}
                  <p className="text-sm font-black leading-none mt-0.5" style={{ color: "var(--brand-light)" }}>${(pf / 100).toLocaleString("es-MX")}</p>
                </div>
                <button type="button" onClick={openBuyNow} className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>Ver</button>
                <button type="button" onClick={() => setDismissedPromos(prev => new Set(prev).add(promo.id))} aria-label="Cerrar anuncio"
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs" style={{ background: "rgba(255,255,255,0.14)" }}>✕</button>
              </div>
            );
          })()}

          <div className="flex gap-2 px-4 pb-2.5 pointer-events-auto items-center">
            {/* Enter sends — no send button, to keep the screen clear */}
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) sendChat(); }}
              enterKeyHint="send"
              placeholder={!user ? "Inicia sesión para chatear" : myMute ? "🔇 Estás silenciado" : !roomRef.current ? "Conéctate para chatear" : "Di algo…"}
              disabled={!user || !roomRef.current || !!myMute}
              maxLength={200}
              className="flex-1 rounded-full px-4 py-2.5 text-sm text-white disabled:opacity-50 placeholder:text-white/50"
              style={{ background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.22)", backdropFilter: "blur(10px)" }} />

            {/* Emoji reaction — tap = default, hold = picker; reactions float up above it */}
            <div className="relative shrink-0" ref={emojiWrapRef}>
              {/* floating reactions rise from just above the button */}
              <div className="absolute bottom-full right-0 w-10 pointer-events-none">
                {reactions.map(r => (
                  <span key={r.id} className="reaction-rise absolute bottom-0 text-3xl" style={{ right: r.x }}>{r.emoji}</span>
                ))}
              </div>
              {/* long-press picker */}
              {showEmojiPicker && (
                <div className="absolute bottom-full right-0 mb-2 flex items-center gap-0.5 rounded-full px-2 py-1.5 z-40"
                  style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  {reactionEmojis.map(em => (
                    <button key={em} onClick={() => { setSelectedEmoji(em); setShowEmojiPicker(false); }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xl active:scale-90 transition-transform hover:bg-white/10 ${em === selectedEmoji ? "ring-2 ring-white/50" : ""}`}>{em}</button>
                  ))}
                </div>
              )}
              <button type="button"
                onPointerDown={onEmojiDown} onPointerMove={onEmojiMove} onPointerUp={onEmojiUp} onPointerCancel={onEmojiCancel}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="Enviar reacción (mantén presionado para elegir emoji)"
                className="w-11 h-11 rounded-full flex items-center justify-center text-lg select-none touch-none"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}>
                <span className="pointer-events-none select-none" style={{ WebkitUserSelect: "none", userSelect: "none" }}>{selectedEmoji}</span>
              </button>
            </div>

          </div>

          {/* Bid bar — overlaid below the chat (slide to bid + full-width max bid) */}
          {isLive && (() => {
            const bItem = a.items?.find(i => i.status === "active");
            // No lot is live yet — the seller opens the next queued lot; buyers wait.
            if (!bItem) {
              const nextPending = (a.items ?? [])
                .filter(i => i.status === "pending")
                .sort((x, y) => (x.position ?? 0) - (y.position ?? 0))[0];
              return (
                <div className="px-4 pb-4 pointer-events-auto">
                  {isSeller ? (
                    nextPending ? (
                      <button type="button" onClick={() => openLot(nextPending.id)} disabled={openingLot}
                        className="w-full h-[58px] rounded-full flex items-center justify-center gap-2 font-black text-base disabled:opacity-50"
                        style={{ background: "var(--brand-light)", color: "var(--brand-ink)", boxShadow: "0 4px 20px color-mix(in srgb, var(--brand) 35%, transparent)" }}>
                        {openingLot ? "Iniciando…" : "Iniciar subasta"}
                      </button>
                    ) : (
                      <div className="w-full h-12 rounded-full flex items-center justify-center text-sm text-center px-4"
                        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.72)" }}>
                        Agrega una carta (🃏 Subastar) para abrir una puja
                      </div>
                    )
                  ) : (
                    <div className="w-full h-12 rounded-full flex items-center justify-center text-sm"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.7)" }}>
                      ⏳ Esperando la próxima puja…
                    </div>
                  )}
                </div>
              );
            }
            const bId = bItem?.id;
            const serverCur = bItem?.currentBid ?? a.currentBid ?? a.startingBid ?? 0;
            // Show whichever is higher so the optimistic value never flickers backwards
            const cur = Math.max(serverCur, optimisticBid ?? 0);
            // Step scales with the price ($20 → $50 → $100 → $200), kept in tens of pesos
            const next = Math.round((cur + bidIncrement(cur)) / 1000) * 1000;
            const leader = bItem?.winner?.username;
            const leaderIsMe = !!leader && leader === user?.username;
            // Who just placed the most recent human bid. If it's the leader, they raised
            // their own bid (no fight → show themselves); otherwise they're battling the leader.
            const pusher = bItem?.lastBidder?.username;
            const pusherIsMe = !!pusher && pusher === user?.username;
            const pusherIsLeader = !!pusher && pusher === leader;
            const showChallenger = !!pusher;
            const dPrice = dutchPrice(bItem);
            return (
              <div className="px-4 pb-4 pointer-events-auto flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-[10px] uppercase font-medium min-w-0" style={{ letterSpacing: "0.1em", color: "rgba(255,255,255,0.6)" }}>
                    {/* Countdown, immediately left of the current bid */}
                    {isLive && closesAt && (
                      <span className={`shrink-0 font-mono font-black text-[13px] px-1.5 py-0.5 rounded-md tracking-normal ${secsLeft !== null && secsLeft <= 10 ? "animate-pulse" : ""}`}
                        style={{
                          background: secsLeft !== null && secsLeft <= 10 ? "rgba(244,63,94,0.9)" : "rgba(255,255,255,0.14)",
                          color: "#fff",
                          transition: "background 0.3s ease",
                        }}>
                        {timer}
                      </span>
                    )}
                    {/* Who's winning right now — including when an auto-bid holds the lead.
                        (No "previous lot winner" chip: a freshly opened lot shows no winner
                        until someone actually bids — the prior winner only flashes in the splash.) */}
                    {leader && bidMode !== "dutch" && (
                      <span className="flex items-center gap-1 min-w-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold normal-case tracking-normal"
                        style={leaderIsMe
                          ? { background: "rgba(74,222,128,0.16)", border: "1px solid rgba(74,222,128,0.45)", color: "#4ade80" }
                          : { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff" }}
                        title={bItem?.winnerHasMaxBid ? "Va ganando con puja automática" : "Va ganando"}>
                        <span className="truncate">👑 {leader}{leaderIsMe ? " (tú)" : ""}</span>
                        {bItem?.winnerHasMaxBid && <span className="shrink-0" title="Puja automática">⚡</span>}
                      </span>
                    )}
                    {/* Who just bid — a challenger battling the leader (⚔️), or the leader
                        raising their own bid with no fight (⬆️, shown as themselves) */}
                    {showChallenger && challengerFlash && bidMode !== "dutch" && (
                      <span className="flex items-center gap-1 min-w-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold normal-case tracking-normal"
                        style={pusherIsMe
                          ? { background: "rgba(74,222,128,0.16)", border: "1px solid rgba(74,222,128,0.45)", color: "#4ade80" }
                          : pusherIsLeader
                            ? { background: "color-mix(in srgb, var(--brand) 16%, transparent)", border: "1px solid color-mix(in srgb, var(--brand) 45%, transparent)", color: "var(--brand-light)" }
                            : { background: "rgba(248,113,113,0.16)", border: "1px solid rgba(248,113,113,0.45)", color: "#f87171" }}
                        title={pusherIsLeader ? "Subió su propia puja" : "Le está pujando al líder"}>
                        <span className="shrink-0">{pusherIsLeader ? "⬆️" : "⚔️"}</span>
                        <span className="truncate">{pusher}{pusherIsMe ? " (tú)" : ""}</span>
                      </span>
                    )}
                    {bidMode === "dutch" && (
                      <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-[9px] font-black leading-none tracking-normal"
                        style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>HOLANDESA</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {/* Your max bid, shown right next to the current bid */}
                    {maxBidOv > 0 && bidMode !== "dutch" && !isSeller && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "color-mix(in srgb, var(--brand) 16%, transparent)", border: "1px solid color-mix(in srgb, var(--brand) 45%, transparent)", color: "var(--brand-light)" }}
                        title="Pujamos por ti hasta este monto">
                        Máx ${(maxBidOv / 100).toLocaleString("es-MX")}
                      </span>
                    )}
                    {/* Sudden death → a skull to the immediate left of the price */}
                    {bidMode === "sudden_death" && (
                      <span className="text-lg leading-none" title="Muerte súbita — el reloj no se reinicia" aria-label="Muerte súbita">💀</span>
                    )}
                    <span className="text-lg font-black text-white tabular-nums" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                      ${((bidMode === "dutch" ? dPrice : cur) / 100).toLocaleString("es-MX")}
                    </span>
                  </span>
                </div>

                {!user ? (
                  <Link href="/login" className="w-full h-12 rounded-full flex items-center justify-center font-semibold text-sm" style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>Inicia sesión para pujar</Link>
                ) : isSeller ? (
                  <div className="w-full h-12 rounded-full flex items-center justify-center text-sm" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.72)" }}>Tu subasta</div>
                ) : bidMode === "dutch" ? (
                  /* Dutch: no bidding — the price falls and the first to accept wins */
                  <button type="button" disabled={!bId || accepting} onClick={() => bId && acceptDutch(bId)}
                    className="w-full h-[58px] rounded-full flex items-center justify-center gap-2 font-black text-base disabled:opacity-50"
                    style={{ background: "var(--brand-light)", color: "var(--brand-ink)", boxShadow: "0 4px 20px color-mix(in srgb, var(--brand) 35%, transparent)" }}>
                    {accepting ? "Comprando…" : `Aceptar $${(dPrice / 100).toLocaleString("es-MX")}`}
                  </button>
                ) : (() => {
                  // While your max bid still covers the price, bidding against yourself
                  // makes no sense — suspend the slide until a bid surpasses your max.
                  const maxCovering = maxBidOv > 0 && cur < maxBidOv;
                  // The moment the clock hits 0, bidding is closed (the server also rejects
                  // late bids) so everyone stops at the same instant the timer shows 0:00.
                  const timeUp = secsLeft !== null && secsLeft <= 0;
                  return (
                  <div className="flex items-stretch gap-2">
                    <div className="order-2 shrink-0 w-[144px]">
                      <SlideToBid
                        label={isPaused ? "En pausa" : timeUp ? "⏱ 0:00" : maxCovering ? `⚡ Máx activa` : !bId ? "Sin carta" : `Pujar $${(next / 100).toLocaleString("es-MX")}`}
                        disabled={!bId || isPaused || maxCovering || timeUp}
                        onConfirm={async () => {
                          if (!bId) return;
                          const amount = next;
                          setOptimisticBid(amount);   // price jumps immediately
                          try {
                            await auctionsApi.bid(bId, amount);
                            const fresh = await auctionsApi.get(a.id);
                            onAuctionUpdate?.(fresh.data);
                          } catch (e: any) {
                            setOptimisticBid(null);   // roll back if the server rejected it
                            flashToast(e?.response?.data?.message ?? "No se pudo registrar la puja.");
                          }
                        }}
                      />
                    </div>

                    <div className="order-1 flex-1 min-w-0" ref={maxBidOvRef}>
                      <button type="button" disabled={timeUp} onClick={() => { setMaxKeypad(String(next / 100)); maxFresh.current = true; setShowMaxBidOv(true); }} aria-label="Max bid"
                        className="w-full h-[46px] px-4 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        <span aria-hidden="true">⚡</span>
                        <span className="truncate">{maxBidOv > 0 ? `Máx $${(maxBidOv / 100).toLocaleString("es-MX")}` : "Max bid"}</span>
                      </button>
                      {showMaxBidOv && (() => {
                        const step = bidIncrement(cur);         // the bid step at this price
                        const minCents = next;                  // one step above the current bid
                        const typedCents = Math.round((parseFloat(maxKeypad || "0") || 0) * 100);
                        // No "multiples" warning: we snap the amount to the nearest valid bid
                        // (a whole number of steps above the current price) automatically.
                        const snappedCents = cur + Math.max(1, Math.round((typedCents - cur) / step)) * step;
                        const valid = !!bId && typedCents >= minCents;
                        return (
                          <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setShowMaxBidOv(false)}>
                            <div className="w-full sm:max-w-md rounded-t-3xl overflow-hidden" style={{ background: "#141418", boxShadow: "0 -8px 40px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
                              <div className="w-10 h-1 rounded-full mx-auto mt-2.5 mb-1" style={{ background: "rgba(255,255,255,0.25)" }} />
                              {/* Header: reference price + seller + close */}
                              <div className="flex items-start justify-between px-5 pt-3">
                                <div>
                                  <p className="text-3xl font-black text-white leading-none">${(cur / 100).toLocaleString("es-MX")}</p>
                                  <p className="text-[13px] mt-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>🧑 {sellerName}</p>
                                </div>
                                <button type="button" onClick={() => setShowMaxBidOv(false)} aria-label="Cerrar"
                                  className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(255,255,255,0.12)" }}>✕</button>
                              </div>
                              {/* Typed amount */}
                              <div className="text-center pt-4 pb-1">
                                {closesAt && <p className="text-lg font-black text-white tabular-nums mb-0.5">{timer}</p>}
                                <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>Tu oferta de subasta máxima ⓘ</p>
                                <p className="text-5xl font-black text-white mt-2 tabular-nums">
                                  <span className="text-2xl align-top" style={{ color: "rgba(255,255,255,0.55)" }}>$</span>{maxKeypad === "" ? (minCents / 100).toLocaleString("es-MX") : maxKeypad}
                                </p>
                                <p className="text-[12px] mt-1.5" style={{ color: maxKeypad !== "" && !valid ? "#f87171" : "rgba(255,255,255,0.5)" }}>
                                  Mínimo ${(minCents / 100).toLocaleString("es-MX")}
                                  {maxKeypad !== "" && typedCents < minCents && " — tu oferta es menor"}
                                  {maxKeypad !== "" && valid && snappedCents !== typedCents && ` · se ajustará a $${(snappedCents / 100).toLocaleString("es-MX")}`}
                                </p>
                              </div>
                              {/* Keypad */}
                              <div className="grid grid-cols-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                {["1","2","3","4","5","6","7","8","9",".","0","back"].map(k => (
                                  <button key={k} type="button" onClick={() => pressKey(k)}
                                    className="h-16 text-2xl font-semibold text-white flex items-center justify-center active:bg-white/10"
                                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", borderRight: k !== "3" && k !== "6" && k !== "9" && k !== "back" ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
                                    {k === "back" ? "⌫" : k}
                                  </button>
                                ))}
                              </div>
                              <p className="text-[11px] text-center px-6 pt-3 pb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                                Al confirmar tu oferta máxima, pujaremos por ti hasta ese monto si alguien te supera.
                              </p>
                              <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                <button type="button" disabled={!valid || settingMaxOv}
                                  onClick={async () => { if (!valid || settingMaxOv) return; setSettingMaxOv(true); try { await auctionsApi.maxBid(bId!, snappedCents); setMaxBidOv(snappedCents); setShowMaxBidOv(false); flashToast(`Max bid activado ⚡ $${(snappedCents / 100).toLocaleString("es-MX")}`); } catch { flashToast("No se pudo activar el max bid."); } finally { setSettingMaxOv(false); } }}
                                  className="w-full py-3.5 rounded-full text-[15px] font-bold disabled:opacity-40"
                                  style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                                  {settingMaxOv ? "Activando…" : "Confirmar la oferta de subasta máxima"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>

        {/* ⚡ Relámpago overlay */}
        {lightningEndsAt && lightningLeft > 0 && (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none"
            style={{ background: "rgba(0,0,0,0.6)" }}
          >
            <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest mb-2">⚡ RELÁMPAGO</p>
            <p className="text-7xl font-black text-white tabular-nums leading-none">{lightningLeft}</p>
            <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>segundos</p>
          </div>
        )}

        {/* 💰 Precio oculto overlay */}
        {priceRevealed && revealedPrice && (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center"
            style={{ background: "rgba(0,0,0,0.78)" }}
          >
            <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--accent-text)" }}>
              💰 PRECIO OCULTO
            </p>
            <p className="text-5xl font-black text-white">
              ${revealedPrice}{" "}
              <span className="text-xl font-normal" style={{ color: "var(--text-secondary)" }}>MXN</span>
            </p>
            <button
              onClick={() => { setPriceRevealed(false); setRevealedPrice(""); }}
              className="mt-4 text-xs px-4 py-2 rounded-lg transition-colors"
              style={{ background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Seller streaming controls overlay */}
        {isSeller && streaming && (
          <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
            <button
              onClick={toggleMic}
              title={micMuted ? "Activar micrófono" : "Silenciar"}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-all"
              style={{ background: micMuted ? "rgba(239,68,68,0.8)" : "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            >
              {micMuted ? "🔇" : "🎤"}
            </button>
            <button
              onClick={toggleCam}
              title={camOff ? "Activar cámara" : "Apagar cámara"}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-all"
              style={{ background: camOff ? "rgba(239,68,68,0.8)" : "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            >
              {camOff ? "📵" : "📹"}
            </button>
          </div>
        )}
      </div>

      {/* ── Seller start/stop controls ── */}
      {isSeller && isLive && (
        <div className="px-4 py-3" style={{ background: "rgba(37,99,235,0.06)", borderBottom: "1px solid var(--border-subtle)" }}>
          {streamError && <p className="text-xs text-[var(--error-text)] mb-2">{streamError}</p>}
          {!streaming ? (
            <div className="flex gap-2">
              <button
                onClick={startStream}
                disabled={connecting}
                className="flex-1 py-3 rounded-xl font-black text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", boxShadow: "0 4px 20px rgba(220,38,38,0.4)" }}
              >
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                {connecting ? "Iniciando..." : "Iniciar stream"}
              </button>
              <button
                onClick={endAuction}
                disabled={endingAuction}
                className="px-4 py-3 rounded-xl font-bold text-sm disabled:opacity-60 transition-all"
                style={confirmEnd
                  ? { background: "rgba(239,68,68,0.2)", color: "var(--error-text)", border: "1px solid rgba(239,68,68,0.4)" }
                  : { background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                {endingAuction ? "..." : confirmEnd ? "¿Confirmar?" : "Terminar subasta"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-[var(--error-text)]">EN VIVO</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={stopStream}
                  className="text-xs font-bold px-3 py-2 rounded-xl transition-all"
                  style={{ background: "rgba(239,68,68,0.15)", color: "var(--error-text)", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  Pausar stream
                </button>
                <button
                  onClick={endAuction}
                  disabled={endingAuction}
                  className="text-xs font-bold px-3 py-2 rounded-xl transition-all disabled:opacity-60"
                  style={confirmEnd
                    ? { background: "rgba(239,68,68,0.2)", color: "var(--error-text)", border: "1px solid rgba(239,68,68,0.4)" }
                    : { background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                >
                  {endingAuction ? "..." : confirmEnd ? "¿Confirmar?" : "Terminar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Panel agregar carta + minijuego (solo vendedor en vivo) ── */}
      {isSeller && isLive && (
        <div style={{ background: "var(--bg-base)", borderTop: "1px solid var(--border-subtle)" }}>

          {/* Carta activa actual */}
          {(() => {
            const activeItem = a.items?.find(i => i.status === "active");
            if (!activeItem) return null;
            const hasBids = (activeItem.currentBid ?? 0) > (activeItem.startingBid ?? 0) || (activeItem.bids?.length ?? 0) > 0;
            return (
              <div className="px-3 pt-3 pb-2">
                <div
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)" }}
                >
                  {activeItem.imageUrls?.[0] && (
                    <img
                      src={activeItem.imageUrls[0]}
                      alt={activeItem.cardName}
                      className="w-10 h-14 object-contain rounded-lg shrink-0"
                      style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.4))" }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-muted)" }}>
                      En subasta
                    </p>
                    <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {activeItem.cardName}
                    </p>
                    <p className="text-xs" style={{ color: "var(--accent-text)" }}>
                      ${((activeItem.currentBid ?? activeItem.startingBid ?? 0) / 100).toLocaleString("es-MX")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {closeItemMsg && (
                      <p className="text-[11px] mb-1" style={{ color: closeItemMsg.startsWith("✓") ? "#4ade80" : "var(--error-text)" }}>
                        {closeItemMsg}
                      </p>
                    )}
                    <button
                      onClick={() => !hasBids && closeActiveItem(activeItem.id)}
                      disabled={closingItem || hasBids}
                      title={hasBids ? "Tiene pujas — espera a que termine el tiempo" : "Cerrar sin ganador y pasar a la siguiente carta"}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                      style={hasBids
                        ? { background: "var(--bg-hover)", color: "var(--text-muted)", cursor: "not-allowed" }
                        : { background: "rgba(239,68,68,0.12)", color: "var(--error-text)", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      {closingItem ? "..." : hasBids ? "🔒 Tiene pujas" : "Saltar carta"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Agregar carta ── */}
          <div className="p-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-muted)" }}>
              🃏 Agregar carta
            </p>
            {addCardError && <p className="text-xs text-[var(--error-text)]">{addCardError}</p>}

            <div className="flex gap-2">
              <div className="flex-1">
                <PokemonCardSearch
                  value={cardName}
                  onChange={setCardName}
                  onSelectCard={(card) => {
                    setCardName(card.name);
                    setCardImageUrl(card.imageLarge || card.image || "");
                    if (card.marketPriceCents != null) {
                      setCardPrice(String(Math.round(card.marketPriceCents / 100)));
                    }
                  }}
                  placeholder="Nombre de la carta..."
                  className="w-full rounded-xl pl-9 pr-3 py-2 text-sm placeholder:text-zinc-600"
                />
              </div>
              <div className="relative w-28 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: "var(--text-muted)" }}>$</span>
                <input
                  type="number" min={1}
                  value={cardPrice}
                  onChange={e => setCardPrice(e.target.value)}
                  placeholder="Precio"
                  className="w-full rounded-xl pl-6 pr-2 py-2 text-sm placeholder:text-zinc-600"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(37,99,235,0.5)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
              </div>
            </div>

            {cardImageUrl && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" }}>
                <img src={cardImageUrl} alt="" className="w-6 h-8 object-contain rounded shrink-0" />
                <p className="text-[11px] flex-1" style={{ color: "#4ade80" }}>✓ Imagen oficial cargada desde la base de datos Pokémon</p>
                <button type="button" onClick={() => setCardImageUrl("")} className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>
                  Quitar
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <select
                value={cardCategory}
                onChange={e => setCardCategory(e.target.value)}
                className="flex-1 rounded-xl px-3 py-2 text-xs"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                {["carta", "paquete", "caja", "expansión", "otro"].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <select
                value={cardDuration}
                onChange={e => setCardDuration(e.target.value)}
                className="flex-1 rounded-xl px-3 py-2 text-xs"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                {[
                  { label: "30 seg", value: "30" },
                  { label: "1 min",  value: "60" },
                  { label: "2 min",  value: "120" },
                  { label: "5 min",  value: "300" },
                  { label: "10 min", value: "600" },
                ].map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <button
                onClick={addCard}
                disabled={addingCard || !cardName.trim() || !cardPrice}
                className="px-4 py-2 rounded-xl text-sm font-black text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
              >
                {addingCard ? "…" : "+ Subir"}
              </button>
            </div>
          </div>

          {/* ── Minijuego (siempre visible) ── */}
          <div className="p-3 flex flex-col gap-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-muted)" }}>
              🎲 Minijuego{streamWinners.length > 0 ? ` (${streamWinners.length})` : ""}
            </p>

            {/* Selector de tipo */}
            <div className="grid grid-cols-5 gap-1">
              {([
                { key: "ruleta",    icon: "🎲", label: "Ruleta"  },
                { key: "carrera",   icon: "🏁", label: "Carrera" },
                { key: "chat",      icon: "🎟️", label: "Chat"    },
                { key: "relampago", icon: "⚡", label: "Rayo"    },
                { key: "precio",    icon: "💰", label: "Precio"  },
              ] as const).map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => setMgType(key)}
                  className="py-1.5 rounded-lg flex flex-col items-center gap-0.5 transition-all"
                  style={mgType === key
                    ? { background: "rgba(37,99,235,0.3)", border: "1px solid rgba(37,99,235,0.5)" }
                    : { background: "var(--bg-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <span className="text-base leading-none">{icon}</span>
                  <span
                    className="text-[9px] font-bold"
                    style={{ color: mgType === key ? "var(--accent-text)" : "var(--text-muted)" }}
                  >
                    {label}
                  </span>
                </button>
              ))}
            </div>

            {/* ── 🎲 Ruleta de ganadores ── */}
            {mgType === "ruleta" && (streamWinners.length === 0 ? (
              <p className="text-xs text-center py-3" style={{ color: "var(--text-muted)" }}>
                Nadie ha ganado cartas aún — los compradores aparecerán aquí.
              </p>
            ) : (
              <>
                <div className="flex gap-1.5 flex-wrap">
                  {["todos", ...Array.from(new Set(streamWinners.map(w => w.category)))].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setMgCategory(cat)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                      style={mgCategory === cat
                        ? { background: "rgba(37,99,235,0.3)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.5)" }
                        : { background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)} ({cat === "todos" ? streamWinners.length : streamWinners.filter(w => w.category === cat).length})
                    </button>
                  ))}
                </div>
                {mgWinner && (
                  <div
                    className="rounded-xl py-3 text-center"
                    style={{
                      background: mgSpinning ? "var(--bg-hover)" : "rgba(74,222,128,0.1)",
                      border: `1px solid ${mgSpinning ? "var(--border)" : "rgba(74,222,128,0.3)"}`,
                    }}
                  >
                    {mgSpinning
                      ? <p className="text-sm font-black animate-pulse" style={{ color: "var(--text-secondary)" }}>@{mgWinner}</p>
                      : <>
                          <p className="text-[10px] text-green-400 font-bold uppercase tracking-widest mb-0.5">¡Ganador!</p>
                          <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>@{mgWinner}</p>
                        </>}
                  </div>
                )}
                <button
                  onClick={spinMinigame}
                  disabled={mgSpinning}
                  className="w-full py-2.5 rounded-xl font-black text-sm text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #f97316)" }}
                >
                  {mgSpinning ? "Girando…" : "🎲 Girar"}
                </button>
              </>
            ))}

            {/* ── 🏁 Carrera de compradores ── */}
            {mgType === "carrera" && (() => {
              const counts = streamWinners.reduce<Record<string, number>>((acc, w) => { acc[w.username] = (acc[w.username] ?? 0) + 1; return acc; }, {});
              const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
              const maxVal = sorted[0]?.[1] ?? 1;
              const medals = ["🥇","🥈","🥉"];
              return sorted.length === 0 ? (
                <p className="text-xs text-center py-3" style={{ color: "var(--text-muted)" }}>Nadie ha ganado cartas aún.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Cartas ganadas este stream</p>
                  {sorted.map(([username, count], i) => (
                    <div key={username} className="flex items-center gap-2">
                      <span className="text-sm w-5 text-center">{medals[i] ?? `${i+1}`}</span>
                      <span className="text-xs font-bold w-20 truncate" style={{ color: "var(--accent-text)" }}>@{username}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${(count / maxVal) * 100}%`,
                            background: i === 0 ? "linear-gradient(90deg,#f59e0b,#f97316)" : "linear-gradient(90deg,#2563EB,#3B82F6)",
                          }}
                        />
                      </div>
                      <span className="text-[10px] w-4 text-right font-bold" style={{ color: "var(--text-secondary)" }}>{count}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── 🎟️ Rifa de chat ── */}
            {mgType === "chat" && (() => {
              const chatters = Array.from(new Set(chatMessages.map(m => m.username))).filter(u => u !== "sistema");
              return chatters.length === 0 ? (
                <p className="text-xs text-center py-3" style={{ color: "var(--text-muted)" }}>Nadie ha escrito en el chat aún.</p>
              ) : (
                <>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{chatters.length} participantes en el chat</p>
                  <div className="max-h-20 overflow-y-auto flex flex-wrap gap-1">
                    {chatters.map(u => (
                      <span
                        key={u}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(37,99,235,0.12)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.2)" }}
                      >
                        @{u}
                      </span>
                    ))}
                  </div>
                  {chatRaffleWinner && (
                    <div
                      className="rounded-xl py-3 text-center"
                      style={{
                        background: chatRaffleSpinning ? "var(--bg-hover)" : "rgba(74,222,128,0.1)",
                        border: `1px solid ${chatRaffleSpinning ? "var(--border)" : "rgba(74,222,128,0.3)"}`,
                      }}
                    >
                      {chatRaffleSpinning
                        ? <p className="text-sm font-black animate-pulse" style={{ color: "var(--text-secondary)" }}>@{chatRaffleWinner}</p>
                        : <>
                            <p className="text-[10px] text-green-400 font-bold uppercase tracking-widest mb-0.5">¡Ganador!</p>
                            <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>@{chatRaffleWinner}</p>
                          </>}
                    </div>
                  )}
                  <button
                    onClick={spinChatRaffle}
                    disabled={chatRaffleSpinning}
                    className="w-full py-2.5 rounded-xl font-black text-sm text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                  >
                    {chatRaffleSpinning ? "Girando…" : "🎟️ Rifar entre el chat"}
                  </button>
                </>
              );
            })()}

            {/* ── ⚡ Relámpago ── */}
            {mgType === "relampago" && (
              <div className="flex flex-col gap-3">
                <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  Activa un contador visible para todos los viewers. Úsalo para crear urgencia antes de subastar la siguiente carta.
                </p>
                <div className="flex gap-1.5">
                  {[30, 60, 90, 120].map(s => (
                    <button
                      key={s}
                      onClick={() => setLightningDuration(s)}
                      className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                      style={lightningDuration === s
                        ? { background: "rgba(245,158,11,0.25)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.4)" }
                        : { background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
                {lightningLeft > 0 ? (
                  <div
                    className="rounded-xl py-3 text-center"
                    style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}
                  >
                    <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest mb-0.5">⚡ EN CURSO</p>
                    <p className="text-3xl font-black text-white tabular-nums">{lightningLeft}s</p>
                  </div>
                ) : (
                  <button
                    onClick={launchLightning}
                    className="w-full py-2.5 rounded-xl font-black text-sm text-white"
                    style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)" }}
                  >
                    ⚡ Activar relámpago {lightningDuration}s
                  </button>
                )}
              </div>
            )}

            {/* ── 💰 Precio oculto ── */}
            {mgType === "precio" && (
              <div className="flex flex-col gap-3">
                <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  Escribe el precio secreto de la siguiente carta. Los viewers verán el reveal en pantalla cuando presiones &ldquo;Revelar&rdquo;.
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: "var(--text-muted)" }}>$</span>
                  <input
                    type="text"
                    value={priceInput}
                    onChange={e => setPriceInput(e.target.value)}
                    placeholder="ej. 850"
                    className="w-full rounded-xl pl-7 pr-4 py-2.5 text-sm placeholder:text-zinc-700"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  />
                </div>
                <button
                  onClick={revealHiddenPrice}
                  disabled={!priceInput.trim()}
                  className="w-full py-2.5 rounded-xl font-black text-sm text-white disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #2563EB, var(--accent-text))" }}
                >
                  💰 Revelar a todos
                </button>
                <button
                  onClick={() => { setPriceInput(""); setPriceRevealed(false); setRevealedPrice(""); }}
                  className="w-full py-1.5 rounded-xl text-xs transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  Reiniciar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

/* ─── Card Info ─────────────────────────────────────────── */
function CardInfo({ auction: a, isSeller }: { auction: ApiAuction; isSeller?: boolean }) {
  const title = liveName(a);
  const sellerName = a.seller?.username ?? a.sellerName ?? "—";
  const verified = a.seller?.verified;
  const imageUrl = (a.items ?? [])[0]?.imageUrls?.[0];

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
    >
      {/* Title row — with optional thumbnail */}
      <div className="flex items-start gap-4 mb-3">
        {imageUrl && (
          <div
            className="shrink-0 rounded-xl overflow-hidden"
            style={{ width: 56, height: 76, background: "#050508", border: "1px solid var(--border)" }}
          >
            <img
              src={imageUrl}
              alt={title}
              width={56}
              height={76}
              className="w-full h-full object-contain"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-black leading-tight" style={{ color: "var(--text-primary)" }}>{title}</h1>
            {a.condition && (
              <span
                className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg"
                style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.25)" }}
              >
                {a.condition}
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{gameLabel(a.game)}</p>
        </div>
      </div>

      {a.description && (
        <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{a.description}</p>
      )}

      <div className={`grid gap-3 ${isSeller ? "grid-cols-2" : "grid-cols-1"}`}>
        <div
          className="rounded-xl px-3 py-2.5"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-[10px] mb-1.5 font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Vendedor</p>
          <Link href={`/tienda/${sellerName}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
              style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.2)" }}
            >
              🧑
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--accent-text)" }}>
                {sellerName} {verified && <span>✓</span>}
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {verified ? "Verificado" : "Ver tienda"}
              </p>
            </div>
          </Link>
        </div>

        {isSeller && (
          <div
            className="rounded-xl px-3 py-2.5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
          >
            <p className="text-[10px] mb-1 font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Total de pujas</p>
            <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>{a.totalBids ?? 0}</p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>participantes</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Slide-to-bid — drag the handle (≈40% of the track) to confirm ─────── */
/* A real spinning roulette wheel: draws one wedge + label per name and rotates so the
   winner's wedge lands under the top pointer. Fires onDone when it stops. */
/** The eleven energy types a Pokémon break is usually split by. */
const ENERGIAS = [
  "Fuego", "Agua", "Planta", "Rayo", "Psíquico", "Lucha",
  "Oscuridad", "Metal", "Hada", "Dragón", "Incolora",
];

/** One shake of the dice for every contender still in the running. */
type DiceRound = { name: string; a: number; b: number }[];
type DiceShow = { rounds: DiceRound[]; winner: string; prize?: string };
type CoinShow = { side: "aguila" | "sol"; heads: string; tails: string; winner: string | null; prize?: string };
type RouletteShow = { names: string[]; winner: string; prize?: string; label?: string };

/* A dozen saturated hues that all read on a black overlay. Ordered so neighbours in
   the list already contrast; buildColors() then guarantees no two touching wedges
   share a colour, including across the wrap. */
const WHEEL_PALETTE = [
  "#EF4444", "#3B82F6", "#F59E0B", "#8B5CF6", "#22C55E", "#EC4899",
  "#06B6D4", "#F97316", "#84CC16", "#A855F7", "#14B8A6", "#FACC15",
];

function buildColors(n: number): string[] {
  const out = Array.from({ length: n }, (_, i) => WHEEL_PALETTE[i % WHEEL_PALETTE.length]);
  // With more wedges than colours the sequence repeats, and an odd count makes the
  // last wedge meet the first. Nudge any collision to the next unused hue.
  for (let i = 0; i < n; i++) {
    const prev = out[(i - 1 + n) % n], next = out[(i + 1) % n];
    if (i > 0 && (out[i] === prev || (i === n - 1 && out[i] === next))) {
      out[i] = WHEEL_PALETTE.find(c => c !== prev && c !== next) ?? out[i];
    }
  }
  return out;
}

/** Black or white for a label, whichever the wedge underneath can actually carry. */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? "#0b0b0f" : "#ffffff";
}

/** A burst of paper over whatever just won. Pure CSS: 34 divs, each with its own drift. */
function Confetti({ pieces = 34 }: { pieces?: number }) {
  // Built once per mount: the positions must not reshuffle on every re-render.
  // A lazy useState initialiser, not a ref — reading .current during render is exactly
  // what the hooks lint objects to, and this is the shape the rule wants.
  const [bits] = useState(() =>
    Array.from({ length: pieces }, (_, i) => {
      // Deterministic-ish spread so the burst always covers the width evenly.
      const left = (i / pieces) * 100 + (i % 3) * 4;
      return {
        left,
        dx: `${((i * 37) % 61) - 30}px`,
        spin: `${((i * 53) % 720) + 180}deg`,
        dur: `${1.5 + ((i * 17) % 90) / 100}s`,
        delay: `${((i * 29) % 45) / 100}s`,
        color: WHEEL_PALETTE[i % WHEEL_PALETTE.length],
        w: 5 + (i % 4) * 2,
        h: 9 + (i % 3) * 3,
      };
    }),
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: "100%" }}>
      {bits.map((b, i) => (
        <span key={i} className="confetti-piece absolute block"
          style={{
            left: `${b.left}%`, top: "16%", width: b.w, height: b.h,
            background: b.color, borderRadius: 1,
            ["--dx" as string]: b.dx, ["--spin" as string]: b.spin,
            ["--dur" as string]: b.dur, ["--delay" as string]: b.delay,
          }} />
      ))}
    </div>
  );
}

/** The pips of one die face, laid out on a 3x3 grid the way a real die is. */
const DIE_PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function Die({ value, size = 34, rolling = false, tick = 0, seed = 0 }: {
  value: number; size?: number; rolling?: boolean; tick?: number; seed?: number;
}) {
  /* While it rolls the face has to keep changing — a fixed face that merely shakes
     reads as a stuck die, which is exactly how the first version looked. The face is
     derived from a tick the parent owns: one timer for the table, not one per die. */
  const pad = size * 0.22, step = (size - pad * 2) / 2, r = size * 0.085;
  // Hashed, not stepped: arithmetic on (tick, seed) left the dice marching in step and
  // drifting upward together. imul gives a real avalanche, so each die looks independent.
  let h = Math.imul(tick + 1, 0x9e3779b1) ^ Math.imul(seed + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  h = (h ^ (h >>> 13)) >>> 0;
  const shown = rolling ? 1 + (h % 6) : value;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      className={rolling ? "die-tumble" : "die-settle"} aria-label={`Dado: ${value}`}
      style={{ overflow: "visible" }}>
      <rect width={size} height={size} rx={size * 0.2} fill="#fff" stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
      {(DIE_PIPS[shown] ?? []).map(([row, col], i) => (
        <circle key={i} cx={pad + col * step} cy={pad + row * step} r={r} fill="#0b0b0f" />
      ))}
    </svg>
  );
}

/** Rolls the rounds one after another, so a tiebreak reads as a second throw. */
function DiceRoll({ rounds, winner, onDone }: { rounds: DiceRound[]; winner: string; onDone?: () => void }) {
  const [round, setRound] = useState(0);
  const [rolling, setRolling] = useState(true);
  const [tick, setTick] = useState(0);
  const firedRef = useRef(false);
  // One timer drives every die on the table. Twenty-four of them would be twenty-four
  // state updates a frame on a page that is also decoding live video.
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setTick(v => v + 1), 70);
    return () => clearInterval(t);
  }, [rolling]);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    rounds.forEach((_, i) => {
      timers.push(setTimeout(() => { setRound(i); setRolling(true); }, t));
      timers.push(setTimeout(() => setRolling(false), t + 900));
      t += 1500;
    });
    timers.push(setTimeout(() => {
      if (!firedRef.current) { firedRef.current = true; onDone?.(); }
    }, Math.max(1400, t - 300)));
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = rounds[round] ?? [];
  const best = shown.length ? Math.max(...shown.map(r => r.a + r.b)) : 0;
  return (
    <div className="w-full max-w-sm">
      {rounds.length > 1 && (
        <p key={round} className="pop-in text-center text-[11px] font-bold uppercase tracking-widest mb-2"
          style={{ color: round === 0 ? "rgba(255,255,255,0.65)" : "#FACC15" }}>
          {round === 0 ? "Primera tirada" : `¡Empate! Desempate ${round}`}
        </p>
      )}
      <div className="space-y-1.5 max-h-[46vh] overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {shown.slice(0, 12).map((r, idx) => {
          const total = r.a + r.b;
          const top = !rolling && total === best;
          return (
            /* Keyed by round too, so every throw re-runs the entrance instead of
               leaving the rows sitting there from the previous one. */
            <div key={`${round}-${r.name}`} className="row-in flex items-center gap-2.5 rounded-xl px-3 py-1.5"
              style={{
                animationDelay: `${idx * 55}ms`,
                transition: "opacity 0.4s ease, border-color 0.4s ease, background 0.4s ease",
                ...(top
                  ? { background: "rgba(84,66,4,0.92)", border: "1.5px solid #FACC15", boxShadow: "0 0 22px rgba(250,204,21,0.35)" }
                  : { background: "rgba(18,18,24,0.9)", border: "1px solid rgba(255,255,255,0.14)", opacity: rolling ? 1 : 0.5 }),
              }}>
              <span className="text-[13px] font-bold text-white truncate flex-1">{r.name}</span>
              <Die value={r.a} rolling={rolling} tick={tick} seed={idx * 2} />
              <Die value={r.b} rolling={rolling} tick={tick} seed={idx * 2 + 1} />
              <span className={`text-base font-black tabular-nums w-7 text-right ${top ? "pop-in" : ""}`}
                style={{ color: top ? "#FACC15" : "rgba(255,255,255,0.85)" }}>{rolling ? "?" : total}</span>
            </div>
          );
        })}
        {shown.length > 12 && (
          <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>y {shown.length - 12} más…</p>
        )}
      </div>
      <p className="sr-only">{`Gana ${winner}`}</p>
    </div>
  );
}

/** Volado — águila or sol, the way a coin is called in Mexico. */
function CoinFlip({ side, heads, tails, onDone }: {
  side: "aguila" | "sol"; heads: string; tails: string; onDone?: () => void;
}) {
  const firedRef = useRef(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setDone(true);
      if (!firedRef.current) { firedRef.current = true; onDone?.(); }
    }, 2300);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Sol is the back of the coin, so it needs the extra half turn to end face-up.
  const rest = side === "aguila" ? 0 : 180;
  const face = (label: string, emoji: string, back: boolean) => (
    <div className="absolute inset-0 rounded-full flex flex-col items-center justify-center"
      style={{
        background: "radial-gradient(circle at 34% 28%, #FDE68A, #D9A404 62%, #A87A02)",
        border: "4px solid #F5D372", boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
        backfaceVisibility: "hidden", transform: back ? "rotateX(180deg)" : undefined,
      }}>
      <span className="text-3xl leading-none" aria-hidden="true">{emoji}</span>
      <span className="text-[10px] font-black uppercase tracking-widest mt-0.5" style={{ color: "#5B4102" }}>{label}</span>
      {/* A light running across the metal while it turns */}
      <span className="absolute inset-0 rounded-full overflow-hidden" aria-hidden="true">
        <span className="coin-shine absolute top-0 bottom-0 w-1/3"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)" }} />
      </span>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`coin-toss ${done ? "win-glow" : ""}`} style={{ perspective: 700 }}>
        <div className={done ? "" : "coin-tumble"}
          style={{ position: "relative", width: 128, height: 128, transformStyle: "preserve-3d", transform: done ? `rotateX(${rest}deg)` : undefined }}>
          {face("Águila", "🦅", false)}
          {face("Sol", "☀️", true)}
        </div>
      </div>
      {(heads || tails) && (
        <div className="flex items-center gap-2 text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>
          <span style={{ color: done && side === "aguila" ? "#FACC15" : undefined }}>🦅 {heads || "—"}</span>
          <span style={{ color: "rgba(255,255,255,0.35)" }}>vs</span>
          <span style={{ color: done && side === "sol" ? "#FACC15" : undefined }}>☀️ {tails || "—"}</span>
        </div>
      )}
    </div>
  );
}

function RouletteWheel({ names, winner, onDone }: { names: string[]; winner: string; onDone?: () => void }) {
  const N = Math.max(1, names.length);
  const seg = 360 / N;
  const winnerIdx = Math.max(0, names.indexOf(winner));
  const [rot, setRot] = useState(0);
  const [landed, setLanded] = useState(false);
  const firedRef = useRef(false);
  const finish = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setLanded(true);
    onDone?.();
  };
  useEffect(() => {
    // Rotate several full turns, then align the winner's wedge centre to the top (0°).
    // With a single name that centre is at 180°, which would land the wheel — and its
    // one label — upside down, so it stops on a whole turn instead.
    const target = 360 * 6 - (names.length === 1 ? 0 : (winnerIdx + 0.5) * seg);
    const t = setTimeout(() => setRot(target), 60);
    // Fallback in case transitionend doesn't fire (e.g. reduced motion)
    const done = setTimeout(finish, 5200);
    return () => { clearTimeout(t); clearTimeout(done); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const colors = buildColors(N);
  const polar = (r: number, deg: number) => { const a = (deg - 90) * Math.PI / 180; return { x: r * Math.cos(a), y: r * Math.sin(a) }; };
  const R = 100;
  const size = Math.min(300, typeof window !== "undefined" ? window.innerWidth - 80 : 300);
  const fs = N > 12 ? 7 : N > 8 ? 8.5 : N > 5 ? 10.5 : 13;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* top pointer */}
      <div style={{ position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", zIndex: 3, width: 0, height: 0, borderLeft: "11px solid transparent", borderRight: "11px solid transparent", borderTop: "18px solid #fff", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }} />
      <svg viewBox="-108 -108 216 216" width={size} height={size}
        style={{ transform: `rotate(${rot}deg)`, transition: "transform 4.8s cubic-bezier(0.16,0.84,0.28,1)", filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.5))" }}
        onTransitionEnd={finish}>
        {/* Rim: a pale ring so the wheel reads as an object against the black scrim */}
        <circle r="104" fill="#14141b" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" />
        {names.map((n, i) => {
          const a0 = i * seg, a1 = (i + 1) * seg, mid = (a0 + a1) / 2;
          const p0 = polar(R, a0), p1 = polar(R, a1);
          const large = seg > 180 ? 1 : 0;
          const isWinner = i === winnerIdx;
          const ink = inkOn(colors[i]);
          // A lone name is a full turn, and an arc from a point back to itself draws
          // nothing — which left the last pick of every break spinning on an empty wheel.
          const single = names.length === 1;
          return (
            <g key={i} className={landed && isWinner ? "win-glow" : ""}
              style={{ opacity: landed && !isWinner ? 0.3 : 1, transition: "opacity 0.6s ease" }}>
              {single ? (
                <circle r={R} fill={colors[i]} stroke="rgba(255,255,255,0.85)" strokeWidth={1.1} />
              ) : (
              <path d={`M0,0 L${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${R},${R} 0 ${large} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)} Z`}
                fill={colors[i]} stroke="rgba(255,255,255,0.85)" strokeWidth={1.1} />
              )}
              {/* Paint the label in whichever ink the wedge can carry — a single dark
                  colour disappeared on every blue and purple slice. */}
              <text transform={single ? "translate(0,-45)" : `rotate(${mid}) translate(0,-62)`} textAnchor="middle" dominantBaseline="middle"
                fontSize={fs} fontWeight={900} fill={ink}
                stroke={ink === "#ffffff" ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.4)"} strokeWidth={0.35} paintOrder="stroke"
                style={{ userSelect: "none", letterSpacing: "0.02em" }}>
                {n.length > 12 ? n.slice(0, 11) + "…" : n}
              </text>
            </g>
          );
        })}
        <circle r="13" fill="#14141b" stroke="#fff" strokeWidth="2.5" />
      </svg>
    </div>
  );
}

function SlideToBid({ label, disabled, onConfirm }: {
  label: string; disabled?: boolean; onConfirm: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [x, setX] = useState(0);
  const [done, setDone] = useState(false);
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    const measure = () => { if (trackRef.current) setTrackW(trackRef.current.clientWidth); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const PAD = 4;
  const HANDLE = Math.max(60, Math.round(trackW * 0.4)); // handle = 40% of track
  const maxX = Math.max(0, trackW - HANDLE - PAD * 2);

  /* The slider must travel the FULL track to count, but it fires the instant it
     lands at the end — no need to lift the finger. firedRef guards re-firing. */
  const firedRef = useRef(false);
  const END_TOLERANCE = 2; // px, so a pixel-perfect end isn't required

  const moveTo = (clientX: number) => {
    const t = trackRef.current;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const nx = Math.max(0, Math.min(clientX - rect.left - HANDLE / 2, maxX));
    setX(nx);
    if (!firedRef.current && maxX > 0 && nx >= maxX - END_TOLERANCE) {
      firedRef.current = true;
      finish();
    }
  };
  const finish = () => {
    setDone(true);
    setX(maxX);
    onConfirm();
    window.setTimeout(() => { setDone(false); setX(0); firedRef.current = false; }, 420);
  };
  const onDown = (e: React.PointerEvent) => {
    if (disabled || done) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    firedRef.current = false;
  };
  const onMove = (e: React.PointerEvent) => { if (draggingRef.current) moveTo(e.clientX); };
  const onUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (!firedRef.current) setX(0); // released short of the line — snap back
  };

  const pct = maxX > 0 ? x / maxX : 0;

  return (
    <div
      ref={trackRef}
      className="relative w-full h-[46px] rounded-full overflow-hidden select-none"
      style={{ background: disabled ? "var(--bg-input)" : "var(--bg-elevated)", border: "1px solid var(--border)", opacity: disabled ? 0.5 : 1, touchAction: "none" }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled && !done) { e.preventDefault(); finish(); } }}
    >
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: x + HANDLE + PAD, background: "var(--brand-light)", opacity: 0.16 + pct * 0.5, transition: draggingRef.current ? "none" : "width 0.25s ease, opacity 0.25s ease" }} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingLeft: HANDLE + 8, paddingRight: 12 }}>
        <span className="text-sm font-semibold truncate" style={{ color: done ? "var(--accent-text)" : "var(--text-secondary)", opacity: 1 - pct * 0.85 }}>
          {done ? "¡Puja enviada!" : label}
        </span>
      </div>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="absolute flex items-center justify-center rounded-full cursor-grab active:cursor-grabbing gap-0.5"
        style={{ top: PAD, left: PAD, bottom: PAD, width: HANDLE, transform: `translateX(${x}px)`, background: "var(--brand-light)", color: "var(--brand-ink)", boxShadow: "0 2px 12px color-mix(in srgb, var(--brand) 45%, transparent)", transition: draggingRef.current ? "none" : "transform 0.25s cubic-bezier(0.22,1,0.36,1)" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </div>
    </div>
  );
}

/* ─── Bid Panel ─────────────────────────────────────────── */
function BidPanel({
  auction: a,
  initialBids,
  currentBid: initialCurrentBid,
  startingBid,
  totalBids,
  itemId,
  isSeller,
  activeItem,
}: {
  auction: ApiAuction;
  initialBids: BidRow[];
  currentBid: number;
  startingBid: number;
  totalBids: number;
  itemId?: string;
  isSeller?: boolean;
  activeItem?: ApiAuctionItem;
}) {
  const { user } = useAuth();
  const { capture } = useAnalytics();
  const [bids, setBids] = useState<BidRow[]>(initialBids);
  const [bidAmount, setBidAmount] = useState(Math.max(initialCurrentBid + 100, startingBid));
  const [justBid, setJustBid] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const [watchloading, setWatchloading] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [hasAddress, setHasAddress] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setHasAddress(false); return; }
    usersApi.me()
      .then(r => setHasAddress(!!r.data.zipCode))
      .catch(() => setHasAddress(false));
  }, [user?.id]);

  const [showMaxBid, setShowMaxBid] = useState(false);
  const [maxBidAmount, setMaxBidAmount] = useState(0);
  const [settingMaxBid, setSettingMaxBid] = useState(false);
  const [activeMaxBid, setActiveMaxBid] = useState<number | null>(null);

  // Fix 19: Reset bid amount when the active item changes
  useEffect(() => {
    setBidAmount(Math.max(initialCurrentBid + 100, startingBid));
  }, [itemId]);

  // Fix 20: Reset bids list when the active item changes
  useEffect(() => {
    setBids(initialBids);
  }, [itemId]);

  const currentBid = bids[0]?.amount ?? initialCurrentBid;

  async function toggleWatchlist() {
    if (!user || watchloading) return;
    setWatchloading(true);
    try {
      if (watchlisted) {
        await watchlistApi.remove(a.id);
        setWatchlisted(false);
        capture("watchlist_removed", { auctionId: a.id });
      } else {
        await watchlistApi.add(a.id);
        setWatchlisted(true);
        capture("watchlist_added", { auctionId: a.id });
      }
    } catch {}
    finally { setWatchloading(false); }
  }

  async function placeBid() {
    if (bidAmount <= currentBid || placing) return;
    setPlacing(true);
    try {
      if (itemId) {
        await auctionsApi.bid(itemId, bidAmount);
      }
      setBids([{ user: user?.username ?? "Tú", amount: bidAmount, time: "ahora" }, ...bids]);
      setBidAmount(bidAmount + 100);
      setJustBid(true);
      setTimeout(() => setJustBid(false), 2500);
      capture("bid_placed", { auctionId: a.id, itemId, amount: bidAmount });
      if (itemId) {
        auctionsApi.get(a.id).then(r => {
          const serverItem = r.data.items?.find(i => i.id === itemId);
          if (serverItem?.bids) {
            setBids(serverItem.bids.map(b => ({
              user: b.bidder?.username ?? "—",
              amount: b.amount,
              time: new Date(b.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
            })));
          }
        }).catch(() => {});
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Error al enviar la puja. Intenta de nuevo.";
      setBidError(msg);
      setTimeout(() => setBidError(null), 3000);
    } finally {
      setPlacing(false);
    }
  }

  async function submitMaxBid() {
    if (!itemId || maxBidAmount <= currentBid || settingMaxBid) return;
    setSettingMaxBid(true);
    try {
      await auctionsApi.maxBid(itemId, maxBidAmount);
      setActiveMaxBid(maxBidAmount);
      setShowMaxBid(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Error al configurar puja máxima.";
      setBidError(msg);
      setTimeout(() => setBidError(null), 3000);
    } finally {
      setSettingMaxBid(false);
    }
  }

  const isLiveOrEnding = a.status === "live" || a.status === "ending";

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
    >
      {/* ── Carta activa ── */}
      {activeItem && isLiveOrEnding && (
        <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-muted)" }}>
                En subasta ahora
              </p>
              <p className="font-black text-base truncate" style={{ color: "var(--text-primary)" }}>
                {activeItem.cardName}
              </p>
            </div>
            {activeItem.category && (
              <span
                className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)" }}
              >
                {activeItem.category}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Precio + timer ── */}
      <div className="px-4 py-4 flex items-end justify-between gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            {(a.status === "upcoming" || a.status === "scheduled") ? "Precio inicial" : "Puja más alta"}
          </p>
          <p className="text-3xl font-black leading-none" style={{ color: "var(--text-primary)" }}>
            ${(currentBid / 100).toLocaleString("es-MX")}
            <span className="text-sm font-normal ml-1" style={{ color: "var(--text-muted)" }}>MXN</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <div
            className="inline-block px-3 py-1.5 rounded-xl font-mono font-black text-lg"
            style={{
              background: a.status === "live" ? "rgba(239,68,68,0.12)" : "var(--bg-elevated)",
              color: a.status === "live" ? "#ef4444" : "var(--text-primary)",
              border: a.status === "live" ? "1px solid rgba(239,68,68,0.25)" : "1px solid var(--border-subtle)",
            }}
          >
            {formatTimer(a.endTime ?? activeItem?.closesAt)}
          </div>
          {isSeller && (
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              {bids.length || totalBids} puja{(bids.length || totalBids) !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* ── Acciones ── */}
      {isLiveOrEnding ? (
        <div className="p-4 flex flex-col gap-2.5">
          {justBid && (
            <div className="text-xs font-bold rounded-xl px-3 py-2 text-center text-green-400" style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)" }}>
              ✓ ¡Puja enviada!
            </div>
          )}
          {bidError && (
            <div className="text-xs font-bold rounded-xl px-3 py-2 text-center text-[var(--error-text)]" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {bidError}
            </div>
          )}

          {/* Bid amount (tens only, ±$20) + Max bid */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-stretch rounded-xl overflow-hidden" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
              <button type="button" aria-label="Bajar $20"
                onClick={() => setBidAmount((p) => Math.max(currentBid + 1000, Math.round((p - 2000) / 1000) * 1000))}
                className="px-4 text-xl font-bold" style={{ color: "var(--text-muted)" }}>−</button>
              <div className="flex-1 flex items-center justify-center gap-1 py-3 min-w-0">
                <span className="font-black text-base" style={{ color: "var(--text-muted)" }}>$</span>
                <input type="number" value={bidAmount / 100}
                  onChange={(e) => setBidAmount(Math.max(currentBid + 1000, Math.round(Number(e.target.value) / 10) * 1000))}
                  className="w-full min-w-0 bg-transparent text-center font-black text-lg outline-none"
                  style={{ color: "var(--text-primary)" }} min={(currentBid + 1000) / 100} step={10} />
              </div>
              <button type="button" aria-label="Subir $20"
                onClick={() => setBidAmount((p) => Math.round((p + 2000) / 1000) * 1000)}
                className="px-4 text-xl font-bold" style={{ color: "var(--text-muted)" }}>+</button>
            </div>
            <div className="relative shrink-0">
              <button type="button" onClick={() => setShowMaxBid((v) => !v)}
                className="h-full px-3 rounded-xl text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
                style={activeMaxBid
                  ? { background: "color-mix(in srgb, var(--brand) 12%, transparent)", border: "1px solid var(--border-brand)", color: "var(--accent-text)" }
                  : { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                ⚡ {activeMaxBid ? `$${(activeMaxBid / 100).toLocaleString("es-MX")}` : "Max bid"}
              </button>
              {showMaxBid && (
                <div className="absolute right-0 bottom-full mb-2 w-64 rounded-2xl p-3.5 z-30"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Max bid</p>
                  <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: "var(--text-muted)" }}>Pujamos por ti hasta este monto (múltiplos de $10).</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                    <input type="number" autoFocus
                      value={maxBidAmount ? maxBidAmount / 100 : ""}
                      onChange={(e) => setMaxBidAmount(Math.round(Number(e.target.value) / 10) * 1000)}
                      placeholder={String((currentBid + 20000) / 100)}
                      className="w-full rounded-xl pl-7 pr-2 py-2.5 font-bold text-sm"
                      style={{ background: "var(--bg-input)", border: `1px solid ${maxBidAmount > 0 && maxBidAmount <= currentBid ? "var(--error-text)" : "var(--border)"}`, color: "var(--text-primary)" }}
                      min={(currentBid + 1000) / 100} step={10} />
                  </div>
                  {maxBidAmount > 0 && maxBidAmount <= currentBid && (
                    <p className="text-[11px] mt-1.5" style={{ color: "var(--error-text)" }}>
                      Debe superar la puja actual (${(currentBid / 100).toLocaleString("es-MX")}).
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    {activeMaxBid && (
                      <button onClick={async () => { if (itemId) { try { await auctionsApi.cancelMaxBid(itemId); } catch {} } setActiveMaxBid(null); setMaxBidAmount(0); setShowMaxBid(false); }}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>Quitar</button>
                    )}
                    <button onClick={submitMaxBid} disabled={maxBidAmount <= currentBid || settingMaxBid}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                      style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                      {settingMaxBid ? "…" : "Activar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Confirm bid */}
          {!user ? (
            <Link href="/login" className="w-full h-[52px] rounded-full font-semibold text-sm flex items-center justify-center"
              style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
              Inicia sesión para pujar →
            </Link>
          ) : hasAddress === false ? (
            <Link href="/ajustes" className="w-full h-[52px] rounded-full font-semibold text-sm flex items-center justify-center"
              style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
              Agrega tu dirección para pujar →
            </Link>
          ) : isSeller ? (
            <div className="w-full h-[52px] rounded-full text-sm flex items-center justify-center"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
              No puedes pujar en tu subasta
            </div>
          ) : (
            <SlideToBid
              label={placing ? "Enviando…" : !itemId ? "Sin carta activa" : `Desliza · Pujar $${(bidAmount / 100).toLocaleString("es-MX")}`}
              disabled={!itemId || bidAmount <= currentBid || placing || hasAddress === null}
              onConfirm={placeBid}
            />
          )}

          {/* BIN button */}
          {a.binPrice && itemId && (
            <button
              onClick={async () => {
                if (!user || placing) return;
                setPlacing(true);
                try {
                  await auctionsApi.bid(itemId, a.binPrice!);
                  setBids([{ user: user.username, amount: a.binPrice!, time: "ahora" }, ...bids]);
                  setJustBid(true);
                  setTimeout(() => setJustBid(false), 2500);
                  capture("bin_used", { auctionId: a.id, itemId, amount: a.binPrice });
                } catch (err: any) {
                  const msg = err?.response?.data?.message ?? "Error al comprar. Intenta de nuevo.";
                  setBidError(msg);
                  setTimeout(() => setBidError(null), 3000);
                } finally {
                  setPlacing(false);
                }
              }}
              disabled={placing || !user || hasAddress === false || hasAddress === null}
              className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all text-white disabled:opacity-40"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
            >
              Comprar ya — ${(a.binPrice / 100).toLocaleString("es-MX")} MXN
            </button>
          )}
        </div>
      ) : (
        <div className="p-4">
          <button
            onClick={toggleWatchlist}
            disabled={watchloading}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
            style={watchlisted
              ? { background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80" }
              : { background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.4)", color: "var(--accent-text)" }
            }
          >
            {watchlisted ? "✓ En seguimiento" : watchloading ? "Guardando..." : "🔔 Recordarme cuando inicie"}
          </button>
          {a.endTime && (
            <p className="text-xs text-center mt-2" style={{ color: "var(--text-muted)" }}>
              Inicia en {formatTimer(a.endTime)}
            </p>
          )}
        </div>
      )}

      {/* ── Bid history ── */}
      {bids.length > 0 && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mt-4 mb-2.5" style={{ color: "var(--text-muted)" }}>
            Historial de pujas
          </p>
          <div
            className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-0.5"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(37,99,235,0.2) transparent" }}
          >
            {bids.map((bid, i) => {
              const isLatest = i === 0;
              const isMe = bid.user === (user?.username ?? "");
              const initial = (bid.user || "?").charAt(0).toUpperCase();
              return (
                <div
                  key={i}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                  style={
                    isLatest
                      ? { background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.25)" }
                      : { background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }
                  }
                >
                  {/* Avatar */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                    style={{
                      background: isMe ? "linear-gradient(135deg, #2563EB, #3B82F6)" : "var(--bg-hover)",
                      color: isMe ? "#fff" : "var(--text-secondary)",
                      border: isLatest ? "1px solid rgba(37,99,235,0.4)" : "1px solid var(--border)",
                    }}
                  >
                    {initial}
                  </div>
                  {/* Name + time */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p
                        className="text-xs font-bold truncate leading-none"
                        style={{ color: isMe ? "var(--accent-text)" : "var(--text-primary)" }}
                      >
                        {bid.user}
                      </p>
                      {isLatest && (
                        <span
                          className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(37,99,235,0.2)", color: "var(--accent-text)" }}
                        >
                          TOP
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {bid.time}
                    </p>
                  </div>
                  {/* Amount */}
                  <p
                    className="text-sm font-black shrink-0"
                    style={{ color: isLatest ? "var(--accent-text)" : "var(--text-primary)" }}
                  >
                    ${(bid.amount / 100).toLocaleString("es-MX")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
