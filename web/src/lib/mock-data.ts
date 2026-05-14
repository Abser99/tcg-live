export type AuctionStatus = "live" | "ending" | "upcoming";

export interface Auction {
  id: number;
  status: AuctionStatus;
  emoji: string;
  gradient: string;
  glow: string;
  name: string;
  set: string;
  condition: string;
  startingBid: number;
  currentBid: number;
  viewers: number;
  timer: string;
  seller: string;
  sellerAvatar: string;
  verified: boolean;
  binPrice?: number;
  description: string;
  totalBids: number;
}

export interface Bid {
  user: string;
  amount: number;
  time: string;
}

export interface Listing {
  id: number;
  emoji: string;
  gradient: string;
  glow: string;
  name: string;
  set: string;
  condition: string;
  price: number;
  seller: string;
  verified: boolean;
  acceptsOffers: boolean;
  stock: number;
}

export const AUCTIONS: Auction[] = [
  {
    id: 1, status: "live",
    emoji: "🔥", gradient: "from-orange-500 to-red-600", glow: "rgba(239,68,68,0.4)",
    name: "Charizard VMAX Rainbow", set: "Brilliant Stars", condition: "PSA 10",
    startingBid: 1500, currentBid: 2850, viewers: 47, timer: "2:34",
    seller: "PokéVault_MX", sellerAvatar: "🧑‍💼", verified: true, binPrice: 4500,
    description: "Charizard VMAX Rainbow Rare en perfecto estado. Clasificada PSA 10 Gem Mint. Una de las cartas más icónicas de la era SWSH. Ideal para coleccionistas serios.",
    totalBids: 12,
  },
  {
    id: 2, status: "live",
    emoji: "⚡", gradient: "from-yellow-400 to-amber-500", glow: "rgba(251,191,36,0.4)",
    name: "Pikachu VSTAR Gold", set: "Pokémon GO", condition: "NM",
    startingBid: 300, currentBid: 650, viewers: 23, timer: "8:12",
    seller: "CartasMX", sellerAvatar: "👨", verified: false,
    description: "Pikachu VSTAR en acabado dorado de la colección Pokémon GO. Estado NM (Near Mint), sin marcas visibles. Carta muy difícil de encontrar en este estado.",
    totalBids: 7,
  },
  {
    id: 3, status: "live",
    emoji: "🌙", gradient: "from-violet-600 to-indigo-800", glow: "rgba(139,92,246,0.4)",
    name: "Umbreon VMAX Alt Art", set: "Evolving Skies", condition: "PSA 9",
    startingBid: 2000, currentBid: 4200, viewers: 89, timer: "0:58",
    seller: "PokeAlpha", sellerAvatar: "👩", verified: true, binPrice: 6000,
    description: "La Umbreon VMAX Alt Art es considerada una de las mejores cartas de arte alternativo de toda la historia del TCG. PSA 9 Mint. Inversión garantizada.",
    totalBids: 19,
  },
  {
    id: 4, status: "ending",
    emoji: "🌊", gradient: "from-blue-500 to-cyan-400", glow: "rgba(59,130,246,0.4)",
    name: "Lugia V Alt Art", set: "Silver Tempest", condition: "NM",
    startingBid: 1200, currentBid: 3100, viewers: 34, timer: "15:22",
    seller: "SilverCards", sellerAvatar: "🧑", verified: true,
    description: "Lugia V Arte Alternativo de Silver Tempest. Estado NM impecable. Una de las mejores artes de la generación. Gran pieza para cualquier colección.",
    totalBids: 15,
  },
  {
    id: 5, status: "ending",
    emoji: "🌸", gradient: "from-pink-400 to-rose-600", glow: "rgba(236,72,153,0.4)",
    name: "Sylveon VMAX Rainbow", set: "Evolving Skies", condition: "PSA 8",
    startingBid: 500, currentBid: 890, viewers: 15, timer: "22:47",
    seller: "GlowTCG", sellerAvatar: "👩‍🦰", verified: false,
    description: "Sylveon VMAX Rainbow Rare. PSA 8 Near Mint-Mint. Carta muy popular entre fans de los Pokémon tipo Hada. Set Evolving Skies ya fuera de producción.",
    totalBids: 9,
  },
  {
    id: 6, status: "ending",
    emoji: "🌿", gradient: "from-green-500 to-emerald-700", glow: "rgba(16,185,129,0.4)",
    name: "Leafeon VMAX Rainbow", set: "Evolving Skies", condition: "NM",
    startingBid: 800, currentBid: 1450, viewers: 28, timer: "45:10",
    seller: "NatureTCG", sellerAvatar: "🧑‍🌾", verified: true, binPrice: 2200,
    description: "Leafeon VMAX Rainbow del popular set Evolving Skies. Perfecto estado NM. Acompañada de su respectiva Leafeon V para el set completo.",
    totalBids: 11,
  },
  {
    id: 7, status: "upcoming",
    emoji: "❄️", gradient: "from-sky-400 to-blue-600", glow: "rgba(56,189,248,0.4)",
    name: "Glaceon VMAX Alt Art", set: "Evolving Skies", condition: "PSA 10",
    startingBid: 2200, currentBid: 2200, viewers: 0, timer: "1h 20m",
    seller: "IceTCG", sellerAvatar: "🧊", verified: true,
    description: "Glaceon VMAX Arte Alternativo, PSA 10 Gem Mint. Una de las Eeveelutions más codiciadas. Precio de salida muy accesible para la calidad de la carta.",
    totalBids: 0,
  },
  {
    id: 8, status: "upcoming",
    emoji: "⚡", gradient: "from-yellow-300 to-yellow-500", glow: "rgba(234,179,8,0.4)",
    name: "Raichu VMAX", set: "Fusion Strike", condition: "NM",
    startingBid: 450, currentBid: 450, viewers: 0, timer: "3h 05m",
    seller: "CartasMX", sellerAvatar: "👨", verified: false,
    description: "Raichu VMAX en excelente estado NM. Carta underrated con gran potencial de revalorización. Ideal para completar colecciones de Pokémon eléctricos.",
    totalBids: 0,
  },
  {
    id: 9, status: "upcoming",
    emoji: "🔮", gradient: "from-purple-500 to-fuchsia-700", glow: "rgba(168,85,247,0.4)",
    name: "Mewtwo V Alt Art", set: "Lost Origin", condition: "PSA 9",
    startingBid: 5500, currentBid: 5500, viewers: 0, timer: "6h 40m",
    seller: "PokéVault_MX", sellerAvatar: "🧑‍💼", verified: true, binPrice: 8000,
    description: "Mewtwo V Arte Alternativo de Lost Origin. PSA 9 Mint. Mewtwo es el Pokémon más icónico de primera generación. Pieza de museo para coleccionistas de alto nivel.",
    totalBids: 0,
  },
];

export const MOCK_BIDS: Record<number, Bid[]> = {
  1: [
    { user: "trainer_gx",       amount: 2850, time: "10s" },
    { user: "pokefan_mx",       amount: 2700, time: "1m" },
    { user: "cards_lover",      amount: 2500, time: "3m" },
    { user: "el_coleccionista", amount: 2200, time: "8m" },
    { user: "PokéVault_MX",     amount: 1500, time: "Inicio" },
  ],
  2: [
    { user: "rayito_tcg",  amount: 650, time: "2m" },
    { user: "pikachu_fan", amount: 550, time: "5m" },
    { user: "CartasMX",    amount: 300, time: "Inicio" },
  ],
  3: [
    { user: "umbreon_mx",       amount: 4200, time: "5s" },
    { user: "moonlight_cards",  amount: 3900, time: "30s" },
    { user: "darktype_fan",     amount: 3500, time: "2m" },
    { user: "trainer_gx",       amount: 3000, time: "5m" },
    { user: "PokeAlpha",        amount: 2000, time: "Inicio" },
  ],
};

export const MOCK_CHAT: Record<number, { user: string; msg: string }[]> = {
  1: [
    { user: "trainer_gx",       msg: "qué carta tan hermosa 😍" },
    { user: "pokefan_mx",       msg: "dale!! subele más 🔥🔥" },
    { user: "cards_lover",      msg: "PSA 10 es rarísimo" },
    { user: "nuevo_user",       msg: "cuánto más puede subir?" },
    { user: "el_coleccionista", msg: "al menos 3500 llegaría" },
    { user: "trainer_gx",       msg: "yo creo que más 👀" },
  ],
  3: [
    { user: "umbreon_mx",      msg: "es mía esta carta 😤" },
    { user: "darktype_fan",    msg: "nooo te la voy a ganar jaja" },
    { user: "moonlight_cards", msg: "qué arte tan increíble" },
    { user: "PokeAlpha",       msg: "gracias a todos por ver!" },
    { user: "umbreon_mx",      msg: "cuánto tiene de BIN?" },
  ],
};

export interface Order {
  id: string;
  item: string;
  emoji: string;
  gradient: string;
  glow: string;
  amount: number;
  status: "pendiente_pago" | "pending_payment" | "procesando" | "en_camino" | "entregado" | "shipped" | "delivered";
  date: string;
  seller: string;
  tracking?: string;
}

export interface Message {
  id: number;
  with: string;
  avatar: string;
  verified: boolean;
  last: string;
  time: string;
  unread: number;
  re: string;
}

export const MY_BIDS = [
  { auctionId: 1, myBid: 2850, status: "ganando"   as const },
  { auctionId: 3, myBid: 3500, status: "perdiendo" as const },
  { auctionId: 4, myBid: 2800, status: "perdiendo" as const },
  { auctionId: 2, myBid: 550,  status: "perdida"   as const },
];

export const MY_ORDERS: Order[] = [
  {
    id: "ORD-001", item: "Charizard VMAX Rainbow", emoji: "🔥",
    gradient: "from-orange-500 to-red-600", glow: "rgba(239,68,68,0.4)",
    amount: 2850, status: "en_camino", date: "10 May 2026",
    seller: "PokéVault_MX", tracking: "MEX123456789MX",
  },
  {
    id: "ORD-002", item: "Mew ex Full Art", emoji: "🌟",
    gradient: "from-pink-400 to-fuchsia-600", glow: "rgba(236,72,153,0.4)",
    amount: 850, status: "entregado", date: "2 May 2026", seller: "PokéVault_MX",
  },
  {
    id: "ORD-003", item: "Miraidon ex Alt Art", emoji: "⚡",
    gradient: "from-violet-500 to-indigo-600", glow: "rgba(139,92,246,0.4)",
    amount: 1800, status: "entregado", date: "28 Abr 2026", seller: "PokeAlpha",
  },
  {
    id: "ORD-004", item: "Arceus VSTAR Rainbow", emoji: "✨",
    gradient: "from-yellow-400 to-orange-500", glow: "rgba(251,191,36,0.4)",
    amount: 3500, status: "pendiente_pago", date: "13 May 2026", seller: "PokéVault_MX",
  },
];

export const MOCK_MESSAGES: Message[] = [
  {
    id: 1, with: "PokéVault_MX", avatar: "🧑‍💼", verified: true, unread: 1,
    last: "¡Tu pedido ya fue enviado! El número de rastreo es MEX123456789MX",
    time: "Hace 2h", re: "Pedido ORD-001",
  },
  {
    id: 2, with: "PokeAlpha", avatar: "👩", verified: true, unread: 0,
    last: "Gracias por tu compra, cualquier duda con gusto te ayudo",
    time: "Hace 3 días", re: "Pedido ORD-003",
  },
  {
    id: 3, with: "CartasMX", avatar: "👨", verified: false, unread: 0,
    last: "Hola, ¿te interesa hacer una oferta por el Pikachu VSTAR Gold?",
    time: "Hace 5 días", re: "Oferta — Pikachu VSTAR Gold",
  },
];

export interface SaleOrder {
  id: string;
  buyer: string;
  item: string;
  emoji: string;
  gradient: string;
  glow: string;
  amount: number;
  status: "pendiente_envio" | "enviado" | "entregado" | "disputa";
  date: string;
  tracking?: string;
}

export const MY_SALE_AUCTIONS: Auction[] = [
  {
    id: 1, status: "live",
    emoji: "🔥", gradient: "from-orange-500 to-red-600", glow: "rgba(239,68,68,0.4)",
    name: "Charizard VMAX Rainbow", set: "Brilliant Stars", condition: "PSA 10",
    startingBid: 1500, currentBid: 2850, viewers: 47, timer: "2:34",
    seller: "PokéVault_MX", sellerAvatar: "🧑‍💼", verified: true, binPrice: 4500,
    description: "", totalBids: 12,
  },
  {
    id: 9, status: "upcoming",
    emoji: "🔮", gradient: "from-purple-500 to-fuchsia-700", glow: "rgba(168,85,247,0.4)",
    name: "Mewtwo V Alt Art", set: "Lost Origin", condition: "PSA 9",
    startingBid: 5500, currentBid: 5500, viewers: 0, timer: "6h 40m",
    seller: "PokéVault_MX", sellerAvatar: "🧑‍💼", verified: true, binPrice: 8000,
    description: "", totalBids: 0,
  },
  {
    id: 101, status: "ending",
    emoji: "✨", gradient: "from-yellow-400 to-orange-500", glow: "rgba(251,191,36,0.4)",
    name: "Arceus VSTAR Rainbow", set: "Brilliant Stars", condition: "PSA 10",
    startingBid: 2500, currentBid: 3500, viewers: 11, timer: "45:00",
    seller: "PokéVault_MX", sellerAvatar: "🧑‍💼", verified: true,
    description: "", totalBids: 8,
  },
];

export const SALE_ORDERS: SaleOrder[] = [
  {
    id: "ORD-001", buyer: "trainer_gx",
    item: "Charizard VMAX Rainbow", emoji: "🔥",
    gradient: "from-orange-500 to-red-600", glow: "rgba(239,68,68,0.4)",
    amount: 2850, status: "enviado", date: "10 May 2026", tracking: "MEX123456789MX",
  },
  {
    id: "ORD-002", buyer: "pokefan_mx",
    item: "Mew ex Full Art", emoji: "🌟",
    gradient: "from-pink-400 to-fuchsia-600", glow: "rgba(236,72,153,0.4)",
    amount: 850, status: "entregado", date: "2 May 2026",
  },
  {
    id: "ORD-004", buyer: "cards_lover",
    item: "Arceus VSTAR Rainbow", emoji: "✨",
    gradient: "from-yellow-400 to-orange-500", glow: "rgba(251,191,36,0.4)",
    amount: 3500, status: "pendiente_envio", date: "13 May 2026",
  },
  {
    id: "ORD-005", buyer: "el_coleccionista",
    item: "Pikachu Gold Star", emoji: "⚡",
    gradient: "from-yellow-300 to-yellow-500", glow: "rgba(234,179,8,0.4)",
    amount: 4800, status: "disputa", date: "8 May 2026",
  },
];

export const LISTINGS: Listing[] = [
  {
    id: 1,
    emoji: "🌟", gradient: "from-pink-400 to-fuchsia-600", glow: "rgba(236,72,153,0.4)",
    name: "Mew ex Full Art", set: "151", condition: "NM",
    price: 850, seller: "PokéVault_MX", verified: true, acceptsOffers: true, stock: 1,
  },
  {
    id: 2,
    emoji: "🌸", gradient: "from-rose-400 to-pink-600", glow: "rgba(251,113,133,0.4)",
    name: "Gardevoir ex SAR", set: "Scarlet & Violet", condition: "PSA 9",
    price: 2200, seller: "CartasMX", verified: false, acceptsOffers: false, stock: 1,
  },
  {
    id: 3,
    emoji: "⚡", gradient: "from-violet-500 to-indigo-600", glow: "rgba(139,92,246,0.4)",
    name: "Miraidon ex Alt Art", set: "Scarlet & Violet", condition: "NM",
    price: 1800, seller: "PokeAlpha", verified: true, acceptsOffers: true, stock: 2,
  },
  {
    id: 4,
    emoji: "✨", gradient: "from-yellow-400 to-orange-500", glow: "rgba(251,191,36,0.4)",
    name: "Arceus VSTAR Rainbow", set: "Brilliant Stars", condition: "PSA 10",
    price: 3500, seller: "PokéVault_MX", verified: true, acceptsOffers: false, stock: 1,
  },
  {
    id: 5,
    emoji: "⚡", gradient: "from-yellow-300 to-yellow-500", glow: "rgba(234,179,8,0.4)",
    name: "Pikachu Gold Star", set: "EX Team Rocket Returns", condition: "LP",
    price: 4800, seller: "VintageCards", verified: true, acceptsOffers: true, stock: 1,
  },
  {
    id: 6,
    emoji: "🌙", gradient: "from-slate-700 to-gray-900", glow: "rgba(100,116,139,0.4)",
    name: "Darkrai VSTAR Alt Art", set: "Astral Radiance", condition: "NM",
    price: 2800, seller: "SilverCards", verified: true, acceptsOffers: true, stock: 1,
  },
  {
    id: 7,
    emoji: "🌺", gradient: "from-pink-300 to-rose-400", glow: "rgba(249,168,212,0.4)",
    name: "Comfey VMAX Alt Art", set: "Lost Origin", condition: "NM",
    price: 320, seller: "GlowTCG", verified: false, acceptsOffers: true, stock: 3,
  },
  {
    id: 8,
    emoji: "🔥", gradient: "from-orange-400 to-red-500", glow: "rgba(249,115,22,0.4)",
    name: "Radiant Charizard", set: "Pokemon GO", condition: "NM",
    price: 750, seller: "CartasMX", verified: false, acceptsOffers: false, stock: 2,
  },
  {
    id: 9,
    emoji: "💎", gradient: "from-cyan-400 to-teal-600", glow: "rgba(34,211,238,0.4)",
    name: "Origin Palkia VSTAR Alt", set: "Astral Radiance", condition: "PSA 9",
    price: 1200, seller: "IceTCG", verified: true, acceptsOffers: true, stock: 1,
  },
];
