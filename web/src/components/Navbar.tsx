"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useTheme } from "@/contexts/theme";

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const initials = user?.username?.slice(0, 2).toUpperCase() ?? "TG";
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/auctions", label: "Subastas" },
    { href: "/shop", label: "Tienda" },
    { href: "/#features", label: "Características" },
    ...(user?.role === "SELLER" || user?.role === "ADMIN" ? [{ href: "/vendedor", label: "Mi tienda", admin: false }] : []),
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin", admin: true }] : []),
  ];

  const isDark = theme === "dark";

  return (
    <>
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
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg font-black text-base"
              style={{
                background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                boxShadow: "0 0 16px rgba(37,99,235,0.5)",
              }}
            >
              ⚡
            </div>
            <span className="font-black text-lg tracking-tight" style={{ color: "var(--text-primary)" }}>
              TCG<span style={{ color: "var(--accent-text)" }}>Live</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: "var(--text-secondary)" }}>
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="hover:text-[var(--accent-text)] transition-colors"
                style={l.admin ? { color: "#f59e0b", fontWeight: 600 } : {}}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggle}
              aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              {isDark ? (
                /* sun */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                /* moon */
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>

            {!loading && (
              <>
                {user ? (
                  <>
                    <Link
                      href="/perfil"
                      className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl transition-all"
                      style={{
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                        background: "transparent",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(37,99,235,0.4)";
                        (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,0.08)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black overflow-hidden shrink-0"
                        style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                      >
                        {user.avatarUrl
                          ? <Image src={user.avatarUrl} alt={user.username} width={28} height={28} className="w-full h-full object-cover" />
                          : initials}
                      </span>
                      <span className="hidden sm:inline">{user.username}</span>
                    </Link>
                    <button
                      onClick={logout}
                      className="hidden sm:block text-xs px-3 py-2 transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={e => ((e.target as HTMLElement).style.color = "var(--text-secondary)")}
                      onMouseLeave={e => ((e.target as HTMLElement).style.color = "var(--text-muted)")}
                    >
                      Salir
                    </button>
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
                      className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl transition-all active:scale-95"
                      style={{
                        background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                        boxShadow: "0 4px 20px rgba(37,99,235,0.35)",
                      }}
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
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
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
