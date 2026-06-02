// Minimal pass-through service worker.
//
// Its only job is to exist: some Android Chrome versions require a registered
// service worker before they will install the app as a standalone web app (a
// WebAPK) rather than a tab-opening shortcut. It deliberately caches nothing —
// every request goes straight to the network — so deploys are never served
// stale. Add caching here only if offline support is wanted later.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)));
