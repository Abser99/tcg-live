"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function Content() {
  const params = useSearchParams();
  const orderId = params.get("external_reference") ?? params.get("order_id") ?? "";

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div
          className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center text-5xl"
          style={{
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.2)",
            boxShadow: "0 0 40px rgba(248,113,113,0.15)",
          }}
        >
          ❌
        </div>

        <h1 className="text-3xl font-black mb-2">Pago no completado</h1>
        <p className="text-zinc-400 mb-1">El pago fue rechazado o cancelado.</p>
        {orderId && (
          <p className="text-xs text-zinc-600 mt-2 font-mono">Orden: {orderId}</p>
        )}

        <div
          className="rounded-2xl p-6 mt-8 text-left"
          style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <h2 className="font-bold mb-3">¿Qué puedes hacer?</h2>
          <div className="space-y-3">
            {[
              { icon: "💳", text: "Verifica que tu tarjeta tenga fondos suficientes" },
              { icon: "🔄", text: "Intenta pagar de nuevo desde tu perfil" },
              { icon: "💬", text: "Si el problema persiste, contáctanos" },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-lg">{s.icon}</span>
                <p className="text-sm text-zinc-400 leading-snug">{s.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Link
            href="/perfil"
            className="flex-1 py-3 rounded-xl font-bold text-white text-sm text-center transition-all"
            style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
          >
            Intentar de nuevo →
          </Link>
          <Link
            href="/auctions"
            className="flex-1 py-3 rounded-xl font-semibold text-sm text-center text-zinc-400 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Ir a subastas
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PagoErrorPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
