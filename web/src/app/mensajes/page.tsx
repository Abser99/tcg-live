"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { messagesApi, type MessageThread, type ApiMessage } from "@/lib/api";

function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default function MensajesPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesApi.threads().then((r) => setThreads(r.data)).catch(() => setThreads([])).finally(() => setLoading(false));
  }, []);

  const loadMessages = useCallback((orderId: string) => {
    messagesApi.getMessages(orderId).then((r) => setMessages(r.data)).catch(() => setMessages([]));
  }, []);

  // Poll the open conversation for near-live updates (web doesn't use the WS gateway)
  useEffect(() => {
    if (!active) return;
    loadMessages(active.orderId);
    const id = setInterval(() => loadMessages(active.orderId), 5000);
    return () => clearInterval(id);
  }, [active, loadMessages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const body = input.trim();
    if (!body || !active || sending) return;
    setSending(true);
    setInput("");
    try {
      const r = await messagesApi.send(active.orderId, body);
      setMessages((prev) => [...prev, r.data]);
    } catch {
      setInput(body);
    } finally { setSending(false); }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />
      <main id="main" className="mx-auto max-w-5xl px-6 pt-32 pb-20">
        <div className="mb-2 text-[11px] font-medium uppercase" style={{ letterSpacing: "0.16em", color: "var(--text-muted)" }}>Conversaciones</div>
        <h1 className="text-4xl md:text-[2.75rem] font-medium tracking-[-0.025em]" style={{ color: "var(--text-primary)" }}>Mensajes</h1>

        <div className="mt-10 grid md:grid-cols-[300px_1fr] gap-5 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", minHeight: "28rem" }}>
          {/* Thread list */}
          <div style={{ borderRight: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
            {loading ? (
              <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl shimmer" />)}</div>
            ) : threads.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sin conversaciones aún.</p>
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Los chats se abren con el vendedor o comprador de una orden.</p>
              </div>
            ) : (
              threads.map((t) => {
                const isActive = active?.orderId === t.orderId;
                return (
                  <button key={t.orderId} onClick={() => setActive(t)}
                    className="w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors"
                    style={{ borderBottom: "1px solid var(--border-subtle)", background: isActive ? "var(--bg-hover)" : "transparent" }}>
                    <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      {(t.otherUser?.username ?? "?").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>@{t.otherUser?.username ?? "Usuario"}</span>
                      <span className="block text-xs truncate" style={{ color: "var(--text-muted)" }}>{t.lastMessage?.content ?? "—"}</span>
                    </span>
                    {!!t.unreadCount && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--brand-light)" }} />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Conversation */}
          <div className="flex flex-col" style={{ background: "var(--bg-base)" }}>
            {!active ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Selecciona una conversación para ver los mensajes.</p>
              </div>
            ) : (
              <>
                <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>@{active.otherUser?.username ?? "Usuario"}</p>
                  <Link href="/compras" className="text-xs font-medium" style={{ color: "var(--accent-text)" }}>Ver orden</Link>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ maxHeight: "26rem" }}>
                  {messages.length === 0 ? (
                    <p className="text-center text-sm py-8" style={{ color: "var(--text-muted)" }}>Sé el primero en escribir.</p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderId === user?.id;
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className="max-w-[78%] px-3.5 py-2 rounded-2xl"
                            style={mine
                              ? { background: "var(--brand-light)", color: "var(--brand-ink)", borderBottomRightRadius: 6 }
                              : { background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)", borderBottomLeftRadius: 6 }}>
                            <p className="text-sm leading-snug whitespace-pre-wrap break-words">{m.body}</p>
                            <p className="text-[10px] mt-1" style={{ color: mine ? "rgba(26,21,5,0.6)" : "var(--text-muted)" }}>{timeShort(m.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="p-3 flex items-center gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                    placeholder="Escribe un mensaje…"
                    maxLength={1000}
                    className="flex-1 rounded-full px-4 py-2.5 text-sm"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                  <button onClick={send} disabled={sending || !input.trim()}
                    className="text-sm font-semibold px-5 py-2.5 rounded-full disabled:opacity-50"
                    style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>Enviar</button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
