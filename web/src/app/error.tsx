"use client";
import { useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen" style={{ background: "#0F0F14" }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
        <div className="text-6xl mb-6">⚠️</div>
        <h1 className="text-2xl font-black text-white mb-3">Algo salió mal</h1>
        <p className="text-zinc-500 mb-8 max-w-sm">Ocurrió un error inesperado. Puedes intentar de nuevo o regresar al inicio.</p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-6 py-3 rounded-2xl font-bold text-white text-sm"
            style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 4px 20px rgba(108,58,232,0.4)" }}
          >
            Intentar de nuevo
          </button>
          <Link
            href="/"
            className="px-6 py-3 rounded-2xl font-bold text-sm"
            style={{ background: "rgba(255,255,255,0.06)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
