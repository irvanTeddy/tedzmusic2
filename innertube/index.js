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
// ENDPOINT BARU: MENGAMBIL AUDIO MURNI
// ==========================================
app.get('/stream', async (req, res) => {
    try {
        const videoId = req.query.id;
        if (!videoId) return res.status(400).json({ error: 'ID lagu tidak diberikan' });

        // Mengunduh stream audio mentah dari YouTube (format m4a yang support di semua HP)
        const stream = await yt.download(videoId, {
            type: 'audio', // Hanya ambil suara, hemat kuota
            quality: 'best',
            format: 'mp4' 
        });

        // Beri tahu browser bahwa ini adalah file musik yang bisa diputar
        res.setHeader('Content-Type', 'audio/mp4');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Alirkan (pipe) data audio dari server YouTube -> VPS kamu -> HP pengguna
        for await (const chunk of stream) {
            res.write(chunk);
        }
        res.end();
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
