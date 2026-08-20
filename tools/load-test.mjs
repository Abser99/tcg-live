#!/usr/bin/env node
/**
 * Load test: ten buyers in one live, chatting, reacting and out-bidding each other.
 *
 * Registration and login are rate limited per IP (5/min), so accounts are created in
 * small batches with a pause between them — hammering it just gets 429s and proves
 * nothing. Tokens are cached to disk so re-runs skip that wait entirely.
 *
 * Usage: node tools/load-test.mjs <auctionId> [rounds]
 */
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.API ?? 'http://localhost:3001/api';
const CACHE = path.join(process.env.TMPDIR ?? '/tmp', 'tcg-load-test-tokens.json');
const PASSWORD = 'password123';

const BUYERS = [
  { username: 'mia_tcg',   email: 'mia@tcg.mx' },
  { username: 'kenji_tcg', email: 'kenji@tcg.mx' },
  { username: 'rosa_tcg',  email: 'rosa@tcg.mx' },
  { username: 'diego_tcg', email: 'diego@tcg.mx' },
  { username: 'sofia_tcg', email: 'sofia@tcg.mx' },
  { username: 'pablo_tcg', email: 'pablo@tcg.mx' },
  { username: 'valen_tcg', email: 'valen@tcg.mx' },
  { username: 'nico_tcg',  email: 'nico@tcg.mx' },
  { username: 'ana_collector', email: 'ana@tcg.mx' },
  { username: 'luis_pkmn',     email: 'luis@tcg.mx' },
];

const CHAT = [
  'va va va', 'esa carta la quiero', 'no la sueltes 😤', 'subo!', 'uff está cara',
  'alguien más?', 'mía mía mía', 'buena esa', 'me salgo, muy alto', 'vamos con todo',
];
const EMOJIS = ['🔥', '❤️', '💎', '🎯', '😂'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Chat and reactions travel over LiveKit's data channel, not our REST API. The server
// SDK can publish into the room, which is how a headless test can produce traffic the
// browser actually renders. Without LiveKit credentials this degrades to a no-op.
let roomService = null;
try {
  // The SDK lives in the backend's node_modules, not next to this script.
  const { RoomServiceClient } = await import(new URL('../backend/node_modules/livekit-server-sdk/dist/index.js', import.meta.url).href);
  const env = fs.readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
  const pick = k => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
  const url = pick('LIVEKIT_WS_URL'), key = pick('LIVEKIT_API_KEY'), secret = pick('LIVEKIT_API_SECRET');
  if (url && key && secret) roomService = new RoomServiceClient(url.replace(/^ws/, 'http'), key, secret);
} catch (e) {
  console.warn(`⚠ chat/reacciones deshabilitados: ${e.message?.slice(0, 90)}`);
}

async function sendToRoom(auctionId, payload) {
  if (!roomService) return false;
  try {
    await roomService.sendData(
      `auction-${auctionId}`,
      new TextEncoder().encode(JSON.stringify(payload)),
      0, // DataPacket_Kind.RELIABLE
    );
    return true;
  } catch {
    return false; // nobody in the room yet, or the room doesn't exist
  }
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

/** Log in, registering first if the account doesn't exist yet. */
async function ensureAccount(b) {
  let r = await api('/auth/login', { method: 'POST', body: { email: b.email, password: PASSWORD } });
  if (r.ok && r.data.token) return r.data.token;
  r = await api('/auth/register', {
    method: 'POST',
    body: { username: b.username, email: b.email, password: PASSWORD, over18: true },
  });
  if (r.ok && r.data.token) return r.data.token;
  throw new Error(`${b.username}: ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
}

async function getTokens() {
  if (fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    // Verify one token still works before trusting the whole file.
    const probe = await api('/auth/me', { token: Object.values(cached)[0] });
    if (probe.ok) { console.log(`↺ ${Object.keys(cached).length} sesiones reutilizadas`); return cached; }
    console.log('↺ tokens vencidos, renovando…');
  }
  const tokens = {};
  const BATCH = 4, GAP_MS = 65_000; // the auth limiter is 5/min per IP
  for (let i = 0; i < BUYERS.length; i += BATCH) {
    const slice = BUYERS.slice(i, i + BATCH);
    for (const b of slice) {
      try { tokens[b.username] = await ensureAccount(b); process.stdout.write(`  ✓ ${b.username}\n`); }
      catch (e) { process.stdout.write(`  ✗ ${e.message}\n`); }
    }
    if (i + BATCH < BUYERS.length) {
      console.log(`  … esperando ${GAP_MS / 1000}s por el límite de autenticación`);
      await sleep(GAP_MS);
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(tokens));
  return tokens;
}

const auctionId = process.argv[2];
const rounds = Number(process.argv[3] ?? 3);
if (!auctionId) { console.error('uso: node tools/load-test.mjs <auctionId> [rondas]'); process.exit(1); }

console.log('\n═══ Preparando 10 cuentas ═══');
const tokens = await getTokens();
const names = Object.keys(tokens);
if (!names.length) { console.error('sin sesiones, aborto'); process.exit(1); }
console.log(`\n═══ ${names.length} compradores listos ═══\n`);

const stats = { bids: 0, rejected: 0, chat: 0, reactions: 0 };

for (let round = 1; round <= rounds; round++) {
  const { data: auction } = await api(`/auctions/${auctionId}`);
  const item = auction?.items?.find(i => i.status === 'active');
  if (!item) {
    // The seller opens lots by hand, so give them a chance rather than failing the round.
    console.log(`· ronda ${round}: sin lote abierto, esperando hasta 60s…`);
    let waited = 0, found = null;
    while (waited < 60_000 && !found) {
      await sleep(3000); waited += 3000;
      const { data: a } = await api(`/auctions/${auctionId}`);
      found = a?.items?.find(i => i.status === 'active');
    }
    if (!found) { console.log('  · nadie abrió un lote, salto la ronda'); continue; }
  }

  const { data: cur } = await api(`/auctions/${auctionId}`);
  const active = cur?.items?.find(i => i.status === 'active');
  if (!active) { console.log(`· ronda ${round}: el lote cerró antes de empezar`); continue; }
  console.log(`\n─── Ronda ${round} · lote "${active.cardName}" ───`);

  // Everyone piles into the chat and reacts. These go out over the same LiveKit data
  // channel the browser uses, so they actually appear in any open live view.
  for (const [i, name] of names.entries()) {
    const text = CHAT[i % CHAT.length];
    const emoji = EMOJIS[i % EMOJIS.length];
    if (await sendToRoom(auctionId, { type: 'chat', username: name, text, ts: Date.now() })) stats.chat++;
    if (await sendToRoom(auctionId, { type: 'reaction', emoji })) stats.reactions++;
    await sleep(150);
  }
  console.log(`  💬 ${stats.chat} mensajes · ${EMOJIS[0]} ${stats.reactions} reacciones enviados al canal de datos`);

  // Then they out-bid each other, one after another.
  for (const name of names) {
    const { data: fresh } = await api(`/auctions/${auctionId}`);
    const live = fresh?.items?.find(i => i.id === item.id);
    if (!live || live.status !== 'active') { console.log('  · lote cerrado, corto la ronda'); break; }

    const current = live.currentPrice ?? live.startingPrice ?? 0;
    const step = current >= 500_000 ? 20_000 : current >= 100_000 ? 10_000 : current >= 40_000 ? 5_000 : 2_000;
    const amount = current + step;

    const r = await api(`/auctions/items/${active.id}/bids`, {
      method: 'POST', token: tokens[name], body: { amount },
    });
    if (r.ok) { stats.bids++; console.log(`  💰 ${name.padEnd(14)} $${(amount / 100).toLocaleString('es-MX')}`); }
    else { stats.rejected++; console.log(`  ⛔ ${name.padEnd(14)} ${r.status} ${(r.data?.message ?? '').toString().slice(0, 60)}`); }
    await sleep(700);
  }
}

console.log(`\n═══ Resumen ═══`);
console.log(`  pujas aceptadas : ${stats.bids}`);
console.log(`  pujas rechazadas: ${stats.rejected}`);
console.log(`  mensajes        : ${stats.chat}`);
console.log(`  reacciones      : ${stats.reactions}`);
