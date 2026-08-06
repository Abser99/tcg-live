"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { usersApi, auctionsApi, listingsApi, watchlistApi, type PublicProfile, type ApiAuction, type ApiListing } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { gameLabel } from "@/lib/format";

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
  upcoming: { text: "PRÓXIMO",        bg: "#2563EB" },
};

type Tab = "subastas" | "shop";

export default function StorefrontPage() {
  const { username } = useParams() as { username: string };
  const { user }     = useAuth();

  const [profile,     setProfile]     = useState<PublicProfile | null>(null);
  const [auctions,    setAuctions]    = useState<ApiAuction[]>([]);
  const [listings,    setListings]    = useState<ApiListing[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(false);
  const [tab,         setTab]         = useState<Tab>("subastas");
  const [watchedIds,  setWatchedIds]  = useState<Set<string>>(new Set());
  const [watchBusy,   setWatchBusy]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
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
    } catch {
      setProfile(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

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
      <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <Navbar />
        <main id="main" className="pt-24 mx-auto max-w-4xl px-6 animate-pulse space-y-4">
          <div className="h-40 rounded-2xl" style={{ background: "var(--bg-elevated)" }} />
          <div className="h-64 rounded-2xl" style={{ background: "var(--bg-elevated)" }} />
        </main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <Navbar />
        <main id="main" className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 80px)" }}>
          <div role="alert" className="text-center">
            <p className="text-5xl mb-4" aria-hidden="true">⚠️</p>
            <p className="text-xl font-bold mb-1">No se pudo cargar la tienda</p>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              Ocurrió un problema al conectar con el servidor. Intenta de nuevo.
            </p>
            <button
              onClick={load}
              className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
              style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.3)" }}
            >
              Reintentar
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <Navbar />
        <main id="main" className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 80px)" }}>
          <div className="text-center">
            <p className="text-5xl mb-4" aria-hidden="true">🔍</p>
            <p className="text-xl font-bold">Vendedor no encontrado</p>
            <Link href="/auctions" className="text-[var(--accent-text)] mt-4 inline-block hover:underline">
              ← Volver a subastas
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const initials = (profile.displayName ?? profile.username).slice(0, 2).toUpperCase();
  const memberSince = new Date(profile.createdAt).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const activeAuctions = auctions.filter(a => a.status === "live" || a.status === "ending" || a.status === "upcoming");
  const rating = profile.averageRating;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />

      {/* Profile header */}
      <div style={{ borderBottom: "1px solid var(--border-subtle)" }} className="pt-20">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link href="/auctions" className="text-sm transition-colors mb-6 inline-block hover:text-[var(--text-primary)]" style={{ color: "var(--text-muted)" }}>
            ← Subastas
          </Link>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black overflow-hidden"
                style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 0 32px rgba(37,99,235,0.4)" }}
              >
                {profile.avatarUrl
                  ? <img src={profile.avatarUrl} alt={`Foto de perfil de ${profile.username}`} className="w-full h-full object-cover" />
                  : <span aria-hidden="true">{initials}</span>
                }
              </div>
              {profile.isVerified && (
                <span
                  className="absolute -bottom-1.5 -right-1.5 text-[10px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: "#2563EB", border: "1px solid var(--bg-base)" }}
                  aria-hidden="true"
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
                  <span className="text-[var(--accent-text)] text-sm font-bold">✓ Verificado</span>
                )}
              </div>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>@{profile.username} · Miembro desde {memberSince}</p>

              <div className="flex flex-wrap items-center gap-5 mt-4">
                {[
                  { label: "Reputación",     value: profile.reputationScore },
                  { label: "Calificaciones", value: profile.totalRatings    },
                  { label: "Subastas",       value: activeAuctions.length   },
                  { label: "En shop",        value: listings.length          },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-xl font-black">{s.value}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Rating badge */}
            {rating !== null && (
              <div className="shrink-0 text-center rounded-2xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <p className="text-3xl font-black" style={{ color: "#fbbf24" }}>{rating.toFixed(1)}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>★ Calificación</p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{profile.totalRatings} reseñas</p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6" role="tablist">
            {([
              { key: "subastas", label: "Subastas", count: activeAuctions.length },
              { key: "shop",     label: "Shop",     count: listings.length       },
            ] as const).map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold border-b-2 transition-all"
                style={tab === t.key
                  ? { color: "var(--accent-text)", borderColor: "#2563EB", background: "rgba(37,99,235,0.08)" }
                  : { color: "var(--text-muted)", borderColor: "transparent" }
                }
              >
                {t.label}
                {t.count > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main id="main" className="mx-auto max-w-4xl px-6 py-8">

        {/* ── SUBASTAS ── */}
        {tab === "subastas" && (
          <div>
            {activeAuctions.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-4xl mb-3" aria-hidden="true">📭</p>
                <p className="font-medium" style={{ color: "var(--text-secondary)" }}>Sin subastas activas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAuctions.map(a => {
                  const s = STATUS_STYLE[a.status];
                  const watched = watchedIds.has(a.id);
                  return (
                    <div key={a.id} className="flex items-center gap-4 rounded-2xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                      <Link href={`/auctions/${a.id}`} aria-hidden="true" tabIndex={-1} className="w-12 h-16 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: "linear-gradient(135deg,#2563EB,#3B82F6)" }}>
                        🃏
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: s?.bg ?? "#2563EB" }}>
                            {s?.text ?? a.status}
                          </span>
                        </div>
                        <p className="font-bold text-sm mt-1 truncate">{a.title ?? a.name ?? "Sin título"}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{gameLabel(a.game)} {a.condition ? `· ${a.condition}` : ""}</p>
                        <p className="text-sm font-black mt-1">
                          ${(a.currentBid ?? a.startingBid ?? 0).toLocaleString("es-MX")}{" "}
                          <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>MXN</span>
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Link
                          href={`/auctions/${a.id}`}
                          className="text-xs font-bold text-white px-4 py-2 rounded-xl text-center"
                          style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                        >
                          {a.status === "upcoming" ? "Ver →" : "Pujar →"}
                        </Link>
                        {a.status === "upcoming" && user && (
                          <button
                            onClick={() => handleWatch(a.id)}
                            disabled={watched || watchBusy === a.id}
                            aria-label={watched ? "Guardada en seguimiento" : "Agregar a seguimiento"}
                            className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                            style={watched
                              ? { background: "rgba(74,222,128,0.1)", color: "#4ade80" }
                              : { background: "var(--bg-hover)", color: "var(--text-muted)" }
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
                <p className="text-xs font-bold uppercase tracking-widest mb-3 px-1" style={{ color: "var(--text-muted)" }}>Subastas pasadas</p>
                <div className="space-y-2">
                  {auctions.filter(a => a.status === "ended").slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border-subtle)" }}>
                      <div className="w-9 h-12 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: "var(--bg-input)" }} aria-hidden="true">🃏</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-secondary)" }}>{a.title ?? a.name ?? "Sin título"}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>${(a.currentBid ?? 0).toLocaleString("es-MX")} MXN · Finalizada</p>
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
                <p className="text-4xl mb-3" aria-hidden="true">🏪</p>
                <p className="font-medium" style={{ color: "var(--text-secondary)" }}>Sin artículos en el shop</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {listings.filter(l => l.status === "active").map(l => {
                  const gradient = hashColor(l.id, GRADIENTS);
                  return (
                    <Link key={l.id} href={`/shop`}>
                      <div className="rounded-2xl p-4 flex items-center gap-4 hover:border-[#2563EB]/30 transition-all cursor-pointer" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                        {l.imageUrls?.[0] ? (
                          <img src={l.imageUrls[0]} alt={`Carta: ${l.title}`} className="w-14 h-20 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className={`w-14 h-20 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl shrink-0`} aria-hidden="true">🃏</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{l.title}</p>
                          {l.condition && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)" }}>
                              {l.condition}
                            </span>
                          )}
                          <p className="font-black text-base mt-2">
                            ${l.price.toLocaleString("es-MX")}{" "}
                            <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>MXN</span>
                          </p>
                          {l.acceptsOffers && (
                            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Acepta ofertas</p>
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
      </main>
    </div>
  );
}
