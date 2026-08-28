"use client";

import type { CardBrand } from "@/lib/card";

/**
 * The mark on a saved card, so the list is scanned by sight rather than read.
 * Drawn rather than fetched: these are three logos on a payment form, and a network
 * request for each one is a blank rectangle whenever it fails.
 */
export default function CardBrandMark({ brand, size = 34 }: { brand?: string | null; size?: number }) {
  const h = Math.round(size * 0.66);
  const box = {
    width: size, height: h, borderRadius: 5,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  } as const;

  switch ((brand ?? "").toLowerCase() as CardBrand) {
    case "visa":
      return (
        <span style={{ ...box, background: "#1434CB" }} aria-label="Visa" role="img">
          <svg viewBox="0 0 48 16" width={size * 0.74} height={h * 0.6} aria-hidden="true">
            <text x="24" y="13" textAnchor="middle" fontSize="15" fontWeight="700"
              fontStyle="italic" fontFamily="Helvetica, Arial, sans-serif" fill="#fff"
              letterSpacing="0.5">VISA</text>
          </svg>
        </span>
      );

    case "mastercard":
      return (
        <span style={{ ...box, background: "#16161c" }} aria-label="Mastercard" role="img">
          <svg viewBox="0 0 40 24" width={size * 0.62} height={h * 0.72} aria-hidden="true">
            <circle cx="15" cy="12" r="11" fill="#EB001B" />
            <circle cx="25" cy="12" r="11" fill="#F79E1B" />
            {/* The overlap is the whole mark — mix-blend keeps it from looking flat. */}
            <path d="M20 3.6a11 11 0 0 0 0 16.8 11 11 0 0 0 0-16.8Z" fill="#FF5F00" />
          </svg>
        </span>
      );

    case "amex":
      return (
        <span style={{ ...box, background: "#1F72CD" }} aria-label="American Express" role="img">
          <svg viewBox="0 0 48 16" width={size * 0.8} height={h * 0.56} aria-hidden="true">
            <text x="24" y="12" textAnchor="middle" fontSize="10" fontWeight="700"
              fontFamily="Helvetica, Arial, sans-serif" fill="#fff" letterSpacing="0.3">AMEX</text>
          </svg>
        </span>
      );

    case "discover":
      return (
        <span style={{ ...box, background: "#F0F0F2" }} aria-label="Discover" role="img">
          <svg viewBox="0 0 48 16" width={size * 0.86} height={h * 0.5} aria-hidden="true">
            <text x="22" y="12" textAnchor="middle" fontSize="9" fontWeight="700"
              fontFamily="Helvetica, Arial, sans-serif" fill="#231F20">DISCVR</text>
            <circle cx="43" cy="8" r="4" fill="#F76B1C" />
          </svg>
        </span>
      );

    default:
      return (
        <span style={{ ...box, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          aria-label="Tarjeta" role="img">
          <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none"
            stroke="var(--text-muted)" strokeWidth={1.6} aria-hidden="true">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20" strokeLinecap="round" />
          </svg>
        </span>
      );
  }
}
