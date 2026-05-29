import type { Metadata } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

interface AuctionData {
  id: string;
  title?: string;
  name?: string;
  condition?: string;
  startingBid?: number;
  currentBid?: number;
  description?: string;
  items?: Array<{ cardName: string; condition?: string; startingBid?: number; imageUrls?: string[] }>;
  imageUrl?: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const fallback: Metadata = {
    title: "Subasta en vivo | TCG Live",
    description: "Participa en subastas en vivo de cartas coleccionables en México.",
    openGraph: {
      title: "Subasta en vivo | TCG Live",
      description: "Participa en subastas en vivo de cartas coleccionables en México.",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Subasta en vivo | TCG Live",
      description: "Participa en subastas en vivo de cartas coleccionables en México.",
    },
  };

  try {
    const res = await fetch(`${API_BASE}/api/auctions/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return fallback;

    const auction: AuctionData = await res.json();

    const auctionTitle = auction.title ?? auction.name ?? "Subasta";
    const firstItem = auction.items?.[0];
    const cardName = firstItem?.cardName ?? auctionTitle;
    const condition = firstItem?.condition ?? auction.condition ?? "";
    const startingBid = (firstItem?.startingBid ?? auction.startingBid ?? auction.currentBid ?? 0) / 100;
    const imageUrl =
      firstItem?.imageUrls?.[0] ??
      (auction as any).imageUrl ??
      undefined;

    const title = `${cardName} — ${auctionTitle} | TCG Live`;
    const description = condition
      ? `Subasta en vivo de ${cardName} (${condition}) — Puja desde $${startingBid.toFixed(0)} MXN`
      : `Subasta en vivo de ${cardName} — Puja desde $${startingBid.toFixed(0)} MXN`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        ...(imageUrl && {
          images: [{ url: imageUrl, width: 800, height: 600 }],
        }),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(imageUrl && { images: [imageUrl] }),
      },
    };
  } catch {
    return fallback;
  }
}

export default function AuctionDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
