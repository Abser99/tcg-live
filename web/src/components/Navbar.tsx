"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth";

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const initials = user?.username?.slice(0, 2).toUpperCase() ?? "TG";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0F0F14]/90 backdrop-blur-lg">
      <div className="mx-auto max-w-7xl px-6 flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg bg-[#6C3AE8] flex items-center justify-center font-black text-sm"
            style={{ boxShadow: "0 0 16px rgba(108,58,232,0.5)" }}
          >
            T
          </div>
          <span className="font-bold text-lg tracking-tight">TCG Live</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          <Link href="/auctions" className="hover:text-white transition-colors">
            Subastas
          </Link>
          <Link href="/shop" className="hover:text-white transition-colors">
            Shop
          </Link>
          <Link href="/#features" className="hover:text-white transition-colors">
            Características
          </Link>
          {user?.role === "SELLER" || user?.role === "ADMIN" ? (
            <Link href="/vendedor" className="hover:text-white transition-colors">
              Mi tienda
            </Link>
          ) : null}
        </div>

        {!loading && (
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/perfil"
                  className="flex items-center gap-2 text-sm font-semibold text-white px-3 py-2 rounded-xl transition-all border border-white/10 hover:border-[#6C3AE8]/40 hover:bg-[#6C3AE8]/10"
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
                    style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                  >
                    {initials}
                  </span>
                  <span className="hidden sm:inline">{user.username}</span>
                </Link>
                <button
                  onClick={logout}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-2"
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
          </div>
        )}
      </div>
    </nav>
  );
}
