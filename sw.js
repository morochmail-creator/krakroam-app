/* ============================================================
   SERVICE WORKER — "schowek" apki w telefonie
   Dzięki niemu na słabym internecie (albo bez internetu):
   - apka otwiera się z pamięci telefonu, jeśli sieć nie odpowie w 4 sekundy,
   - raz obejrzane kawałki mapy (kafelki) są brane z telefonu, a nie z sieci,
   - raz odsłuchane / doładowane nagrania grają z telefonu.
   Zmiana numeru wersji poniżej czyści stare schowki u wszystkich.
============================================================ */
const VERSION = 'v1';
const SHELL = 'krakroam-shell-' + VERSION;   // sama apka (strona, ikony)
const LIBS = 'krakroam-libs-' + VERSION;     // biblioteka mapy i czcionki z zewnętrznych serwerów
const TILES = 'krakroam-tiles-' + VERSION;   // kafelki mapy
const AUDIO = 'krakroam-audio-' + VERSION;   // nagrania
const KEEP = [SHELL, LIBS, TILES, AUDIO];

const MAX_TILES = 2500;            // ok. 50–80 MB zdjęć satelitarnych, starsze kasujemy
const AUDIO_FRESH_MS = 3 * 24 * 3600 * 1000; // po 3 dniach sprawdzamy, czy nagranie nie zostało podmienione
const PAGE_TIMEOUT_MS = 4000;

const SHELL_FILES = ['/', '/manifest.json', '/icon-180.png', '/icon-192.png', '/lib/leaflet-rotate-0.2.8.js'];
const LIB_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // każdy plik osobno — jeden nieudany nie blokuje reszty
    const shell = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map(u => shell.add(u).catch(() => {})));
    const libs = await caches.open(LIBS);
    await Promise.all(LIB_FILES.map(u => libs.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      if (url.pathname === '/' || url.pathname === '/index.html') event.respondWith(pageResponse(req));
      return;
    }
    if (url.pathname.startsWith('/audio/') && url.pathname.endsWith('.mp3')) {
      event.respondWith(audioResponse(event, req));
      return;
    }
    if (url.pathname.startsWith('/foto/') || SHELL_FILES.includes(url.pathname)) {
      event.respondWith(staleWhileRevalidate(event, req, SHELL));
    }
    return;
  }

  if (url.hostname === 'server.arcgisonline.com' || url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(tileResponse(event, req));
    return;
  }
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event, req, LIBS)); // adresy z numerem wersji — nigdy się nie zmieniają
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(event, req, LIBS));
  }
  // reszta (np. wyznaczanie trasy pieszej) idzie normalnie przez sieć
});

/* --- strona apki: najpierw sieć (żeby nowe wersje docierały od razu), a gdy sieć nie odpowie w 4 s — kopia z telefonu --- */
async function pageResponse(req) {
  const cache = await caches.open(SHELL);
  const network = fetch(req).then(res => {
    if (res.ok && !res.redirected) cache.put('/', res.clone());
    return res;
  });
  const cached = await cache.match('/');
  if (!cached) return network;
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS));
  const fast = await Promise.race([network.catch(() => null), timeout]);
  return fast || cached;
}

/* --- kafelki mapy: z telefonu, a gdy ich nie ma — z sieci i od razu zapisujemy --- */
const noCors = new Set(); // serwery bez zgody na zapis kafelków (CORS) — wtedy tylko pokazujemy, bez zapisu
let tilePuts = 0;
async function tileResponse(event, req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const host = new URL(req.url).hostname;
  let res = null;
  if (!noCors.has(host)) {
    try { res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); } catch (_) {}
  }
  if (!res) {
    res = await fetch(req); // gdy i to się nie uda, to po prostu nie ma sieci
    noCors.add(host);
    return res;
  }
  if (res.ok) {
    event.waitUntil(cache.put(req.url, res.clone()).then(() => {
      if (++tilePuts % 100 === 0) return trimCache(TILES, MAX_TILES);
    }).catch(() => {}));
  }
  return res;
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]); // najstarsze są pierwsze
}

/* --- nagrania ---
   Jest w telefonie → gramy z telefonu (także przewijanie).
   Nie ma → gramy z sieci, a jeśli przyszedł cały plik, zapisujemy go przy okazji (bez pobierania drugi raz). */
async function audioResponse(event, req) {
  const cache = await caches.open(AUDIO);
  const key = new URL(req.url).pathname;
  const hit = await cache.match(key);
  const fresh = hit && (Date.now() - (+hit.headers.get('x-saved-at') || 0) < AUDIO_FRESH_MS);
  if (hit && fresh) return rangeFrom(hit, req.headers.get('range'));

  let res;
  try { res = await fetch(req); }
  catch (e) { if (hit) return rangeFrom(hit, req.headers.get('range')); throw e; }

  if (isWholeFile(res)) {
    const copy = res.clone();
    event.waitUntil(copy.blob().then(blob => cache.put(key, new Response(blob, {
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(blob.size), 'x-saved-at': String(Date.now()) }
    }))).catch(() => {}));
  }
  return res;
}

function isWholeFile(res) {
  if (res.status === 200) return true;
  if (res.status !== 206) return false;
  const m = /bytes 0-(\d+)\/(\d+)/.exec(res.headers.get('content-range') || '');
  return !!m && +m[1] === +m[2] - 1;
}

async function rangeFrom(cached, range) {
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  const base = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' };
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return new Response(buf, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - (+m[2] || 0)); end = size - 1; }
  else { start = +m[1]; end = m[2] ? Math.min(+m[2], size - 1) : size - 1; }
  if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` }
  });
}

/* --- pomocnicze --- */
async function cacheFirst(event, req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
  return res;
}

async function staleWhileRevalidate(event, req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true, ignoreSearch: true });
  const network = fetch(req).then(res => {
    if (res.ok) return cache.put(req, res.clone()).then(() => res);
    return res;
  });
  if (hit) { event.waitUntil(network.catch(() => {})); return hit; }
  return network;
}
