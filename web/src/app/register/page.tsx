"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Turnstile } from "@marsidev/react-turnstile";
import { useAuth } from "@/contexts/auth";

// Replace with real Cloudflare Turnstile site key from dash.cloudflare.com
const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm]       = useState({ name: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [cfToken, setCfToken] = useState<string | null>(null);
  const turnstileRef           = useRef<any>(null);

  function set(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!cfToken) {
      setError("Completa la verificación de seguridad.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await register(form.name, form.email, form.password);
      router.push("/auctions");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "No se pudo crear la cuenta. Intenta de nuevo.");
      turnstileRef.current?.reset();
      setCfToken(null);
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
          <h1 className="text-3xl font-black">Crea tu cuenta gratis</h1>
          <p className="text-zinc-500 mt-2 text-sm">Empieza a pujar y comprar hoy</p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                Nombre de usuario
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="trainer_mx"
                required
                className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-zinc-300">
                Correo electrónico
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="tu@correo.com"
                required
                className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-zinc-300">
                Contraseña
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-zinc-300">
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => set("confirm", e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors text-sm"
              />
            </div>

            {/* Cloudflare Turnstile — anti-bot */}
            <div className="flex flex-col items-start gap-1">
              <label className="block text-sm font-semibold mb-1 text-zinc-300">
                Verificación de seguridad
              </label>
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={setCfToken}
                onExpire={() => setCfToken(null)}
                onError={() => setCfToken(null)}
                options={{ theme: "dark", language: "es" }}
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer mt-1">
              <input type="checkbox" required className="mt-0.5 accent-violet-500" />
              <span className="text-xs text-zinc-500 leading-relaxed">
                Acepto los{" "}
                <Link href="#" className="text-[#a78bfa] hover:underline">Términos de uso</Link>{" "}
                y la{" "}
                <Link href="#" className="text-[#a78bfa] hover:underline">Política de privacidad</Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !cfToken}
              className="w-full py-4 rounded-xl font-black text-white transition-all active:scale-95 disabled:opacity-60 mt-1"
              style={{
                background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
                boxShadow: "0 8px 25px rgba(108,58,232,0.35)",
              }}
            >
              {loading ? "Creando cuenta..." : "Crear cuenta gratis →"}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-zinc-500">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-[#a78bfa] font-semibold hover:text-white transition-colors">
            Inicia sesión →
          </Link>
        </p>
      </div>
    </div>
  );
}
