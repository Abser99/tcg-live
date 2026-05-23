"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/contexts/auth";

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const initials = user?.username?.slice(0, 2).toUpperCase() ?? "TG";
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/auctions", label: "Subastas" },
    { href: "/shop", label: "Shop" },
    { href: "/#features", label: "Características" },
    ...(user?.role === "SELLER" || user?.role === "ADMIN" ? [{ href: "/vendedor", label: "Mi tienda", admin: false }] : []),
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin", admin: true }] : []),
  ];

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0F0F14]/90 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div
              className="w-8 h-8 rounded-lg bg-[#6C3AE8] flex items-center justify-center font-black text-sm"
              style={{ boxShadow: "0 0 16px rgba(108,58,232,0.5)" }}
            >
              T
            </div>
            <span className="font-bold text-lg tracking-tight">TCG Live</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="hover:text-white transition-colors"
                style={l.admin ? { color: "#f59e0b", fontWeight: 600 } : {}}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {!loading && (
              <>
                {user ? (
                  <>
                    <Link
                      href="/perfil"
                      className="flex items-center gap-2 text-sm font-semibold text-white px-3 py-2 rounded-xl transition-all border border-white/10 hover:border-[#6C3AE8]/40 hover:bg-[#6C3AE8]/10"
                    >
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black overflow-hidden shrink-0"
                        style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                      >
                        {user.avatarUrl
                          ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                          : initials}
                      </span>
                      <span className="hidden sm:inline">{user.username}</span>
                    </Link>
                    <button
                      onClick={logout}
                      className="hidden sm:block text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-2"
                    >
                      Salir
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="text-sm text-zinc-400 hover:text-white transition-colors px-4 py-2 hidden sm:block"
                    >
                      Iniciar sesión
                    </Link>
                    <Link
                      href="/register"
                      className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl transition-all"
                      style={{
                        background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
                        boxShadow: "0 4px 20px rgba(108,58,232,0.35)",
                      }}
                    >
                      Registrarse gratis
                    </Link>
                  </>
                )}
              </>
            )}

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-white/5 gap-1.5"
              aria-label="Abrir menú"
            >
              <span
                className="block w-5 h-0.5 bg-zinc-400 transition-all duration-200 origin-center"
                style={mobileOpen ? { transform: "rotate(45deg) translate(2px, 2px)" } : {}}
              />
              <span
                className="block w-5 h-0.5 bg-zinc-400 transition-all duration-200"
                style={mobileOpen ? { opacity: 0, transform: "scaleX(0)" } : {}}
              />
              <span
                className="block w-5 h-0.5 bg-zinc-400 transition-all duration-200 origin-center"
                style={mobileOpen ? { transform: "rotate(-45deg) translate(2px, -2px)" } : {}}
              />
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#0F0F14]/98 backdrop-blur-lg">
            <div className="px-4 py-4 flex flex-col gap-1">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-3 py-3 rounded-xl text-sm font-semibold transition-colors hover:bg-white/5"
                  style={l.admin ? { color: "#f59e0b" } : { color: "#a1a1aa" }}
                >
                  {l.label}
                </Link>
              ))}
              {user && (
                <button
                  onClick={() => { logout(); setMobileOpen(false); }}
                  className="flex items-center px-3 py-3 rounded-xl text-sm font-semibold text-red-400/70 hover:text-red-400 transition-colors text-left"
                >
                  Cerrar sesión
                </button>
              )}
              {!user && (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-3 py-3 rounded-xl text-sm font-semibold text-zinc-400 hover:bg-white/5 transition-colors"
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
