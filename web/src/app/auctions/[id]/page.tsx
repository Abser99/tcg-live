"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Room, RoomEvent, Track } from "livekit-client";
import { auctionsApi, watchlistApi, usersApi, type ApiAuction, type ApiAuctionItem } from "@/lib/api";
import { censorText } from "@/lib/profanity";
import { formatTimer } from "@/lib/format";
import { useAuth } from "@/contexts/auth";
import { useAnalytics } from "@/hooks/useAnalytics";

const STATUS_LABEL: Record<string, { text: string; bg: string }> = {
  live:      { text: "EN VIVO",        bg: "#ef4444" },
  ending:    { text: "TERMINA PRONTO", bg: "#f59e0b" },
  upcoming:  { text: "PROGRAMADA",     bg: "#6C3AE8" },
  scheduled: { text: "PROGRAMADA",     bg: "#6C3AE8" },
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
  "rgba(139,92,246,0.4)",
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

  // All hooks must be called unconditionally before any early returns
  // (React Rules of Hooks). useAuth must come before the loading/null guards.
  const { user } = useAuth();

  useEffect(() => {
    auctionsApi.get(id)
      .then((r) => setAuction(r.data))
      .catch(() => setAuction(null))
      .finally(() => setLoading(false));
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
      <div className="min-h-screen bg-[#0F0F14] text-white">
        <Navbar />
        <div className="pt-24 mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-[1fr_380px] gap-8 animate-pulse">
            <div className="space-y-4">
              <div className="rounded-2xl bg-[#16161E] aspect-video" />
              <div className="rounded-2xl bg-[#16161E] h-48" />
            </div>
            <div className="rounded-2xl bg-[#16161E] h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen bg-[#0F0F14] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-xl font-bold">Subasta no encontrada</p>
          <Link href="/auctions" className="text-[#a78bfa] mt-4 inline-block hover:underline">
            ← Volver a subastas
          </Link>
        </div>
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
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />
      <div className="pt-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <Link
            href="/auctions"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors"
          >
            ← Subastas
          </Link>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-16">
          <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
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
      </div>
    </div>
  );
}

export default function AuctionDetailPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="min-h-screen bg-[#0F0F14]" />}>
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
  const STATUS_LABEL: Record<string, { text: string; bg: string }> = {
    live:      { text: "EN VIVO",        bg: "#ef4444" },
    ending:    { text: "TERMINA PRONTO", bg: "#f59e0b" },
    upcoming:  { text: "PROGRAMADA",     bg: "#6C3AE8" },
    scheduled: { text: "PROGRAMADA",     bg: "#6C3AE8" },
    ended:     { text: "TERMINADA",      bg: "#52525b" },
    cancelled: { text: "CANCELADA",      bg: "#52525b" },
  };
  const status = STATUS_LABEL[a.status ?? "upcoming"];

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
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Product image area */}
      <div className="relative bg-[#050508] flex items-center justify-center overflow-hidden" style={{ minHeight: 280 }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-contain max-h-72"
          />
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${glow} 0%, transparent 65%)`, opacity: 0.5 }} />
            <div className={`relative w-36 h-48 rounded-2xl bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-2 shadow-2xl`} style={{ boxShadow: `0 0 60px ${glow}` }}>
              <span className="text-6xl">🃏</span>
              <span className="text-white text-xs font-black tracking-widest opacity-90 text-center px-2">{title.toUpperCase().slice(0, 14)}</span>
            </div>
          </>
        )}

        {/* Status badge */}
        <div className="absolute top-4 left-4 z-10">
          <div className="flex items-center gap-1.5 text-white text-xs font-black px-3 py-1.5 rounded-full" style={{ background: status?.bg }}>
            {a.status === "live" && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
            {status?.text ?? a.status}
          </div>
        </div>

        {/* Seller info */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent z-10" />
        <div className="absolute bottom-3 left-4 flex items-center gap-2 z-10">
          <Link href={`/tienda/${sellerName}`} className="w-8 h-8 rounded-full bg-[#1E1E2A] border border-white/20 flex items-center justify-center text-sm hover:border-[#6C3AE8]/50 transition-colors">🧑</Link>
          <div>
            <Link href={`/tienda/${sellerName}`} className="text-white text-sm font-bold leading-none hover:text-[#a78bfa] transition-colors">
              {sellerName} {verified && <span className="text-[#a78bfa]">✓</span>}
            </Link>
            <p className="text-zinc-400 text-xs">Vendedor</p>
          </div>
        </div>
      </div>

      {/* Title + condition */}
      <div className="px-5 py-4 border-b border-white/5">
        <h1 className="font-black text-lg leading-tight text-white">{title}</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {a.game && <span className="text-xs text-zinc-500">{a.game}</span>}
          {activeItem?.condition && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}>
              {activeItem.condition}
            </span>
          )}
          {a.description && <p className="text-xs text-zinc-500 w-full mt-1">{a.description}</p>}
        </div>
      </div>

      {/* Seller end button */}
      {isSeller && a.status === "live" && (
        <div className="px-5 py-3">
          {!confirmEnd ? (
            <button
              onClick={() => setConfirmEnd(true)}
              className="w-full py-2 rounded-xl text-xs font-semibold text-zinc-400 border border-white/10 hover:border-red-500/40 hover:text-red-400 transition-all"
            >
              Terminar subasta
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={endAuction}
                disabled={endingAuction}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-all disabled:opacity-60"
              >
                {endingAuction ? "Terminando..." : "Confirmar"}
              </button>
              <button onClick={() => setConfirmEnd(false)} className="flex-1 py-2 rounded-xl text-xs text-zinc-400 border border-white/10">
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
            className="py-2 px-4 rounded-xl text-xs font-semibold text-zinc-500 border border-white/10 hover:border-red-500/30 hover:text-red-400 transition-all disabled:opacity-60"
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
  // Only use stable IDs for seller detection — username comparison is unreliable
  // (username changes, collisions, case sensitivity).
  const isSeller = !!user && (
    user.id === (a as any).sellerId ||
    user.id === a.seller?.id
  );
  const isLive   = a.status === "live" || a.status === "ending";

  const roomRef        = useRef<Room | null>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  const startingRef    = useRef(false); // prevents double startStream() calls
  const [streaming,      setStreaming]      = useState(false);
  const [connecting,     setConnecting]     = useState(false);
  const [roomConnected,  setRoomConnected]  = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [micMuted,       setMicMuted]       = useState(false);
  const [camOff,         setCamOff]         = useState(false);
  const [streamError,    setStreamError]    = useState<string | null>(null);
  const [endingAuction,  setEndingAuction]  = useState(false);
  const [confirmEnd,     setConfirmEnd]     = useState(false);

  // Panel agregar carta
  const [cardName,      setCardName]      = useState("");
  const [cardPrice,     setCardPrice]     = useState("");
  const [cardDuration,  setCardDuration]  = useState("60");
  const [cardCategory,  setCardCategory]  = useState("carta");
  const [addingCard,    setAddingCard]    = useState(false);
  const [addCardError,  setAddCardError]  = useState("");
  const [closingItem,   setClosingItem]   = useState(false);
  const [closeItemMsg,  setCloseItemMsg]  = useState("");

  // Panel minijuego
  const [showMinigame,    setShowMinigame]    = useState(false);
  const [streamWinners,   setStreamWinners]   = useState<{ username: string; category: string; itemName: string }[]>([]);
  const [mgCategory,      setMgCategory]      = useState("todos");
  const [mgSpinning,      setMgSpinning]      = useState(false);
  const [mgWinner,        setMgWinner]        = useState<string | null>(null);
  const mgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chat en vivo
  const [chatMessages, setChatMessages] = useState<{ username: string; text: string; ts: number }[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const chatBoxRef = useRef<HTMLDivElement>(null);

  // Everyone (seller + viewers) auto-connect for chat/video — only for stream auctions
  useEffect(() => {
    if (!isLive || !user || !a.isStream) return;
    let alive = true;
    const room = new Room();
    roomRef.current = room;

    // Viewers subscribe to video tracks
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

    auctionsApi.livekitToken(a.id)
      .then(({ data }) => {
        if (!alive) return;
        return room.connect(data.wsUrl, data.token).then(() => { if (alive) setRoomConnected(true); });
      })
      .catch(() => {});

    return () => {
      alive = false;
      setRoomConnected(false);
      room.disconnect();
      roomRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, a.id]);

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
    // Enforce the same 200-char limit the backend socket.io handler uses
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

  // Auto-start stream when seller arrives via "Iniciar Livestream" button
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
      });
      onAuctionUpdate?.(res.data);
      setCardName("");
      setCardPrice("");
    } catch (err: any) {
      setAddCardError(err?.response?.data?.message ?? "Error al agregar la carta");
    } finally {
      setAddingCard(false);
    }
  }

  // Track buyers who win items during this stream (poll auction items for new winners)
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
    return () => { if (mgIntervalRef.current) clearInterval(mgIntervalRef.current); };
  }, []);

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

  async function startStream() {
    if (startingRef.current || streaming) return; // prevent double-call
    startingRef.current = true;
    setConnecting(true);
    setStreamError(null);
    try {
      // Reuse existing room connection (auto-connected for chat); create new one only if needed
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

      // Try camera and mic independently — missing device warns but doesn't abort stream
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
    // Disable camera/mic but keep room alive for chat
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
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>

      {/* ── Video area ── */}
      <div className="relative bg-[#050508] aspect-video flex items-center justify-center overflow-hidden">

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
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${glow} 0%, transparent 65%)`, opacity: 0.5 }} />
            <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)" }} />
            <div className={`relative w-36 h-48 rounded-2xl bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-2 shadow-2xl`} style={{ boxShadow: `0 0 60px ${glow}` }}>
              <span className="text-6xl">🃏</span>
              <span className="text-white text-xs font-black tracking-widest opacity-90 text-center px-2">{title.toUpperCase().slice(0, 12)}</span>
            </div>
            {isLive && !isSeller && (
              <p className="absolute bottom-16 left-1/2 -translate-x-1/2 text-xs text-zinc-500 whitespace-nowrap animate-pulse">
                Esperando al vendedor...
              </p>
            )}
          </>
        )}

        {/* Status + viewers */}
        <div className="absolute top-4 left-4 flex items-center gap-3 z-10">
          <div className="flex items-center gap-1.5 text-white text-xs font-black px-3 py-1.5 rounded-full" style={{ background: status?.bg, boxShadow: `0 0 14px ${status?.bg ?? "#6C3AE8"}80` }}>
            {a.status === "live" && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
            {status?.text ?? a.status}
          </div>
          {a.status !== "upcoming" && a.status !== "scheduled" && isSeller && (
            <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-zinc-300 text-xs px-2.5 py-1.5 rounded-full">
              👁 {a.viewers ?? 0} viendo
            </div>
          )}
        </div>

        {/* Timer — only when there's a real countdown */}
        {a.endTime && (
          <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm text-white font-mono font-black text-lg px-3 py-1 rounded-xl z-10">
            {timer}
          </div>
        )}

        {/* Seller info */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/80 to-transparent z-10" />
        <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
          <Link href={`/tienda/${sellerName}`} className="w-8 h-8 rounded-full bg-[#1E1E2A] border border-white/20 flex items-center justify-center text-sm hover:border-[#6C3AE8]/50 transition-colors">🧑</Link>
          <div>
            <Link href={`/tienda/${sellerName}`} className="text-white text-sm font-bold leading-none hover:text-[#a78bfa] transition-colors">
              {sellerName} {verified && <span className="text-[#a78bfa]">✓</span>}
            </Link>
            <p className="text-zinc-400 text-xs">Vendedor</p>
          </div>
        </div>

        {/* Seller streaming controls (overlay) */}
        {isSeller && streaming && (
          <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
            <button onClick={toggleMic} title={micMuted ? "Activar micrófono" : "Silenciar"} className="w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-all" style={{ background: micMuted ? "rgba(239,68,68,0.8)" : "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              {micMuted ? "🔇" : "🎤"}
            </button>
            <button onClick={toggleCam} title={camOff ? "Activar cámara" : "Apagar cámara"} className="w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-all" style={{ background: camOff ? "rgba(239,68,68,0.8)" : "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              {camOff ? "📵" : "📹"}
            </button>
          </div>
        )}
      </div>

      {/* ── Seller start/stop controls ── */}
      {isSeller && isLive && (
        <div className="px-4 py-3 border-b border-white/5" style={{ background: "rgba(108,58,232,0.06)" }}>
          {streamError && (
            <p className="text-xs text-red-400 mb-2">{streamError}</p>
          )}
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
                  ? { background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid rgba(239,68,68,0.4)" }
                  : { background: "rgba(113,113,122,0.15)", color: "#a1a1aa", border: "1px solid rgba(113,113,122,0.25)" }}
              >
                {endingAuction ? "..." : confirmEnd ? "¿Confirmar?" : "Terminar subasta"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-red-400">EN VIVO</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={stopStream}
                  className="text-xs font-bold px-3 py-2 rounded-xl transition-all"
                  style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  Pausar stream
                </button>
                <button
                  onClick={endAuction}
                  disabled={endingAuction}
                  className="text-xs font-bold px-3 py-2 rounded-xl transition-all disabled:opacity-60"
                  style={confirmEnd
                    ? { background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid rgba(239,68,68,0.4)" }
                    : { background: "rgba(113,113,122,0.15)", color: "#a1a1aa", border: "1px solid rgba(113,113,122,0.25)" }}
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
        <div className="border-t border-white/5" style={{ background: "#0d0d14" }}>

          {/* Carta activa actual */}
          {(() => {
            const activeItem = a.items?.find(i => i.status === "active");
            if (!activeItem) return null;
            const hasBids = (activeItem.currentBid ?? 0) > (activeItem.startingBid ?? 0) || (activeItem.bids?.length ?? 0) > 0;
            return (
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(108,58,232,0.08)", border: "1px solid rgba(108,58,232,0.15)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">En subasta</p>
                    <p className="text-sm font-bold text-white truncate">{activeItem.cardName}</p>
                    <p className="text-xs text-[#a78bfa]">${((activeItem.currentBid ?? activeItem.startingBid ?? 0) / 100).toLocaleString("es-MX")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {closeItemMsg && (
                      <p className="text-[11px] mb-1" style={{ color: closeItemMsg.startsWith("✓") ? "#4ade80" : "#f87171" }}>{closeItemMsg}</p>
                    )}
                    <button
                      onClick={() => !hasBids && closeActiveItem(activeItem.id)}
                      disabled={closingItem || hasBids}
                      title={hasBids ? "Tiene pujas — espera a que termine el tiempo" : "Cerrar sin ganador y pasar a la siguiente carta"}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                      style={hasBids
                        ? { background: "rgba(255,255,255,0.04)", color: "#52525b", cursor: "not-allowed" }
                        : { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      {closingItem ? "..." : hasBids ? "🔒 Tiene pujas" : "Saltar carta"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Tab toggle */}
          <div className="flex border-b border-white/5">
            {[
              { key: false, label: "🃏 Agregar carta" },
              { key: true,  label: `🎲 Minijuego${streamWinners.length > 0 ? ` (${streamWinners.length})` : ""}` },
            ].map(({ key, label }) => (
              <button
                key={String(key)}
                onClick={() => setShowMinigame(key)}
                className="flex-1 py-2.5 text-xs font-bold transition-all"
                style={showMinigame === key
                  ? { color: "#a78bfa", borderBottom: "2px solid #6C3AE8" }
                  : { color: "#52525b", borderBottom: "2px solid transparent" }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Agregar carta ── */}
          {!showMinigame && (
            <div className="p-3 flex flex-col gap-2">
              {addCardError && <p className="text-xs text-red-400">{addCardError}</p>}

              {/* Nombre + precio */}
              <div className="flex gap-2">
                <input
                  value={cardName}
                  onChange={e => setCardName(e.target.value)}
                  placeholder="Nombre de la carta..."
                  className="flex-1 bg-[#16161E] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/50"
                />
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                  <input
                    type="number" min={1}
                    value={cardPrice}
                    onChange={e => setCardPrice(e.target.value)}
                    placeholder="Precio"
                    className="w-full bg-[#16161E] border border-white/10 rounded-xl pl-6 pr-2 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/50"
                  />
                </div>
              </div>

              {/* Categoría + duración */}
              <div className="flex gap-2">
                <select
                  value={cardCategory}
                  onChange={e => setCardCategory(e.target.value)}
                  className="flex-1 bg-[#16161E] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#6C3AE8]/50"
                >
                  {["carta", "paquete", "caja", "expansión", "otro"].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
                <select
                  value={cardDuration}
                  onChange={e => setCardDuration(e.target.value)}
                  className="flex-1 bg-[#16161E] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#6C3AE8]/50"
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
                  style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                >
                  {addingCard ? "…" : "+ Subir"}
                </button>
              </div>
            </div>
          )}

          {/* ── Minijuego ── */}
          {showMinigame && (
            <div className="p-3 flex flex-col gap-3">
              {streamWinners.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-4">
                  Los compradores que ganen cartas en este stream aparecerán aquí.
                </p>
              ) : (
                <>
                  {/* Filtro por categoría */}
                  <div className="flex gap-1.5 flex-wrap">
                    {["todos", ...Array.from(new Set(streamWinners.map(w => w.category)))].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setMgCategory(cat)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                        style={mgCategory === cat
                          ? { background: "rgba(108,58,232,0.3)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.5)" }
                          : { background: "rgba(255,255,255,0.05)", color: "#71717a", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        {" "}({cat === "todos" ? streamWinners.length : streamWinners.filter(w => w.category === cat).length})
                      </button>
                    ))}
                  </div>

                  {/* Lista de elegibles */}
                  <div className="max-h-24 overflow-y-auto flex flex-col gap-1">
                    {(mgCategory === "todos" ? streamWinners : streamWinners.filter(w => w.category === mgCategory)).map((w, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <span className="font-bold text-[#a78bfa]">@{w.username}</span>
                        <span className="text-zinc-600">{w.itemName} · {w.category}</span>
                      </div>
                    ))}
                  </div>

                  {/* Resultado del spin */}
                  {mgWinner && (
                    <div
                      className="rounded-xl py-3 text-center"
                      style={{ background: mgSpinning ? "rgba(255,255,255,0.04)" : "rgba(74,222,128,0.1)", border: `1px solid ${mgSpinning ? "rgba(255,255,255,0.08)" : "rgba(74,222,128,0.3)"}` }}
                    >
                      {mgSpinning
                        ? <p className="text-sm font-black text-zinc-400 animate-pulse">@{mgWinner}</p>
                        : <>
                            <p className="text-[10px] text-green-400 font-bold uppercase tracking-widest mb-0.5">¡Ganador!</p>
                            <p className="text-lg font-black text-white">@{mgWinner}</p>
                          </>
                      }
                    </div>
                  )}

                  {/* Botón girar */}
                  <button
                    onClick={spinMinigame}
                    disabled={mgSpinning}
                    className="w-full py-2.5 rounded-xl font-black text-sm text-white disabled:opacity-60 transition-all"
                    style={{ background: "linear-gradient(135deg, #f59e0b, #f97316)", boxShadow: "0 4px 16px rgba(245,158,11,0.35)" }}
                  >
                    {mgSpinning ? "Girando…" : "🎲 Girar para elegir ganador"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Chat en vivo ── */}
      <div className="bg-[#0d0d14] border-t border-white/5 p-4">
        <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mb-3">Chat en vivo</p>
        {isLive && !roomConnected && roomRef.current && (
          <p className="text-xs text-amber-400 text-center mb-2 animate-pulse">Reconectando...</p>
        )}
        <div
          ref={chatBoxRef}
          className="h-36 overflow-y-auto flex flex-col gap-1.5 mb-3 pr-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}
        >
          {chatMessages.length === 0 ? (
            <p className="text-xs text-zinc-700 text-center mt-4">
              {isLive ? "Sé el primero en escribir…" : "El chat estará activo durante el stream"}
            </p>
          ) : (
            chatMessages.slice(-50).map((m, i) => (
              <div key={i} className="text-xs leading-snug">
                <span className="font-bold" style={{ color: m.username === user?.username ? "#a78bfa" : "#60a5fa" }}>
                  {m.username}
                </span>
                <span className="text-zinc-300 ml-1.5">{m.text}</span>
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
            className="flex-1 bg-[#16161E] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/50 disabled:opacity-40"
          />
          <button
            onClick={sendChat}
            disabled={!user || !roomRef.current || !chatInput.trim()}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
            style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
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

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-xl font-black">{title}</h1>
          <p className="text-zinc-500 text-sm">{a.game ?? ""}</p>
        </div>
        {a.condition && (
          <span
            className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg"
            style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.25)" }}
          >
            {a.condition}
          </span>
        )}
      </div>

      {a.description && (
        <p className="text-zinc-500 text-xs mb-3 leading-relaxed">{a.description}</p>
      )}

      <div className={`grid gap-3 ${isSeller ? "grid-cols-2" : "grid-cols-1"}`}>
        <div
          className="rounded-xl px-3 py-2.5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-[10px] text-zinc-600 mb-1">Vendedor</p>
          <Link href={`/tienda/${sellerName}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="text-base">🧑</span>
            <div>
              <p className="text-sm font-bold text-[#a78bfa]">
                {sellerName} {verified && <span>✓</span>}
              </p>
              <p className="text-[10px] text-zinc-600">{verified ? "Verificado" : "Ver tienda"}</p>
            </div>
          </Link>
        </div>
        {isSeller && (
          <div
            className="rounded-xl px-3 py-2.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-[10px] text-zinc-600 mb-1">Total de pujas</p>
            <p className="text-2xl font-black">{a.totalBids ?? 0}</p>
            <p className="text-[10px] text-zinc-600">participantes</p>
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
      // Reconcile with server truth
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
      style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* ── Carta activa ── */}
      {activeItem && isLiveOrEnding && (
        <div className="px-4 pt-3 pb-2 border-b border-white/5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">En subasta ahora</p>
              <p className="font-black text-base truncate text-white">{activeItem.cardName}</p>
            </div>
            {activeItem.category && (
              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}>
                {activeItem.category}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Precio + timer ── */}
      <div className="px-4 py-3 border-b border-white/5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">
            {(a.status === "upcoming" || a.status === "scheduled") ? "Precio inicial" : "Puja más alta"}
          </p>
          <p className="text-3xl font-black leading-none">
            ${(currentBid / 100).toLocaleString("es-MX")}
            <span className="text-sm text-zinc-500 font-normal ml-1">MXN</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-mono font-black text-white">{formatTimer(a.endTime ?? activeItem?.closesAt)}</p>
          {isSeller && (
            <p className="text-[10px] text-zinc-600 mt-0.5">{bids.length || totalBids} puja{(bids.length || totalBids) !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      {/* ── Top bidder (solo si hay pujas) ── */}
      {bids.length > 0 && (
        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[9px] bg-[#6C3AE8]/20 text-[#a78bfa] px-1.5 py-0.5 rounded font-black uppercase">TOP</span>
            <span className={`text-sm font-bold ${bids[0].user === (user?.username ?? "") ? "text-[#a78bfa]" : "text-white"}`}>
              {bids[0].user}
            </span>
          </div>
          <span className="text-sm font-black">${(bids[0].amount / 100).toLocaleString("es-MX")}</span>
        </div>
      )}

      {/* ── Acciones ── */}
      {isLiveOrEnding ? (
        <div className="p-3 flex flex-col gap-2">
          {justBid && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold rounded-lg px-3 py-2 text-center">
              ✓ ¡Puja enviada!
            </div>
          )}
          {bidError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-lg px-3 py-2 text-center">
              {bidError}
            </div>
          )}

          {/* Quick increments — labels in pesos, values in cents */}
          <div className="flex gap-1.5">
            {[{ label: 50, cents: 5000 }, { label: 100, cents: 10000 }, { label: 200, cents: 20000 }, { label: 500, cents: 50000 }].map(({ label, cents }) => (
              <button
                key={label}
                onClick={() => setBidAmount((prev) => Math.max(currentBid + 100, prev + cents))}
                className="flex-1 py-1.5 rounded-lg text-xs font-bold text-zinc-300 transition-colors"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                +${label}
              </button>
            ))}
          </div>

          {/* Input + button inline */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">$</span>
              <input
                type="number"
                value={bidAmount / 100}
                onChange={(e) => setBidAmount(Math.round(Number(e.target.value) * 100))}
                className="w-full bg-[#0F0F14] border border-white/15 rounded-xl pl-7 pr-2 py-3 text-white font-bold text-base focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
                min={(currentBid + 100) / 100}
                step={1}
              />
            </div>
            {!user ? (
              <Link
                href="/login"
                className="shrink-0 px-4 py-3 rounded-xl font-black text-white text-sm flex items-center"
                style={{ background: "rgba(108,58,232,0.4)", border: "1px solid rgba(108,58,232,0.5)" }}
              >
                Login →
              </Link>
            ) : hasAddress === false ? (
              <Link
                href="/ajustes"
                className="shrink-0 px-3 py-3 rounded-xl font-black text-white text-xs flex items-center text-center leading-tight"
                style={{ background: "rgba(108,58,232,0.3)", border: "1px solid rgba(108,58,232,0.4)" }}
              >
                + Dirección
              </Link>
            ) : isSeller ? (
              <div className="shrink-0 px-4 py-3 rounded-xl text-xs text-zinc-600 border border-white/5 text-center">
                Tu subasta
              </div>
            ) : (
              <button
                onClick={placeBid}
                disabled={!itemId || bidAmount <= currentBid || placing || hasAddress === null}
                className="shrink-0 px-5 py-3 rounded-xl font-black text-white text-sm transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
                  boxShadow: itemId && bidAmount > currentBid ? "0 4px 16px rgba(108,58,232,0.45)" : "none",
                }}
              >
                {placing ? "…" : !itemId ? "Sin carta activa" : hasAddress === null ? "…" : "Pujar →"}
              </button>
            )}
          </div>

          {/* Puja automática */}
          {activeMaxBid ? (
            <div
              className="rounded-lg px-3 py-2 flex items-center justify-between"
              style={{ background: "rgba(108,58,232,0.1)", border: "1px solid rgba(108,58,232,0.25)" }}
            >
              <div>
                <p className="text-[10px] text-[#a78bfa] font-bold">⚡ Auto-puja activa</p>
                <p className="text-xs text-white font-semibold">hasta ${(activeMaxBid / 100).toLocaleString("es-MX")}</p>
              </div>
              <button
                onClick={async () => {
                  if (itemId) {
                    try { await auctionsApi.cancelMaxBid(itemId); } catch {}
                  }
                  setActiveMaxBid(null);
                  setMaxBidAmount(0);
                }}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
              >
                ✕ Cancelar
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={() => setShowMaxBid((v) => !v)}
                className="w-full py-2 rounded-lg text-xs font-semibold text-zinc-500 hover:text-zinc-300 border border-white/8 hover:border-white/15 transition-all"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                {showMaxBid ? "✕ Cerrar" : "⚡ Puja automática"}
              </button>
              {showMaxBid && (
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">$</span>
                    <input
                      type="number"
                      value={maxBidAmount ? maxBidAmount / 100 : ""}
                      onChange={(e) => setMaxBidAmount(Math.round(Number(e.target.value) * 100))}
                      placeholder={String((currentBid + 20000) / 100)}
                      className="w-full bg-[#0F0F14] border border-white/15 rounded-xl pl-7 pr-2 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-[#6C3AE8]/60"
                      min={(currentBid + 100) / 100}
                      step={1}
                    />
                  </div>
                  <button
                    onClick={submitMaxBid}
                    disabled={maxBidAmount <= currentBid || settingMaxBid}
                    className="shrink-0 px-4 py-2.5 rounded-xl font-bold text-white text-xs disabled:opacity-40"
                    style={{ background: "rgba(108,58,232,0.5)", border: "1px solid rgba(108,58,232,0.4)" }}
                  >
                    {settingMaxBid ? "…" : "Activar"}
                  </button>
                </div>
              )}
            </div>
          )}

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
              className="w-full py-2 rounded-lg font-semibold text-white border border-white/10 hover:bg-white/5 transition-all text-xs disabled:opacity-40"
            >
              Comprar ya — ${(a.binPrice / 100).toLocaleString("es-MX")} MXN
            </button>
          )}
        </div>
      ) : (
        <div className="p-3">
          <button
            onClick={toggleWatchlist}
            disabled={watchloading}
            className="w-full py-3.5 rounded-xl font-bold text-white border transition-all text-sm disabled:opacity-60"
            style={watchlisted
              ? { background: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.3)", color: "#4ade80" }
              : { background: "rgba(108,58,232,0.1)", borderColor: "rgba(108,58,232,0.4)" }
            }
          >
            {watchlisted ? "✓ En seguimiento" : watchloading ? "Guardando..." : "🔔 Recordarme cuando inicie"}
          </button>
          {a.endTime && (
            <p className="text-xs text-zinc-600 text-center mt-2">Inicia en {formatTimer(a.endTime)}</p>
          )}
        </div>
      )}
    </div>
  );
}
