"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { sellerApplicationsApi, sellerDocumentsApi, disputesApi, usersApi, adminOrdersApi, type SellerApplication, type SellerDocumentRecord, type ApiDispute, type AdminUser, type ApiOrder, adminStatsApi, type ApiAdminOverview, type ApiSellerStatsRow, type ApiBuyerStatsRow, incidentsApi, type ApiIncident } from "@/lib/api";

const DOC_LABELS: Record<string, string> = {
  identificacion:        "Identificación Oficial",
  curp:                  "CURP",
  constancia_fiscal:     "Constancia de Situación Fiscal",
  opinion_cumplimiento:  "Opinión de Cumplimiento SAT",
  comprobante_domicilio: "Comprobante de Domicilio",
  cuenta_bancaria:       "Cuenta Bancaria / CLABE",
};

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Pendiente", color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  approved: { label: "Aprobado",  color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  rejected: { label: "Rechazado", color: "var(--error-text)", bg: "rgba(248,113,113,0.12)" },
};

/** MXN from cents, with no decimals — these are reporting figures, not receipts. */
function money(cents: number): string {
  return `$${Math.round((cents ?? 0) / 100).toLocaleString("es-MX")}`;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [applications,  setApplications]  = useState<SellerApplication[]>([]);
  const [documents,     setDocuments]     = useState<SellerDocumentRecord[]>([]);
  const [allDisputes,   setAllDisputes]   = useState<ApiDispute[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState<"stats" | "incidents" | "applications" | "documents" | "disputes" | "users" | "cobros">("stats");

  // ── Reporting ──
  const [overview, setOverview] = useState<ApiAdminOverview | null>(null);
  const [sellerRows, setSellerRows] = useState<ApiSellerStatsRow[]>([]);
  const [buyerRows, setBuyerRows] = useState<ApiBuyerStatsRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [who, setWho] = useState<"sellers" | "buyers">("sellers");

  // ── Incident queue ──
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [incidentNote, setIncidentNote] = useState<Record<string, string>>({});
  const openIncidents = incidents.filter(i => i.status === "open").length;
  const loadIncidents = useCallback(() => {
    incidentsApi.list().then(r => setIncidents(r.data)).catch(() => {});
  }, []);
  const [filter,        setFilter]        = useState("pending");
  const [selected,      setSelected]      = useState<SellerApplication | null>(null);
  const [rejectNote,    setRejectNote]    = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [docPreview,    setDocPreview]    = useState<string | null>(null);

  // Dispute resolution modal
  const [disputeSelected,  setDisputeSelected]  = useState<ApiDispute | null>(null);
  const [disputeNote,      setDisputeNote]      = useState("");
  const [disputeStatus,    setDisputeStatus]    = useState<"resolved" | "rejected">("resolved");

  // Cobros (payouts) tab state
  const [pendingPayouts,     setPendingPayouts]     = useState<ApiOrder[] | null>(null);
  const [payoutsLoading,     setPayoutsLoading]     = useState(false);
  const [releasingPayout,    setReleasingPayout]    = useState<string | null>(null);
  const [payoutFlash,        setPayoutFlash]        = useState<string | null>(null);
  const [confirmPayoutId,    setConfirmPayoutId]    = useState<string | null>(null);

  // Users tab state
  const [allUsers,         setAllUsers]         = useState<AdminUser[]>([]);
  const [usersTotal,       setUsersTotal]        = useState(0);
  const [usersPage,        setUsersPage]         = useState(1);
  const [usersLoading,     setUsersLoading]      = useState(false);
  const [userSearch,       setUserSearch]        = useState("");
  const [suspendTarget,    setSuspendTarget]     = useState<AdminUser | null>(null);
  const [suspendReason,    setSuspendReason]     = useState("");
  const [suspendError,     setSuspendError]      = useState("");
  const [userFlash,        setUserFlash]         = useState<string | null>(null);

  // Modal focus targets
  const selectedModalRef    = useRef<HTMLDivElement>(null);
  const suspendModalRef     = useRef<HTMLDivElement>(null);
  const disputeModalRef     = useRef<HTMLDivElement>(null);
  const docPreviewModalRef  = useRef<HTMLDivElement>(null);

  const DISPUTE_REASON_LABELS: Record<string, string> = {
    not_received:     "No recibió el paquete",
    wrong_item:       "Artículo incorrecto",
    damaged:          "Llegó dañado",
    not_as_described: "No coincide con la descripción",
    other:            "Otro",
  };

  const DISPUTE_STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
    open:         { label: "Abierta",     color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
    under_review: { label: "En revisión", color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
    resolved:     { label: "Resuelta",    color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
    rejected:     { label: "Rechazada",   color: "var(--error-text)", bg: "rgba(248,113,113,0.12)" },
  };

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "ADMIN")) router.replace("/");
  }, [authLoading, user, router]);

  // ── Modal accessibility: Escape-to-close, body scroll lock, focus on open ──
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { setSelected(null); setRejectNote(""); } }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    selectedModalRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [selected]);

  useEffect(() => {
    if (!suspendTarget) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { setSuspendTarget(null); setSuspendReason(""); setSuspendError(""); } }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    suspendModalRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [suspendTarget]);

  useEffect(() => {
    if (!disputeSelected) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { setDisputeSelected(null); setDisputeNote(""); } }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    disputeModalRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [disputeSelected]);

  useEffect(() => {
    if (!docPreview) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setDocPreview(null); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    docPreviewModalRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [docPreview]);

  const loadData = useCallback(async () => {
    if (!user || user.role !== "ADMIN") return;
    setLoading(true);
    try {
      const [appsRes, docsRes, disputesRes] = await Promise.all([
        sellerApplicationsApi.list(filter === "all" ? undefined : filter),
        sellerDocumentsApi.listAll(filter === "all" ? undefined : filter),
        disputesApi.all().catch(() => null),
      ]);
      setApplications(appsRes.data);
      setDocuments(docsRes.data);
      if (disputesRes) setAllDisputes(disputesRes.data);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadUsers = useCallback(async (page = 1, append = false) => {
    if (!user || user.role !== "ADMIN") return;
    setUsersLoading(true);
    try {
      const res = await usersApi.listAll(page);
      setAllUsers(prev => append ? [...prev, ...res.data] : res.data);
      setUsersTotal(res.total);
      setUsersPage(page);
    } catch {
      // silently fail — existing flash handles errors
    } finally {
      setUsersLoading(false);
    }
  }, [user]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [o, se, bu] = await Promise.all([adminStatsApi.overview(), adminStatsApi.sellers(50), adminStatsApi.buyers(50)]);
      setOverview(o.data); setSellerRows(se.data); setBuyerRows(bu.data);
    } catch {
      // the empty state already reads as "sin datos"
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Each tab pays for its own query the first time it is opened.
  useEffect(() => {
    if (tab === "stats" && !overview && !statsLoading) loadStats();
    if (tab === "incidents" && incidents.length === 0) loadIncidents();
    if (tab === "users" && allUsers.length === 0) loadUsers(1);
  }, [tab, overview, statsLoading, loadStats, incidents.length, loadIncidents, allUsers.length, loadUsers]);

  useEffect(() => {
    if (tab === "cobros" && pendingPayouts === null) loadPendingPayouts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function showFlash(msg: string) {
    setUserFlash(msg);
    setTimeout(() => setUserFlash(null), 3000);
  }

  async function handleSuspend() {
    if (!suspendTarget) return;
    if (suspendReason.trim().length < 10) {
      setSuspendError("El motivo debe tener al menos 10 caracteres.");
      return;
    }
    setSuspendError("");
    setActionLoading(true);
    try {
      const res = await usersApi.suspend(suspendTarget.id, suspendReason.trim());
      setAllUsers(prev => prev.map(u => u.id === suspendTarget.id ? res.data : u));
      setSuspendTarget(null);
      setSuspendReason("");
      showFlash("Usuario suspendido correctamente.");
    } catch {
      setSuspendError("Error al suspender el usuario. Intenta de nuevo.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnsuspend(targetUser: AdminUser) {
    setActionLoading(true);
    try {
      const res = await usersApi.unsuspend(targetUser.id);
      setAllUsers(prev => prev.map(u => u.id === targetUser.id ? res.data : u));
      showFlash("Usuario reactivado correctamente.");
    } catch {
      showFlash("Error al reactivar el usuario. Intenta de nuevo.");
    } finally {
      setActionLoading(false);
    }
  }

  async function reviewApplication(id: string, status: "approved" | "rejected") {
    setActionLoading(true);
    try {
      await sellerApplicationsApi.review(id, status, status === "rejected" ? rejectNote : undefined);
      setSelected(null);
      setRejectNote("");
      await loadData();
    } finally {
      setActionLoading(false);
    }
  }

  async function resolveDispute() {
    if (!disputeSelected || !disputeNote.trim()) return;
    setActionLoading(true);
    try {
      await disputesApi.resolve(disputeSelected.id, disputeStatus, disputeNote);
      setDisputeSelected(null);
      setDisputeNote("");
      await loadData();
    } finally {
      setActionLoading(false);
    }
  }

  async function reviewDocument(id: string, status: "approved" | "rejected", note?: string) {
    setActionLoading(true);
    try {
      await sellerDocumentsApi.review(id, status, note);
      await loadData();
    } finally {
      setActionLoading(false);
    }
  }

  async function loadPendingPayouts() {
    setPayoutsLoading(true);
    try {
      const data = await adminOrdersApi.getPendingPayouts();
      setPendingPayouts(data);
    } catch {
      setPendingPayouts([]);
    } finally {
      setPayoutsLoading(false);
    }
  }

  async function handleReleasePayout(orderId: string) {
    setReleasingPayout(orderId);
    try {
      await adminOrdersApi.releasePayout(orderId);
      setPayoutFlash("Pago liberado correctamente.");
      setTimeout(() => setPayoutFlash(null), 3000);
      await loadPendingPayouts();
    } catch {
      setPayoutFlash("Error al liberar el pago. Intenta de nuevo.");
      setTimeout(() => setPayoutFlash(null), 3000);
    } finally {
      setReleasingPayout(null);
    }
  }

  if (authLoading || !user) return null;
  if (user.role !== "ADMIN") return null;

  const pendingApps      = applications.filter(a => a.status === "pending").length;
  const pendingDocs      = documents.filter(d => d.status === "pending").length;
  const openDisputes     = allDisputes.filter(d => d.status === "open" || d.status === "under_review").length;
  const suspendedCount   = allUsers.filter(u => u.isSuspended).length;
  const pendingPayoutsCount = (pendingPayouts ?? []).filter(o => o.payoutStatus === "pending").length;
  const filteredUsers    = allUsers.filter(u =>
    userSearch.trim() === "" ||
    u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );
  const filteredDisputes = filter === "all"
    ? allDisputes
    : allDisputes.filter(d => {
        if (filter === "pending") return d.status === "open" || d.status === "under_review";
        if (filter === "approved") return d.status === "resolved";
        if (filter === "rejected") return d.status === "rejected";
        return true;
      });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />

      <main id="main">
      <div className="pt-24 pb-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-black">Panel de Administración</h1>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Actividad de la plataforma, solicitudes de vendedor y disputas</p>
            </div>
            <div className="flex gap-2">
              {(["pending", "approved", "rejected", "all"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all capitalize"
                  style={filter === f
                    ? { background: "rgba(37,99,235,0.25)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.4)" }
                    : { background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid transparent" }}>
                  {f === "all" ? "Todos" : f === "pending" ? "Pendientes" : f === "approved" ? "Aprobados" : "Rechazados"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1 mt-6 flex-wrap">
            {[
              { key: "stats",        label: "Estadísticas",            count: 0            },
              { key: "incidents",    label: "Reportes",                count: openIncidents },
              { key: "applications", label: "Solicitudes de Vendedor", count: pendingApps  },
              { key: "documents",    label: "Documentos KYC",          count: pendingDocs  },
              { key: "disputes",     label: "Disputas",                count: openDisputes },
              { key: "users",        label: "Usuarios",                count: suspendedCount },
              { key: "cobros",       label: "Cobros Pendientes",       count: pendingPayoutsCount },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold border-b-2 transition-all"
                style={tab === t.key
                  ? { color: "var(--accent-text)", borderColor: "#2563EB", background: "rgba(37,99,235,0.08)" }
                  : { color: "var(--text-muted)", borderColor: "transparent" }}>
                {t.label}
                {t.count > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* ── SOLICITUDES ── */}
            {tab === "stats" && (
              <div className="space-y-6">
                {statsLoading && !overview ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-24 rounded-2xl shimmer" style={{ border: "1px solid var(--border)" }} />)}
                  </div>
                ) : overview ? (
                  <>
                    {/* Headline numbers. Money first — it's what the question usually is. */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {([
                        ["Ingresos cobrados", money(overview.orders.revenueCents), `comisión ${money(overview.orders.commissionCents)}`],
                        ["Ventas totales",    money(overview.orders.gmvCents),     `${overview.orders.total} órdenes · ${overview.orders.paid} pagadas`],
                        ["Minutos vistos",    overview.watch.watchedMinutes.toLocaleString("es-MX"), `${overview.watch.viewers} espectadores`],
                        ["Pujas",             overview.bids.total.toLocaleString("es-MX"), `${overview.bids.bidders} pujadores · ${overview.bids.automatic} automáticas`],
                        ["Minutos al aire",   overview.auctions.streamedMinutes.toLocaleString("es-MX"), `${overview.auctions.total} subastas`],
                        ["En vivo ahora",     String(overview.auctions.live), `${overview.auctions.scheduled} programadas`],
                        ["Usuarios",          String(overview.users.total), `${overview.users.sellers} vendedores · ${overview.users.buyers} compradores`],
                        ["Sorteos",           String(overview.raffles.drawn), `de ${overview.raffles.total} creados`],
                      ] as const).map(([label, value, sub]) => (
                        <div key={label} className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</p>
                          <p className="text-2xl font-black mt-1 tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Per-person detail. One table at a time keeps the columns readable. */}
                    <div className="flex gap-2">
                      {(["sellers", "buyers"] as const).map(k => (
                        <button key={k} onClick={() => setWho(k)}
                          className="px-4 py-2 rounded-full text-sm font-semibold"
                          style={who === k
                            ? { background: "var(--brand-light)", color: "var(--brand-ink)" }
                            : { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                          {k === "sellers" ? `Vendedores (${sellerRows.length})` : `Compradores (${buyerRows.length})`}
                        </button>
                      ))}
                    </div>

                    <div className="rounded-2xl overflow-x-auto" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                      <table className="w-full text-sm" style={{ minWidth: 680 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            {(who === "sellers"
                              ? ["Vendedor", "Lives", "Min. al aire", "Órdenes", "Ingresos", "Pujas recibidas", "Min. de audiencia"]
                              : ["Comprador", "Órdenes", "Gastado", "Sorteos ganados", "Pujas", "Min. vistos", "Lives"]
                            ).map((h, i) => (
                              <th key={h} className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap"
                                style={{ color: "var(--text-muted)", textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {who === "sellers" ? sellerRows.map(r => (
                            <tr key={r.userId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                              <td className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                                @{r.username}{r.verified && <span style={{ color: "var(--accent-text)" }}> ✓</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.lives}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.streamedMinutes.toLocaleString("es-MX")}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.orders}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: "var(--text-primary)" }}>{money(r.revenueCents)}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.bidsReceived}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.audienceMinutes.toLocaleString("es-MX")}</td>
                            </tr>
                          )) : buyerRows.map(r => (
                            <tr key={r.userId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                              <td className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>@{r.username}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.orders}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: "var(--text-primary)" }}>{money(r.spentCents)}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.giveaways}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.bids}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.watchedMinutes.toLocaleString("es-MX")}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{r.livesAttended}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-center py-12" style={{ color: "var(--text-muted)" }}>No se pudieron cargar las estadísticas.</p>
                )}
              </div>
            )}

            {tab === "incidents" && (
              <div className="space-y-3">
                {incidents.length === 0 ? (
                  <p className="text-sm text-center py-16" style={{ color: "var(--text-muted)" }}>No hay reportes.</p>
                ) : incidents.map(i => {
                  const kindLabel: Record<string, string> = {
                    live: "En transmisión", no_response: "Vendedor no responde",
                    seller_report: "Denuncia a vendedor", other: "Otro",
                  };
                  const stamp = (sec: number | null) =>
                    sec === null ? "" : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
                  const done = i.status === "resolved" || i.status === "dismissed";
                  return (
                    <div key={i.id} className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", opacity: done ? 0.6 : 1 }}>
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "var(--bg-elevated)", color: "var(--accent-text)" }}>{kindLabel[i.kind] ?? i.kind}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "var(--bg-elevated)", color: done ? "var(--text-muted)" : "var(--warn)" }}>{i.status}</span>
                        </div>
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {new Date(i.createdAt).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      <p className="text-sm" style={{ color: "var(--text-primary)" }}>{i.description}</p>
                      <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                        Reportó @{i.reporterUsername}
                        {i.reportedUsername && <> · sobre <span style={{ color: "var(--error-text)" }}>@{i.reportedUsername}</span></>}
                      </p>

                      {/* The whole point of marking instead of buffering: jump straight
                          to the minute in the recording that already exists. */}
                      {i.auctionId && i.fromOffsetSec !== null && (
                        <a href={`/auctions/${i.auctionId}/replay?t=${i.fromOffsetSec}`} target="_blank" rel="noopener"
                          className="inline-flex items-center gap-1.5 mt-2.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                          ▶ Ver la grabación {stamp(i.fromOffsetSec)} – {stamp(i.toOffsetSec)}
                        </a>
                      )}

                      {i.adminNote && (
                        <p className="text-xs mt-2 pt-2" style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)" }}>
                          Nota: {i.adminNote}
                        </p>
                      )}

                      {!done && (
                        <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <input
                            value={incidentNote[i.id] ?? ""}
                            onChange={e => setIncidentNote(p => ({ ...p, [i.id]: e.target.value }))}
                            placeholder="Qué se hizo (lo verá quien reportó)"
                            className="w-full rounded-lg px-3 py-2 text-sm"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                          <div className="flex gap-2">
                            {([["resolved", "Resolver"], ["dismissed", "Descartar"], ["reviewing", "En revisión"]] as const).map(([st, label]) => (
                              <button key={st} onClick={async () => {
                                try {
                                  await incidentsApi.resolve(i.id, st, incidentNote[i.id]);
                                  loadIncidents();
                                } catch {}
                              }}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg"
                                style={st === "resolved"
                                  ? { background: "var(--brand-light)", color: "var(--brand-ink)" }
                                  : { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "applications" && (
              <div className="space-y-3">
                <h2 className="sr-only">Solicitudes de vendedor</h2>
                {applications.length === 0 && (
                  <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>No hay solicitudes {filter !== "all" ? filter === "pending" ? "pendientes" : filter : ""}</div>
                )}
                {applications.map(app => {
                  const s = STATUS_STYLE[app.status];
                  const userDocs = documents.filter(d => d.userId === app.userId);
                  return (
                    <div key={app.id} className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="font-black text-base">{app.fullName}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                          </div>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                            @{app.user?.username ?? "—"} · {app.user?.email ?? "—"} · {app.state}
                          </p>
                          <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{app.description}</p>
                          <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                            Solicitado: {new Date(app.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          {app.reviewNote && (
                            <p className="text-xs text-[var(--error-text)] mt-2">Nota: {app.reviewNote}</p>
                          )}
                        </div>

                        {app.status === "pending" && (
                          <div className="flex flex-col gap-2 shrink-0">
                            <button onClick={() => reviewApplication(app.id, "approved")} disabled={actionLoading}
                              className="text-xs font-black px-5 py-2.5 rounded-xl disabled:opacity-50"
                              style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                              ✓ Aprobar
                            </button>
                            <button onClick={() => setSelected(app)}
                              className="text-xs font-black px-5 py-2.5 rounded-xl"
                              style={{ background: "rgba(248,113,113,0.12)", color: "var(--error-text)", border: "1px solid rgba(248,113,113,0.3)" }}>
                              ✕ Rechazar
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Documentos del usuario */}
                      {userDocs.length > 0 && (
                        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Documentos subidos</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {userDocs.map(doc => {
                              const ds = STATUS_STYLE[doc.status];
                              const isPDF = doc.fileUrl?.toLowerCase().includes(".pdf") || doc.fileUrl?.includes("/raw/");
                              return (
                                <div key={doc.id} className="rounded-xl p-3" style={{ background: "var(--bg-elevated)", border: `1px solid ${ds.color}22` }}>
                                  <p className="text-[11px] font-bold truncate mb-1">{DOC_LABELS[doc.documentType] ?? doc.documentType}</p>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: ds.bg, color: ds.color }}>{ds.label}</span>
                                  {doc.emissionDate && <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Emisión: {doc.emissionDate}</p>}
                                  <div className="flex gap-1 mt-2">
                                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                      className="text-[10px] font-bold px-2 py-1 rounded-lg"
                                      style={{ background: "rgba(37,99,235,0.2)", color: "var(--accent-text)" }}>
                                      {isPDF ? "Ver PDF" : "Ver"}
                                    </a>
                                    {doc.status === "pending" && (
                                      <>
                                        <button onClick={() => reviewDocument(doc.id, "approved")} disabled={actionLoading}
                                          className="text-[10px] font-bold px-2 py-1 rounded-lg disabled:opacity-50"
                                          style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>✓</button>
                                        <button onClick={() => reviewDocument(doc.id, "rejected")} disabled={actionLoading}
                                          className="text-[10px] font-bold px-2 py-1 rounded-lg disabled:opacity-50"
                                          style={{ background: "rgba(248,113,113,0.12)", color: "var(--error-text)" }}>✕</button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── DISPUTAS ── */}
            {tab === "disputes" && (
              <div className="space-y-3">
                <h2 className="sr-only">Disputas</h2>
                {filteredDisputes.length === 0 && (
                  <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>No hay disputas</div>
                )}
                {filteredDisputes.map(d => {
                  const s = DISPUTE_STATUS_STYLE[d.status] ?? DISPUTE_STATUS_STYLE.open;
                  const isOpen = d.status === "open" || d.status === "under_review";
                  return (
                    <div key={d.id} className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap mb-1">
                            <p className="font-black text-base">{DISPUTE_REASON_LABELS[d.reason] ?? d.reason}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                          </div>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            Comprador: @{d.buyer?.username ?? d.buyerId.slice(0, 8)} · Vendedor: @{d.seller?.username ?? d.sellerId.slice(0, 8)}
                          </p>
                          <p className="text-[11px] mt-0.5 font-mono" style={{ color: "var(--text-muted)" }}>Orden: {d.orderId}</p>
                          <p className="text-sm mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{d.description}</p>
                          <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                            {new Date(d.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          {d.resolutionNote && (
                            <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)" }}>
                              <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Resolución</p>
                              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{d.resolutionNote}</p>
                            </div>
                          )}
                        </div>
                        {isOpen && (
                          <button
                            onClick={() => { setDisputeSelected(d); setDisputeNote(""); setDisputeStatus("resolved"); }}
                            className="shrink-0 text-xs font-black px-5 py-2.5 rounded-xl"
                            style={{ background: "rgba(37,99,235,0.2)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.3)" }}
                          >
                            Responder →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── USUARIOS ── */}
            {tab === "users" && (
              <div>
                <h2 className="sr-only">Usuarios</h2>
                {/* Flash */}
                {userFlash && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-sm font-semibold"
                    style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
                    {userFlash}
                  </div>
                )}

                {/* Search */}
                <div className="mb-4">
                  <label htmlFor="admin-user-search" className="sr-only">Buscar por usuario o correo</label>
                  <input
                    id="admin-user-search"
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Buscar por usuario o correo..."
                    className="w-full rounded-xl px-4 py-2.5 text-sm placeholder:text-zinc-500 focus:border-[#2563EB]/50 transition-colors"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                </div>

                {usersLoading && allUsers.length === 0 ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
                  </div>
                ) : (
                  <>
                    {filteredUsers.length === 0 && (
                      <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>No se encontraron usuarios</div>
                    )}

                    <div className="space-y-2">
                      {filteredUsers.map(u => (
                        <div key={u.id} className="flex items-center gap-4 rounded-2xl p-4 flex-wrap"
                          style={{ background: "var(--bg-surface)", border: `1px solid ${u.isSuspended ? "rgba(248,113,113,0.2)" : "var(--border)"}` }}>

                          {/* Avatar placeholder + info */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-black"
                              style={{ background: u.isSuspended ? "rgba(248,113,113,0.15)" : "rgba(37,99,235,0.2)", color: u.isSuspended ? "var(--error-text)" : "var(--accent-text)" }}>
                              {u.username.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-sm">@{u.username}</p>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                  style={u.isSuspended
                                    ? { background: "rgba(248,113,113,0.15)", color: "var(--error-text)" }
                                    : { background: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
                                  {u.isSuspended ? "Suspendido" : "Activo"}
                                </span>
                                {u.isVerified && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>
                                    Verificado
                                  </span>
                                )}
                              </div>
                              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{u.email}</p>
                              {u.isSuspended && u.suspendReason && (
                                <p className="text-[11px] text-[var(--error-text)] mt-0.5 truncate" title={u.suspendReason}>
                                  Motivo: {u.suspendReason}
                                </p>
                              )}
                              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                Registro: {new Date(u.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="shrink-0 flex gap-2">
                            {u.isSuspended ? (
                              <button
                                onClick={() => handleUnsuspend(u)}
                                disabled={actionLoading}
                                className="text-xs font-black px-4 py-2 rounded-xl disabled:opacity-50"
                                style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                                Reactivar
                              </button>
                            ) : (
                              <button
                                onClick={() => { setSuspendTarget(u); setSuspendReason(""); setSuspendError(""); }}
                                disabled={actionLoading}
                                className="text-xs font-black px-4 py-2 rounded-xl disabled:opacity-50"
                                style={{ background: "rgba(248,113,113,0.12)", color: "var(--error-text)", border: "1px solid rgba(248,113,113,0.3)" }}>
                                Suspender
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Load more */}
                    {userSearch.trim() === "" && allUsers.length < usersTotal && (
                      <div className="flex justify-center mt-6">
                        <button
                          onClick={() => loadUsers(usersPage + 1, true)}
                          disabled={usersLoading}
                          className="text-sm font-bold px-6 py-2.5 rounded-xl disabled:opacity-50"
                          style={{ background: "rgba(37,99,235,0.2)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.3)" }}>
                          {usersLoading ? "Cargando..." : "Cargar más"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── DOCUMENTOS KYC ── */}
            {tab === "documents" && (
              <div className="space-y-2">
                <h2 className="sr-only">Documentos KYC</h2>
                {documents.length === 0 && (
                  <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>No hay documentos</div>
                )}
                {documents.map(doc => {
                  const s = STATUS_STYLE[doc.status];
                  return (
                    <div key={doc.id} className="flex items-center gap-4 rounded-2xl p-4 flex-wrap" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm">{DOC_LABELS[doc.documentType] ?? doc.documentType}</p>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>@{doc.user?.username ?? "—"} · {doc.user?.email ?? "—"}</p>
                        {doc.emissionDate && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Emisión: {doc.emissionDate}</p>}
                        {doc.rejectionNote && <p className="text-xs text-[var(--error-text)] mt-1">Rechazado: {doc.rejectionNote}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-bold px-4 py-2 rounded-xl"
                          style={{ background: "rgba(37,99,235,0.2)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.3)" }}>
                          Ver documento
                        </a>
                        {doc.status === "pending" && (
                          <>
                            <button onClick={() => reviewDocument(doc.id, "approved")} disabled={actionLoading}
                              className="text-xs font-black px-4 py-2 rounded-xl disabled:opacity-50"
                              style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                              ✓ Aprobar
                            </button>
                            <button onClick={() => reviewDocument(doc.id, "rejected")} disabled={actionLoading}
                              className="text-xs font-black px-4 py-2 rounded-xl disabled:opacity-50"
                              style={{ background: "rgba(248,113,113,0.12)", color: "var(--error-text)", border: "1px solid rgba(248,113,113,0.3)" }}>
                              ✕ Rechazar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* ── COBROS PENDIENTES ── */}
            {tab === "cobros" && (
              <div className="space-y-4">
                <h2 className="sr-only">Cobros pendientes</h2>
                {payoutFlash && (
                  <div className="px-4 py-3 rounded-xl text-sm font-semibold"
                    style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
                    {payoutFlash}
                  </div>
                )}

                {payoutsLoading && pendingPayouts === null ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
                  </div>
                ) : (pendingPayouts ?? []).length === 0 ? (
                  <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>No hay cobros pendientes</div>
                ) : (
                  <div className="space-y-3">
                    {(pendingPayouts ?? []).map(order => {
                      const isReleased  = order.payoutStatus === "released";
                      const cobro       = (order.payoutAmount ?? 0) / 100;
                      const total       = (order.totalCents ?? order.totalAmount ?? 0) / 100;
                      const relDate     = order.payoutReleasedAt
                        ? new Date(order.payoutReleasedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
                        : null;
                      const orderDate   = new Date(order.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
                      const sellerClabe = order.seller?.clabe ?? null;
                      const sellerMp    = order.seller?.mpPayoutEmail ?? null;

                      return (
                        <div key={order.id} className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-0">
                              {/* Header row */}
                              <div className="flex items-center gap-3 flex-wrap mb-2">
                                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{order.id.slice(0, 8)}…</span>
                                {isReleased ? (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
                                    ✅ Liberado
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
                                    ⏳ Pendiente
                                  </span>
                                )}
                              </div>

                              {/* Parties */}
                              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                Vendedor: <span className="font-bold" style={{ color: "var(--text-primary)" }}>@{order.seller?.username ?? "—"}</span>
                                {" · "}
                                Comprador: <span className="font-bold" style={{ color: "var(--text-primary)" }}>@{order.buyer?.username ?? "—"}</span>
                                {" · "}{orderDate}
                              </p>

                              {/* Amounts */}
                              <div className="flex flex-wrap gap-4 mt-3">
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Total orden</p>
                                  <p className="text-sm font-bold">${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Cobro vendedor (92%)</p>
                                  <p className="text-sm font-black" style={{ color: "#4ade80" }}>${cobro.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                                </div>
                                {isReleased && relDate && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Liberado el</p>
                                    <p className="text-sm font-semibold">{relDate}</p>
                                  </div>
                                )}
                              </div>

                              {/* Payout destination */}
                              <div className="mt-3 flex flex-wrap gap-2">
                                {sellerClabe ? (
                                  <span className="text-[11px] px-2 py-1 rounded-lg font-mono"
                                    style={{ background: "rgba(37,99,235,0.1)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.2)" }}>
                                    CLABE: {sellerClabe}
                                  </span>
                                ) : null}
                                {sellerMp ? (
                                  <span className="text-[11px] px-2 py-1 rounded-lg"
                                    style={{ background: "rgba(0,174,240,0.08)", color: "#60a5fa", border: "1px solid rgba(0,174,240,0.2)" }}>
                                    MP: {sellerMp}
                                  </span>
                                ) : null}
                                {!sellerClabe && !sellerMp && (
                                  <span className="text-[11px] px-2 py-1 rounded-lg"
                                    style={{ background: "rgba(248,113,113,0.08)", color: "var(--error-text)", border: "1px solid rgba(248,113,113,0.2)" }}>
                                    Sin datos de cobro registrados
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Action */}
                            {!isReleased && (
                              <div className="shrink-0">
                                {confirmPayoutId === order.id ? (
                                  <div className="flex flex-col items-end gap-2">
                                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>¿Confirmar liberación de ${((order.payoutAmount ?? 0) / 100).toLocaleString("es-MX")} MXN?</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={async () => {
                                          await handleReleasePayout(order.id);
                                          setConfirmPayoutId(null);
                                        }}
                                        className="text-xs font-bold text-white px-3 py-1.5 rounded-lg"
                                        style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                                      >Sí, liberar</button>
                                      <button onClick={() => setConfirmPayoutId(null)} className="text-xs px-3 py-1.5" style={{ color: "var(--text-muted)" }}>Cancelar</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmPayoutId(order.id)}
                                    disabled={releasingPayout === order.id}
                                    className="text-xs font-bold text-white px-4 py-2 rounded-xl disabled:opacity-50"
                                    style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                                  >
                                    {releasingPayout === order.id ? "Liberando…" : "💸 Liberar pago"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal rechazar solicitud */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div
            ref={selectedModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-app-heading"
            tabIndex={-1}
            className="relative w-full max-w-md rounded-2xl p-6"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <button
              onClick={() => { setSelected(null); setRejectNote(""); }}
              aria-label="Cerrar"
              className="absolute top-4 right-4 text-xl transition-opacity hover:opacity-60"
              style={{ color: "var(--text-muted)" }}
            >✕</button>
            <h2 id="reject-app-heading" className="font-black text-lg mb-1">Rechazar solicitud</h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>@{selected.user?.username} — {selected.fullName}</p>
            <label htmlFor="reject-note" className="sr-only">Motivo del rechazo</label>
            <textarea id="reject-note" value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3}
              placeholder="Motivo del rechazo (se le mostrará al usuario)..."
              className="w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 focus:border-red-500/50 resize-none mb-4 transition-colors"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            <div className="flex gap-3">
              <button onClick={() => { setSelected(null); setRejectNote(""); }}
                className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                Cancelar
              </button>
              <button onClick={() => reviewApplication(selected.id, "rejected")} disabled={actionLoading || !rejectNote.trim()}
                className="flex-1 py-3 rounded-xl font-black text-white text-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}>
                {actionLoading ? "..." : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {docPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-zoom-out" style={{ background: "rgba(0,0,0,0.9)" }} onClick={() => setDocPreview(null)}>
          <div
            ref={docPreviewModalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Vista previa de documento"
            tabIndex={-1}
            className="relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setDocPreview(null)}
              aria-label="Cerrar"
              className="absolute -top-10 right-0 text-xl text-white transition-opacity hover:opacity-60"
            >✕</button>
            <img src={docPreview} alt="Documento" className="max-w-full max-h-full rounded-xl object-contain" />
          </div>
        </div>
      )}

      {/* Modal suspender usuario */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div
            ref={suspendModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="suspend-user-heading"
            tabIndex={-1}
            className="relative w-full max-w-md rounded-2xl p-6"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <button
              onClick={() => { setSuspendTarget(null); setSuspendReason(""); setSuspendError(""); }}
              aria-label="Cerrar"
              className="absolute top-4 right-4 text-xl transition-opacity hover:opacity-60"
              style={{ color: "var(--text-muted)" }}
            >✕</button>
            <h2 id="suspend-user-heading" className="font-black text-lg mb-1">Suspender usuario</h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>@{suspendTarget.username} · {suspendTarget.email}</p>
            <label htmlFor="suspend-reason" className="text-xs font-semibold block mb-2" style={{ color: "var(--text-secondary)" }}>Motivo de la suspensión</label>
            <textarea
              id="suspend-reason"
              value={suspendReason}
              onChange={e => { setSuspendReason(e.target.value); setSuspendError(""); }}
              rows={3}
              placeholder="Describe el motivo (mínimo 10 caracteres)..."
              className="w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 focus:border-red-500/50 resize-none mb-2 transition-colors"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
            {suspendError && (
              <p className="text-xs text-[var(--error-text)] mb-3">{suspendError}</p>
            )}
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { setSuspendTarget(null); setSuspendReason(""); setSuspendError(""); }}
                className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                Cancelar
              </button>
              <button
                onClick={handleSuspend}
                disabled={actionLoading || suspendReason.trim().length < 10}
                className="flex-1 py-3 rounded-xl font-black text-white text-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}>
                {actionLoading ? "..." : "Confirmar suspensión"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal resolver disputa */}
      {disputeSelected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div
            ref={disputeModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dispute-resolve-heading"
            tabIndex={-1}
            className="relative w-full max-w-md rounded-2xl p-6"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <button
              onClick={() => { setDisputeSelected(null); setDisputeNote(""); }}
              aria-label="Cerrar"
              className="absolute top-4 right-4 text-xl transition-opacity hover:opacity-60"
              style={{ color: "var(--text-muted)" }}
            >✕</button>
            <h2 id="dispute-resolve-heading" className="font-black text-lg mb-1">Resolver disputa</h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              {DISPUTE_REASON_LABELS[disputeSelected.reason]} · @{disputeSelected.buyer?.username ?? "comprador"}
            </p>

            <div className="mb-4">
              <label className="text-xs font-semibold block mb-2" style={{ color: "var(--text-secondary)" }}>Resultado</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDisputeStatus("resolved")}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                  style={disputeStatus === "resolved"
                    ? { background: "rgba(74,222,128,0.2)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.4)" }
                    : { background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid transparent" }}
                >
                  ✓ A favor del comprador
                </button>
                <button
                  onClick={() => setDisputeStatus("rejected")}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                  style={disputeStatus === "rejected"
                    ? { background: "rgba(248,113,113,0.2)", color: "var(--error-text)", border: "1px solid rgba(248,113,113,0.4)" }
                    : { background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid transparent" }}
                >
                  ✕ A favor del vendedor
                </button>
              </div>
            </div>

            <label htmlFor="dispute-note" className="sr-only">Explicación de la resolución</label>
            <textarea
              id="dispute-note"
              value={disputeNote}
              onChange={e => setDisputeNote(e.target.value)}
              rows={4}
              placeholder="Explica la resolución al comprador..."
              className="w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 focus:border-[#2563EB]/50 resize-none mb-4 transition-colors"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setDisputeSelected(null); setDisputeNote(""); }}
                className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
              >
                Cancelar
              </button>
              <button
                onClick={resolveDispute}
                disabled={actionLoading || !disputeNote.trim()}
                className="flex-1 py-3 rounded-xl font-black text-white text-sm disabled:opacity-50"
                style={{ background: disputeStatus === "resolved" ? "linear-gradient(135deg, #059669, #10b981)" : "linear-gradient(135deg, #dc2626, #ef4444)" }}
              >
                {actionLoading ? "..." : "Confirmar resolución"}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
