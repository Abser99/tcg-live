"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { usersApi, auctionsApi, listingsApi, watchlistApi, type PublicProfile, type ApiAuction, type ApiListing } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

const GRADIENTS = [
  "from-orange-500 to-red-600",
  "from-violet-600 to-indigo-800",
  "from-blue-500 to-cyan-400",
  "from-yellow-400 to-amber-500",
  "from-emerald-500 to-teal-600",
  "from-pink-500 to-rose-600",
];

function hashColor(str: string, arr: string[]) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

const STATUS_STYLE: Record<string, { text: string; bg: string }> = {
  live:     { text: "EN VIVO",        bg: "#ef4444" },
  ending:   { text: "TERMINA PRONTO", bg: "#f59e0b" },
  upcoming: { text: "PRÓXIMO",        bg: "#6C3AE8" },
};

type Tab = "subastas" | "shop";

export default function StorefrontPage() {
  const { username } = useParams() as { username: string };
  const { user }     = useAuth();

  const [profile,     setProfile]     = useState<PublicProfile | null>(null);
  const [auctions,    setAuctions]    = useState<ApiAuction[]>([]);
  const [listings,    setListings]    = useState<ApiListing[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<Tab>("subastas");
  const [watchedIds,  setWatchedIds]  = useState<Set<string>>(new Set());
  const [watchBusy,   setWatchBusy]   = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const profileRes = await usersApi.publicProfile(username);
        setProfile(profileRes.data);

        // Load all auctions and filter by sellerId on the frontend
        // (no seller-specific public endpoint, so we query all and filter)
        const [auctionsRes, listingsRes] = await Promise.all([
          auctionsApi.list().catch(() => null),
          listingsApi.list().catch(() => null),
        ]);

        if (auctionsRes) {
          const auctionList = Array.isArray(auctionsRes.data) ? auctionsRes.data : (auctionsRes.data as any).data ?? [];
          setAuctions(auctionList.filter(
            (a: any) => a.seller?.id === profileRes.data.id || a.seller?.username === username
          ));
        }
        if (listingsRes) {
          setListings(listingsRes.data.filter(
            (l) => l.seller?.id === profileRes.data.id || l.seller?.username === username
          ));
        }
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [username]);

  async function handleWatch(auctionId: string) {
    if (!user || watchBusy) return;
    setWatchBusy(auctionId);
    try {
      await watchlistApi.add(auctionId);
      setWatchedIds(prev => new Set([...prev, auctionId]));
    } catch {}
    finally { setWatchBusy(null); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0F14] text-white">
        <Navbar />
        <div className="pt-24 mx-auto max-w-4xl px-6 animate-pulse space-y-4">
          <div className="h-40 rounded-2xl bg-[#16161E]" />
          <div className="h-64 rounded-2xl bg-[#16161E]" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0F0F14] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-xl font-bold">Vendedor no encontrado</p>
          <Link href="/auctions" className="text-[#a78bfa] mt-4 inline-block hover:underline">
            ← Volver a subastas
          </Link>
        </div>
      </div>
    );
  }

  const initials = (profile.displayName ?? profile.username).slice(0, 2).toUpperCase();
  const memberSince = new Date(profile.createdAt).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const activeAuctions = auctions.filter(a => a.status === "live" || a.status === "ending" || a.status === "upcoming");
  const rating = profile.averageRating;

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      {/* Profile header */}
      <div className="pt-20 border-b border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link href="/auctions" className="text-sm text-zinc-500 hover:text-white transition-colors mb-6 inline-block">
            ← Subastas
          </Link>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black overflow-hidden"
                style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 0 32px rgba(108,58,232,0.4)" }}
              >
                {profile.avatarUrl
                  ? <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
                  : initials
                }
              </div>
              {profile.isVerified && (
                <span
                  className="absolute -bottom-1.5 -right-1.5 text-[10px] font-black px-2 py-0.5 rounded-full border border-[#0F0F14]"
                  style={{ background: "#6C3AE8" }}
                >
                  ✓
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black">{profile.displayName ?? profile.username}</h1>
                {profile.isVerified && (
                  <span className="text-[#a78bfa] text-sm font-bold">✓ Verificado</span>
                )}
              </div>
              <p className="text-zinc-500 text-sm mt-0.5">@{profile.username} · Miembro desde {memberSince}</p>

              <div className="flex flex-wrap items-center gap-5 mt-4">
                {[
                  { label: "Reputación",     value: profile.reputationScore },
                  { label: "Calificaciones", value: profile.totalRatings    },
                  { label: "Subastas",       value: activeAuctions.length   },
                  { label: "En shop",        value: listings.length          },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-xl font-black">{s.value}</p>
                    <p className="text-[11px] text-zinc-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Rating badge */}
            {rating !== null && (
              <div className="shrink-0 text-center rounded-2xl p-4" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-3xl font-black" style={{ color: "#fbbf24" }}>{rating.toFixed(1)}</p>
                <p className="text-xs text-zinc-500 mt-1">★ Calificación</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">{profile.totalRatings} reseñas</p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6">
            {([
              { key: "subastas", label: "Subastas", count: activeAuctions.length },
              { key: "shop",     label: "Shop",     count: listings.length       },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold border-b-2 transition-all"
                style={tab === t.key
                  ? { color: "#a78bfa", borderColor: "#6C3AE8", background: "rgba(108,58,232,0.08)" }
                  : { color: "#71717a", borderColor: "transparent" }
                }
              >
                {t.label}
                {t.count > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={{ background: "rgba(255,255,255,0.08)", color: "#71717a" }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-6 py-8">

        {/* ── SUBASTAS ── */}
        {tab === "subastas" && (
          <div>
            {activeAuctions.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-zinc-400 font-medium">Sin subastas activas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAuctions.map(a => {
                  const s = STATUS_STYLE[a.status];
                  const gradient = hashColor(a.id, GRADIENTS);
                  const watched = watchedIds.has(a.id);
                  return (
                    <div key={a.id} className="flex items-center gap-4 rounded-2xl p-4" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Link href={`/auctions/${a.id}`} className="w-12 h-16 rounded-xl flex items-center justify-center text-xl shrink-0 bg-gradient-to-br" style={{ background: "linear-gradient(135deg,#6C3AE8,#8B5CF6)" }}>
                        🃏
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: s?.bg ?? "#6C3AE8" }}>
                            {s?.text ?? a.status}
                          </span>
                        </div>
                        <p className="font-bold text-sm mt-1 truncate">{a.title ?? a.name ?? "Sin título"}</p>
                        <p className="text-xs text-zinc-500">{a.game ?? ""} {a.condition ? `· ${a.condition}` : ""}</p>
                        <p className="text-sm font-black mt-1">
                          ${(a.currentBid ?? a.startingBid ?? 0).toLocaleString("es-MX")}{" "}
                          <span className="text-[10px] text-zinc-600 font-normal">MXN</span>
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Link
                          href={`/auctions/${a.id}`}
                          className="text-xs font-bold text-white px-4 py-2 rounded-xl text-center"
                          style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                        >
                          {a.status === "upcoming" ? "Ver →" : "Pujar →"}
                        </Link>
                        {a.status === "upcoming" && user && (
                          <button
                            onClick={() => handleWatch(a.id)}
                            disabled={watched || watchBusy === a.id}
                            className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                            style={watched
                              ? { background: "rgba(74,222,128,0.1)", color: "#4ade80" }
                              : { background: "rgba(255,255,255,0.06)", color: "#71717a" }
                            }
                          >
                            {watched ? "✓ Guardada" : "🔔"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Past auctions */}
            {auctions.filter(a => a.status === "ended").length > 0 && (
              <div className="mt-8">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 px-1">Subastas pasadas</p>
                <div className="space-y-2">
                  {auctions.filter(a => a.status === "ended").slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="w-9 h-12 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-base shrink-0">🃏</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate text-zinc-300">{a.title ?? a.name ?? "Sin título"}</p>
                        <p className="text-[11px] text-zinc-600">${(a.currentBid ?? 0).toLocaleString("es-MX")} MXN · Finalizada</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SHOP ── */}
        {tab === "shop" && (
          <div>
            {listings.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-4xl mb-3">🏪</p>
                <p className="text-zinc-400 font-medium">Sin artículos en el shop</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {listings.filter(l => l.status === "active").map(l => {
                  const gradient = hashColor(l.id, GRADIENTS);
                  return (
                    <Link key={l.id} href={`/shop`}>
                      <div className="rounded-2xl p-4 flex items-center gap-4 hover:border-[#6C3AE8]/30 transition-all cursor-pointer" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                        {l.imageUrls?.[0] ? (
                          <img src={l.imageUrls[0]} alt={l.title} className="w-14 h-20 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className={`w-14 h-20 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl shrink-0`}>🃏</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{l.title}</p>
                          {l.condition && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}>
                              {l.condition}
                            </span>
                          )}
                          <p className="font-black text-base mt-2">
                            ${l.price.toLocaleString("es-MX")}{" "}
                            <span className="text-[10px] text-zinc-600 font-normal">MXN</span>
                          </p>
                          {l.acceptsOffers && (
                            <p className="text-[10px] text-zinc-500 mt-0.5">Acepta ofertas</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
