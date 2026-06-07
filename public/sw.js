// Minimal service worker.
//
// Two jobs:
//
// 1. Existence — some Android browsers require a registered service worker
//    before they will install the app as a standalone web app (a WebAPK)
//    rather than a tab-opening shortcut. It caches nothing: every normal
//    request goes straight to the network, so deploys are never served stale.
//
// 2. PDF delivery — `jsPDF.save()` hands the file off as a `blob:` URL
//    download, which Firefox Android punts to a blank external tab when the
//    app runs as an installed standalone PWA. Instead the page posts the PDF
//    blob here; we stash it and serve it back from a real same-origin URL with
//    `Content-Disposition: attachment`, which the PWA downloads natively.
// Bumped whenever sw.js changes, so the page's ack can confirm which worker
// actually answered (the JS bundle and the SW cache update independently).
const SW_VERSION = 'sw-pdf-2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Pending PDF downloads keyed by a one-shot id, awaiting their fetch.
const pendingDownloads = new Map();

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'pdf-download') {
    pendingDownloads.set(data.id, { blob: data.blob, filename: data.filename });
    // Acknowledge so the page only navigates once the blob is stashed,
    // avoiding a race where the fetch arrives first.
    event.ports[0]?.postMessage({ ok: true, version: SW_VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(/^\/download-pdf\/([^/]+)/);
  if (match) {
    const entry = pendingDownloads.get(match[1]);
    if (entry) {
      pendingDownloads.delete(match[1]); // one-shot
      const encoded = encodeURIComponent(entry.filename);
      event.respondWith(
        new Response(entry.blob, {
          headers: {
            'Content-Type': 'application/pdf',
            // `inline` so a top-level navigation to this URL renders the PDF in
            // the browser's viewer (or downloads it) rather than forcing a
            // download that a standalone PWA may bounce to a blank tab. RFC 5987
            // filename* carries the UTF-8 name (titles may be Japanese).
            'Content-Disposition': `inline; filename*=UTF-8''${encoded}`,
          },
        })
      );
      return;
    }
  }
  event.respondWith(fetch(event.request));
});
