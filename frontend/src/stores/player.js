import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

// Alamat backend pencarian. Atur lewat .env: VITE_API_URL=https://api.domainmu.com
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')

function readJson(key, fallback) {
    try {
        const v = JSON.parse(localStorage.getItem(key))
        return v ?? fallback
    } catch {
        return fallback
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch {
        /* penyimpanan penuh / diblokir: abaikan */
    }
}

export const usePlayerStore = defineStore('player', () => {
    // State katalog & pencarian
    const searchQuery = ref('')
    const tracks = ref([])
    const isSearching = ref(false)
    const searchError = ref(null)

    // Sesi terakhir (antrean, lagu, posisi) dipulihkan saat aplikasi dibuka lagi
    const saved = readJson('player_session', null)
    const savedQueue = Array.isArray(saved?.queue) ? saved.queue : []
    const savedIndex = Number.isInteger(saved?.index) && saved.index >= 0 && saved.index < savedQueue.length ? saved.index : -1

    // State antrean & pemutaran
    const queue = ref(savedIndex >= 0 ? savedQueue : [])
    const currentIndex = ref(savedIndex)
    const isPlaying = ref(false)
    const isReady = ref(false)
    const currentTime = ref(savedIndex >= 0 ? Number(saved.time) || 0 : 0)
    const duration = ref(savedIndex >= 0 ? savedQueue[savedIndex]?.duration || 0 : 0)
    const rawVolume = localStorage.getItem('player_volume')
    const volume = ref(rawVolume !== null && Number.isFinite(Number(rawVolume)) ? Number(rawVolume) : 80)
    const isMuted = ref(false)
    const playbackError = ref(null)
    const stopAfterTrack = ref(false) // timer tidur "akhir lagu ini"

    // Mode putar: acak & ulang ('off' | 'all' | 'one'), disimpan di localStorage
    const shuffle = ref(localStorage.getItem('player_shuffle') === 'true')
    const repeat = ref(localStorage.getItem('player_repeat') || 'off')
    let shuffleBag = [] // video_id yang belum diputar pada putaran acak ini
    let shuffleHistory = [] // riwayat lagu untuk tombol "sebelumnya" saat acak
    let shuffleStarted = false // false = kantong acak belum dikocok untuk antrean ini

    // Koleksi lokal (disimpan di localStorage agar persisten)
    const likedTracks = ref(readJson('liked_tracks', []))
    const recentTracks = ref(readJson('recent_tracks', []))
    const playlists = ref(readJson('playlists', []))

    // Instance YouTube Player
    let ytPlayer = null
    let progressTimer = null
    let loadedVideoId = '' // video yang saat ini dimuat di pemutar YouTube
    let errorStreak = 0
    let errorTimer = null
    let saveTick = 0

    const currentTrack = computed(() => {
        if (currentIndex.value >= 0 && currentIndex.value < queue.value.length) {
            return queue.value[currentIndex.value]
        }
        return null
    })

    const isCurrentLiked = computed(() => {
        if (!currentTrack.value) return false
        return likedTracks.value.some(t => t.video_id === currentTrack.value.video_id)
    })

    /* ---------- Penyimpanan sesi ---------- */
    function saveSession() {
        writeJson('player_session', {
            queue: queue.value.slice(0, 200),
            index: currentIndex.value,
            time: Math.floor(currentTime.value)
        })
    }

    function flashError(message) {
        playbackError.value = message
        clearTimeout(errorTimer)
        errorTimer = setTimeout(() => (playbackError.value = null), 5000)
    }

    /* ---------- Kontrol Media Lock Screen HP & Tombol Media Keyboard ---------- */
    function updateMediaSession(track) {
        if (!('mediaSession' in navigator) || !track) return

        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: 'TedzMusic',
            artwork: track.thumbnail_url
                ? [{ src: track.thumbnail_url, sizes: '512x512', type: 'image/jpeg' }]
                : []
        })

        navigator.mediaSession.setActionHandler('play', () => togglePlay())
        navigator.mediaSession.setActionHandler('pause', () => togglePlay())
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrev())
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext())
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) seekTo(details.seekTime)
        })
    }

    // Inisialisasi Headless YouTube IFrame API
    function initYouTubePlayer(elementId = 'yt-hidden-player') {
        if (window.YT && window.YT.Player) {
            createPlayerInstance(elementId)
            return
        }

        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)

        window.onYouTubeIframeAPIReady = () => {
            createPlayerInstance(elementId)
        }
    }

    function createPlayerInstance(elementId) {
        ytPlayer = new window.YT.Player(elementId, {
            height: '1',
            width: '1',
            playerVars: {
                autoplay: 1,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                rel: 0,
                playsinline: 1
            },
            events: {
                onReady: (event) => {
                    isReady.value = true
                    event.target.setVolume(volume.value)
                },
                onStateChange: (event) => {
                    // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
                    if (event.data === window.YT.PlayerState.PLAYING) {
                        errorStreak = 0
                        isPlaying.value = true
                        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
                        
                        // KEMBALIKAN VOLUME SETELAH LAGU MULAI (Menghilangkan pop sound)
                        ytPlayer.setVolume(isMuted.value ? 0 : volume.value)

                        duration.value = ytPlayer.getDuration() || currentTrack.value?.duration || 0
                        startProgressLoop()
                    } else if (event.data === window.YT.PlayerState.PAUSED) {
                        isPlaying.value = false
                        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
                        stopProgressLoop()
                        saveSession()
                    } else if (event.data === window.YT.PlayerState.ENDED) {
                        stopProgressLoop()
                        if (stopAfterTrack.value) {
                            // Timer tidur "akhir lagu ini": berhenti di sini
                            stopAfterTrack.value = false
                            isPlaying.value = false
                            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
                            currentTime.value = 0
                            loadedVideoId = ''
                            saveSession()
                            return
                        }
                        if (repeat.value === 'one') {
                            // Ulangi lagu yang sama tanpa memuat ulang video
                            currentTime.value = 0
                            ytPlayer.seekTo(0, true)
                            ytPlayer.playVideo()
                            return
                        }
                        isPlaying.value = false
                        advance(true)
                    }
                },
                onError: (e) => {
                    console.error('YouTube Player Error:', e.data)
                    errorStreak++
                    // Beberapa lagu berturut-turut gagal: berhenti, jangan melompat tanpa akhir
                    if (errorStreak >= 3 || queue.value.length <= 1) {
                        errorStreak = 0
                        isPlaying.value = false
                        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
                        stopProgressLoop()
                        flashError('Lagu tidak bisa diputar. Coba lagu lain atau periksa koneksi internetmu.')
                        return
                    }
                    flashError('Lagu ini tidak bisa diputar, dilewati.')
                    advance(true)
                }
            }
        })
    }

    function startProgressLoop() {
        stopProgressLoop()
        progressTimer = setInterval(() => {
            if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
                currentTime.value = ytPlayer.getCurrentTime()
                const d = ytPlayer.getDuration()
                if (d > 0) duration.value = d
                // Simpan posisi tiap ±5 detik
                saveTick = (saveTick + 1) % 10
                if (saveTick === 0) saveSession()
            }
        }, 500)
    }

    function stopProgressLoop() {
        if (progressTimer) {
            clearInterval(progressTimer)
            progressTimer = null
        }
    }

    // Pencarian lagu ke microservice InnerTube
    async function searchMusic(query) {
        if (!query || !query.trim()) return
        searchQuery.value = query
        isSearching.value = true
        searchError.value = null

        try {
            const res = await axios.get(`${API_URL}/search`, {
                params: { q: query },
                timeout: 12000
            })
            tracks.value = res.data.data || []
        } catch (err) {
            console.error('Gagal mencari lagu:', err)
            searchError.value =
                typeof navigator !== 'undefined' && navigator.onLine === false
                    ? 'Kamu sedang offline. Sambungkan internet lalu coba lagi.'
                    : 'Tidak bisa terhubung ke server pencarian. Coba lagi sebentar lagi.'
        } finally {
            isSearching.value = false
        }
    }

    function retrySearch() {
        searchMusic(searchQuery.value || 'Top Hits Indonesia')
    }

    function pushRecent(track) {
        recentTracks.value = [track, ...recentTracks.value.filter(t => t.video_id !== track.video_id)].slice(0, 12)
        writeJson('recent_tracks', recentTracks.value)
    }

    // Putar lagu & set antrean
    function playTrack(track, trackList = null) {
        if (trackList && Array.isArray(trackList)) {
            queue.value = [...trackList]
            currentIndex.value = queue.value.findIndex(t => t.video_id === track.video_id)
            // Antrean baru: mulai putaran acak & riwayat dari awal
            shuffleBag = []
            shuffleHistory = []
            shuffleStarted = false
        } else {
            const existingIdx = queue.value.findIndex(t => t.video_id === track.video_id)
            if (existingIdx !== -1) {
                currentIndex.value = existingIdx
            } else {
                queue.value.push(track)
                currentIndex.value = queue.value.length - 1
                shuffleBag = []
                shuffleStarted = false
            }
        }
        // Lagu yang baru dipilih dianggap sudah diputar pada putaran acak ini
        shuffleBag = shuffleBag.filter(id => id !== track.video_id)

        pushRecent(track)
        currentTime.value = 0
        duration.value = track.duration || 0
        updateMediaSession(track)
        saveSession()

        if (ytPlayer && isReady.value) {
            loadedVideoId = track.video_id
            ytPlayer.setVolume(0) // Mute sesaat sebelum ganti lagu
            ytPlayer.loadVideoById({ videoId: track.video_id, startSeconds: 0 })
        }
    }

    // Muat lagu yang sedang aktif (mis. sesi yang dipulihkan) mulai dari posisi tertentu
    function loadCurrent(start = 0) {
        const t = currentTrack.value
        if (!t || !ytPlayer || !isReady.value) return
        updateMediaSession(t)
        loadedVideoId = t.video_id
        ytPlayer.setVolume(0) // Mute sesaat sebelum ganti lagu
        ytPlayer.loadVideoById({ videoId: t.video_id, startSeconds: start })
    }

    function togglePlay() {
        if (!ytPlayer || !isReady.value || !currentTrack.value) return
        if (loadedVideoId !== currentTrack.value.video_id) {
            loadCurrent(currentTime.value)
            return
        }
        if (isPlaying.value) {
            ytPlayer.pauseVideo()
        } else {
            ytPlayer.playVideo()
        }
    }

    // Kocok semua lagu antrean (kecuali yang sedang diputar) ke dalam "kantong" acak
    function refillShuffleBag() {
        const currentId = currentTrack.value?.video_id
        const ids = queue.value.map(t => t.video_id).filter(id => id !== currentId)
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        shuffleBag = ids
        shuffleStarted = true
    }

    // Tentukan indeks lagu berikutnya; -1 berarti berhenti
    // auto = true bila dipicu lagu selesai sendiri (bukan tombol "berikutnya")
    function nextIndex(auto) {
        const n = queue.value.length
        const stopAtEnd = auto && repeat.value !== 'all'

        if (shuffle.value) {
            if (!shuffleBag.length) {
                // Berhenti hanya bila satu putaran acak sudah benar-benar habis
                if (shuffleStarted && stopAtEnd) return -1
                refillShuffleBag()
            }
            if (!shuffleBag.length) return stopAtEnd ? -1 : 0 // antrean hanya satu lagu
            const id = shuffleBag.shift()
            return queue.value.findIndex(t => t.video_id === id)
        }

        const next = currentIndex.value + 1
        if (next >= n) return stopAtEnd ? -1 : 0
        return next
    }

    function advance(auto = false) {
        if (queue.value.length === 0) return
        const idx = nextIndex(auto)
        if (idx === -1) {
            // Akhir antrean tanpa "ulangi semua": berhenti dan kembali ke awal lagu
            isPlaying.value = false
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
            currentTime.value = 0
            if (ytPlayer && isReady.value) ytPlayer.stopVideo()
            loadedVideoId = ''
            saveSession()
            return
        }
        if (shuffle.value && currentTrack.value) {
            shuffleHistory.push(currentTrack.value.video_id)
        }
        playTrack(queue.value[idx])
    }

    function playNext() {
        advance(false)
    }

    function playPrev() {
        if (queue.value.length === 0) return
        if (currentTime.value > 3) {
            seekTo(0)
            return
        }
        if (shuffle.value && shuffleHistory.length) {
            const id = shuffleHistory.pop()
            const idx = queue.value.findIndex(t => t.video_id === id)
            if (idx !== -1) {
                // Kembalikan lagu yang ditinggalkan ke kantong agar bisa muncul lagi
                if (currentTrack.value) shuffleBag.unshift(currentTrack.value.video_id)
                playTrack(queue.value[idx])
                return
            }
        }
        const prevIdx = (currentIndex.value - 1 + queue.value.length) % queue.value.length
        playTrack(queue.value[prevIdx])
    }

    function toggleShuffle() {
        shuffle.value = !shuffle.value
        shuffleBag = []
        shuffleHistory = []
        shuffleStarted = false
        localStorage.setItem('player_shuffle', String(shuffle.value))
    }

    function cycleRepeat() {
        repeat.value = repeat.value === 'off' ? 'all' : repeat.value === 'all' ? 'one' : 'off'
        localStorage.setItem('player_repeat', repeat.value)
    }

    /* ---------- Kelola antrean ---------- */
    function addToQueue(track) {
        if (!track) return
        if (queue.value.some(t => t.video_id === track.video_id)) return
        queue.value.push(track)
        shuffleBag = []
        shuffleStarted = false
        saveSession()
    }

    function removeFromQueue(idx) {
        if (idx < 0 || idx >= queue.value.length) return
        const removingCurrent = idx === currentIndex.value
        queue.value.splice(idx, 1)
        const ids = new Set(queue.value.map(t => t.video_id))
        shuffleBag = shuffleBag.filter(id => ids.has(id))

        if (idx < currentIndex.value) {
            currentIndex.value--
        } else if (removingCurrent) {
            if (!queue.value.length) {
                currentIndex.value = -1
                isPlaying.value = false
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
                currentTime.value = 0
                duration.value = 0
                if (ytPlayer && isReady.value) ytPlayer.stopVideo()
                loadedVideoId = ''
            } else {
                if (currentIndex.value >= queue.value.length) currentIndex.value = 0
                playTrack(queue.value[currentIndex.value])
                return
            }
        }
        saveSession()
    }

    function moveInQueue(from, to) {
        const n = queue.value.length
        if (from < 0 || from >= n || to < 0 || to >= n || from === to) return
        const [item] = queue.value.splice(from, 1)
        queue.value.splice(to, 0, item)
        const cur = currentIndex.value
        if (from === cur) currentIndex.value = to
        else if (from < cur && to >= cur) currentIndex.value--
        else if (from > cur && to <= cur) currentIndex.value++
        saveSession()
    }

    // Hapus semua lagu setelah lagu yang sedang diputar
    function clearUpcoming() {
        if (currentIndex.value < 0) {
            queue.value = []
        } else {
            queue.value.splice(currentIndex.value + 1)
        }
        shuffleBag = []
        shuffleStarted = false
        saveSession()
    }

    /* ---------- Daftar putar buatan sendiri ---------- */
    function createPlaylist(name) {
        const n = String(name || '').trim().slice(0, 60)
        if (!n) return null
        const id = 'pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        playlists.value.push({ id, name: n, tracks: [] })
        writeJson('playlists', playlists.value)
        return id
    }

    function renamePlaylist(id, name) {
        const p = playlists.value.find(x => x.id === id)
        const n = String(name || '').trim().slice(0, 60)
        if (!p || !n) return
        p.name = n
        writeJson('playlists', playlists.value)
    }

    function deletePlaylist(id) {
        playlists.value = playlists.value.filter(p => p.id !== id)
        writeJson('playlists', playlists.value)
    }

    function isInPlaylist(id, videoId) {
        return !!playlists.value.find(p => p.id === id)?.tracks.some(t => t.video_id === videoId)
    }

    // Menambah bila belum ada, menghapus bila sudah ada. Mengembalikan true bila ditambahkan.
    function togglePlaylistTrack(id, track) {
        const p = playlists.value.find(x => x.id === id)
        if (!p || !track) return false
        const idx = p.tracks.findIndex(t => t.video_id === track.video_id)
        if (idx === -1) p.tracks.push(track)
        else p.tracks.splice(idx, 1)
        writeJson('playlists', playlists.value)
        return idx === -1
    }

    function seekTo(seconds) {
        if (!ytPlayer || !isReady.value) return
        // Sesi yang dipulihkan belum dimuat: simpan posisinya, diterapkan saat tombol putar ditekan
        if (loadedVideoId !== currentTrack.value?.video_id) {
            currentTime.value = seconds
            return
        }
        ytPlayer.seekTo(seconds, true)
        currentTime.value = seconds
    }

    function setVolume(val) {
        volume.value = Number(val)
        localStorage.setItem('player_volume', String(volume.value))
        if (ytPlayer && isReady.value) {
            ytPlayer.setVolume(volume.value)
            if (volume.value > 0 && isMuted.value) {
                ytPlayer.unMute()
                isMuted.value = false
            }
        }
    }

    function toggleMute() {
        if (!ytPlayer || !isReady.value) return
        if (isMuted.value) {
            ytPlayer.unMute()
            isMuted.value = false
        } else {
            ytPlayer.mute()
            isMuted.value = true
        }
    }

    function toggleLike(track) {
        if (!track) return
        const idx = likedTracks.value.findIndex(t => t.video_id === track.video_id)
        if (idx === -1) {
            likedTracks.value.unshift(track)
        } else {
            likedTracks.value.splice(idx, 1)
        }
        writeJson('liked_tracks', likedTracks.value)
    }

    return {
        searchQuery,
        tracks,
        isSearching,
        searchError,
        queue,
        currentIndex,
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        shuffle,
        repeat,
        playbackError,
        stopAfterTrack,
        likedTracks,
        recentTracks,
        playlists,
        isCurrentLiked,
        initYouTubePlayer,
        searchMusic,
        retrySearch,
        playTrack,
        togglePlay,
        playNext,
        playPrev,
        toggleShuffle,
        cycleRepeat,
        addToQueue,
        removeFromQueue,
        moveInQueue,
        clearUpcoming,
        createPlaylist,
        renamePlaylist,
        deletePlaylist,
        isInPlaylist,
        togglePlaylistTrack,
        seekTo,
        setVolume,
        toggleMute,
        toggleLike
    }
})
