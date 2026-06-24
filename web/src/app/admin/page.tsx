"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import {
  sellerApplicationsApi, sellerDocumentsApi, disputesApi, usersApi, adminOrdersApi,
  type SellerApplication, type SellerDocumentRecord, type ApiDispute, type AdminUser, type ApiOrder,
} from "@/lib/api";

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
  rejected: { label: "Rechazado", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [applications,  setApplications]  = useState<SellerApplication[]>([]);
  const [documents,     setDocuments]     = useState<SellerDocumentRecord[]>([]);
  const [allDisputes,   setAllDisputes]   = useState<ApiDispute[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState<"applications" | "documents" | "disputes" | "users" | "cobros">("applications");
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
    rejected:     { label: "Rechazada",   color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  };

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "ADMIN")) router.replace("/");
  }, [authLoading, user, router]);

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

  useEffect(() => {
    if (tab === "users" && allUsers.length === 0) loadUsers(1);
  }, [tab, allUsers.length, loadUsers]);

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
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      <div className="pt-24 pb-0 border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-black">Panel de Administración</h1>
              <p className="text-zinc-500 text-sm mt-1">Revisión de solicitudes y documentos KYC</p>
            </div>
            <div className="flex gap-2">
              {(["pending", "approved", "rejected", "all"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all capitalize"
                  style={filter === f
                    ? { background: "rgba(108,58,232,0.25)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.4)" }
                    : { background: "rgba(255,255,255,0.04)", color: "#71717a", border: "1px solid transparent" }}>
                  {f === "all" ? "Todos" : f === "pending" ? "Pendientes" : f === "approved" ? "Aprobados" : "Rechazados"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1 mt-6 flex-wrap">
            {[
              { key: "applications", label: "Solicitudes de Vendedor", count: pendingApps  },
              { key: "documents",    label: "Documentos KYC",          count: pendingDocs  },
              { key: "disputes",     label: "Disputas",                count: openDisputes },
              { key: "users",        label: "Usuarios",                count: suspendedCount },
              { key: "cobros",       label: "Cobros Pendientes",       count: pendingPayoutsCount },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold border-b-2 transition-all"
                style={tab === t.key
                  ? { color: "#a78bfa", borderColor: "#6C3AE8", background: "rgba(108,58,232,0.08)" }
                  : { color: "#71717a", borderColor: "transparent" }}>
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
            <div className="w-6 h-6 rounded-full border-2 border-[#6C3AE8] border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* ── SOLICITUDES ── */}
            {tab === "applications" && (
              <div className="space-y-3">
                {applications.length === 0 && (
                  <div className="text-center py-16 text-zinc-500">No hay solicitudes {filter !== "all" ? filter === "pending" ? "pendientes" : filter : ""}</div>
                )}
                {applications.map(app => {
                  const s = STATUS_STYLE[app.status];
                  const userDocs = documents.filter(d => d.userId === app.userId);
                  return (
                    <div key={app.id} className="rounded-2xl p-5" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="font-black text-base">{app.fullName}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">
                            @{app.user?.username ?? "—"} · {app.user?.email ?? "—"} · {app.state}
                          </p>
                          <p className="text-sm text-zinc-300 mt-3 leading-relaxed">{app.description}</p>
                          <p className="text-[11px] text-zinc-600 mt-2">
                            Solicitado: {new Date(app.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          {app.reviewNote && (
                            <p className="text-xs text-red-400 mt-2">Nota: {app.reviewNote}</p>
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
                              style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                              ✕ Rechazar
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Documentos del usuario */}
                      {userDocs.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/5">
                          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Documentos subidos</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {userDocs.map(doc => {
                              const ds = STATUS_STYLE[doc.status];
                              const isPDF = doc.fileUrl?.toLowerCase().includes(".pdf") || doc.fileUrl?.includes("/raw/");
                              return (
                                <div key={doc.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ds.color}22` }}>
                                  <p className="text-[11px] font-bold truncate mb-1">{DOC_LABELS[doc.documentType] ?? doc.documentType}</p>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: ds.bg, color: ds.color }}>{ds.label}</span>
                                  {doc.emissionDate && <p className="text-[10px] text-zinc-600 mt-1">Emisión: {doc.emissionDate}</p>}
                                  <div className="flex gap-1 mt-2">
                                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                      className="text-[10px] font-bold px-2 py-1 rounded-lg"
                                      style={{ background: "rgba(108,58,232,0.2)", color: "#a78bfa" }}>
                                      {isPDF ? "Ver PDF" : "Ver"}
                                    </a>
                                    {doc.status === "pending" && (
                                      <>
                                        <button onClick={() => reviewDocument(doc.id, "approved")} disabled={actionLoading}
                                          className="text-[10px] font-bold px-2 py-1 rounded-lg disabled:opacity-50"
                                          style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>✓</button>
                                        <button onClick={() => reviewDocument(doc.id, "rejected")} disabled={actionLoading}
                                          className="text-[10px] font-bold px-2 py-1 rounded-lg disabled:opacity-50"
                                          style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>✕</button>
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
                {filteredDisputes.length === 0 && (
                  <div className="text-center py-16 text-zinc-500">No hay disputas</div>
                )}
                {filteredDisputes.map(d => {
                  const s = DISPUTE_STATUS_STYLE[d.status] ?? DISPUTE_STATUS_STYLE.open;
                  const isOpen = d.status === "open" || d.status === "under_review";
                  return (
                    <div key={d.id} className="rounded-2xl p-5" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap mb-1">
                            <p className="font-black text-base">{DISPUTE_REASON_LABELS[d.reason] ?? d.reason}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            Comprador: @{d.buyer?.username ?? d.buyerId.slice(0, 8)} · Vendedor: @{d.seller?.username ?? d.sellerId.slice(0, 8)}
                          </p>
                          <p className="text-[11px] text-zinc-600 mt-0.5 font-mono">Orden: {d.orderId}</p>
                          <p className="text-sm text-zinc-300 mt-3 leading-relaxed">{d.description}</p>
                          <p className="text-[11px] text-zinc-600 mt-2">
                            {new Date(d.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          {d.resolutionNote && (
                            <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(108,58,232,0.08)", border: "1px solid rgba(108,58,232,0.2)" }}>
                              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Resolución</p>
                              <p className="text-sm text-zinc-300">{d.resolutionNote}</p>
                            </div>
                          )}
                        </div>
                        {isOpen && (
                          <button
                            onClick={() => { setDisputeSelected(d); setDisputeNote(""); setDisputeStatus("resolved"); }}
                            className="shrink-0 text-xs font-black px-5 py-2.5 rounded-xl"
                            style={{ background: "rgba(108,58,232,0.2)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.3)" }}
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
                {/* Flash */}
                {userFlash && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-sm font-semibold"
                    style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
                    {userFlash}
                  </div>
                )}

                {/* Search */}
                <div className="mb-4">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Buscar por usuario o correo..."
                    className="w-full bg-[#16161E] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/50"
                  />
                </div>

                {usersLoading && allUsers.length === 0 ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 rounded-full border-2 border-[#6C3AE8] border-t-transparent animate-spin" />
                  </div>
                ) : (
                  <>
                    {filteredUsers.length === 0 && (
                      <div className="text-center py-16 text-zinc-500">No se encontraron usuarios</div>
                    )}

                    <div className="space-y-2">
                      {filteredUsers.map(u => (
                        <div key={u.id} className="flex items-center gap-4 rounded-2xl p-4 flex-wrap"
                          style={{ background: "#16161E", border: `1px solid ${u.isSuspended ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.07)"}` }}>

                          {/* Avatar placeholder + info */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-black"
                              style={{ background: u.isSuspended ? "rgba(248,113,113,0.15)" : "rgba(108,58,232,0.2)", color: u.isSuspended ? "#f87171" : "#a78bfa" }}>
                              {u.username.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-sm">@{u.username}</p>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                  style={u.isSuspended
                                    ? { background: "rgba(248,113,113,0.15)", color: "#f87171" }
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
                              <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                              {u.isSuspended && u.suspendReason && (
                                <p className="text-[11px] text-red-400 mt-0.5 truncate" title={u.suspendReason}>
                                  Motivo: {u.suspendReason}
                                </p>
                              )}
                              <p className="text-[11px] text-zinc-600 mt-0.5">
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
                                style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
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
                          style={{ background: "rgba(108,58,232,0.2)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.3)" }}>
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
                {documents.length === 0 && (
                  <div className="text-center py-16 text-zinc-500">No hay documentos</div>
                )}
                {documents.map(doc => {
                  const s = STATUS_STYLE[doc.status];
                  return (
                    <div key={doc.id} className="flex items-center gap-4 rounded-2xl p-4 flex-wrap" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm">{DOC_LABELS[doc.documentType] ?? doc.documentType}</p>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">@{doc.user?.username ?? "—"} · {doc.user?.email ?? "—"}</p>
                        {doc.emissionDate && <p className="text-[11px] text-zinc-600 mt-0.5">Emisión: {doc.emissionDate}</p>}
                        {doc.rejectionNote && <p className="text-xs text-red-400 mt-1">Rechazado: {doc.rejectionNote}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-bold px-4 py-2 rounded-xl"
                          style={{ background: "rgba(108,58,232,0.2)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.3)" }}>
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
                              style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
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
                {payoutFlash && (
                  <div className="px-4 py-3 rounded-xl text-sm font-semibold"
                    style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
                    {payoutFlash}
                  </div>
                )}

                {payoutsLoading && pendingPayouts === null ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 rounded-full border-2 border-[#6C3AE8] border-t-transparent animate-spin" />
                  </div>
                ) : (pendingPayouts ?? []).length === 0 ? (
                  <div className="text-center py-16 text-zinc-500">No hay cobros pendientes</div>
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
                        <div key={order.id} className="rounded-2xl p-5" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-0">
                              {/* Header row */}
                              <div className="flex items-center gap-3 flex-wrap mb-2">
                                <span className="text-xs font-mono text-zinc-500">{order.id.slice(0, 8)}…</span>
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
                              <p className="text-xs text-zinc-400">
                                Vendedor: <span className="font-bold text-white">@{order.seller?.username ?? "—"}</span>
                                {" · "}
                                Comprador: <span className="font-bold text-white">@{order.buyer?.username ?? "—"}</span>
                                {" · "}{orderDate}
                              </p>

                              {/* Amounts */}
                              <div className="flex flex-wrap gap-4 mt-3">
                                <div>
                                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Total orden</p>
                                  <p className="text-sm font-bold">${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Cobro vendedor (92%)</p>
                                  <p className="text-sm font-black" style={{ color: "#4ade80" }}>${cobro.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                                </div>
                                {isReleased && relDate && (
                                  <div>
                                    <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Liberado el</p>
                                    <p className="text-sm font-semibold">{relDate}</p>
                                  </div>
                                )}
                              </div>

                              {/* Payout destination */}
                              <div className="mt-3 flex flex-wrap gap-2">
                                {sellerClabe ? (
                                  <span className="text-[11px] px-2 py-1 rounded-lg font-mono"
                                    style={{ background: "rgba(108,58,232,0.1)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.2)" }}>
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
                                    style={{ background: "rgba(248,113,113,0.08)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}>
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
                                    <span className="text-xs text-zinc-400">¿Confirmar liberación de ${((order.payoutAmount ?? 0) / 100).toLocaleString("es-MX")} MXN?</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={async () => {
                                          await handleReleasePayout(order.id);
                                          setConfirmPayoutId(null);
                                        }}
                                        className="text-xs font-bold text-white px-3 py-1.5 rounded-lg"
                                        style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                                      >Sí, liberar</button>
                                      <button onClick={() => setConfirmPayoutId(null)} className="text-xs text-zinc-500 px-3 py-1.5">Cancelar</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmPayoutId(order.id)}
                                    disabled={releasingPayout === order.id}
                                    className="text-xs font-bold text-white px-4 py-2 rounded-xl disabled:opacity-50"
                                    style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
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
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h3 className="font-black text-lg mb-1">Rechazar solicitud</h3>
            <p className="text-sm text-zinc-500 mb-4">@{selected.user?.username} — {selected.fullName}</p>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3}
              placeholder="Motivo del rechazo (se le mostrará al usuario)..."
              className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/50 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setSelected(null); setRejectNote(""); }}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-400 text-sm"
                style={{ background: "rgba(255,255,255,0.05)" }}>
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
          <img src={docPreview} alt="Documento" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}

      {/* Modal suspender usuario */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h3 className="font-black text-lg mb-1">Suspender usuario</h3>
            <p className="text-sm text-zinc-500 mb-4">@{suspendTarget.username} · {suspendTarget.email}</p>
            <label className="text-xs font-semibold text-zinc-400 block mb-2">Motivo de la suspensión</label>
            <textarea
              value={suspendReason}
              onChange={e => { setSuspendReason(e.target.value); setSuspendError(""); }}
              rows={3}
              placeholder="Describe el motivo (mínimo 10 caracteres)..."
              className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/50 resize-none mb-2"
            />
            {suspendError && (
              <p className="text-xs text-red-400 mb-3">{suspendError}</p>
            )}
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { setSuspendTarget(null); setSuspendReason(""); setSuspendError(""); }}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-400 text-sm"
                style={{ background: "rgba(255,255,255,0.05)" }}>
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
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h3 className="font-black text-lg mb-1">Resolver disputa</h3>
            <p className="text-sm text-zinc-500 mb-4">
              {DISPUTE_REASON_LABELS[disputeSelected.reason]} · @{disputeSelected.buyer?.username ?? "comprador"}
            </p>

            <div className="mb-4">
              <label className="text-xs font-semibold text-zinc-400 block mb-2">Resultado</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDisputeStatus("resolved")}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                  style={disputeStatus === "resolved"
                    ? { background: "rgba(74,222,128,0.2)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.4)" }
                    : { background: "rgba(255,255,255,0.05)", color: "#71717a", border: "1px solid transparent" }}
                >
                  ✓ A favor del comprador
                </button>
                <button
                  onClick={() => setDisputeStatus("rejected")}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                  style={disputeStatus === "rejected"
                    ? { background: "rgba(248,113,113,0.2)", color: "#f87171", border: "1px solid rgba(248,113,113,0.4)" }
                    : { background: "rgba(255,255,255,0.05)", color: "#71717a", border: "1px solid transparent" }}
                >
                  ✕ A favor del vendedor
                </button>
              </div>
            </div>

            <textarea
              value={disputeNote}
              onChange={e => setDisputeNote(e.target.value)}
              rows={4}
              placeholder="Explica la resolución al comprador..."
              className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/50 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setDisputeSelected(null); setDisputeNote(""); }}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-400 text-sm"
                style={{ background: "rgba(255,255,255,0.05)" }}
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
    </div>
  );
}
