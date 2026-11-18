import express from 'express';
import cors from 'cors';
import { Innertube, UniversalCache } from 'youtubei.js';
import { Readable } from 'stream'; // Wajib untuk bikin pipa anti-lemot

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
// ENDPOINT BARU: JURUS HACKER (VIDEO-TO-AUDIO PIPING)
// ==========================================
app.get('/stream', async (req, res) => {
    try {
        const videoId = req.query.id;
        if (!videoId) return res.status(400).json({ error: 'ID lagu tidak diberikan' });

        const info = await yt.getBasicInfo(videoId);
        
        // RAHASIA UTAMA: Kita ambil format ITAG 18 (Video MP4 360p)
        // Format ini BUKAN DASH, jadi 10.000% pasti bunyi di HP Android/iOS manapun!
        let format = info.formats.find(f => f.itag === 18); 
        
        // Cadangan kalau format 360p gak ada (jarang terjadi)
        if (!format) {
            format = info.formats.find(f => f.has_audio && f.has_video && f.container === 'mp4');
        }

        if (!format || !format.url) {
            return res.status(404).json({ error: 'Format standar tidak ditemukan' });
        }

        // Siapkan header (Teruskan fitur geser-geser durasi dari HP ke YouTube)
        const fetchHeaders = {};
        if (req.headers.range) {
            fetchHeaders.Range = req.headers.range;
        }

        // Buka keran dari YouTube
        const ytRes = await fetch(format.url, { headers: fetchHeaders });

        // Tembak header balik ke HP pengguna
        res.status(ytRes.status);
        const headersToPass = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
        headersToPass.forEach(h => {
            if (ytRes.headers.has(h)) {
                res.setHeader(h, ytRes.headers.get(h));
            }
        });

        // SAMBUNGKAN PIPA: YouTube -> VPS -> HP (RAM VPS AMAN 100%)
        Readable.fromWeb(ytRes.body).pipe(res);

        // Kalau tab ditutup, matikan keran!
        req.on('close', () => {
            res.end();
        });

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
