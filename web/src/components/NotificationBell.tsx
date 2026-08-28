"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { notificationsApi, type ApiNotification } from "@/lib/api";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

/* dot color by notification type */
function typeDot(type: string): string {
  if (type === "outbid") return "#f59e0b"; // no longer sent; kept so old rows still render
  if (type.startsWith("auction")) return "#ef4444";
  if (type === "new_message") return "var(--brand)";
  if (type.startsWith("dispute")) return "var(--error-text)";
  return "var(--accent-text)";
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("tcg_token")) return;
    notificationsApi.list()
      .then((r) => { setItems(r.data.items); setUnread(r.data.unread); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function toggle() { setOpen((v) => !v); if (!open) load(); }

  function openItem(n: ApiNotification) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      notificationsApi.markRead(n.id).catch(() => {});
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    notificationsApi.markAllRead().catch(() => {});
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={toggle}
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        aria-expanded={open}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:brightness-110"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums"
            style={{ background: "var(--brand-light)", color: "var(--brand-ink)", border: "2px solid var(--bg-base)" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-3 right-3 top-[4.5rem] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem] rounded-2xl overflow-hidden z-[60]"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Notificaciones</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-medium" style={{ color: "var(--accent-text)" }}>
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sin notificaciones aún</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className="w-full text-left px-4 py-3 flex gap-3 transition-colors"
                  style={{ borderBottom: "1px solid var(--border-subtle)", background: n.read ? "transparent" : "var(--bg-hover)" }}
                >
                  <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: n.read ? "var(--border)" : typeDot(n.type) }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{n.title}</span>
                      <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="block text-xs mt-0.5 leading-snug" style={{ color: "var(--text-secondary)" }}>{n.body}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
