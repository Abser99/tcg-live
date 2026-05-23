"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { Room, RoomEvent, Track } from "livekit-client";
import { auctionsApi, watchlistApi, usersApi, type ApiAuction } from "@/lib/api";
import { censorText } from "@/lib/profanity";
import { useAuth } from "@/contexts/auth";

const STATUS_LABEL: Record<string, { text: string; bg: string }> = {
  live:     { text: "EN VIVO",        bg: "#ef4444" },
  ending:   { text: "TERMINA PRONTO", bg: "#f59e0b" },
  upcoming: { text: "PRÓXIMO",        bg: "#6C3AE8" },
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

function formatTimer(endTime?: string): string {
  if (!endTime) return "—";
  const diff = Math.max(0, new Date(endTime).getTime() - Date.now());
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

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

  useEffect(() => {
    auctionsApi.get(id)
      .then((r) => setAuction(r.data))
      .catch(() => setAuction(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!auction || (auction.status !== 'live' && auction.status !== 'ending')) return;
    const timer = setInterval(() => {
      auctionsApi.get(id).then(r => setAuction(r.data)).catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [id, auction?.status]);

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

  const hashIdx = auction.id.charCodeAt(0) % GRADIENTS.length;
  const gradient = GRADIENTS[hashIdx];
  const glow = GLOWS[hashIdx];

  const item = auction.items?.[0];
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
        <div className="mx-auto max-w-7xl px-6 py-4">
          <Link
            href="/auctions"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors"
          >
            ← Subastas
          </Link>
        </div>

        <div className="mx-auto max-w-7xl px-6 pb-16">
          <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
            <div className="flex flex-col gap-6">
              <StreamPanel auction={auction} gradient={gradient} glow={glow} autoStream={autoStream} onAuctionUpdate={setAuction} />
              <CardInfo auction={auction} />
            </div>
            <div className="lg:sticky lg:top-24">
              <BidPanel
                auction={auction}
                initialBids={initialBids}
                currentBid={currentBid}
                startingBid={startingBid}
                totalBids={totalBids}
                itemId={itemId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuctionDetailPage() {
  return (
    <Suspense>
      <AuctionDetailPageInner />
    </Suspense>
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
  const isSeller = !!user && (
    user.id === (a as any).sellerId ||
    user.id === a.seller?.id ||
    user.username === (a.seller?.username ?? a.sellerName)
  );
  const isLive   = a.status === "live" || a.status === "ending";

  const roomRef    = useRef<Room | null>(null);
  const videoRef   = useRef<HTMLVideoElement>(null);
  const [streaming,      setStreaming]      = useState(false);
  const [connecting,     setConnecting]     = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [micMuted,       setMicMuted]       = useState(false);
  const [camOff,         setCamOff]         = useState(false);
  const [streamError,    setStreamError]    = useState<string | null>(null);
  const [endingAuction,  setEndingAuction]  = useState(false);

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

  // Chat en vivo
  const [chatMessages, setChatMessages] = useState<{ username: string; text: string; ts: number }[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const chatBoxRef = useRef<HTMLDivElement>(null);

  // Everyone (seller + viewers) auto-connect for chat when auction is live
  useEffect(() => {
    if (!isLive || !user) return;
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

    attachChatListener(room);

    auctionsApi.livekitToken(a.id)
      .then(({ data }) => { if (alive) return room.connect(data.wsUrl, data.token); })
      .catch(() => {});

    return () => {
      alive = false;
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
    room.on(RoomEvent.DataReceived, (data: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(data));
        if (msg.type === "chat") {
          setChatMessages(prev => [...prev, { username: msg.username, text: censorText(msg.text), ts: msg.ts }]);
        }
      } catch {}
    });
  }

  async function sendChat() {
    if (!chatInput.trim() || !roomRef.current || !user) return;
    const clean = censorText(chatInput.trim());
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

  function spinMinigame() {
    const pool = mgCategory === "todos"
      ? streamWinners
      : streamWinners.filter(w => w.category === mgCategory);
    if (pool.length === 0) return;
    setMgSpinning(true);
    setMgWinner(null);
    let ticks = 0;
    const total = 20 + Math.floor(Math.random() * 15);
    const interval = setInterval(() => {
      const random = pool[Math.floor(Math.random() * pool.length)];
      setMgWinner(random.username);
      ticks++;
      if (ticks >= total) {
        clearInterval(interval);
        setMgSpinning(false);
      }
    }, 80);
  }

  async function startStream() {
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

      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);

      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track && videoRef.current) camPub.track.attach(videoRef.current);

      setStreaming(true);
    } catch (err: any) {
      console.error("Stream error:", err);
      const msg: string = err?.message ?? err?.name ?? String(err);
      const name: string = err?.name ?? "";
      if (name === "NotFoundError" || msg.toLowerCase().includes("not found") || msg.includes("object can not be found")) {
        setStreamError("No se encontró cámara. Conecta una cámara (webcam o celular) y vuelve a intentarlo.");
      } else if (name === "NotAllowedError" || msg.includes("NotAllowed") || msg.toLowerCase().includes("permission")) {
        setStreamError("El navegador bloqueó la cámara. Haz clic en el ícono de cámara en la barra de direcciones y permite el acceso.");
      } else if (name === "NotReadableError" || msg.includes("in use")) {
        setStreamError("La cámara está en uso por otra aplicación. Ciérrala y vuelve a intentarlo.");
      } else {
        setStreamError(`Error al iniciar stream: ${msg}`);
      }
    } finally {
      setConnecting(false);
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
    setEndingAuction(true);
    try {
      await stopStream();
      const { data } = await auctionsApi.end(a.id);
      onAuctionUpdate?.(data as any);
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
          {a.status !== "upcoming" && (
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
                style={{ background: "rgba(113,113,122,0.15)", color: "#a1a1aa", border: "1px solid rgba(113,113,122,0.25)" }}
              >
                {endingAuction ? "..." : "Terminar subasta"}
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
                  style={{ background: "rgba(113,113,122,0.15)", color: "#a1a1aa", border: "1px solid rgba(113,113,122,0.25)" }}
                >
                  {endingAuction ? "..." : "Terminar"}
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
                    <p className="text-xs text-[#a78bfa]">${(activeItem.currentBid ?? activeItem.startingBid ?? 0).toLocaleString("es-MX")}</p>
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
            onKeyDown={e => { if (e.key === "Enter") sendChat(); }}
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
function CardInfo({ auction: a }: { auction: ApiAuction }) {
  const title = a.title ?? a.name ?? "Sin título";
  const sellerName = a.seller?.username ?? a.sellerName ?? "—";
  const verified = a.seller?.verified;

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-black">{title}</h1>
          <p className="text-zinc-500 mt-1">{a.game ?? ""}</p>
        </div>
        {a.condition && (
          <span
            className="shrink-0 text-sm font-bold px-3 py-1 rounded-lg"
            style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.25)" }}
          >
            {a.condition}
          </span>
        )}
      </div>

      {a.description && (
        <p className="text-zinc-400 leading-relaxed text-sm mb-6">{a.description}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-xs text-zinc-600 mb-1">Vendedor</p>
          <Link href={`/tienda/${sellerName}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="text-lg">🧑</span>
            <div>
              <p className="text-sm font-bold text-[#a78bfa]">
                {sellerName} {verified && <span>✓</span>}
              </p>
              <p className="text-xs text-zinc-600">{verified ? "Vendedor verificado" : "Ver tienda"}</p>
            </div>
          </Link>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-xs text-zinc-600 mb-1">Total de pujas</p>
          <p className="text-2xl font-black">{a.totalBids ?? 0}</p>
          <p className="text-xs text-zinc-600">participantes</p>
        </div>
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
}: {
  auction: ApiAuction;
  initialBids: BidRow[];
  currentBid: number;
  startingBid: number;
  totalBids: number;
  itemId?: string;
}) {
  const { user } = useAuth();
  const [bids, setBids] = useState<BidRow[]>(initialBids);
  const [bidAmount, setBidAmount] = useState(Math.max(initialCurrentBid + 50, startingBid));
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

  const currentBid = bids[0]?.amount ?? initialCurrentBid;

  async function toggleWatchlist() {
    if (!user || watchloading) return;
    setWatchloading(true);
    try {
      await watchlistApi.add(a.id);
      setWatchlisted(true);
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
      setBidAmount(bidAmount + 50);
      setJustBid(true);
      setTimeout(() => setJustBid(false), 2500);
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

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="p-5 border-b border-white/5">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
          {a.status === "upcoming" ? "Precio inicial" : "Puja más alta"}
        </p>
        <p className="text-4xl font-black">
          ${currentBid.toLocaleString("es-MX")}{" "}
          <span className="text-lg text-zinc-500 font-normal">MXN</span>
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-sm text-zinc-500">{bids.length || totalBids} pujas</span>
          <span className="text-zinc-700">·</span>
          <span className="text-sm font-mono font-bold text-white">⏱ {formatTimer(a.endTime)}</span>
        </div>
      </div>

      {bids.length > 0 && (
        <div className="p-5 border-b border-white/5">
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Historial</p>
          <div className="flex flex-col gap-2">
            {bids.slice(0, 5).map((b, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {i === 0 && (
                    <span className="text-[10px] bg-[#6C3AE8]/20 text-[#a78bfa] px-1.5 py-0.5 rounded font-bold">
                      TOP
                    </span>
                  )}
                  <p className={`text-sm font-semibold ${b.user === (user?.username ?? "Tú") ? "text-[#a78bfa]" : "text-white"}`}>
                    {b.user}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">${b.amount.toLocaleString("es-MX")}</p>
                  <p className="text-[10px] text-zinc-600">{b.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {a.status !== "upcoming" ? (
        <div className="p-5 flex flex-col gap-3">
          {justBid && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-semibold rounded-xl px-4 py-2.5 text-center">
              ✓ ¡Puja enviada!
            </div>
          )}
          {bidError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold rounded-xl px-4 py-2.5 text-center">
              {bidError}
            </div>
          )}

          <p className="text-xs text-zinc-600">Tu puja (mín. ${(currentBid + 50).toLocaleString("es-MX")})</p>

          <div className="flex gap-2">
            {[50, 100, 200].map((inc) => (
              <button
                key={inc}
                onClick={() => setBidAmount((prev) => Math.max(currentBid + inc, prev + inc))}
                className="flex-1 py-1.5 rounded-lg text-xs font-bold text-zinc-300 transition-colors"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                +${inc}
              </button>
            ))}
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
            <input
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(Number(e.target.value))}
              className="w-full bg-[#0F0F14] border border-white/15 rounded-xl pl-8 pr-4 py-3.5 text-white font-bold text-lg focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
              min={currentBid + 50}
              step={50}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">MXN</span>
          </div>

          {!user ? (
            <Link
              href="/login"
              className="w-full py-4 rounded-xl font-black text-white text-center block transition-all"
              style={{ background: "rgba(108,58,232,0.25)", border: "1px solid rgba(108,58,232,0.4)" }}
            >
              Inicia sesión para pujar →
            </Link>
          ) : hasAddress === false ? (
            <Link
              href="/ajustes"
              className="w-full py-4 rounded-xl font-black text-white text-center block transition-all"
              style={{ background: "rgba(108,58,232,0.25)", border: "1px solid rgba(108,58,232,0.4)" }}
            >
              Agrega dirección y forma de pago →
            </Link>
          ) : (
          <button
            onClick={placeBid}
            disabled={bidAmount <= currentBid || placing || hasAddress === null}
            className="w-full py-4 rounded-xl font-black text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
              boxShadow: bidAmount > currentBid ? "0 8px 25px rgba(108,58,232,0.4)" : "none",
            }}
          >
            {placing ? "Enviando..." : hasAddress === null ? "Verificando..." : `Pujar $${bidAmount.toLocaleString("es-MX")} MXN →`}
          </button>
          )}

          {activeMaxBid ? (
            <div
              className="rounded-xl px-4 py-3 flex items-center justify-between"
              style={{ background: "rgba(108,58,232,0.1)", border: "1px solid rgba(108,58,232,0.25)" }}
            >
              <div>
                <p className="text-xs text-[#a78bfa] font-bold">Puja automática activa</p>
                <p className="text-sm text-white font-semibold">hasta ${activeMaxBid.toLocaleString("es-MX")} MXN</p>
              </div>
              <button
                onClick={() => { setActiveMaxBid(null); setMaxBidAmount(0); }}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={() => setShowMaxBid((v) => !v)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white border border-white/10 hover:border-white/20 transition-all"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                {showMaxBid ? "✕ Cancelar puja automática" : "⚡ Configurar puja automática"}
              </button>

              {showMaxBid && (
                <div className="mt-3 flex flex-col gap-3">
                  <p className="text-xs text-zinc-500">
                    Puja automáticamente hasta tu límite. Si alguien puja más, te supera automáticamente hasta tu máximo.
                  </p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                    <input
                      type="number"
                      value={maxBidAmount || ""}
                      onChange={(e) => setMaxBidAmount(Number(e.target.value))}
                      placeholder={String(currentBid + 200)}
                      className="w-full bg-[#0F0F14] border border-white/15 rounded-xl pl-8 pr-16 py-3 text-white font-bold focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
                      min={currentBid + 50}
                      step={50}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">MXN</span>
                  </div>
                  <button
                    onClick={submitMaxBid}
                    disabled={maxBidAmount <= currentBid || settingMaxBid}
                    className="w-full py-3 rounded-xl font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "rgba(108,58,232,0.5)", border: "1px solid rgba(108,58,232,0.4)" }}
                  >
                    {settingMaxBid ? "Guardando..." : `Activar puja hasta $${maxBidAmount ? maxBidAmount.toLocaleString("es-MX") : "—"}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {a.binPrice && (
            <button className="w-full py-3 rounded-xl font-semibold text-white border border-white/15 hover:bg-white/5 transition-all text-sm">
              Comprar ya — ${a.binPrice.toLocaleString("es-MX")} MXN
            </button>
          )}

          <p className="text-[10px] text-zinc-700 text-center">
            Pagos procesados con Mercado Pago · Compra protegida
          </p>
        </div>
      ) : (
        <div className="p-5">
          <button
            onClick={toggleWatchlist}
            disabled={watchloading || watchlisted}
            className="w-full py-4 rounded-xl font-bold text-white border transition-all text-sm disabled:opacity-60"
            style={watchlisted
              ? { background: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.3)", color: "#4ade80" }
              : { background: "rgba(108,58,232,0.1)", borderColor: "rgba(108,58,232,0.4)" }
            }
          >
            {watchlisted ? "✓ En tu watchlist" : watchloading ? "Guardando..." : "🔔 Recordarme cuando inicie"}
          </button>
          <p className="text-xs text-zinc-600 text-center mt-3">
            Inicia en {formatTimer(a.endTime)}
          </p>
        </div>
      )}
    </div>
  );
}
