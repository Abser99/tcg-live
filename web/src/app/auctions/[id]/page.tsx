"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ErrorBoundary from "@/components/ErrorBoundary";
import PokemonCardSearch from "@/components/PokemonCardSearch";
import { Room, RoomEvent, Track } from "livekit-client";
import { auctionsApi, watchlistApi, usersApi, type ApiAuction, type ApiAuctionItem } from "@/lib/api";
import { censorText } from "@/lib/profanity";
import { formatTimer, gameLabel } from "@/lib/format";
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
  const autoStream = searchParams.get("stream") === "1";
  const [auction, setAuction] = useState<ApiAuction | null>(null);
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
            {/* Left panel: stream video OR product card */}
            <div className="order-1 lg:col-start-1 lg:row-start-1">
              {auction.isStream
                ? <StreamPanel auction={auction} gradient={gradient} glow={glow} autoStream={autoStream} onAuctionUpdate={setAuction} />
                : <ProductPanel auction={auction} gradient={gradient} glow={glow} activeItem={item} isSeller={isSeller} onAuctionUpdate={setAuction} />
              }
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
  const title      = a.title ?? a.name ?? "Sin título";
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
function StreamPanel({ auction: a, gradient, glow, autoStream = false, onAuctionUpdate }: {
  auction: ApiAuction;
  gradient: string;
  glow: string;
  autoStream?: boolean;
  onAuctionUpdate?: (a: ApiAuction) => void;
}) {
  const { user } = useAuth();
  const { capture } = useAnalytics();
  const isSeller = !!user && (
    user.id === (a as any).sellerId ||
    user.id === a.seller?.id
  );
  const isLive   = a.status === "live" || a.status === "ending";

  const roomRef        = useRef<Room | null>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
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
  const [chatMessages, setChatMessages] = useState<{ username: string; text: string; ts: number }[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const chatBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLive || !user || !a.isStream) return;
    let alive = true;
    const room = new Room();
    roomRef.current = room;

    if (!isSeller) {
      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (!alive) return;
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          setHasRemoteVideo(true);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
        if (track.kind === Track.Kind.Video) {
          track.detach();
          if (alive) setHasRemoteVideo(false);
        }
      });
    }

    room.on(RoomEvent.Reconnecting, () => { if (alive) setRoomConnected(false); });
    room.on(RoomEvent.Reconnected,  () => { if (alive) setRoomConnected(true); });

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
    if (box) box.scrollTop = box.scrollHeight;
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
        }
      } catch {}
    });
  }

  async function sendChat() {
    if (!chatInput.trim() || !roomRef.current || !user) return;
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

  async function addCard() {
    if (!cardName.trim() || !cardPrice) return;
    setAddingCard(true);
    setAddCardError("");
    try {
      const res = await auctionsApi.addItem(a.id, {
        cardName:        cardName.trim(),
        startingPrice:   Math.round(Number(cardPrice) * 100),
        durationSeconds: Number(cardDuration),
        category:        cardCategory,
        imageUrls:       cardImageUrl ? [cardImageUrl] : undefined,
      });
      onAuctionUpdate?.(res.data);
      setCardName("");
      setCardImageUrl("");
      setCardPrice("");
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
  const title      = a.title ?? a.name ?? "Sin título";
  const sellerName = a.seller?.username ?? a.sellerName ?? "—";
  const verified   = a.seller?.verified;
  const timer      = formatTimer(a.endTime);
  const showVideo  = streaming || hasRemoteVideo;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
    >

      {/* ── Video area ── */}
      <div className="relative aspect-video flex items-center justify-center overflow-hidden" style={{ background: "#050508" }}>

        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSeller}
          disablePictureInPicture
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: showVideo ? "block" : "none" }}
        />

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
            {/* EN VIVO badge when live */}
            {isLive && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                <div
                  className="flex items-center gap-2 px-4 py-2 rounded-full"
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)" }}
                >
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-black tracking-widest uppercase" style={{ color: "#ef4444" }}>EN VIVO</span>
                </div>
                {!isSeller && (
                  <p className="text-xs animate-pulse" style={{ color: "var(--text-muted)" }}>
                    Esperando al vendedor...
                  </p>
                )}
              </div>
            )}
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

        {/* Status + viewers */}
        <div className="absolute top-4 left-4 flex items-center gap-3 z-10">
          <div
            className="flex items-center gap-1.5 text-white text-xs font-black px-3 py-1.5 rounded-full"
            style={{ background: status?.bg, boxShadow: `0 0 14px ${status?.bg ?? "#2563EB"}80` }}
          >
            {a.status === "live" && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
            {status?.text ?? a.status}
          </div>
          {a.status !== "upcoming" && a.status !== "scheduled" && isSeller && (
            <div
              className="flex items-center gap-1.5 backdrop-blur-sm text-xs px-2.5 py-1.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.75)" }}
            >
              👁 {a.viewers ?? 0} viendo
            </div>
          )}
        </div>

        {/* Timer */}
        {a.endTime && (
          <div
            className="absolute top-4 right-4 backdrop-blur-sm text-white font-mono font-black text-lg px-3 py-1 rounded-xl z-10"
            style={{ background: "rgba(0,0,0,0.72)" }}
          >
            {timer}
          </div>
        )}

        {/* Seller info overlay */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/80 to-transparent z-10" />
        <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
          <Link
            href={`/tienda/${sellerName}`}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors"
            style={{ background: "var(--bg-elevated)", border: "1px solid rgba(255,255,255,0.15)" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(37,99,235,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          >
            🧑
          </Link>
          <div>
            <Link
              href={`/tienda/${sellerName}`}
              className="text-white text-sm font-bold leading-none hover:underline transition-colors"
            >
              {sellerName} {verified && <span style={{ color: "var(--accent-text)" }}>✓</span>}
            </Link>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Vendedor</p>
          </div>
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
                  style={{ background: "linear-gradient(135deg, #2563EB, #FFCB05)" }}
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

      {/* ── Chat en vivo ── */}
      <div className="p-4" style={{ background: "var(--bg-base)", borderTop: "1px solid var(--border-subtle)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
          Chat en vivo
        </p>
        {isLive && !roomConnected && roomRef.current && (
          <p className="text-xs text-amber-400 text-center mb-2 animate-pulse">Reconectando...</p>
        )}
        <div
          ref={chatBoxRef}
          className="h-36 overflow-y-auto flex flex-col gap-1.5 mb-3 pr-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(37,99,235,0.2) transparent" }}
        >
          {chatMessages.length === 0 ? (
            <p className="text-xs text-center mt-4" style={{ color: "var(--text-muted)" }}>
              {isLive ? "Sé el primero en escribir…" : "El chat estará activo durante el stream"}
            </p>
          ) : (
            chatMessages.slice(-50).map((m, i) => (
              <div key={i} className="text-xs leading-snug">
                <span
                  className="font-bold"
                  style={{ color: m.username === user?.username ? "var(--accent-text)" : "#60a5fa" }}
                >
                  {m.username}
                </span>
                <span className="ml-1.5" style={{ color: "var(--text-secondary)" }}>{m.text}</span>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) sendChat(); }}
            placeholder={!user ? "Inicia sesión para chatear" : !roomRef.current ? "Conéctate al stream para chatear" : "Escribe un mensaje…"}
            disabled={!user || !roomRef.current}
            className="flex-1 rounded-xl px-3 py-2 text-sm disabled:opacity-40 placeholder:text-zinc-600"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = "rgba(37,99,235,0.5)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
          />
          <button
            onClick={sendChat}
            disabled={!user || !roomRef.current || !chatInput.trim()}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
            style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Card Info ─────────────────────────────────────────── */
function CardInfo({ auction: a, isSeller }: { auction: ApiAuction; isSeller?: boolean }) {
  const title = a.title ?? a.name ?? "Sin título";
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

          {/* Quick increment buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {[{ label: 50, cents: 5000 }, { label: 100, cents: 10000 }, { label: 200, cents: 20000 }, { label: 500, cents: 50000 }].map(({ label, cents }) => (
              <button
                key={label}
                onClick={() => setBidAmount((prev) => Math.max(currentBid + 100, prev + cents))}
                className="py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "rgba(37,99,235,0.12)";
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.4)";
                  e.currentTarget.style.color = "var(--accent-text)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "var(--bg-elevated)";
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                +${label}
              </button>
            ))}
          </div>

          {/* Bid input + button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-base" style={{ color: "var(--text-muted)" }}>$</span>
              <input
                type="number"
                value={bidAmount / 100}
                onChange={(e) => setBidAmount(Math.round(Number(e.target.value) * 100))}
                className="w-full rounded-xl pl-8 pr-3 py-3.5 font-black text-lg"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)";
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                min={(currentBid + 100) / 100}
                step={1}
              />
            </div>
            {!user ? (
              <Link
                href="/login"
                className="shrink-0 px-5 py-3.5 rounded-xl font-black text-white text-sm flex items-center"
                style={{ background: "rgba(37,99,235,0.4)", border: "1px solid rgba(37,99,235,0.5)" }}
              >
                Login →
              </Link>
            ) : hasAddress === false ? (
              <Link
                href="/ajustes"
                className="shrink-0 px-3 py-3.5 rounded-xl font-black text-white text-xs flex items-center text-center leading-tight"
                style={{ background: "rgba(37,99,235,0.3)", border: "1px solid rgba(37,99,235,0.4)" }}
              >
                + Dirección
              </Link>
            ) : isSeller ? (
              <div
                className="shrink-0 px-4 py-3.5 rounded-xl text-xs text-center"
                style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
              >
                Tu subasta
              </div>
            ) : (
              <button
                onClick={placeBid}
                disabled={!itemId || bidAmount <= currentBid || placing || hasAddress === null}
                className="shrink-0 px-5 py-3.5 rounded-xl font-black text-white text-sm transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                  boxShadow: itemId && bidAmount > currentBid ? "0 4px 20px rgba(37,99,235,0.5)" : "none",
                }}
              >
                {placing ? "…" : !itemId ? "Sin carta" : hasAddress === null ? "…" : "Pujar →"}
              </button>
            )}
          </div>

          {/* Auto-puja */}
          {activeMaxBid ? (
            <div
              className="rounded-xl px-3 py-2.5 flex items-center justify-between"
              style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)" }}
            >
              <div>
                <p className="text-[10px] font-bold" style={{ color: "var(--accent-text)" }}>⚡ Auto-puja activa</p>
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  hasta ${(activeMaxBid / 100).toLocaleString("es-MX")}
                </p>
              </div>
              <button
                onClick={async () => {
                  if (itemId) {
                    try { await auctionsApi.cancelMaxBid(itemId); } catch {}
                  }
                  setActiveMaxBid(null);
                  setMaxBidAmount(0);
                }}
                className="text-[10px] transition-colors"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--error-text)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                ✕ Cancelar
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={() => setShowMaxBid((v) => !v)}
                className="w-full py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--border-brand)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                {showMaxBid ? "✕ Cerrar" : "⚡ Puja automática"}
              </button>
              {showMaxBid && (
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm" style={{ color: "var(--text-muted)" }}>$</span>
                    <input
                      type="number"
                      value={maxBidAmount ? maxBidAmount / 100 : ""}
                      onChange={(e) => setMaxBidAmount(Math.round(Number(e.target.value) * 100))}
                      placeholder={String((currentBid + 20000) / 100)}
                      className="w-full rounded-xl pl-7 pr-2 py-2.5 font-bold text-sm placeholder:text-zinc-600"
                      style={{
                        background: "var(--bg-input)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                      min={(currentBid + 100) / 100}
                      step={1}
                    />
                  </div>
                  <button
                    onClick={submitMaxBid}
                    disabled={maxBidAmount <= currentBid || settingMaxBid}
                    className="shrink-0 px-4 py-2.5 rounded-xl font-bold text-white text-xs disabled:opacity-40"
                    style={{ background: "rgba(37,99,235,0.5)", border: "1px solid rgba(37,99,235,0.4)" }}
                  >
                    {settingMaxBid ? "…" : "Activar"}
                  </button>
                </div>
              )}
            </div>
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
