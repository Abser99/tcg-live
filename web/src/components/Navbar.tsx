"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth";
import NotificationBell from "@/components/NotificationBell";

export default function Navbar({ minimal = false }: { minimal?: boolean }) {
  const { user, logout, loading } = useAuth();
  const initials = user?.username?.slice(0, 2).toUpperCase() ?? "TG";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const isSeller = user?.role === "SELLER" || user?.role === "ADMIN";
  // Top nav stays lean: the live-auctions landing (reached via the logo) is the only page,
  // so no "Subastas" / "Tienda" entries. Everything personal lives in the profile dropdown.
  const navLinks = [
    ...(user ? [] : [{ href: "/#features", label: "Características" }]),
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin", admin: true }] : []),
  ];

  // Everything reachable from the profile button (no more profile tabs).
  const menuItems: { href: string; label: string; icon: string }[] = [
    { href: "/perfil",              label: "Mi perfil",   icon: "👤" },
    { href: "/compras",             label: "Mis compras", icon: "🧾" },
    { href: "/mensajes",            label: "Mensajes",    icon: "💬" },
    { href: "/perfil?sec=watchlist",label: "Seguimiento", icon: "👁️" },
    { href: "/perfil?sec=disputas", label: "Disputas",    icon: "⚖️" },
    { href: "/ajustes",             label: "Ajustes",     icon: "⚙️" },
    { href: "/soporte",             label: "Soporte",     icon: "🛟" },
    ...(isSeller ? [{ href: "/vendedor", label: "Mi tienda", icon: "🏪" }] : []),
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin", icon: "🛠️" }] : []),
  ];

  const INK = "var(--brand-ink)"; // text on a brand fill

  return (
    <>
      <style>{`
        .nav-link { position: relative; transition: color 0.2s ease; }
        .nav-link::after { content: ""; position: absolute; left: 0; bottom: -5px; width: 100%; height: 1px; background: var(--accent-text); transform: scaleX(0); transform-origin: left; transition: transform 0.28s cubic-bezier(0.22,1,0.36,1); }
        .nav-link:hover { color: var(--text-primary); }
        .nav-link:hover::after { transform: scaleX(1); }
      `}</style>
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-200"
        style={{
          background: "var(--nav-bg)",
          borderColor: "var(--border-subtle)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ background: "var(--brand-light)", color: INK }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" />
              </svg>
            </div>
            <span className="font-semibold text-lg tracking-tight" style={{ color: "var(--text-primary)" }}>
              TCG<span style={{ color: "var(--accent-text)" }}>Live</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          {!minimal && (
          <div className="hidden md:flex items-center gap-9 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="nav-link"
                style={l.admin ? { color: "#f59e0b", fontWeight: 600 } : {}}
              >
                {l.label}
              </Link>
            ))}
          </div>
          )}

          {/* Right side */}
          {!minimal && (
          <div className="flex items-center gap-2">
            {!loading && (
              <>
                {user ? (
                  <>
                    <NotificationBell />
                    {/* Profile button → dropdown menu with everything (replaces the profile tabs) */}
                    <div className="relative" ref={menuRef}>
                      <button
                        onClick={() => setMenuOpen(o => !o)}
                        aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Menú de perfil"
                        className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl transition-all"
                        style={{ color: "var(--text-primary)", border: "1px solid var(--border)", background: menuOpen ? "var(--bg-hover)" : "transparent" }}
                      >
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold overflow-hidden shrink-0"
                          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                          {user.avatarUrl
                            ? <Image src={user.avatarUrl} alt={user.username} width={28} height={28} className="w-full h-full object-cover" />
                            : initials}
                        </span>
                        <span className="hidden sm:inline">{user.username}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className="hidden sm:block shrink-0 transition-transform" style={{ transform: menuOpen ? "rotate(180deg)" : "none", color: "var(--text-muted)" }} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                      {menuOpen && (
                        <div role="menu" className="absolute right-0 mt-2 w-56 rounded-2xl overflow-hidden py-1.5 z-50"
                          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
                          <div className="px-4 pb-2 pt-1 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>@{user.username}</div>
                          {menuItems.map(m => (
                            <Link key={m.href} href={m.href} role="menuitem" onClick={() => setMenuOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
                              style={{ color: "var(--text-secondary)" }}>
                              <span className="w-5 text-center text-base leading-none" aria-hidden="true">{m.icon}</span>
                              {m.label}
                            </Link>
                          ))}
                          <div className="my-1.5 mx-4" style={{ borderTop: "1px solid var(--border)" }} />
                          <button role="menuitem" onClick={() => { setMenuOpen(false); logout(); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-[var(--bg-hover)]"
                            style={{ color: "var(--error-text)" }}>
                            <span className="w-5 text-center text-base leading-none" aria-hidden="true">↩</span>
                            Cerrar sesión
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="text-sm px-4 py-2 hidden sm:block transition-colors"
                      style={{ color: "var(--text-secondary)" }}
                      onMouseEnter={e => ((e.target as HTMLElement).style.color = "var(--text-primary)")}
                      onMouseLeave={e => ((e.target as HTMLElement).style.color = "var(--text-secondary)")}
                    >
                      Iniciar sesión
                    </Link>
                    <Link
                      href="/register"
                      className="text-sm font-semibold px-5 py-2.5 rounded-full transition-all active:scale-95 hover:brightness-105"
                      style={{ background: "var(--brand-light)", color: INK }}
                    >
                      Registrarse
                    </Link>
                  </>
                )}
              </>
            )}

            {/* Hamburger */}
            <button
              onClick={() => setMobileOpen(v => !v)}
              className="md:hidden flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-colors gap-1.5"
              style={{ color: "var(--text-secondary)" }}
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileOpen}
              aria-controls="navbar-mobile-menu"
            >
              <span className="block w-5 h-0.5 bg-current transition-all duration-200 origin-center"
                style={mobileOpen ? { transform: "rotate(45deg) translate(2px, 2px)" } : {}} />
              <span className="block w-5 h-0.5 bg-current transition-all duration-200"
                style={mobileOpen ? { opacity: 0, transform: "scaleX(0)" } : {}} />
              <span className="block w-5 h-0.5 bg-current transition-all duration-200 origin-center"
                style={mobileOpen ? { transform: "rotate(-45deg) translate(2px, -2px)" } : {}} />
            </button>
          </div>
          )}
        </div>

        {/* Mobile menu */}
        {!minimal && mobileOpen && (
          <div
            id="navbar-mobile-menu"
            className="md:hidden border-t"
            style={{
              background: "var(--nav-bg)",
              borderColor: "var(--border-subtle)",
              backdropFilter: "blur(20px)",
            }}
          >
            <div className="px-4 py-4 flex flex-col gap-1">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-3 py-3 rounded-xl text-sm font-semibold transition-colors"
                  style={l.admin ? { color: "#f59e0b" } : { color: "var(--text-secondary)" }}
                  onMouseEnter={e => { if (!l.admin) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {l.label}
                </Link>
              ))}
              {user && (
                <button
                  onClick={() => { logout(); setMobileOpen(false); }}
                  className="flex items-center px-3 py-3 rounded-xl text-sm font-semibold text-left transition-colors"
                  style={{ color: "var(--error-text)" }}
                >
                  Cerrar sesión
                </button>
              )}
              {!user && (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-3 py-3 rounded-xl text-sm font-semibold transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Iniciar sesión
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>
    </>
  );
}

