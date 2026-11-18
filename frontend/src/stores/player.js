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

// Naikkan resolusi cover
function hdThumb(url, size = 720) {
    if (!url || typeof url !== 'string') return url
    if (/(googleusercontent|ggpht)\.com/i.test(url)) {
        return url.replace(/=(w\d+-h\d+|s\d+)[^/=]*$/i, `=w${size}-h${size}-l90-rj`)
    }
    return url.replace(/(\/vi(?:_webp)?\/[^/]+\/)(?:default|mqdefault)(\.\w+)/i, '$1hqdefault$2')
}
const hdTrack = t => (t && t.thumbnail_url ? { ...t, thumbnail_url: hdThumb(t.thumbnail_url) } : t)
const hdList = list => (Array.isArray(list) ? list.map(hdTrack) : [])

export const usePlayerStore = defineStore('player', () => {
    // State katalog & pencarian
    const searchQuery = ref('')
    const tracks = ref([])
    const isSearching = ref(false)
    const searchError = ref(null)

    // Sesi terakhir dipulihkan saat aplikasi dibuka lagi
    const saved = readJson('player_session', null)
    const savedQueue = hdList(saved?.queue)
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
    const stopAfterTrack = ref(false) // timer tidur

    // Mode putar: acak & ulang
    const shuffle = ref(localStorage.getItem('player_shuffle') === 'true')
    const repeat = ref(localStorage.getItem('player_repeat') || 'off')
    let shuffleBag = []
    let shuffleHistory = []
    let shuffleStarted = false

    // Koleksi lokal
    const likedTracks = ref(hdList(readJson('liked_tracks', [])))
    const recentTracks = ref(hdList(readJson('recent_tracks', [])))
    const playlists = ref(
        readJson('playlists', []).map(p => ({ ...p, tracks: hdList(p.tracks) }))
    )

    // Instance YouTube Player
    let ytPlayer = null
    let progressTimer = null
    let loadedVideoId = ''
    let errorStreak = 0
    let errorTimer = null
    let saveTick = 0
    let loadTimer = null
    let userPaused = false
    let hiddenAt = 0
    let autoResumeTries = 0
    let visibilityBound = false

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

    let liveVol = volume.value
    let fadeTimer = null
    let pendingFadeIn = false

    function applyVol(v) {
        liveVol = v
        if (ytPlayer && isReady.value) ytPlayer.setVolume(v)
    }

    function clearFade() {
        clearInterval(fadeTimer)
        fadeTimer = null
    }

    const smooth = t => t * t * (3 - 2 * t)

    function fade(from, to, ms, done) {
        clearFade()
        if (!ytPlayer || !isReady.value) return done?.()
        if (ms <= 0) {
            applyVol(to)
            return done?.()
        }
        const start = performance.now()
        fadeTimer = setInterval(() => {
            const t = Math.min(1, (performance.now() - start) / ms)
            applyVol(Math.round(from + (to - from) * smooth(t)))
            if (t >= 1) {
                clearFade()
                done?.()
            }
        }, 16)
    }

    function restoreVolume() {
        clearFade()
        clearTimeout(loadTimer)
        loadTimer = null
        pendingFadeIn = false
        applyVol(volume.value)
    }

    let keepAliveEl = null

    function silentWavUrl(seconds = 10, rate = 8000) {
        const n = seconds * rate
        const buf = new ArrayBuffer(44 + n)
        const v = new DataView(buf)
        const tag = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
        tag(0, 'RIFF')
        v.setUint32(4, 36 + n, true)
        tag(8, 'WAVE')
        tag(12, 'fmt ')
        v.setUint32(16, 16, true)
        v.setUint16(20, 1, true)
        v.setUint16(22, 1, true)
        v.setUint32(24, rate, true)
        v.setUint32(28, rate, true)
        v.setUint16(32, 1, true)
        v.setUint16(34, 8, true)
        tag(36, 'data')
        v.setUint32(40, n, true)
        new Uint8Array(buf, 44).fill(128)
        return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
    }

    function setKeepAlive(on) {
        try {
            if (on) {
                if (!keepAliveEl) {
                    keepAliveEl = new Audio(silentWavUrl())
                    keepAliveEl.loop = true
                    keepAliveEl.preload = 'auto'
                }
                keepAliveEl.play()?.catch(() => {})
            } else if (keepAliveEl) {
                keepAliveEl.pause()
            }
        } catch { }
    }

    function bindVisibility() {
        if (visibilityBound || typeof document === 'undefined') return
        visibilityBound = true
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                hiddenAt = Date.now()
                autoResumeTries = 0
            }
        })
    }

    function updateMediaMetadata(track) {
        if (!('mediaSession' in navigator) || !track) return
        const src = track.thumbnail_url
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: 'TedzMusic',
            artwork: src ? [96, 192, 256, 384, 512].map(n => ({ src, sizes: `${n}x${n}` })) : []
        })
    }

    function syncPositionState() {
        if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
        const d = duration.value
        if (!d || !Number.isFinite(d)) return
        try {
            navigator.mediaSession.setPositionState({
                duration: d,
                position: Math.min(Math.max(currentTime.value, 0), d),
                playbackRate: 1
            })
        } catch { }
    }

    function setPlaybackState(state) {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state
    }

    function setupMediaHandlers() {
        if (!('mediaSession' in navigator)) return
        const set = (action, fn) => {
            try { navigator.mediaSession.setActionHandler(action, fn) } catch { }
        }
        set('play', () => { if (!isPlaying.value) togglePlay() })
        set('pause', () => { if (isPlaying.value) togglePlay() })
        set('previoustrack', () => playPrev())
        set('nexttrack', () => playNext())
        set('seekto', d => { if (d.seekTime != null) seekTo(d.seekTime) })
        set('seekbackward', d => seekTo(Math.max(0, currentTime.value - (d.seekOffset || 10))))
        set('seekforward', d => seekTo(Math.min(duration.value || 0, currentTime.value + (d.seekOffset || 10))))
    }

    function initYouTubePlayer(elementId = 'yt-hidden-player') {
        bindVisibility()
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
            height: '1', // <-- TRIK HEMAT 1: Paksa layar jadi 1 pixel (super kecil)
            width: '1',  // <-- TRIK HEMAT 1: Paksa layar jadi 1 pixel
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
                    applyVol(volume.value)
                    
                    // TRIK HEMAT 2: Begitu player siap, paksa setingan ke 144p ('small')
                    if (typeof ytPlayer.setPlaybackQuality === 'function') {
                        ytPlayer.setPlaybackQuality('small')
                    }
                    
                    setupMediaHandlers()
                    if (currentTrack.value) updateMediaMetadata(currentTrack.value)
                },
                onStateChange: (event) => {
                    if (pendingFadeIn && (event.data === -1 || event.data === window.YT.PlayerState.BUFFERING)) applyVol(0)
                    if (event.data === window.YT.PlayerState.PLAYING) {
                        
                        // TRIK HEMAT 3: Pengamanan ekstra. Tiap kali video mulai, paksa lagi ke 144p
                        if (typeof ytPlayer.setPlaybackQuality === 'function') {
                            ytPlayer.setPlaybackQuality('small')
                        }

                        errorStreak = 0
                        userPaused = false
                        autoResumeTries = 0
                        setKeepAlive(true)
                        isPlaying.value = true
                        duration.value = ytPlayer.getDuration() || currentTrack.value?.duration || 0
                        currentTime.value = ytPlayer.getCurrentTime() || currentTime.value
                        setPlaybackState('playing')
                        syncPositionState()
                        if (pendingFadeIn) {
                            pendingFadeIn = false
                            fade(liveVol, volume.value, 320)
                        }
                        startProgressLoop()
                    } else if (event.data === window.YT.PlayerState.PAUSED) {
                        if (!userPaused && document.hidden && Date.now() - hiddenAt < 2500 && autoResumeTries < 2) {
                            autoResumeTries++
                            ytPlayer.playVideo()
                            return
                        }
                        isPlaying.value = false
                        currentTime.value = ytPlayer.getCurrentTime() || currentTime.value
                        setPlaybackState('paused')
                        syncPositionState()
                        stopProgressLoop()
                        setKeepAlive(false)
                        saveSession()
                    } else if (event.data === window.YT.PlayerState.ENDED) {
                        stopProgressLoop()
                        restoreVolume()
                        if (stopAfterTrack.value) {
                            stopAfterTrack.value = false
                            isPlaying.value = false
                            setKeepAlive(false)
                            setPlaybackState('paused')
                            currentTime.value = 0
                            loadedVideoId = ''
                            saveSession()
                            return
                        }
                        if (repeat.value === 'one') {
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
                    restoreVolume()
                    errorStreak++
                    if (errorStreak >= 3 || queue.value.length <= 1) {
                        errorStreak = 0
                        isPlaying.value = false
                        setKeepAlive(false)
                        setPlaybackState('paused')
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
            tracks.value = hdList(res.data.data || [])
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

    const FADE_OUT_MS = 180
    const SILENCE_MS = 140

    function startLoad(track, start = 0) {
        if (!ytPlayer || !isReady.value) return
        clearTimeout(loadTimer)
        loadTimer = null
        const load = () => {
            loadTimer = null
            loadedVideoId = track.video_id
            userPaused = false
            pendingFadeIn = true
            applyVol(0)
            
            // TRIK HEMAT 4: Memuat video dengan instruksi resolusi small
            ytPlayer.loadVideoById({ videoId: track.video_id, startSeconds: start, suggestedQuality: 'small' })
        }
        if (isPlaying.value) {
            fade(liveVol, 0, FADE_OUT_MS, () => {
                loadTimer = setTimeout(load, SILENCE_MS)
            })
        } else {
            load()
        }
    }

    function playTrack(track, trackList = null) {
        if (trackList && Array.isArray(trackList)) {
            queue.value = [...trackList]
            currentIndex.value = queue.value.findIndex(t => t.video_id === track.video_id)
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
        shuffleBag = shuffleBag.filter(id => id !== track.video_id)

        pushRecent(track)
        currentTime.value = 0
        duration.value = track.duration || 0
        updateMediaMetadata(track)
        saveSession()

        startLoad(track, 0)
    }

    function loadCurrent(start = 0) {
        const t = currentTrack.value
        if (!t || !ytPlayer || !isReady.value) return
        updateMediaMetadata(t)
        startLoad(t, start)
    }

    function togglePlay() {
        if (!ytPlayer || !isReady.value || !currentTrack.value) return
        if (loadedVideoId !== currentTrack.value.video_id) {
            loadCurrent(currentTime.value)
            return
        }
        if (isPlaying.value) {
            userPaused = true
            ytPlayer.pauseVideo()
            restoreVolume() 
        } else {
            userPaused = false
            ytPlayer.playVideo()
        }
    }

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

    function nextIndex(auto) {
        const n = queue.value.length
        const stopAtEnd = auto && repeat.value !== 'all'

        if (shuffle.value) {
            if (!shuffleBag.length) {
                if (shuffleStarted && stopAtEnd) return -1
                refillShuffleBag()
            }
            if (!shuffleBag.length) return stopAtEnd ? -1 : 0 
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
            isPlaying.value = false
            setKeepAlive(false)
            setPlaybackState('paused')
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
                setPlaybackState('paused')
                currentTime.value = 0
                duration.value = 0
                setKeepAlive(false)
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
        if (loadedVideoId !== currentTrack.value?.video_id) {
            currentTime.value = seconds
            return
        }
        ytPlayer.seekTo(seconds, true)
        currentTime.value = seconds
        syncPositionState()
    }

    function setVolume(val) {
        clearFade()
        pendingFadeIn = false
        volume.value = Number(val)
        localStorage.setItem('player_volume', String(volume.value))
        applyVol(volume.value)
        if (ytPlayer && isReady.value && volume.value > 0 && isMuted.value) {
            ytPlayer.unMute()
            isMuted.value = false
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
