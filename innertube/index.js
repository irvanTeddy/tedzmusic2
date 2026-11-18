import express from 'express';
import cors from 'cors';
import { Innertube, UniversalCache } from 'youtubei.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let yt;

async function initYouTube() {
    yt = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
    });
    console.log('InnerTube Search Engine siap!');
}

app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.json({ data: [] });

        const search = await yt.music.search(query, { type: 'song' });
        let items = search.songs?.contents || search.results || [];

        if (items.length > 0 && items[0].contents) {
            items = items.flatMap(shelf => shelf.contents || []);
        }

        let tracks = items
            .filter(item => item.id)
            .map(item => ({
                video_id: item.id,
                title: item.title?.text || item.title || 'Unknown Title',
                artist: item.artists?.map(a => a.name).join(', ') || item.author?.name || 'Unknown Artist',
                thumbnail_url: item.thumbnails?.[0]?.url || item.thumbnail?.contents?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
                duration: item.duration?.seconds || 0
            }));

        if (tracks.length === 0) {
            const fallbackSearch = await yt.search(query + ' official audio', { type: 'video' });
            tracks = (fallbackSearch.videos || [])
                .filter(v => v.id)
                .slice(0, 15)
                .map(v => ({
                    video_id: v.id,
                    title: v.title?.text || v.title || 'Unknown Title',
                    artist: v.author?.name || 'Unknown Artist',
                    thumbnail_url: v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
                    duration: v.duration?.seconds || 0
                }));
        }

        res.json({ data: tracks });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

// ==========================================
// ENDPOINT BARU: MENGAMBIL AUDIO MURNI (SMART PROXY RANGE)
// ==========================================
app.get('/stream', async (req, res) => {
    try {
        const videoId = req.query.id;
        if (!videoId) return res.status(400).json({ error: 'ID lagu tidak diberikan' });

        // 1. Dapatkan info lagu
        const info = await yt.getBasicInfo(videoId);
        const format = info.chooseFormat({ type: 'audio', format: 'mp4', quality: 'best' });

        if (!format || !format.url) {
            return res.status(404).json({ error: 'Format audio tidak ditemukan' });
        }

        // 2. Ambil URL audio mentah
        const url = format.url;

        // 3. Teruskan header Range dari HP pengguna ke YouTube
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        if (req.headers.range) {
            headers['Range'] = req.headers.range; // Ini kunci agar HP mau mengeluarkan suara!
        }

        // 4. Request audionya ke YouTube
        const response = await fetch(url, { headers });

        // 5. Beri tahu HP statusnya (bisa 206 Partial Content atau 200 OK)
        res.status(response.status);

        // 6. Copy header jawaban dari YouTube ke HP pengguna
        const headersToPass = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
        headersToPass.forEach(h => {
            if (response.headers.has(h)) {
                res.setHeader(h, response.headers.get(h));
            }
        });

        // 7. Alirkan audionya. Jika HP tiba-tiba ditutup, stop aliran untuk hemat kuota VPS.
        if (response.body) {
            const reader = response.body.getReader();
            
            req.on('close', () => {
                reader.cancel(); 
            });

            const pump = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        res.write(value);
                    }
                    res.end();
                } catch (err) {
                    if (!res.writableEnded) res.end();
                }
            };
            pump();
        } else {
            res.end();
        }
    } catch (error) {
        console.error('Stream error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Gagal mengambil audio' });
        }
    }
});
// ==========================================

initYouTube().then(() => {
    app.listen(PORT, () => {
        console.log(`InnerTube service berjalan di http://localhost:${PORT}`);
    });
});
