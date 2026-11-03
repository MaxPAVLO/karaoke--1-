// Сохраняет файлы приложения, чтобы оно открывалось без интернета.
// Изменили код? Увеличьте номер версии (v4 -> v5).
const CACHE = 'karaoke-v5';
const FILES = [
  './', 'index.html', 'style.css', 'config.js', 'cloud.js', 'db.js', 'player.js', 'app.js',
  'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // запросы к Supabase и любые не-GET браузер делает сам
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
