const CACHE = "mandelbrot-v3";
const URLS = ["/","/index.html","/app.js","/worker.js","/style.css","/manifest.json","/icons/favicon.svg","/icons/icon-192.png","/icons/icon-512.png"];

self.addEventListener("install", e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)));
    self.skipWaiting();
});
self.addEventListener("activate", e => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
    self.clients.claim();
});
self.addEventListener("fetch", e => {
    e.respondWith(caches.match(e.request).then(c => {
        const f = fetch(e.request).then(r => {
            if (r && r.status === 200 && e.request.method === "GET") {
                caches.open(CACHE).then(ca => ca.put(e.request, r.clone()));
            }
            return r;
        }).catch(() => c);
        return c || f;
    }));
});
