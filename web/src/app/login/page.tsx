"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      router.push("/auctions");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Credenciales incorrectas. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#6C3AE8]/12 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-violet-500/8 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "40px 40px" }}
        />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Link href="/">
            <div
              className="w-12 h-12 rounded-2xl bg-[#6C3AE8] flex items-center justify-center font-black text-xl mb-4"
              style={{ boxShadow: "0 0 30px rgba(108,58,232,0.5)" }}
            >
              T
            </div>
          </Link>
          <h1 className="text-3xl font-black">Bienvenido de vuelta</h1>
          <p className="text-zinc-500 mt-2 text-sm">Inicia sesión en tu cuenta</p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm text-red-400 font-medium"
                style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}
              >
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold mb-2 text-zinc-300">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors text-sm"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-semibold text-zinc-300">Contraseña</label>
                <Link href="/olvide-contrasena" className="text-xs text-[#a78bfa] hover:text-white transition-colors">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl font-black text-white transition-all active:scale-95 disabled:opacity-60 mt-1"
              style={{
                background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
                boxShadow: "0 8px 25px rgba(108,58,232,0.35)",
              }}
            >
              {loading ? "Iniciando sesión..." : "Iniciar sesión →"}
            </button>
          </form>

        </div>

        <p className="text-center mt-6 text-sm text-zinc-500">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="text-[#a78bfa] font-semibold hover:text-white transition-colors">
            Regístrate gratis →
          </Link>
        </p>
      </div>
    </div>
  );
}
