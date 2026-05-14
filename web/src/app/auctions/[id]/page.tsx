"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { auctionsApi, type ApiAuction } from "@/lib/api";
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

export default function AuctionDetailPage() {
  const { id } = useParams() as { id: string };
  const [auction, setAuction] = useState<ApiAuction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auctionsApi.get(id)
      .then((r) => setAuction(r.data))
      .catch(() => setAuction(null))
      .finally(() => setLoading(false));
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
              <StreamPanel auction={auction} gradient={gradient} glow={glow} />
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

/* ─── Stream Panel ──────────────────────────────────────── */
function StreamPanel({
  auction: a,
  gradient,
  glow,
}: {
  auction: ApiAuction;
  gradient: string;
  glow: string;
}) {
  const status = STATUS_LABEL[a.status ?? "upcoming"];
  const title = a.title ?? a.name ?? "Sin título";
  const sellerName = a.seller?.username ?? a.sellerName ?? "—";
  const verified = a.seller?.verified;
  const timer = formatTimer(a.endTime);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="relative bg-[#050508] aspect-video flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 50%, ${glow} 0%, transparent 65%)`, opacity: 0.5 }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)" }}
        />

        <div
          className={`relative w-36 h-48 rounded-2xl bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-2 shadow-2xl`}
          style={{ boxShadow: `0 0 60px ${glow}` }}
        >
          <span className="text-6xl">🃏</span>
          <span className="text-white text-xs font-black tracking-widest opacity-90 text-center px-2">
            {title.toUpperCase().slice(0, 12)}
          </span>
        </div>

        <div className="absolute top-4 left-4 flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 text-white text-xs font-black px-3 py-1.5 rounded-full"
            style={{ background: status?.bg, boxShadow: `0 0 14px ${status?.bg ?? "#6C3AE8"}80` }}
          >
            {a.status === "live" && (
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            )}
            {status?.text ?? a.status}
          </div>
          {a.status !== "upcoming" && (
            <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-zinc-300 text-xs px-2.5 py-1.5 rounded-full">
              👁 {a.viewers ?? 0} viendo
            </div>
          )}
        </div>

        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm text-white font-mono font-black text-lg px-3 py-1 rounded-xl">
          {timer}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />

        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#1E1E2A] border border-white/20 flex items-center justify-center text-sm">
            🧑
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-none">
              {sellerName} {verified && <span className="text-[#a78bfa]">✓</span>}
            </p>
            <p className="text-zinc-400 text-xs">Vendedor</p>
          </div>
        </div>

        {a.status !== "upcoming" && (
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            <button className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm transition-colors">
              🔊
            </button>
            <button className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm transition-colors">
              ⛶
            </button>
          </div>
        )}
      </div>

      {/* Chat placeholder — real-time via LiveKit/socket to be wired later */}
      <div className="bg-[#0d0d14] border-t border-white/5 p-4">
        <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mb-3">
          Chat en vivo
        </p>
        <div className="mt-3 flex gap-2">
          <input
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-[#16161E] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/50"
          />
          <button
            className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
          >
            →
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
          <div className="flex items-center gap-2">
            <span className="text-lg">🧑</span>
            <div>
              <p className="text-sm font-bold">
                {sellerName} {verified && <span className="text-[#a78bfa]">✓</span>}
              </p>
              {verified && <p className="text-xs text-zinc-600">Vendedor verificado</p>}
            </div>
          </div>
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

  const currentBid = bids[0]?.amount ?? initialCurrentBid;

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
    } catch {
      // 401 handled globally by interceptor
    } finally {
      setPlacing(false);
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

          <button
            onClick={placeBid}
            disabled={bidAmount <= currentBid || placing}
            className="w-full py-4 rounded-xl font-black text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
              boxShadow: bidAmount > currentBid ? "0 8px 25px rgba(108,58,232,0.4)" : "none",
            }}
          >
            {placing ? "Enviando..." : `Pujar $${bidAmount.toLocaleString("es-MX")} MXN →`}
          </button>

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
          <button className="w-full py-4 rounded-xl font-bold text-white border border-[#6C3AE8]/40 bg-[#6C3AE8]/10 hover:bg-[#6C3AE8]/20 transition-all text-sm">
            🔔 Recordarme cuando inicie
          </button>
          <p className="text-xs text-zinc-600 text-center mt-3">
            Inicia en {formatTimer(a.endTime)}
          </p>
        </div>
      )}
    </div>
  );
}
