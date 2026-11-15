// Service worker: guarda la aplicación en el dispositivo para que funcione sin conexión.
const CACHE = 'separaciones-v3';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'styles.css',
  'app.js',
  'core.js',
  'db.js',
  'xlsx.js',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Responde desde el caché y actualiza en segundo plano (la versión nueva se ve al abrir de nuevo).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardado = await cache.match(req, { ignoreSearch: true });
      const red = fetch(req)
        .then((resp) => {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => null);
      if (guardado) {
        e.waitUntil(red);
        return guardado;
      }
      const resp = await red;
      return resp || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }),
  );
});
