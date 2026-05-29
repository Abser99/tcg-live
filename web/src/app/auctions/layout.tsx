import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subastas en vivo — TCG Live",
  description:
    "Explora y participa en subastas en vivo de cartas Pokémon, Magic y más. Pagos protegidos con Mercado Pago.",
  openGraph: {
    title: "Subastas en vivo — TCG Live",
    description:
      "Explora y participa en subastas en vivo de cartas Pokémon, Magic y más. Pagos protegidos con Mercado Pago.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Subastas en vivo — TCG Live",
    description:
      "Explora y participa en subastas en vivo de cartas Pokémon, Magic y más. Pagos protegidos con Mercado Pago.",
  },
};

export default function AuctionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
