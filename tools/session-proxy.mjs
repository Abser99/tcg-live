#!/usr/bin/env node
/**
 * Dev-only proxy that serves the app on a second origin with a pre-seeded session.
 *
 * Browsers scope localStorage per origin, so two tabs on localhost:3000 share one
 * login — signing in as a buyer in one silently replaces the seller in the other.
 * Fronting the same dev server on another port gives each role its own storage,
 * which is what makes a side-by-side seller/buyer view possible.
 *
 * Usage: PORT=3100 USER_EMAIL=luis@tcg.mx node tools/session-proxy.mjs
 */
import http from 'node:http';
import net from 'node:net';

const UPSTREAM = { host: '127.0.0.1', port: Number(process.env.UPSTREAM_PORT ?? 3000) };
const API = process.env.API ?? 'http://localhost:3001';
const PORT = Number(process.env.PORT ?? 3100);
const EMAIL = process.env.USER_EMAIL ?? 'ana@tcg.mx';
const PASSWORD = process.env.USER_PASSWORD ?? 'password123';

let seed = ''; // <script> that installs the session before the app boots

async function loadSession() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('login failed: ' + JSON.stringify(data).slice(0, 200));
  seed =
    `<script>try{` +
    `localStorage.setItem('tcg_token',${JSON.stringify(data.token)});` +
    `localStorage.setItem('tcg_user',${JSON.stringify(JSON.stringify(data.user))});` +
    `localStorage.setItem('tcg_returning','1');` +
    // Deliberately no data-theme here: setting it before hydration mismatches the
    // server-rendered html and trips React's hydration warning.
    `}catch(e){}</script>`;
  console.log(`session ready: ${data.user.username} (${data.user.role}) on :${PORT}`);
}

const server = http.createServer((req, res) => {
  const proxyReq = http.request(
    {
      host: UPSTREAM.host, port: UPSTREAM.port, path: req.url, method: req.method,
      // identity: we rewrite HTML, so it has to arrive uncompressed
      headers: { ...req.headers, host: `localhost:${UPSTREAM.port}`, 'accept-encoding': 'identity' },
    },
    (proxyRes) => {
      const type = proxyRes.headers['content-type'] || '';
      if (!type.includes('text/html')) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
        return;
      }
      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').replace('<head>', '<head>' + seed);
        const headers = { ...proxyRes.headers };
        delete headers['content-length'];
        delete headers['content-encoding'];
        res.writeHead(proxyRes.statusCode, headers);
        res.end(body);
      });
    },
  );
  proxyReq.on('error', e => { res.writeHead(502); res.end('proxy error: ' + e.message); });
  req.pipe(proxyReq);
});

// Pass websocket upgrades (HMR, LiveKit) straight through
server.on('upgrade', (req, socket, head) => {
  const up = net.connect(UPSTREAM.port, UPSTREAM.host, () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
});

await loadSession();
server.listen(PORT, () => console.log(`proxy on http://localhost:${PORT} → :${UPSTREAM.port}`));
