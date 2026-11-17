// Service worker sederhana: aplikasi tetap bisa dibuka saat offline.
// Hanya menyimpan berkas milik situs sendiri; API pencarian dan YouTube tidak di-cache.
const CACHE = 'tedzmusic-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
    event.waitUntil(
        caches
            .keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    )
})

self.addEventListener('fetch', event => {
    const req = event.request
    if (req.method !== 'GET') return
    const url = new URL(req.url)
    if (url.origin !== self.location.origin) return

    // Halaman: ambil dari jaringan dulu, jatuh ke salinan terakhir saat offline
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(res => {
                    const copy = res.clone()
                    caches.open(CACHE).then(c => c.put('/', copy))
                    return res
                })
                .catch(() => caches.match('/'))
        )
        return
    }

    // Berkas statis: pakai cache, perbarui di latar belakang
    event.respondWith(
        caches.match(req).then(cached => {
            const network = fetch(req)
                .then(res => {
                    if (res.ok) {
                        const copy = res.clone()
                        caches.open(CACHE).then(c => c.put(req, copy))
                    }
                    return res
                })
                .catch(() => cached)
            return cached || network
        })
    )
})