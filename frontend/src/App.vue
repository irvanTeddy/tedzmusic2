<script setup>
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  h,
  defineComponent
} from 'vue'
import { usePlayerStore } from './stores/player'
import logo from './assets/logo.png'
import { ChevronLeft, ChevronUp, Trash2, Plus, Moon, Download, WifiOff, RotateCw, ListPlus, Pencil, Check, Library, Shuffle, Repeat, Repeat1, Search, Compass, ListMusic, ChevronDown, Music2, Keyboard, X, Clock } from 'lucide-vue-next'

/* ==========================================================
   IKON KONTROL KUSTOM (sudut membulat, dipakai seperti lucide)
   ========================================================== */
function makeIcon(name, draw, solid = false) {
  return defineComponent({
    name,
    render: () =>
      h(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: '0 0 24 24',
          fill: solid ? 'currentColor' : 'none',
          stroke: 'currentColor',
          'stroke-width': 2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true'
        },
        draw()
      )
  })
}

const Play = makeIcon('PlayIcon', () => [h('path', { d: 'M8.5 6v12l9-6z' })], true)

const Pause = makeIcon(
  'PauseIcon',
  () => [
    h('rect', { x: 7, y: 5.5, width: 2.4, height: 13, rx: 1 }),
    h('rect', { x: 14.6, y: 5.5, width: 2.4, height: 13, rx: 1 })
  ],
  true
)

const prevShapes = () => [
  h('path', { d: 'M6.5 6v12', 'stroke-width': 2.6, fill: 'none' }),
  h('path', { d: 'M18 6.8v10.4L9.8 12z' })
]
const SkipBack = makeIcon('SkipBackIcon', prevShapes, true)
const SkipForward = makeIcon(
  'SkipForwardIcon',
  () => [h('g', { transform: 'translate(24 0) scale(-1 1)' }, prevShapes())],
  true
)

const Heart = makeIcon('HeartIcon', () => [
  h('path', {
    d: 'M12 20.5s-7.5-4.6-9.2-9.2C1.8 8.2 3.6 4.8 7 4.8c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.4 0 5.2 3.4 4.2 6.5-1.7 4.6-9.2 9.2-9.2 9.2z'
  })
])

const Mic = makeIcon('MicIcon', () => [
  h('rect', { x: 9, y: 3, width: 6, height: 11, rx: 3 }),
  h('path', { d: 'M5.5 11a6.5 6.5 0 0 0 13 0' }),
  h('path', { d: 'M12 17.5V21' }),
  h('path', { d: 'M8.5 21h7' })
])

const speaker = () => h('path', { d: 'M4 9.5h2.8L12 5.2v13.6l-5.2-4.3H4z' })
const Volume2 = makeIcon(
  'Volume2Icon',
  () => [
    speaker(),
    h('path', { d: 'M15.6 9.2a4 4 0 0 1 0 5.6', fill: 'none' }),
    h('path', { d: 'M18.2 6.6a7.6 7.6 0 0 1 0 10.8', fill: 'none' })
  ],
  true
)
const VolumeX = makeIcon(
  'VolumeXIcon',
  () => [
    speaker(),
    h('path', { d: 'M16 9.5l5 5', fill: 'none' }),
    h('path', { d: 'M21 9.5l-5 5', fill: 'none' })
  ],
  true
)

/* ==========================================================
   STATE UI
   ========================================================== */
const player = usePlayerStore()
const activeTab = ref('explore') // 'explore' | 'liked' | 'queue'
const searchInput = ref('')
const showNowPlaying = ref(false) // layar penuh (mobile)
const showLyrics = ref(false) // lirik (mobile & desktop)
const showQueue = ref(false) // daftar antrean (bottom sheet / panel)
const scrollEl = ref(null)
const mobileSearchOpen = ref(false) // mobile: kolom cari menggantikan logo saat dibuka
const searchInputEl = ref(null)
const scrolled = ref(false)
const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const pickerTrack = ref(null) // lagu yang akan ditambahkan ke antrean / daftar putar
const dialog = ref(null) // { mode: 'create' | 'rename', id?, value, thenAdd? }
const dialogInput = ref(null)
const showSleep = ref(false)
const sleepEndsAt = ref(0)
const nowTick = ref(Date.now())
const toastMsg = ref('')
const installEvent = ref(null)
const installDismissed = ref(localStorage.getItem('install_dismissed') === '1')
let sleepTimerId = null
let toastTimer = null
let touchStartX = 0
let debounceTimer = null
let touchStartY = 0

// Chip suasana. "Untuk kamu" dibuat dari artis yang paling sering kamu putar / sukai.
const moods = [
  { label: 'Untuk kamu', query: null },
  { label: 'Santai', query: 'lagu santai indonesia' },
  { label: 'Galau', query: 'lagu galau indonesia' },
  { label: 'Semangat', query: 'lagu semangat indonesia' },
  { label: 'Fokus', query: 'musik fokus belajar instrumental' },
  { label: 'Tidur', query: 'musik pengantar tidur relaksasi' }
]
const activeChip = ref('')

const navItems = computed(() => [
  {
    id: 'explore',
    label: 'Jelajahi',
    icon: Compass,
    count: null,
    sub: 'Temukan musik baru',
    grad: 'from-emerald-700 to-teal-300'
  },
  {
    id: 'liked',
    label: 'Disukai',
    icon: Heart,
    count: player.likedTracks.length,
    sub: `Daftar putar • ${player.likedTracks.length} lagu`,
    grad: 'from-amber-500 to-yellow-200'
  },
  {
    id: 'queue',
    label: 'Antrean',
    icon: ListMusic,
    count: player.queue.length,
    sub: `Antrean • ${player.queue.length} lagu`,
    grad: 'from-emerald-800 to-emerald-400'
  },
  {
    id: 'playlists',
    label: 'Daftar putar',
    icon: Library,
    count: player.playlists.length,
    sub: `${player.playlists.length} daftar putar`,
    grad: 'from-teal-700 to-amber-300'
  }
])

const greeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 11) return 'Selamat pagi'
  if (hr < 15) return 'Selamat siang'
  if (hr < 19) return 'Selamat sore'
  return 'Selamat malam'
})

const hasQuery = computed(() => searchInput.value.trim().length > 0 || !!activeChip.value)
// Di Jelajahi kolom cari mencari lagu baru; di halaman koleksi ia menyaring isi daftar
const filterInput = ref('')
const inLibrary = computed(() => activeTab.value !== 'explore')
const activeQueryText = computed(() => (inLibrary.value ? filterInput.value : searchInput.value))
const searchActive = computed(() => mobileSearchOpen.value || activeQueryText.value.trim().length > 0)
const searchPlaceholder = computed(() => {
  const t = activeTab.value
  if (t === 'explore') return 'Apa yang ingin kamu putar?'
  if (t === 'liked') return 'Cari di Lagu Disukai'
  if (t === 'queue') return 'Cari di Antrean'
  if (t === 'playlists') return 'Cari daftar putar'
  return `Cari di ${activePlaylist.value?.name ?? 'daftar putar'}`
})
const hero = computed(() => player.tracks[0] ?? null)
// Tanpa pencarian: 6 pilihan cepat. Dengan pencarian: hasil teratas + 4 lagu.
const quickPicks = computed(() => (hasQuery.value ? [] : player.tracks.slice(0, 6)))
const topSongs = computed(() => (hasQuery.value ? player.tracks.slice(1, 5) : []))
const listStart = computed(() => (hasQuery.value ? 5 : 6))
const trending = computed(() => player.tracks.slice(listStart.value, listStart.value + 8))
const restTracks = computed(() => player.tracks.slice(listStart.value + 8))
const queueUpcoming = computed(() => player.queue.slice(player.currentIndex + 1, player.currentIndex + 51))
const upNext = computed(() =>
  player.queue.slice(player.currentIndex + 1, player.currentIndex + 7)
)

const isPlaylistTab = computed(() => activeTab.value.startsWith('pl:'))
const activePlaylist = computed(() =>
  isPlaylistTab.value ? player.playlists.find(p => p.id === activeTab.value.slice(3)) : null
)
const libraryTracks = computed(() => {
  if (activeTab.value === 'liked') return player.likedTracks
  if (activeTab.value === 'queue') return player.queue
  return activePlaylist.value?.tracks ?? []
})
const libraryMeta = computed(() => {
  if (activeTab.value === 'liked') {
    return {
      title: 'Lagu Disukai',
      icon: Heart,
      gradient: 'from-amber-600/60 via-amber-900/20 to-transparent',
      cover: 'from-amber-500 to-yellow-200',
      empty: 'Belum ada lagu yang disukai. Ketuk ikon hati pada lagu untuk menyimpannya di sini.'
    }
  }
  if (activeTab.value === 'queue') {
    return {
      title: 'Antrean Putar',
      icon: ListMusic,
      gradient: 'from-emerald-700/70 via-emerald-900/30 to-transparent',
      cover: 'from-emerald-800 to-emerald-400',
      empty: 'Antrean kosong. Pilih lagu dari menu Jelajahi untuk mulai memutar.'
    }
  }
  return {
    title: activePlaylist.value?.name ?? 'Daftar putar',
    icon: ListMusic,
    gradient: 'from-teal-700/60 via-teal-900/20 to-transparent',
    cover: 'from-teal-700 to-amber-300',
    empty: 'Daftar putar ini masih kosong. Tambahkan lagu lewat tombol + di setiap lagu.'
  }
})

const matchText = (track, q) => `${track.title} ${track.artist}`.toLowerCase().includes(q)
const isFiltering = computed(() => filterInput.value.trim().length > 0)
// Setiap baris membawa indeks aslinya agar tombol naik / turun / hapus tetap tepat saat disaring
const libraryRows = computed(() => {
  const q = filterInput.value.trim().toLowerCase()
  return libraryTracks.value
    .map((track, idx) => ({ track, idx }))
    .filter(row => !q || matchText(row.track, q))
})
const filteredPlaylists = computed(() => {
  const q = filterInput.value.trim().toLowerCase()
  return player.playlists.filter(pl => !q || pl.name.toLowerCase().includes(q))
})

const progressPct = computed(() =>
  player.duration > 0 ? Math.min(100, (player.currentTime / player.duration) * 100) : 0
)

// Ukuran cover di layar penuh mobile mengikuti tinggi layar agar tidak menimpa teks
const coverSize = { width: 'clamp(9rem, calc(100dvh - 31rem), 22rem)' }

// Arah pergantian lagu menentukan arah animasi cover (berikutnya dari kanan, sebelumnya dari kiri)
const coverDir = ref('next')
watch(
  () => player.currentIndex,
  (n, o) => {
    coverDir.value = n < o ? 'prev' : 'next'
  }
)

/* Cover layar penuh: dipramuat & didecode dulu agar pergantian tidak "jedug" */
const shownCover = ref(null) // { id, url } yang sedang tampil
const preloaded = new Map() // url -> { img, p }

function preloadImage(url) {
  if (!url) return Promise.resolve()
  if (!preloaded.has(url)) {
    const img = new Image()
    img.src = url
    const p = (img.decode ? img.decode() : new Promise(r => (img.onload = r))).catch(() => {})
    preloaded.set(url, { img, p }) // img disimpan agar hasil decode tidak dibuang
    if (preloaded.size > 40) preloaded.delete(preloaded.keys().next().value)
  }
  return preloaded.get(url).p
}

let coverSeq = 0
watch(
  () => player.currentTrack?.video_id,
  async () => {
    const t = player.currentTrack
    const seq = ++coverSeq
    if (!t) {
      shownCover.value = null
      return
    }
    // Tunggu gambar siap, maksimal 700 ms supaya jaringan lambat tidak menahan tampilan
    await Promise.race([preloadImage(t.thumbnail_url), new Promise(r => setTimeout(r, 700))])
    if (seq !== coverSeq) return
    shownCover.value = { id: t.video_id, url: t.thumbnail_url }
  },
  { immediate: true }
)

// Pramuat cover lagu di sekitar lagu yang sedang diputar
watch(
  () => [player.currentIndex, player.queue.length],
  () => {
    const q = player.queue
    const i = player.currentIndex
    ;[q[i + 1], q[i - 1], q[i + 2]].forEach(t => t && preloadImage(t.thumbnail_url))
  },
  { immediate: true }
)


/* ==========================================================
   LIRIK (LRCLIB, gratis tanpa API key)
   ========================================================== */
const LRCLIB = 'https://lrclib.net/api'
const lyricLines = ref([]) // [{ time, text }]
const lyricsPlain = ref('')
const lyricsStatus = ref('idle') // idle | loading | synced | plain | none
const lyricsCache = new Map()
let lyricsAbort = null
let lyricsPausedUntil = 0

// "Hindia - Topic" / "Tulus, Nadin" -> artis utama saja
function cleanArtist(artist = '') {
  return artist
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\bx\b)\s*/i)[0]
    .trim()
}

// "Hindia - Everything U Are (Official Video)" -> "Everything U Are"
function cleanTitle(title = '', artist = '') {
  let t = title
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\b(official|music\s+video|lyric\s+video|lyrics?|video\s+clip|audio|visualizer|mv)\b/gi, ' ')
    .replace(/\s*[|｜].*$/, '')

  const a = cleanArtist(artist).toLowerCase()
  const parts = t.split(/\s+[-–—]\s+/)
  if (parts.length > 1 && a) {
    const first = parts[0].trim().toLowerCase()
    if (first && (first.includes(a) || a.includes(first))) parts.shift()
  }
  t = parts.join(' - ')

  return t
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—]+|[\s\-–—]+$/g, '')
    .trim()
}

// "[01:23.45] teks" -> { time: 83.45, text: 'teks' }
function parseLrc(lrc = '') {
  const stamp = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  const out = []
  for (const raw of lrc.split(/\r?\n/)) {
    const matches = [...raw.matchAll(stamp)]
    if (!matches.length) continue
    const text = raw.replace(stamp, '').trim()
    for (const m of matches) {
      const frac = m[3] ? Number('0.' + m[3]) : 0
      out.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text })
    }
  }
  out.sort((a, b) => a.time - b.time)
  return out.filter((line, i) => !(line.text === '' && i > 0 && out[i - 1].text === ''))
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`)
  return res.json()
}

const toLyricsResult = item => ({
  synced: item.syncedLyrics || '',
  plain: item.plainLyrics || ''
})

function chooseBestLyrics(list, duration) {
  if (!Array.isArray(list)) return null
  let pool = list.filter(x => !x.instrumental && (x.syncedLyrics || x.plainLyrics))
  if (duration) pool = pool.filter(x => Math.abs((x.duration || 0) - duration) <= 8)
  if (!pool.length) return null
  pool.sort((a, b) => {
    const sa = a.syncedLyrics ? 0 : 1
    const sb = b.syncedLyrics ? 0 : 1
    if (sa !== sb) return sa - sb
    return Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration)
  })
  return toLyricsResult(pool[0])
}

async function findLyrics(track, signal) {
  const artist = cleanArtist(track.artist)
  const title = cleanTitle(track.title, track.artist)
  const duration = Math.round(track.duration || 0)
  if (!title) return null

  // 1) cocok tepat
  const exactParams = new URLSearchParams({ track_name: title, artist_name: artist })
  if (duration) exactParams.set('duration', String(duration))
  const exact = await getJson(`${LRCLIB}/get?${exactParams}`, signal)
  if (exact && !exact.instrumental && (exact.syncedLyrics || exact.plainLyrics)) {
    return toLyricsResult(exact)
  }

  // 2) pencarian longgar
  const attempts = [
    new URLSearchParams({ track_name: title, artist_name: artist }),
    new URLSearchParams({ q: `${title} ${artist}`.trim() })
  ]
  for (const params of attempts) {
    const list = await getJson(`${LRCLIB}/search?${params}`, signal)
    const best = chooseBestLyrics(list, duration)
    if (best) return best
  }
  return null
}

function applyLyrics(result) {
  lyricLines.value = []
  lyricsPlain.value = ''
  if (result?.synced) {
    const lines = parseLrc(result.synced)
    if (lines.length > 2) {
      lyricLines.value = lines
      lyricsStatus.value = 'synced'
      return
    }
  }
  if (result?.plain) {
    lyricsPlain.value = result.plain
    lyricsStatus.value = 'plain'
    return
  }
  lyricsStatus.value = 'none'
}

async function loadLyrics(track) {
  if (lyricsAbort) lyricsAbort.abort()
  lyricLines.value = []
  lyricsPlain.value = ''

  if (!track) {
    lyricsStatus.value = 'idle'
    return
  }
  if (lyricsCache.has(track.video_id)) {
    applyLyrics(lyricsCache.get(track.video_id))
    return
  }

  lyricsStatus.value = 'loading'
  const controller = new AbortController()
  lyricsAbort = controller
  try {
    const result = await findLyrics(track, controller.signal)
    if (controller.signal.aborted) return
    lyricsCache.set(track.video_id, result)
    applyLyrics(result)
  } catch (err) {
    if (controller.signal.aborted || err?.name === 'AbortError') return
    console.error('Gagal memuat lirik:', err)
    lyricsStatus.value = 'none'
  }
}

// Muat lirik otomatis setiap lagu berganti (store tidak perlu diubah)
watch(() => player.currentTrack?.video_id, () => loadLyrics(player.currentTrack), {
  immediate: true
})

// Baris lirik yang sedang dinyanyikan (-1 bila belum dimulai)
const activeLyricIndex = computed(() => {
  if (lyricsStatus.value !== 'synced') return -1
  const t = player.currentTime + 0.25
  let idx = -1
  for (let i = 0; i < lyricLines.value.length; i++) {
    if (lyricLines.value[i].time <= t) idx = i
    else break
  }
  return idx
})

function lineClass(i) {
  return [
    'cursor-pointer font-extrabold leading-tight tracking-tight py-2 origin-left text-3xl md:text-4xl transition-[scale,opacity] duration-500 ease-out will-change-transform',
    i === activeLyricIndex.value
      ? 'opacity-100 scale-100'
      : 'opacity-35 hover:opacity-70 scale-[0.92]'
  ]
}

// Gulirkan wadah lirik yang sedang terlihat agar baris aktif berada di tengah
function scrollLyrics(i, smooth = true) {
  if (i < 0) return
  document.querySelectorAll('[data-lyrics]').forEach(box => {
    if (box.getClientRects().length === 0) return
    const el = box.querySelector(`[data-line="${i}"]`)
    if (!el) return
    const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2
    if (smooth) smoothScrollTo(box, top)
    else box.scrollTop = top
  })
}

// Scroll halus dengan easing sendiri: tidak patah saat baris berganti cepat
const lyricsAnim = new WeakMap()
function smoothScrollTo(box, to, duration = 550) {
  cancelAnimationFrame(lyricsAnim.get(box))
  const from = box.scrollTop
  const dist = to - from
  if (Math.abs(dist) < 1) return
  const t0 = performance.now()
  const step = now => {
    const p = Math.min(1, (now - t0) / duration)
    box.scrollTop = from + dist * (1 - Math.pow(1 - p, 3))
    if (p < 1) lyricsAnim.set(box, requestAnimationFrame(step))
  }
  lyricsAnim.set(box, requestAnimationFrame(step))
}

// Bila pengguna menggulir sendiri, auto-scroll berhenti sejenak
function pauseLyricsScroll() {
  document.querySelectorAll('[data-lyrics]').forEach(b => cancelAnimationFrame(lyricsAnim.get(b)))
  lyricsPausedUntil = Date.now() + 3500
}

watch(activeLyricIndex, i => {
  if (!showLyrics.value || Date.now() < lyricsPausedUntil) return
  nextTick(() => scrollLyrics(i))
})

watch(showLyrics, open => {
  if (open) {
    lyricsPausedUntil = 0
    nextTick(() => scrollLyrics(activeLyricIndex.value, false))
  }
})

watch(lyricsStatus, () => {
  nextTick(() => {
    document.querySelectorAll('[data-lyrics]').forEach(box => box.scrollTo({ top: 0 }))
  })
})

/* ==========================================================
   INTERAKSI
   ========================================================== */
function onKey(e) {
  if (e.key === 'Escape') {
    if (dialog.value) dialog.value = null
    else if (pickerTrack.value) pickerTrack.value = null
    else if (showSleep.value) showSleep.value = false
    else if (showQueue.value) showQueue.value = false
    else if (showLyrics.value) showLyrics.value = false
    else showNowPlaying.value = false
    return
  }
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.code === 'Space') {
    e.preventDefault()
    player.togglePlay()
  }
}

onMounted(() => {
  setupPwa()
  player.initYouTubePlayer('yt-hidden-player')
  player.searchMusic('Top Hits Indonesia')
  window.addEventListener('keydown', onKey)
  window.addEventListener('popstate', onPopState)
  setupExitGuard()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('popstate', onPopState)
  clearTimeout(exitTimer)
  teardownPwa()
  clearTimeout(debounceTimer)
  if (lyricsAbort) lyricsAbort.abort()
})

watch(activeTab, () => {
  filterInput.value = ''
  showLyrics.value = false
  scrollEl.value?.scrollTo({ top: 0 })
})

function handleSearchInput(e) {
  const value = e.target.value
  if (inLibrary.value) {
    filterInput.value = value
    return
  }
  searchInput.value = value
  activeChip.value = ''
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (searchInput.value.trim()) player.searchMusic(searchInput.value)
  }, 450)
}

function submitSearch() {
  if (inLibrary.value) {
    searchInputEl.value?.blur()
    return
  }
  if (searchInput.value.trim()) player.searchMusic(searchInput.value)
}

function clearSearch() {
  if (inLibrary.value) {
    filterInput.value = ''
  } else {
    searchInput.value = ''
    activeChip.value = ''
    player.searchMusic('Top Hits Indonesia')
  }
  searchInputEl.value?.focus()
}

function openMobileSearch() {
  mobileSearchOpen.value = true
  nextTick(() => searchInputEl.value?.focus())
}

function onSearchBlur() {
  if (!activeQueryText.value.trim()) mobileSearchOpen.value = false
}

// Artis yang paling sering muncul di lagu disukai + terakhir diputar
function forYouQuery() {
  const counts = new Map()
  for (const t of [...player.likedTracks, ...player.recentTracks]) {
    const a = (t.artist || '').split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b)\s*/i)[0].trim()
    if (a) counts.set(a, (counts.get(a) || 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return top ? `${top[0]} lagu terbaik` : 'lagu hits indonesia terbaru'
}

function pickMood(m) {
  activeTab.value = 'explore'
  activeChip.value = m.label
  searchInput.value = ''
  player.searchMusic(m.query || forYouQuery())
}

function showAll() {
  activeChip.value = ''
  searchInput.value = ''
  player.searchMusic('Top Hits Indonesia')
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const minutes = Math.floor(sec / 60)
  const seconds = Math.floor(sec % 60)
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
}

function isTrackLiked(videoId) {
  return player.likedTracks.some(t => t.video_id === videoId)
}

function isCurrent(track) {
  return player.currentTrack?.video_id === track.video_id
}

function isActivePlaying(track) {
  return isCurrent(track) && player.isPlaying
}

function playOrToggle(track, list = null) {
  if (isCurrent(track)) player.togglePlay()
  else player.playTrack(track, list)
}

function playLibraryTrack(track) {
  if (activeTab.value === 'queue') playOrToggle(track)
  else playOrToggle(track, libraryTracks.value)
}

// Warna isi slider lewat CSS variable; berubah hijau saat di-hover (lihat <style>)
function rangeStyle(pct) {
  return { '--p': `${pct}%` }
}

/* ==========================================================
   ACAK & ULANG (logikanya ada di stores/player)
   ========================================================== */
const shuffle = computed(() => player.shuffle)
const repeat = computed(() => player.repeat)
const repeatLabel = computed(() =>
  repeat.value === 'one' ? 'Ulangi satu lagu' : repeat.value === 'all' ? 'Ulangi semua' : 'Ulangi'
)
const toggleShuffle = () => player.toggleShuffle()
const cycleRepeat = () => player.cycleRepeat()
const nextTrack = () => player.playNext()

// Tombol play besar di halaman koleksi
const libraryIsPlaying = computed(
  () => player.isPlaying && libraryTracks.value.some(t => t.video_id === player.currentTrack?.video_id)
)
function playLibrary() {
  const list = libraryTracks.value
  if (!list.length) return
  if (list.some(isCurrent)) return player.togglePlay()
  const start = shuffle.value ? list[Math.floor(Math.random() * list.length)] : list[0]
  playLibraryTrack(start)
}

/* ==========================================================
   DAFTAR PUTAR, TIMER TIDUR, PWA, OFFLINE
   ========================================================== */
// Tab "Daftar putar" ikut menyala saat membuka salah satu daftar putar (dipakai bar bawah mobile)
const isTabActive = id => activeTab.value === id || (id === 'playlists' && isPlaylistTab.value)

function notify(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 2500)
}

function openPicker(track) {
  if (track) pickerTrack.value = track
}
function pickQueue() {
  player.addToQueue(pickerTrack.value)
  notify('Ditambahkan ke antrean')
  pickerTrack.value = null
}
function pickPlaylist(pl) {
  const added = player.togglePlaylistTrack(pl.id, pickerTrack.value)
  notify(added ? `Ditambahkan ke ${pl.name}` : `Dihapus dari ${pl.name}`)
  pickerTrack.value = null
}
function openCreate(thenAdd = null) {
  dialog.value = { mode: 'create', value: '', thenAdd }
  pickerTrack.value = null
}
function openRename() {
  if (!activePlaylist.value) return
  dialog.value = { mode: 'rename', id: activePlaylist.value.id, value: activePlaylist.value.name }
}
function submitDialog() {
  const d = dialog.value
  if (!d) return
  const name = d.value.trim()
  if (!name) return
  if (d.mode === 'create') {
    const id = player.createPlaylist(name)
    if (id && d.thenAdd) {
      player.togglePlaylistTrack(id, d.thenAdd)
      notify(`Ditambahkan ke ${name}`)
    } else if (id) {
      notify('Daftar putar dibuat')
    }
  } else {
    player.renamePlaylist(d.id, name)
  }
  dialog.value = null
}
function removeActivePlaylist() {
  const pl = activePlaylist.value
  if (!pl) return
  if (window.confirm(`Hapus daftar putar "${pl.name}"?`)) {
    player.deletePlaylist(pl.id)
    activeTab.value = 'playlists'
  }
}
function removeFromActivePlaylist(track) {
  if (activePlaylist.value) player.togglePlaylistTrack(activePlaylist.value.id, track)
}

watch(
  () => player.likedTracks.length,
  (n, o) => notify(n > o ? 'Ditambahkan ke Lagu Disukai' : 'Dihapus dari Lagu Disukai')
)

watch(dialog, d => {
  if (d) nextTick(() => dialogInput.value?.focus())
})
// Bila daftar putar yang sedang dibuka terhapus, kembali ke daftar semua daftar putar
watch(activePlaylist, pl => {
  if (isPlaylistTab.value && !pl) activeTab.value = 'playlists'
})

// ----- Timer tidur -----
const sleepActive = computed(() => sleepEndsAt.value > 0 || player.stopAfterTrack)
const sleepLabel = computed(() => {
  if (player.stopAfterTrack) return 'Akhir lagu'
  if (!sleepEndsAt.value) return ''
  return formatTime(Math.max(0, Math.ceil((sleepEndsAt.value - nowTick.value) / 1000)))
})
function startSleep(minutes) {
  player.stopAfterTrack = false
  sleepEndsAt.value = Date.now() + minutes * 60000
  showSleep.value = false
  notify(`Timer tidur ${minutes} menit aktif`)
}
function sleepAfterTrack() {
  sleepEndsAt.value = 0
  player.stopAfterTrack = true
  showSleep.value = false
  notify('Berhenti setelah lagu ini selesai')
}
function cancelSleep() {
  sleepEndsAt.value = 0
  player.stopAfterTrack = false
  showSleep.value = false
}
watch(sleepEndsAt, v => {
  clearInterval(sleepTimerId)
  sleepTimerId = null
  if (!v) return
  nowTick.value = Date.now()
  sleepTimerId = setInterval(() => {
    nowTick.value = Date.now()
    if (nowTick.value >= sleepEndsAt.value) {
      sleepEndsAt.value = 0
      if (player.isPlaying) player.togglePlay()
      notify('Timer tidur selesai')
    }
  }, 1000)
})

// ----- PWA: pasang ke layar utama, service worker, offline -----
const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
const showInstallBanner = computed(
  () => !installDismissed.value && !isStandalone && (installEvent.value || isIOS)
)

function onBeforeInstall(e) {
  e.preventDefault()
  installEvent.value = e
}
async function installApp() {
  const e = installEvent.value
  if (!e) return
  e.prompt()
  try {
    await e.userChoice
  } catch {}
  installEvent.value = null
}
function dismissInstall() {
  installDismissed.value = true
  localStorage.setItem('install_dismissed', '1')
}
function onInstalled() {
  installEvent.value = null
  notify('TedzMusic terpasang di layar utama')
}
function onOnline() {
  isOnline.value = true
  if (player.searchError) player.retrySearch()
}
function onOffline() {
  isOnline.value = false
}

// Pastikan tag PWA ada di <head> (lebih baik ditaruh langsung di index.html)
function ensureHead() {
  const head = document.head
  const add = (tag, attrs) => {
    const el = document.createElement(tag)
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
    head.appendChild(el)
  }
  if (!document.querySelector('link[rel="manifest"]')) add('link', { rel: 'manifest', href: '/manifest.webmanifest' })
  if (!document.querySelector('meta[name="theme-color"]')) add('meta', { name: 'theme-color', content: '#0e1814' })
  if (!document.querySelector('link[rel="apple-touch-icon"]')) add('link', { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' })
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' })
  if (!document.querySelector('meta[name="mobile-web-app-capable"]')) add('meta', { name: 'mobile-web-app-capable', content: 'yes' })
  if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' })
  const vp = document.querySelector('meta[name="viewport"]')
  if (vp && !vp.content.includes('viewport-fit')) vp.content += ', viewport-fit=cover'

  // Terpasang sebagai aplikasi: matikan zoom cubit / ketuk dua kali agar terasa seperti aplikasi asli.
  // Di tab browser biasa zoom dibiarkan aktif demi aksesibilitas.
  if (isStandalone) {
    if (vp && !/maximum-scale|user-scalable/.test(vp.content)) vp.content += ', maximum-scale=1, user-scalable=no'
    document.documentElement.style.touchAction = 'manipulation'
    document.addEventListener('gesturestart', e => e.preventDefault()) // iOS
  }
  // Tarik ke bawah tidak memuat ulang halaman (mengganggu gestur menutup layar penuh)
  document.documentElement.style.overscrollBehaviorY = 'contain'
}

function setupPwa() {
  ensureHead()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onInstalled)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}
function teardownPwa() {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onInstalled)
  clearInterval(sleepTimerId)
  clearTimeout(toastTimer)
}

// Daftar yang bisa digeser ke samping: dukung drag mouse & roda mouse (layar sentuh sudah bawaan)
const vDragScroll = {
  mounted(el) {
    el.style.cursor = 'grab'
    let down = false
    let moved = false
    let startX = 0
    let startLeft = 0

    el.addEventListener(
      'wheel',
      e => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return
        const max = el.scrollWidth - el.clientWidth
        const next = el.scrollLeft + e.deltaY
        if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return
        e.preventDefault()
        el.scrollLeft = Math.max(0, Math.min(max, next))
      },
      { passive: false }
    )

    el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      down = true
      moved = false
      startX = e.clientX
      startLeft = el.scrollLeft
    })
    window.addEventListener('pointermove', e => {
      if (!down) return
      const dx = e.clientX - startX
      if (!moved && Math.abs(dx) > 5) {
        moved = true
        el.style.scrollSnapType = 'none'
        el.style.cursor = 'grabbing'
        el.style.userSelect = 'none'
      }
      if (moved) el.scrollLeft = startLeft - dx
    })
    window.addEventListener('pointerup', () => {
      if (!down) return
      down = false
      el.style.cursor = 'grab'
      el.style.userSelect = ''
      el.style.scrollSnapType = ''
    })
    // Setelah drag, jangan anggap sebagai klik pada kartu / chip
    el.addEventListener(
      'click',
      e => {
        if (moved) {
          e.stopPropagation()
          e.preventDefault()
          moved = false
        }
      },
      true
    )
  }
}

/* ==========================================================
   GESTUR: swipe atas membuka layar penuh, swipe bawah menutupnya
   ========================================================== */
const sheetDrag = ref(0) // jarak layar penuh mengikuti jari (px)
const sheetDragging = ref(false)
let gX = 0
let gY = 0
let gT = 0
let gMode = '' // '' = belum jelas | 'v' = vertikal | 'h' = horizontal | 'skip' = mulai dari slider

function openNowPlaying() {
  sheetDrag.value = 0
  showNowPlaying.value = true
}
function closeNowPlaying() {
  showNowPlaying.value = false
  sheetDrag.value = 0
}

// Mini-player: geser ke atas = buka (mengetuk tetap membuka)
function miniTouchStart(e) {
  gX = e.touches[0].clientX
  gY = e.touches[0].clientY
}
function miniTouchEnd(e) {
  const dy = e.changedTouches[0].clientY - gY
  const dx = e.changedTouches[0].clientX - gX
  if (dy < -40 && Math.abs(dy) > Math.abs(dx)) openNowPlaying()
}

// Layar penuh: tarik ke bawah (mengikuti jari) = tutup, geser kiri / kanan = lagu berikutnya / sebelumnya
function npTouchStart(e) {
  const t = e.touches[0]
  gX = t.clientX
  gY = t.clientY
  gT = Date.now()
  gMode = e.target.closest?.('input[type="range"]') ? 'skip' : ''
}
function npTouchMove(e) {
  if (gMode === 'skip') return
  const t = e.touches[0]
  const dx = t.clientX - gX
  const dy = t.clientY - gY
  if (!gMode) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    gMode = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h'
    if (gMode === 'v') sheetDragging.value = true
  }
  if (gMode === 'v') sheetDrag.value = Math.max(0, dy)
}
function npTouchEnd(e) {
  const mode = gMode
  gMode = ''
  sheetDragging.value = false
  if (mode === 'v') {
    const dy = e.changedTouches[0].clientY - gY
    const speed = dy / Math.max(1, Date.now() - gT) // px per ms
    if (dy > 120 || (dy > 40 && speed > 0.6)) closeNowPlaying()
    else sheetDrag.value = 0
  } else if (mode === 'h') {
    const dx = e.changedTouches[0].clientX - gX
    const dy = e.changedTouches[0].clientY - gY
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) player.playNext()
      else player.playPrev()
    }
  }
}
function npTouchCancel() {
  gMode = ''
  sheetDragging.value = false
  sheetDrag.value = 0
}

/* ==========================================================
   TOMBOL BACK (HP / PWA): menutup lapisan paling atas, bukan keluar dari aplikasi
   ========================================================== */
// Urutan = prioritas penutupan (paling atas ditutup lebih dulu)
const layers = [
  { open: () => !!dialog.value, close: () => (dialog.value = null) },
  { open: () => !!pickerTrack.value, close: () => (pickerTrack.value = null) },
  { open: () => showSleep.value, close: () => (showSleep.value = false) },
  { open: () => showQueue.value, close: () => (showQueue.value = false) },
  { open: () => showLyrics.value, close: () => (showLyrics.value = false) },
  { open: () => showNowPlaying.value, close: () => closeNowPlaying() },
  // Hapus baris ini bila back dari tab koleksi tidak perlu kembali ke Jelajahi
  { open: () => activeTab.value !== 'explore', close: () => (activeTab.value = 'explore') }
]
const openLayerCount = computed(() => layers.filter(l => l.open()).length)

let pushedStates = 0 // entri history yang kita tambahkan
let skipPops = 0 // popstate hasil history.go() buatan kita sendiri
let closingFromBack = false

// Tiap lapisan yang terbuka menambah satu entri history. Ditutup lewat tombol X / Esc,
// entri itu dibuang lagi supaya history tetap sinkron.
watch(openLayerCount, (n, o) => {
  if (n > o) {
    for (let i = o; i < n; i++) {
      history.pushState({ layer: true }, '')
      pushedStates++
    }
  } else if (closingFromBack) {
    closingFromBack = false
  } else {
    const steps = Math.min(o - n, pushedStates)
    if (steps > 0) {
      pushedStates -= steps
      skipPops++
      history.go(-steps)
    }
  }
})

// Penjaga beranda: satu entri history tambahan di bawah halaman agar back pertama bisa kita tangkap
let exitArmed = false
let exitTimer = null
function setupExitGuard() {
  if (!isStandalone) return
  if (history.state?.layer) history.replaceState({ root: true }, '')
  else if (!history.state?.root) history.pushState({ root: true }, '')
}

function onPopState() {
  if (skipPops > 0) {
    skipPops--
    return
  }
  if (pushedStates <= 0) {
    // Tidak ada lapisan terbuka = back di beranda. Saat terpasang sebagai PWA: ketuk dua kali untuk keluar
    if (!isStandalone) return
    if (exitArmed) {
      exitArmed = false
      clearTimeout(exitTimer)
      history.back() // keluar dari aplikasi
      return
    }
    exitArmed = true
    notify('Ketuk sekali lagi untuk keluar')
    history.pushState({ root: true }, '') // pasang kembali penjaga di bawah halaman
    exitTimer = setTimeout(() => (exitArmed = false), 2000)
    return
  }
  pushedStates--
  const top = layers.find(l => l.open())
  if (top) {
    closingFromBack = true
    top.close()
  }
}

/* ==========================================================
   JUDUL TAB (Media Session diurus di stores/player)
   ========================================================== */
watch(
  () => player.currentTrack?.video_id,
  () => {
    const t = player.currentTrack
    document.title = t ? `${t.title} • ${t.artist}` : 'TedzMusic'
  },
  { immediate: true }
)
</script>

<template>
  <div class="app relative h-dvh w-full overflow-hidden bg-[#060d0a] text-white">
    <!-- Hidden headless YouTube audio engine -->
    <div class="fixed -top-96 -left-96 opacity-0 pointer-events-none">
      <div id="yt-hidden-player"></div>
    </div>

    <div class="relative h-full flex flex-col">
      <!-- Workspace -->
      <div class="flex-1 min-h-0 flex gap-2 md:p-2 md:pb-0">
        <!-- ============ LEFT RAIL (desktop): dua panel ala Spotify ============ -->
        <aside class="hidden md:flex w-[4.75rem] lg:w-80 shrink-0 flex-col gap-2">
          <!-- Panel atas: logo + navigasi -->
          <div class="rounded-lg bg-[#0e1814] p-3 lg:px-5 lg:py-4">
            <div class="flex items-center gap-2.5 justify-center lg:justify-start py-1">
              <img :src="logo" alt="TedzMusic" class="w-9 h-9 rounded-[22%] shrink-0" />
              <h1 class="hidden lg:block font-black text-xl tracking-tight">TedzMusic</h1>
            </div>
            <button
              @click="activeTab = 'explore'"
              title="Jelajahi"
              :class="[
                'mt-4 w-full flex items-center gap-5 py-2 font-bold text-base transition justify-center lg:justify-start',
                activeTab === 'explore' ? 'text-white' : 'text-[#a3b3aa] hover:text-white'
              ]"
            >
              <Compass class="w-6 h-6 shrink-0" />
              <span class="hidden lg:inline">Jelajahi</span>
            </button>
          </div>

          <!-- Panel bawah: koleksi -->
          <div class="flex-1 min-h-0 flex flex-col rounded-lg bg-[#0e1814]">
            <div class="flex items-center gap-3 px-3 lg:px-5 pt-4 pb-2 justify-center lg:justify-start text-[#a3b3aa]">
              <ListMusic class="w-6 h-6 shrink-0" />
              <span class="hidden lg:inline font-bold">Koleksimu</span>
              <button @click="openCreate()" aria-label="Buat daftar putar" title="Buat daftar putar" class="hidden lg:flex ml-auto w-8 h-8 rounded-full hover:bg-white/10 hover:text-white items-center justify-center transition">
                <Plus class="w-5 h-5" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto scroll-thin px-2 pb-2">
              <button
                v-for="item in navItems.slice(1)"
                :key="item.id"
                @click="activeTab = item.id"
                :title="item.label"
                :class="[
                  'w-full flex items-center gap-3 p-2 rounded-md text-left transition justify-center lg:justify-start',
                  activeTab === item.id ? 'bg-white/10' : 'hover:bg-white/5'
                ]"
              >
                <div :class="['w-12 h-12 rounded-md shrink-0 flex items-center justify-center bg-linear-to-br', item.grad]">
                  <component :is="item.icon" :class="['w-5 h-5 text-white', item.id === 'liked' ? 'fill-white' : '']" />
                </div>
                <div class="hidden lg:block min-w-0">
                  <p :class="['font-semibold truncate', activeTab === item.id ? 'text-[#f5cf5b]' : '']">{{ item.label }}</p>
                  <p class="text-sm text-[#a3b3aa] truncate">{{ item.sub }}</p>
                </div>
              </button>
              <button
                v-for="pl in player.playlists"
                :key="pl.id"
                @click="activeTab = 'pl:' + pl.id"
                :title="pl.name"
                :class="[
                  'w-full flex items-center gap-3 p-2 rounded-md text-left transition justify-center lg:justify-start',
                  activeTab === 'pl:' + pl.id ? 'bg-white/10' : 'hover:bg-white/5'
                ]"
              >
                <div class="w-12 h-12 rounded-md shrink-0 overflow-hidden bg-linear-to-br from-teal-700 to-amber-300 flex items-center justify-center">
                  <img v-if="pl.tracks[0]" :src="pl.tracks[0].thumbnail_url" loading="lazy" class="w-full h-full object-cover" />
                  <ListMusic v-else class="w-5 h-5 text-white" />
                </div>
                <div class="hidden lg:block min-w-0">
                  <p :class="['font-semibold truncate', activeTab === 'pl:' + pl.id ? 'text-[#f5cf5b]' : '']">{{ pl.name }}</p>
                  <p class="text-sm text-[#a3b3aa] truncate">Daftar putar • {{ pl.tracks.length }} lagu</p>
                </div>
              </button>
            </div>
            <div class="hidden lg:flex items-start gap-3 m-3 rounded-lg bg-white/5 p-3">
              <Keyboard class="w-4 h-4 text-[#f5cf5b] mt-0.5 shrink-0" />
              <p class="text-xs text-[#a3b3aa] leading-relaxed">
                Tekan <kbd class="px-1.5 py-0.5 rounded bg-white/10 text-white text-[10px]">Spasi</kbd> untuk putar / jeda lagu.
              </p>
            </div>
          </div>
        </aside>

        <!-- ============ MAIN ============ -->
        <main class="relative flex-1 min-w-0 flex flex-col overflow-hidden md:rounded-lg bg-[#0e1814]">
          <!-- Banner offline -->
          <div v-if="!isOnline" class="relative z-30 shrink-0 flex items-center justify-center gap-2 bg-amber-400 text-black text-xs font-bold py-1.5 px-4">
            <WifiOff class="w-4 h-4" /> Kamu sedang offline
          </div>

          <!-- Warna latar dinamis dari cover lagu -->
          <div class="pointer-events-none absolute inset-x-0 top-0 h-96 overflow-hidden">
            <Transition name="ambient">
              <img
                v-if="player.currentTrack"
                :key="player.currentTrack.video_id"
                :src="player.currentTrack.thumbnail_url"
                class="ambient-blur opacity-40"
              />
            </Transition>
            <div class="absolute inset-0 bg-linear-to-b from-transparent via-[#0e1814]/70 to-[#0e1814]"></div>
          </div>

          <div ref="scrollEl" @scroll.passive="e => (scrolled = e.target.scrollTop > 8)" class="relative flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scroll-thin">
            <!-- Sticky glass header -->
            <header
              :class="[
                'sticky top-0 z-20 flex items-center gap-2 px-4 md:px-6 pb-4 md:pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-3 backdrop-blur-xl transition-colors duration-300',
                scrolled ? 'bg-[#0e1814]/95 shadow-[0_1px_0_rgba(255,255,255,0.06)]' : 'bg-[#0e1814]/40'
              ]"
            >
              <div :class="[searchActive ? 'hidden' : 'flex md:hidden', 'items-center gap-2 shrink-0']">
                <img :src="logo" alt="TedzMusic" class="w-9 h-9 rounded-[22%] shrink-0" />
                <span class="font-black text-lg tracking-tight">TedzMusic</span>
              </div>
              <button
                v-if="!searchActive"
                @click="openMobileSearch"
                aria-label="Cari"
                class="md:hidden ml-auto w-10 h-10 rounded-full bg-white/10 active:bg-white/20 flex items-center justify-center transition"
              >
                <Search class="w-5 h-5" />
              </button>

              <form
                @submit.prevent="submitSearch"
                :class="['relative flex-1 md:mx-auto md:max-w-lg', searchActive ? '' : 'hidden md:block']"
              >
                <Search class="w-5 h-5 text-[#a3b3aa] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  :value="activeQueryText"
                  @input="handleSearchInput"
                  ref="searchInputEl"
                  @blur="onSearchBlur"
                  type="text"
                  inputmode="search"
                  :placeholder="searchPlaceholder"
                  class="w-full h-11 rounded-full bg-[#1a2a23] hover:bg-[#213229] focus:bg-[#213229] border border-transparent hover:border-white/20 focus:border-white pl-11 pr-10 text-sm font-medium text-ellipsis placeholder-[#a3b3aa] focus:outline-hidden transition"
                />
                <button
                  v-if="activeQueryText"
                  type="button"
                  @click="clearSearch"
                  aria-label="Hapus pencarian"
                  class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#a3b3aa] hover:text-white"
                >
                  <X class="w-4 h-4" />
                </button>
              </form>

            </header>

            <div class="px-4 md:px-6 pb-10">
              <Transition name="fade" mode="out-in">
                <!-- ===== EXPLORE ===== -->
                <section v-if="activeTab === 'explore'" key="explore">
                  <!-- Ajakan pasang ke layar utama -->
                  <div v-if="showInstallBanner" class="flex items-center gap-3 rounded-lg bg-white/[0.07] p-3 mb-4">
                    <img :src="logo" alt="" class="w-10 h-10 rounded-[22%] shrink-0" />
                    <p class="flex-1 min-w-0 text-sm leading-snug">
                      <template v-if="installEvent">Pasang TedzMusic di layar utama untuk akses cepat dan tampilan layar penuh.</template>
                      <template v-else>Di iPhone: ketuk tombol Bagikan, lalu pilih <b>Tambahkan ke Layar Utama</b>.</template>
                    </p>
                    <button v-if="installEvent" @click="installApp" class="shrink-0 flex items-center gap-1.5 rounded-full bg-[#f5cf5b] text-black text-sm font-bold px-4 h-9 hover:bg-[#ffe27a] active:scale-95 transition">
                      <Download class="w-4 h-4" /> Pasang
                    </button>
                    <button @click="dismissInstall" aria-label="Tutup" class="shrink-0 p-1.5 text-[#a3b3aa] hover:text-white"><X class="w-4 h-4" /></button>
                  </div>

                  <!-- Filter chips -->
                  <div v-drag-scroll class="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:-mx-6 md:px-6 py-1 mt-2 md:mt-1 mb-5">
                    <button
                      @click="showAll"
                      :class="[
                        'shrink-0 rounded-full px-4 h-9 whitespace-nowrap text-sm font-medium transition',
                        !hasQuery ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/15'
                      ]"
                    >
                      Semua
                    </button>
                    <button
                      v-for="m in moods"
                      :key="m.label"
                      @click="pickMood(m)"
                      :class="[
                        'shrink-0 rounded-full px-4 h-9 whitespace-nowrap text-sm font-medium transition',
                        activeChip === m.label ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/15'
                      ]"
                    >
                      {{ m.label }}
                    </button>
                  </div>

                  <h2 v-if="!hasQuery" class="text-2xl md:text-3xl font-bold tracking-tight mb-4">{{ greeting }}</h2>
                  <h2 v-else class="text-2xl md:text-3xl font-bold tracking-tight mb-4 truncate">
                    {{ activeChip || `Hasil untuk "${player.searchQuery}"` }}
                  </h2>

                  <!-- Loading skeleton -->
                  <div v-if="player.isSearching" class="animate-pulse space-y-8">
                    <div class="grid grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                      <div v-for="n in 6" :key="n" class="h-14 md:h-16 rounded-md bg-white/5"></div>
                    </div>
                    <div class="flex gap-4 overflow-hidden">
                      <div v-for="n in 6" :key="n" class="w-40 shrink-0">
                        <div class="aspect-square rounded-md bg-white/5"></div>
                        <div class="h-3 w-3/4 bg-white/5 rounded mt-3"></div>
                        <div class="h-3 w-1/2 bg-white/5 rounded mt-2"></div>
                      </div>
                    </div>
                  </div>

                  <div v-else-if="player.searchError" class="flex flex-col items-center text-center gap-4 rounded-lg bg-white/[0.04] border border-white/10 px-6 py-12">
                    <div class="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
                      <WifiOff class="w-7 h-7 text-[#f5cf5b]" />
                    </div>
                    <div>
                      <p class="font-bold">Gagal memuat musik</p>
                      <p class="text-sm text-[#a3b3aa] mt-1 max-w-sm">{{ player.searchError }}</p>
                    </div>
                    <button @click="player.retrySearch()" class="flex items-center gap-2 rounded-full bg-[#f5cf5b] text-black font-bold text-sm px-5 h-10 hover:bg-[#ffe27a] active:scale-95 transition">
                      <RotateCw class="w-4 h-4" /> Coba lagi
                    </button>
                  </div>

                  <div v-else-if="!hero" class="text-center py-20 text-[#a3b3aa] text-sm">
                    <Music2 class="w-10 h-10 mx-auto mb-3 opacity-60" />
                    Tidak ada hasil. Coba kata kunci lain.
                  </div>

                  <template v-else>
                    <!-- Pilihan cepat (beranda) -->
                    <div v-if="!hasQuery" class="grid grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3 mb-10">
                      <div
                        v-for="track in quickPicks"
                        :key="'q-' + track.video_id"
                        @click="playOrToggle(track, player.tracks)"
                        class="group relative flex items-center h-14 md:h-16 rounded-md overflow-hidden bg-white/[0.07] hover:bg-white/15 cursor-pointer transition"
                      >
                        <img :src="track.thumbnail_url" :alt="track.title" class="h-full aspect-square object-cover shrink-0" />
                        <p :class="['flex-1 min-w-0 px-3 text-sm font-bold line-clamp-2 leading-tight', isCurrent(track) ? 'text-[#f5cf5b]' : '']">
                          {{ track.title }}
                        </p>
                        <span v-if="isActivePlaying(track)" class="eq mr-4 group-hover:hidden"><i></i><i></i><i></i></span>
                        <button
                          @click.stop="playOrToggle(track, player.tracks)"
                          :aria-label="isActivePlaying(track) ? 'Jeda' : 'Putar'"
                          class="hidden md:flex absolute right-3 w-10 h-10 rounded-full bg-[#f5cf5b] text-black items-center justify-center shadow-xl shadow-black/50 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 hover:scale-105 transition"
                        >
                          <Pause v-if="isActivePlaying(track)" class="w-5 h-5" />
                          <Play v-else class="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <!-- Hasil teratas + lagu (pencarian) -->
                    <div v-else class="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-10">
                      <div class="min-w-0 lg:col-span-2">
                        <h3 class="text-xl font-bold mb-3">Hasil teratas</h3>
                        <article
                          @click="playOrToggle(hero, player.tracks)"
                          class="group relative min-w-0 rounded-lg bg-white/[0.06] hover:bg-white/10 p-5 cursor-pointer transition"
                        >
                          <img :src="hero.thumbnail_url" :alt="hero.title" class="w-24 h-24 md:w-28 md:h-28 rounded-md object-cover shadow-xl shadow-black/50" />
                          <h4 class="text-2xl md:text-3xl font-bold mt-5 line-clamp-2 leading-tight break-words">{{ hero.title }}</h4>
                          <p class="text-sm text-[#a3b3aa] mt-2 truncate">
                            {{ hero.artist }}
                            <span class="ml-2 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-white">Lagu</span>
                          </p>
                          <button
                            @click.stop="playOrToggle(hero, player.tracks)"
                            :aria-label="isActivePlaying(hero) ? 'Jeda' : 'Putar'"
                            :class="[
                              'absolute right-5 bottom-5 w-12 h-12 rounded-full bg-[#f5cf5b] text-black flex items-center justify-center shadow-xl shadow-black/50 hover:scale-105 transition duration-200',
                              isActivePlaying(hero) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                            ]"
                          >
                            <Pause v-if="isActivePlaying(hero)" class="w-6 h-6" />
                            <Play v-else class="w-6 h-6" />
                          </button>
                        </article>
                      </div>

                      <div class="min-w-0 lg:col-span-3">
                        <h3 class="text-xl font-bold mb-3">Lagu</h3>
                        <div
                          v-for="track in topSongs"
                          :key="'s-' + track.video_id"
                          @click="playOrToggle(track, player.tracks)"
                          class="group flex items-center gap-3 p-2 rounded-md hover:bg-white/10 cursor-pointer transition"
                        >
                          <div class="relative w-11 h-11 rounded overflow-hidden shrink-0 bg-white/5">
                            <img :src="track.thumbnail_url" loading="lazy" class="w-full h-full object-cover" />
                            <div
                              :class="[
                                'absolute inset-0 bg-black/50 flex items-center justify-center transition',
                                isCurrent(track) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              ]"
                            >
                              <span v-if="isActivePlaying(track)" class="eq"><i></i><i></i><i></i></span>
                              <Play v-else class="w-5 h-5" />
                            </div>
                          </div>
                          <div class="flex-1 min-w-0">
                            <h4 :class="['text-sm font-medium truncate', isCurrent(track) ? 'text-[#f5cf5b]' : '']">{{ track.title }}</h4>
                            <p class="text-sm text-[#a3b3aa] truncate">{{ track.artist }}</p>
                          </div>
                          <button @click.stop="player.toggleLike(track)" aria-label="Sukai lagu" class="p-2">
                            <Heart :class="['w-4 h-4 transition', isTrackLiked(track.video_id) ? 'text-[#f5cf5b] fill-[#f5cf5b]' : 'text-[#a3b3aa] reveal hover:text-white']" />
                          </button>
                          <button @click.stop="openPicker(track)" aria-label="Tambahkan ke daftar putar" class="p-2">
                            <ListPlus class="w-5 h-5 text-[#a3b3aa] reveal hover:text-white" />
                          </button>
                          <span class="hidden sm:block w-10 text-right text-sm text-[#a3b3aa] tabular-nums">{{ formatTime(track.duration) }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Terakhir diputar -->
                    <section v-if="!hasQuery && player.recentTracks.length" class="mb-10">
                      <h3 class="text-xl md:text-2xl font-bold mb-3">Terakhir diputar</h3>
                      <div v-drag-scroll class="flex gap-1 overflow-x-auto snap-x no-scrollbar -mx-4 px-2 md:-mx-6 md:px-4 pb-2">
                        <div
                          v-for="track in player.recentTracks"
                          :key="'r-' + track.video_id"
                          @click="playOrToggle(track, player.recentTracks)"
                          class="snap-start shrink-0 w-28 md:w-32 p-2 rounded-lg hover:bg-white/10 cursor-pointer transition"
                        >
                          <div class="relative aspect-square rounded-md overflow-hidden bg-white/5">
                            <img :src="track.thumbnail_url" :alt="track.title" loading="lazy" class="w-full h-full object-cover" />
                            <span v-if="isActivePlaying(track)" class="eq absolute top-2 left-2"><i></i><i></i><i></i></span>
                          </div>
                          <h4 :class="['text-xs font-bold truncate mt-2', isCurrent(track) ? 'text-[#f5cf5b]' : '']">{{ track.title }}</h4>
                          <p class="text-xs text-[#a3b3aa] truncate">{{ track.artist }}</p>
                        </div>
                      </div>
                    </section>

                    <!-- Carousel kartu -->
                    <section v-if="trending.length" class="mb-10">
                      <h3 class="text-xl md:text-2xl font-bold mb-3">{{ hasQuery ? 'Lagu lainnya' : 'Sedang naik daun' }}</h3>
                      <div v-drag-scroll class="flex gap-1 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 px-2 md:-mx-6 md:px-4 pb-2">
                        <div
                          v-for="track in trending"
                          :key="track.video_id"
                          @click="playOrToggle(track, player.tracks)"
                          class="group snap-start shrink-0 w-36 sm:w-40 md:w-44 p-3 rounded-lg hover:bg-white/10 cursor-pointer transition"
                        >
                          <div class="relative aspect-square rounded-md overflow-hidden bg-white/5 shadow-lg shadow-black/40">
                            <img :src="track.thumbnail_url" :alt="track.title" loading="lazy" class="w-full h-full object-cover" />

                            <span v-if="isActivePlaying(track)" class="eq absolute top-2 left-2"><i></i><i></i><i></i></span>

                            <button
                              @click.stop="playOrToggle(track, player.tracks)"
                              :aria-label="isActivePlaying(track) ? 'Jeda' : 'Putar'"
                              :class="[
                                'absolute right-2 bottom-2 w-11 h-11 rounded-full bg-[#f5cf5b] text-black flex items-center justify-center shadow-xl shadow-black/50 hover:scale-105 transition duration-200',
                                isActivePlaying(track) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                              ]"
                            >
                              <Pause v-if="isActivePlaying(track)" class="w-5 h-5" />
                              <Play v-else class="w-5 h-5" />
                            </button>
                          </div>
                          <h4 :class="['text-sm font-bold truncate mt-3', isCurrent(track) ? 'text-[#f5cf5b]' : '']">{{ track.title }}</h4>
                          <p class="text-sm text-[#a3b3aa] truncate mt-0.5">{{ track.artist }}</p>
                        </div>
                      </div>
                    </section>

                    <!-- Sisanya sebagai daftar -->
                    <section v-if="restTracks.length">
                      <h3 class="text-xl md:text-2xl font-bold mb-3">Semua lagu</h3>
                      <div class="grid grid-cols-1 xl:grid-cols-2 gap-x-6 min-w-0">
                        <div
                          v-for="track in restTracks"
                          :key="track.video_id"
                          @click="playOrToggle(track, player.tracks)"
                          class="group flex items-center gap-3 p-2 rounded-md hover:bg-white/10 cursor-pointer transition"
                        >
                          <div class="relative w-11 h-11 rounded overflow-hidden shrink-0 bg-white/5">
                            <img :src="track.thumbnail_url" loading="lazy" class="w-full h-full object-cover" />
                            <div
                              :class="[
                                'absolute inset-0 bg-black/50 flex items-center justify-center transition',
                                isCurrent(track) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              ]"
                            >
                              <span v-if="isActivePlaying(track)" class="eq"><i></i><i></i><i></i></span>
                              <Play v-else class="w-5 h-5" />
                            </div>
                          </div>
                          <div class="flex-1 min-w-0">
                            <h4 :class="['text-sm font-medium truncate', isCurrent(track) ? 'text-[#f5cf5b]' : '']">{{ track.title }}</h4>
                            <p class="text-sm text-[#a3b3aa] truncate">{{ track.artist }}</p>
                          </div>
                          <button @click.stop="player.toggleLike(track)" aria-label="Sukai lagu" class="p-2">
                            <Heart :class="['w-4 h-4 transition', isTrackLiked(track.video_id) ? 'text-[#f5cf5b] fill-[#f5cf5b]' : 'text-[#a3b3aa] reveal hover:text-white']" />
                          </button>
                          <button @click.stop="openPicker(track)" aria-label="Tambahkan ke daftar putar" class="p-2">
                            <ListPlus class="w-5 h-5 text-[#a3b3aa] reveal hover:text-white" />
                          </button>
                          <span class="hidden sm:block w-10 text-right text-sm text-[#a3b3aa] tabular-nums">{{ formatTime(track.duration) }}</span>
                        </div>
                      </div>
                    </section>
                  </template>
                </section>

                <!-- ===== DAFTAR PUTAR ===== -->
                <section v-else-if="activeTab === 'playlists'" key="playlists">
                  <div class="flex items-end justify-between gap-4 pt-4 md:pt-2 mb-6">
                    <div class="min-w-0">
                      <h2 class="text-2xl md:text-3xl font-bold tracking-tight leading-tight">Daftar putar</h2>
                      <p class="text-sm text-[#a3b3aa] mt-1">{{ player.playlists.length }} koleksi</p>
                    </div>
                    <button
                      @click="openCreate()"
                      class="shrink-0 flex items-center gap-2 rounded-full bg-[#f5cf5b] text-black font-bold text-sm pl-3 pr-5 h-11 shadow-lg shadow-black/30 hover:bg-[#ffe27a] hover:scale-[1.03] active:scale-95 transition"
                    >
                      <span class="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center"><Plus class="w-4 h-4" /></span>
                      Buat baru
                    </button>
                  </div>
                  <div v-if="!player.playlists.length" class="text-center py-16 text-[#a3b3aa] text-sm">
                    <Library class="w-10 h-10 mx-auto mb-3 opacity-60" />
                    Belum ada daftar putar. Buat satu, lalu tambahkan lagu lewat tombol + di setiap lagu.
                  </div>
                  <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2 md:gap-4">
                    <button
                      v-for="pl in filteredPlaylists"
                      :key="pl.id"
                      @click="activeTab = 'pl:' + pl.id"
                      class="min-w-0 text-left p-3 rounded-lg hover:bg-white/10 transition"
                    >
                      <div class="aspect-square rounded-md overflow-hidden bg-linear-to-br from-teal-700 to-amber-300 flex items-center justify-center shadow-lg shadow-black/40">
                        <img v-if="pl.tracks[0]" :src="pl.tracks[0].thumbnail_url" loading="lazy" class="w-full h-full object-cover" />
                        <ListMusic v-else class="w-1/3 h-1/3 text-white/80" />
                      </div>
                      <h4 class="text-sm font-bold truncate mt-3">{{ pl.name }}</h4>
                      <p class="text-xs text-[#a3b3aa] truncate">{{ pl.tracks.length }} lagu</p>
                    </button>
                  </div>
                  <p v-if="player.playlists.length && !filteredPlaylists.length" class="text-center py-12 text-sm text-[#a3b3aa]">
                    Tidak ada daftar putar yang cocok dengan "{{ filterInput }}".
                  </p>
                </section>

                <!-- ===== LIBRARY (liked / queue / satu daftar putar) ===== -->
                <section v-else :key="activeTab">
                  <div :class="['-mx-4 md:-mx-6 -mt-16 pt-20 px-4 md:px-6 pb-6 bg-linear-to-b', libraryMeta.gradient]">
                    <button
                      v-if="isPlaylistTab"
                      @click="activeTab = 'playlists'"
                      class="mb-4 -ml-1 flex items-center gap-1 rounded-full bg-black/30 hover:bg-black/50 active:scale-95 pl-2 pr-4 h-9 text-sm font-bold transition"
                    >
                      <ChevronLeft class="w-5 h-5" /> Semua daftar putar
                    </button>
                    <div class="flex items-end gap-5 md:gap-6">
                      <div :class="['w-32 h-32 md:w-52 md:h-52 rounded-md shrink-0 flex items-center justify-center shadow-2xl shadow-black/50 bg-linear-to-br', libraryMeta.cover]">
                        <component :is="libraryMeta.icon" :class="['w-14 h-14 md:w-24 md:h-24 text-white', activeTab === 'liked' ? 'fill-white' : '']" />
                      </div>
                      <div class="min-w-0">
                        <p class="text-sm font-bold">Daftar putar</p>
                        <h2 class="text-3xl sm:text-5xl lg:text-7xl font-black tracking-tight mt-1 md:mt-2 leading-none">{{ libraryMeta.title }}</h2>
                        <p class="text-sm text-white/80 mt-3 md:mt-6 font-medium">{{ libraryTracks.length }} lagu</p>
                        <div v-if="isPlaylistTab" class="flex items-center gap-2 mt-3">
                          <button @click="openRename" class="flex items-center gap-1.5 rounded-full bg-black/30 hover:bg-black/50 px-3 h-8 text-xs font-bold transition"><Pencil class="w-3.5 h-3.5" /> Ganti nama</button>
                          <button @click="removeActivePlaylist" class="flex items-center gap-1.5 rounded-full bg-black/30 hover:bg-black/50 px-3 h-8 text-xs font-bold transition"><Trash2 class="w-3.5 h-3.5" /> Hapus</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="libraryTracks.length === 0" class="text-center py-16 text-[#a3b3aa] text-sm">
                    {{ libraryMeta.empty }}
                  </div>

                  <template v-else>
                    <div class="flex items-center gap-5 mb-6">
                      <button
                        @click="playLibrary"
                        class="w-14 h-14 rounded-full bg-[#f5cf5b] text-black flex items-center justify-center hover:scale-105 hover:bg-[#ffe27a] active:scale-95 transition"
                        :aria-label="libraryIsPlaying ? 'Jeda' : 'Putar'"
                      >
                        <Pause v-if="libraryIsPlaying" class="w-7 h-7" />
                        <Play v-else class="w-7 h-7" />
                      </button>
                      <button
                        @click="toggleShuffle"
                        aria-label="Acak"
                        title="Acak"
                        :class="['relative w-10 h-10 flex items-center justify-center transition', shuffle ? 'text-[#f5cf5b]' : 'text-[#a3b3aa] hover:text-white']"
                      >
                        <Shuffle class="w-6 h-6" />
                        <span v-if="shuffle" class="absolute bottom-0 w-1 h-1 rounded-full bg-[#f5cf5b]"></span>
                      </button>
                      <button
                        v-if="activeTab === 'queue'"
                        @click="player.clearUpcoming()"
                        class="rounded-full border border-white/25 hover:border-white px-4 h-9 text-sm font-bold transition"
                      >
                        Kosongkan berikutnya
                      </button>
                    </div>

                    <div class="hidden sm:grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-4 px-3 pb-2 mb-2 border-b border-white/10 text-sm text-[#a3b3aa]">
                      <span class="text-center">#</span>
                      <span>Judul</span>
                      <span class="flex items-center gap-8 pr-2"><Clock class="w-4 h-4" /></span>
                    </div>

                    <div class="flex flex-col">
                      <div
                        v-for="{ track, idx } in libraryRows"
                        :key="track.video_id + idx"
                        @click="playLibraryTrack(track)"
                        :class="[
                          'group flex sm:grid sm:grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4 px-3 py-2 rounded-md cursor-pointer transition',
                          isCurrent(track) ? 'bg-white/10' : 'hover:bg-white/10'
                        ]"
                      >
                        <span class="hidden sm:flex w-8 justify-center text-sm text-[#a3b3aa] tabular-nums">
                          <span :class="['group-hover:hidden', isCurrent(track) ? 'text-[#f5cf5b]' : '']">{{ idx + 1 }}</span>
                          <Play class="hidden group-hover:block w-4 h-4 text-white" />
                        </span>
                        <div class="flex flex-1 min-w-0 items-center gap-3">
                          <div class="relative w-10 h-10 rounded overflow-hidden shrink-0">
                            <img :src="track.thumbnail_url" loading="lazy" class="w-full h-full object-cover" />
                            <div v-if="isActivePlaying(track)" class="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span class="eq"><i></i><i></i><i></i></span>
                            </div>
                          </div>
                          <div class="min-w-0">
                            <h4 :class="['text-sm font-medium truncate', isCurrent(track) ? 'text-[#f5cf5b]' : '']">{{ track.title }}</h4>
                            <p class="text-sm text-[#a3b3aa] truncate group-hover:text-white">{{ track.artist }}</p>
                          </div>
                        </div>
                        <div class="flex items-center gap-0.5 sm:gap-2">
                          <template v-if="activeTab === 'queue'">
                            <button @click.stop="player.moveInQueue(idx, idx - 1)" :disabled="idx === 0 || isFiltering" aria-label="Naikkan" class="p-1.5 text-[#a3b3aa] hover:text-white disabled:opacity-25 disabled:pointer-events-none"><ChevronUp class="w-5 h-5" /></button>
                            <button @click.stop="player.moveInQueue(idx, idx + 1)" :disabled="idx === libraryTracks.length - 1 || isFiltering" aria-label="Turunkan" class="p-1.5 text-[#a3b3aa] hover:text-white disabled:opacity-25 disabled:pointer-events-none"><ChevronDown class="w-5 h-5" /></button>
                            <button @click.stop="player.removeFromQueue(idx)" aria-label="Hapus dari antrean" class="p-1.5 text-[#a3b3aa] hover:text-white"><X class="w-5 h-5" /></button>
                          </template>
                          <template v-else>
                            <button v-if="isPlaylistTab" @click.stop="removeFromActivePlaylist(track)" aria-label="Hapus dari daftar putar" class="p-1.5 text-[#a3b3aa] hover:text-white"><Trash2 class="w-4 h-4" /></button>
                            <button @click.stop="player.toggleLike(track)" aria-label="Sukai lagu" class="p-1.5">
                              <Heart :class="['w-4 h-4 transition', isTrackLiked(track.video_id) ? 'text-[#f5cf5b] fill-[#f5cf5b]' : 'text-[#a3b3aa] reveal hover:text-white']" />
                            </button>
                            <button v-if="!isPlaylistTab" @click.stop="openPicker(track)" aria-label="Tambahkan ke daftar putar" class="p-1.5">
                              <ListPlus class="w-5 h-5 text-[#a3b3aa] reveal hover:text-white" />
                            </button>
                          </template>
                          <span :class="['w-10 text-right text-sm text-[#a3b3aa] tabular-nums', activeTab === 'queue' ? 'hidden sm:block' : '']">{{ formatTime(track.duration) }}</span>
                        </div>
                      </div>
                    </div>
                    <p v-if="!libraryRows.length" class="text-center py-12 text-sm text-[#a3b3aa]">
                      Tidak ada lagu yang cocok dengan "{{ filterInput }}".
                    </p>
                  </template>
                </section>
              </Transition>
            </div>
          </div>
        </main>

        <!-- ============ RIGHT PANEL: NOW PLAYING (xl) ============ -->
        <aside class="relative hidden xl:flex w-80 shrink-0 flex-col gap-4 rounded-lg bg-[#0e1814] p-4 overflow-hidden">
          <!-- Latar warna cover -->
          <Transition name="ambient">
            <img v-if="player.currentTrack" :key="player.currentTrack.video_id" :src="player.currentTrack.thumbnail_url" class="ambient-blur opacity-50 pointer-events-none" />
          </Transition>
          <div class="aurora pointer-events-none"><span></span><span></span></div>
          <div class="absolute inset-0 bg-linear-to-b from-transparent via-[#0e1814]/60 to-[#0e1814] pointer-events-none"></div>

          <p class="relative text-[11px] uppercase tracking-[0.2em] font-bold text-white/70">Sedang diputar</p>

          <template v-if="player.currentTrack">
            <div class="relative px-2 pt-2">
              <img :src="player.currentTrack.thumbnail_url" aria-hidden="true" class="cover-glow" />
              <img
                :src="player.currentTrack.thumbnail_url"
                :alt="player.currentTrack.title"
                class="cover-frame relative w-full aspect-square object-cover rounded-2xl ring-1 ring-white/10"
              />
            </div>

            <div class="relative flex items-start gap-2 mt-1">
              <div class="min-w-0 flex-1">
                <h3 class="text-2xl font-extrabold leading-tight tracking-tight line-clamp-2">{{ player.currentTrack.title }}</h3>
                <p class="text-white/70 font-medium truncate mt-1">{{ player.currentTrack.artist }}</p>
              </div>
              <button @click="player.toggleLike(player.currentTrack)" aria-label="Sukai lagu" class="glass w-10 h-10 rounded-full flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition">
                <Heart :class="['w-5 h-5 transition', player.isCurrentLiked ? 'text-[#f5cf5b] fill-[#f5cf5b]' : 'text-white']" />
              </button>
              <button @click="openPicker(player.currentTrack)" aria-label="Tambahkan ke daftar putar" class="glass w-10 h-10 rounded-full flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition">
                <ListPlus class="w-5 h-5" />
              </button>
            </div>

            <!-- Lirik singkat -->
            <button
              v-if="lyricsStatus === 'synced' && activeLyricIndex >= 0"
              @click="showLyrics = true"
              class="relative glass rounded-xl px-4 py-3 text-left hover:bg-white/15 transition"
            >
              <p class="text-[10px] uppercase tracking-widest text-[#f5cf5b] font-bold mb-1">Lirik</p>
              <Transition name="fade" mode="out-in">
                <p :key="activeLyricIndex" class="text-sm font-semibold line-clamp-2">{{ lyricLines[activeLyricIndex].text || '♪' }}</p>
              </Transition>
            </button>

            <!-- Berikutnya -->
            <div class="relative flex-1 min-h-0 flex flex-col glass rounded-xl p-3">
              <p class="text-sm font-bold mb-2 px-1">Berikutnya</p>
              <div v-if="upNext.length" class="flex-1 overflow-y-auto scroll-thin flex flex-col gap-0.5">
                <button
                  v-for="(track, i) in upNext"
                  :key="track.video_id + i"
                  @click="player.playTrack(track)"
                  class="flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition text-left"
                >
                  <img :src="track.thumbnail_url" loading="lazy" class="w-10 h-10 rounded-md object-cover shrink-0" />
                  <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ track.title }}</p>
                    <p class="text-xs text-[#a3b3aa] truncate">{{ track.artist }}</p>
                  </div>
                </button>
              </div>
              <p v-else class="text-sm text-[#a3b3aa] px-1">Tidak ada lagu berikutnya.</p>
            </div>
          </template>

          <div v-else class="relative flex-1 flex flex-col items-center justify-center text-center text-[#a3b3aa] gap-3">
            <div class="glass w-20 h-20 rounded-2xl flex items-center justify-center">
              <Music2 class="w-9 h-9" />
            </div>
            <p class="text-sm leading-relaxed">Pilih lagu untuk mulai memutar.<br />Detailnya muncul di sini.</p>
          </div>
        </aside>
      </div>

      <!-- ============ DESKTOP PLAYER BAR ============ -->
      <footer
        class="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 h-[4.5rem] px-3 shrink-0"
      >
        <!-- Track info -->
        <div class="flex items-center gap-3 min-w-0">
          <template v-if="player.currentTrack">
            <div class="relative w-14 h-14 rounded-md overflow-hidden shadow-md shrink-0">
              <img :src="player.currentTrack.thumbnail_url" class="w-full h-full object-cover" />
              <div v-if="player.isPlaying" class="absolute inset-0 bg-black/45 flex items-center justify-center">
                <span class="eq"><i></i><i></i><i></i></span>
              </div>
            </div>
            <div class="min-w-0">
              <h4 class="text-sm font-medium truncate">{{ player.currentTrack.title }}</h4>
              <p class="text-xs text-[#a3b3aa] truncate">{{ player.currentTrack.artist }}</p>
            </div>
            <button @click="player.toggleLike(player.currentTrack)" aria-label="Sukai lagu" class="p-1.5 shrink-0">
              <Heart :class="['w-4 h-4 transition', player.isCurrentLiked ? 'text-[#f5cf5b] fill-[#f5cf5b]' : 'text-[#a3b3aa] hover:text-white']" />
            </button>
            <button @click="openPicker(player.currentTrack)" aria-label="Tambahkan ke daftar putar" class="p-1.5 shrink-0 text-[#a3b3aa] hover:text-white">
              <ListPlus class="w-4 h-4" />
            </button>
          </template>
          <div v-else class="text-xs text-[#a3b3aa]">Pilih lagu untuk mulai memutar</div>
        </div>

        <!-- Controls + progress -->
        <div class="flex flex-col items-center gap-1.5">
          <div class="flex items-center gap-4">
            <button
              @click="toggleShuffle"
              aria-label="Acak"
              title="Acak"
              :class="['relative w-8 h-8 flex items-center justify-center transition active:scale-90', shuffle ? 'text-[#f5cf5b]' : 'text-[#a3b3aa] hover:text-white']"
            >
              <Shuffle class="w-[18px] h-[18px]" />
              <span v-if="shuffle" class="absolute bottom-0 w-1 h-1 rounded-full bg-[#f5cf5b]"></span>
            </button>
            <button @click="player.playPrev" class="w-8 h-8 flex items-center justify-center text-[#a3b3aa] hover:text-white transition active:scale-90" aria-label="Sebelumnya">
              <SkipBack class="w-5 h-5" />
            </button>
            <button
              @click="player.togglePlay"
              class="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition"
              aria-label="Putar/Jeda"
            >
              <Pause v-if="player.isPlaying" class="w-[18px] h-[18px]" />
              <Play v-else class="w-[18px] h-[18px]" />
            </button>
            <button @click="nextTrack" class="w-8 h-8 flex items-center justify-center text-[#a3b3aa] hover:text-white transition active:scale-90" aria-label="Berikutnya">
              <SkipForward class="w-5 h-5" />
            </button>
            <button
              @click="cycleRepeat"
              :aria-label="repeatLabel"
              :title="repeatLabel"
              :class="['relative w-8 h-8 flex items-center justify-center transition active:scale-90', repeat !== 'off' ? 'text-[#f5cf5b]' : 'text-[#a3b3aa] hover:text-white']"
            >
              <Repeat1 v-if="repeat === 'one'" class="w-[18px] h-[18px]" />
              <Repeat v-else class="w-[18px] h-[18px]" />
              <span v-if="repeat !== 'off'" class="absolute bottom-0 w-1 h-1 rounded-full bg-[#f5cf5b]"></span>
            </button>
          </div>
          <div class="w-full max-w-xl flex items-center gap-2">
            <span class="text-[11px] text-[#a3b3aa] w-10 text-right tabular-nums">{{ formatTime(player.currentTime) }}</span>
            <input
              type="range"
              min="0"
              :max="player.duration || 100"
              :value="player.currentTime"
              :style="rangeStyle(progressPct)"
              @input="e => player.seekTo(Number(e.target.value))"
              class="range flex-1"
            />
            <span class="text-[11px] text-[#a3b3aa] w-10 tabular-nums">{{ formatTime(player.duration) }}</span>
          </div>
        </div>

        <!-- Lyrics + volume -->
        <div class="flex items-center justify-end gap-1.5">
          <button
            @click="showSleep = true"
            :class="['h-9 px-1.5 flex items-center gap-1 transition', sleepActive ? 'text-[#f5cf5b]' : 'text-[#a3b3aa] hover:text-white']"
            aria-label="Timer tidur"
            title="Timer tidur"
          >
            <Moon class="w-5 h-5" />
            <span v-if="sleepActive" class="text-[10px] font-bold tabular-nums">{{ sleepLabel }}</span>
          </button>
          <button
            @click="showQueue = !showQueue"
            :class="['w-9 h-9 flex items-center justify-center transition', showQueue ? 'text-[#f5cf5b]' : 'text-[#a3b3aa] hover:text-white']"
            aria-label="Antrean"
            title="Antrean"
          >
            <ListMusic class="w-5 h-5" />
          </button>
          <button
            @click="showLyrics = !showLyrics"
            :disabled="!player.currentTrack"
            aria-label="Lirik"
            title="Lirik"
            :class="[
              'w-9 h-9 flex items-center justify-center transition disabled:opacity-30 disabled:pointer-events-none',
              showLyrics ? 'text-[#f5cf5b]' : 'text-[#a3b3aa] hover:text-white'
            ]"
          >
            <Mic class="w-5 h-5" />
          </button>
          <button @click="player.toggleMute" class="w-9 h-9 flex items-center justify-center text-[#a3b3aa] hover:text-white transition" aria-label="Bisukan">
            <VolumeX v-if="player.isMuted || player.volume === 0" class="w-5 h-5" />
            <Volume2 v-else class="w-5 h-5" />
          </button>
          <input
            type="range"
            min="0"
            max="100"
            :value="player.isMuted ? 0 : player.volume"
            :style="rangeStyle(player.isMuted ? 0 : player.volume)"
            @input="e => player.setVolume(e.target.value)"
            class="range w-20 lg:w-28"
          />
        </div>
      </footer>

      <!-- ============ MOBILE MINI PLAYER ============ -->
      <div
        v-if="player.currentTrack"
        @click="openNowPlaying"
        @touchstart.passive="miniTouchStart"
        @touchend.passive="miniTouchEnd"
        class="md:hidden mx-2 mb-1 rounded-lg bg-[#213229] overflow-hidden shrink-0 cursor-pointer touch-pan-x shadow-lg shadow-black/50"
      >
        <div class="flex items-center gap-3 p-2 pr-3">
          <div class="relative w-11 h-11 rounded overflow-hidden shrink-0">
            <img :src="player.currentTrack.thumbnail_url" class="w-full h-full object-cover" />
            <div v-if="player.isPlaying" class="absolute inset-0 bg-black/45 flex items-center justify-center">
              <span class="eq"><i></i><i></i><i></i></span>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="text-sm font-semibold truncate">{{ player.currentTrack.title }}</h4>
            <p class="text-xs text-[#a3b3aa] truncate">{{ player.currentTrack.artist }}</p>
          </div>
          <button @click.stop="player.toggleLike(player.currentTrack)" class="p-2" aria-label="Sukai lagu">
            <Heart :class="['w-6 h-6', player.isCurrentLiked ? 'text-[#f5cf5b] fill-[#f5cf5b]' : 'text-white/80']" />
          </button>
          <button
            @click.stop="player.togglePlay"
            class="w-9 h-9 flex items-center justify-center active:scale-90 transition"
            aria-label="Putar/Jeda"
          >
            <Pause v-if="player.isPlaying" class="w-7 h-7" />
            <Play v-else class="w-7 h-7" />
          </button>
        </div>
        <div class="h-0.5 mx-2 mb-1.5 rounded-full bg-white/20">
          <div class="h-full rounded-full bg-white" :style="{ width: progressPct + '%' }"></div>
        </div>
      </div>

      <!-- ============ MOBILE BOTTOM TAB BAR ============ -->
      <nav
        class="md:hidden grid grid-cols-4 shrink-0 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-[#060d0a]/95 backdrop-blur-xl border-t border-white/5"
      >
        <button
          v-for="item in navItems"
          :key="'m-' + item.id"
          @click="activeTab = item.id"
          :aria-label="item.label"
          :aria-current="isTabActive(item.id) ? 'page' : undefined"
          class="group flex flex-col items-center gap-1 py-0.5 active:scale-95 transition"
        >
          <span
            :class="[
              'flex items-center justify-center h-8 w-16 rounded-full transition-all duration-300',
              isTabActive(item.id) ? 'bg-[#f5cf5b]/15 text-[#f5cf5b]' : 'text-[#a3b3aa] group-active:bg-white/10'
            ]"
          >
            <component
              :is="item.icon"
              :class="['w-[22px] h-[22px] transition', isTabActive(item.id) && item.id === 'liked' ? 'fill-[#f5cf5b]' : '']"
            />
          </span>
          <span :class="['text-[11px] leading-none transition', isTabActive(item.id) ? 'font-bold text-white' : 'font-medium text-[#a3b3aa]']">
            {{ item.label }}
          </span>
        </button>
      </nav>
    </div>

    <!-- ============ MOBILE NOW PLAYING (fullscreen) ============ -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-full"
      leave-active-class="transition duration-200 ease-in"
      leave-to-class="translate-y-full"
    >
      <div
        v-if="showNowPlaying && player.currentTrack"
        @touchstart.passive="npTouchStart"
        @touchmove.passive="npTouchMove"
        @touchend.passive="npTouchEnd"
        @touchcancel.passive="npTouchCancel"
        :style="{
          transform: sheetDrag ? `translateY(${sheetDrag}px)` : undefined,
          transition: sheetDragging ? 'none' : undefined
        }"
        class="md:hidden fixed inset-0 z-50 flex flex-col bg-[#060d0a] overflow-hidden touch-none transition-transform"
      >
        <!-- Latar: warna cover + cahaya bergerak -->
        <Transition name="ambient">
          <img v-if="shownCover" :key="shownCover.id" :src="shownCover.url" class="ambient-blur opacity-70 pointer-events-none" />
        </Transition>
        <div class="aurora pointer-events-none"><span></span><span></span></div>
        <div class="absolute inset-0 bg-linear-to-b from-black/20 via-black/40 to-black/95 pointer-events-none"></div>

        <div class="relative flex-1 flex flex-col px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] min-h-0">
          <div class="shrink-0 mx-auto mb-1 h-1 w-10 rounded-full bg-white/30"></div>

          <!-- Header -->
          <div class="shrink-0 flex items-center justify-between">
            <button @click="showNowPlaying = false" class="glass w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition" aria-label="Tutup">
              <ChevronDown class="w-6 h-6" />
            </button>
            <div class="text-center">
              <p class="text-[10px] uppercase tracking-[0.2em] text-white/60 font-bold">Sedang diputar</p>
              <p v-if="player.queue.length" class="text-xs text-white/80 font-semibold mt-0.5">
                {{ player.currentIndex + 1 }} dari {{ player.queue.length }}
              </p>
            </div>
            <button @click="openPicker(player.currentTrack)" class="glass w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition" aria-label="Tambahkan ke daftar putar">
              <ListPlus class="w-5 h-5" />
            </button>
          </div>

          <!-- Cover dengan cahaya -->
          <div class="flex-1 min-h-0 py-4 flex items-center justify-center">
            <div :style="coverSize" class="relative max-w-full aspect-square">
              <img v-if="shownCover" :src="shownCover.url" aria-hidden="true" class="cover-glow" />
              <div class="cover-frame relative w-full h-full rounded-2xl overflow-hidden bg-[#16251e] ring-1 ring-white/10">
                <Transition :name="coverDir === 'prev' ? 'cover-prev' : 'cover-next'">
                  <img v-if="shownCover" :key="shownCover.id" :src="shownCover.url" :alt="player.currentTrack.title" class="absolute inset-0 w-full h-full object-cover" />
                </Transition>
              </div>
            </div>
          </div>

          <!-- Judul + suka -->
          <div class="shrink-0 flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <h3 class="text-[1.65rem] font-extrabold leading-tight tracking-tight line-clamp-2">{{ player.currentTrack.title }}</h3>
              <p class="text-white/70 font-medium truncate mt-0.5">{{ player.currentTrack.artist }}</p>
            </div>
            <button @click="player.toggleLike(player.currentTrack)" class="glass w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition shrink-0" aria-label="Sukai lagu">
              <Heart :class="['w-6 h-6 transition', player.isCurrentLiked ? 'text-[#f5cf5b] fill-[#f5cf5b] scale-110' : 'text-white']" />
            </button>
          </div>

          <!-- Cuplikan lirik yang sedang dinyanyikan -->
          <button
            v-if="lyricsStatus === 'synced' && activeLyricIndex >= 0"
            @click="showLyrics = true"
            class="shrink-0 mt-3 glass rounded-xl px-4 py-2.5 text-left active:scale-[0.98] transition"
          >
            <Transition name="fade" mode="out-in">
              <p :key="activeLyricIndex" class="text-sm font-semibold text-white/90 line-clamp-1">
                {{ lyricLines[activeLyricIndex].text || '♪' }}
              </p>
            </Transition>
          </button>

          <!-- Progress -->
          <div class="shrink-0 mt-4">
            <input
              type="range" min="0" :max="player.duration || 100" :value="player.currentTime"
              :style="rangeStyle(progressPct)" @input="e => player.seekTo(Number(e.target.value))"
              class="range range-lg w-full"
            />
            <div class="flex justify-between text-[11px] text-white/60 mt-1.5 tabular-nums font-medium">
              <span>{{ formatTime(player.currentTime) }}</span>
              <span>{{ formatTime(player.duration) }}</span>
            </div>
          </div>

          <!-- Kontrol -->
          <div class="shrink-0 flex items-center justify-between mt-2">
            <button @click="toggleShuffle" aria-label="Acak" :class="['relative w-11 h-11 flex items-center justify-center transition active:scale-90', shuffle ? 'text-[#f5cf5b]' : 'text-white/70']">
              <Shuffle class="w-5 h-5" />
              <span v-if="shuffle" class="absolute bottom-1 w-1 h-1 rounded-full bg-[#f5cf5b]"></span>
            </button>
            <button @click="player.playPrev" class="w-14 h-14 flex items-center justify-center active:scale-90 transition" aria-label="Sebelumnya">
              <SkipBack class="w-9 h-9" />
            </button>
            <button @click="player.togglePlay" class="play-glow w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center active:scale-95 transition" aria-label="Putar/Jeda">
              <Pause v-if="player.isPlaying" class="w-9 h-9" />
              <Play v-else class="w-9 h-9" />
            </button>
            <button @click="nextTrack" class="w-14 h-14 flex items-center justify-center active:scale-90 transition" aria-label="Berikutnya">
              <SkipForward class="w-9 h-9" />
            </button>
            <button @click="cycleRepeat" :aria-label="repeatLabel" :class="['relative w-11 h-11 flex items-center justify-center transition active:scale-90', repeat !== 'off' ? 'text-[#f5cf5b]' : 'text-white/70']">
              <Repeat1 v-if="repeat === 'one'" class="w-5 h-5" />
              <Repeat v-else class="w-5 h-5" />
              <span v-if="repeat !== 'off'" class="absolute bottom-1 w-1 h-1 rounded-full bg-[#f5cf5b]"></span>
            </button>
          </div>

          <!-- Aksi bawah: kapsul kaca -->
          <div class="shrink-0 grid grid-cols-3 gap-2 mt-5">
            <button @click="showLyrics = true" class="glass h-11 rounded-full flex items-center justify-center gap-2 text-xs font-bold active:scale-95 transition">
              <Mic class="w-4 h-4" /> Lirik
            </button>
            <button @click="showQueue = true" class="glass h-11 rounded-full flex items-center justify-center gap-2 text-xs font-bold active:scale-95 transition">
              <ListMusic class="w-4 h-4" /> Antrean
            </button>
            <button @click="showSleep = true" :class="['glass h-11 rounded-full flex items-center justify-center gap-2 text-xs font-bold active:scale-95 transition', sleepActive ? 'text-[#f5cf5b]' : '']">
              <Moon class="w-4 h-4" /> {{ sleepActive ? sleepLabel : 'Timer' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ============ LYRICS OVERLAY (mobile layar penuh, desktop di atas area konten) ============ -->
    <Transition name="fade">
      <div
        v-if="showLyrics && player.currentTrack"
        class="fixed z-60 top-0 left-0 right-0 bottom-0 md:top-2 md:left-2 md:right-2 md:bottom-[5.25rem] md:rounded-lg flex flex-col overflow-hidden bg-[#0e1814]"
      >
        <img
          :src="player.currentTrack.thumbnail_url"
          class="ambient-blur opacity-80 pointer-events-none"
        />
        <div class="absolute inset-0 bg-black/40 pointer-events-none"></div>

        <div class="relative flex-1 min-h-0 w-full max-w-3xl mx-auto flex flex-col px-5 md:px-8 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <!-- Header -->
          <div class="shrink-0 flex items-center gap-4">
            <img :src="player.currentTrack.thumbnail_url" class="w-12 h-12 md:w-14 md:h-14 rounded-md object-cover shadow-lg" />
            <div class="min-w-0 flex-1">
              <h3 class="text-base md:text-lg font-bold truncate">{{ player.currentTrack.title }}</h3>
              <p class="text-sm text-white/70 truncate">{{ player.currentTrack.artist }}</p>
            </div>
            <button
              @click="showLyrics = false"
              aria-label="Tutup lirik"
              class="w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition shrink-0"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Isi lirik -->
          <div class="flex-1 min-h-0 flex flex-col mt-2">
            <!-- Tersinkron -->
            <div
              v-if="lyricsStatus === 'synced'"
              data-lyrics
              @wheel.passive="pauseLyricsScroll"
              @touchmove.passive="pauseLyricsScroll"
              class="lyrics-mask relative flex-1 min-h-0 overflow-y-auto no-scrollbar"
            >
              <div class="py-[25dvh]">
                <p
                  v-for="(line, i) in lyricLines"
                  :key="i"
                  :data-line="i"
                  @click="player.seekTo(line.time)"
                  :class="lineClass(i)"
                >
                  {{ line.text || '♪' }}
                </p>
              </div>
            </div>

            <!-- Tidak tersinkron -->
            <div v-else-if="lyricsStatus === 'plain'" data-lyrics class="lyrics-mask relative flex-1 min-h-0 overflow-y-auto no-scrollbar">
              <p class="text-xs text-white/60 pt-6 pb-3">Lirik belum tersinkron dengan waktu lagu.</p>
              <p class="whitespace-pre-line text-xl md:text-2xl font-bold leading-relaxed text-white/90 pb-24">{{ lyricsPlain }}</p>
            </div>

            <!-- Memuat -->
            <div v-else-if="lyricsStatus === 'loading'" class="flex-1 flex flex-col justify-center gap-4 animate-pulse">
              <div v-for="w in ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-1/3']" :key="w" :class="['h-7 rounded-lg bg-white/15', w]"></div>
            </div>

            <!-- Tidak ada -->
            <div v-else class="flex-1 flex flex-col items-center justify-center text-center text-white/60 gap-3 px-6">
              <div class="w-16 h-16 rounded-lg bg-black/20 flex items-center justify-center">
                <Mic class="w-7 h-7" />
              </div>
              <p class="text-sm leading-relaxed">Lirik belum tersedia untuk lagu ini.</p>
            </div>

            <p v-if="lyricsStatus === 'synced' || lyricsStatus === 'plain'" class="shrink-0 pt-2 text-[10px] text-white/50">
              Lirik dari LRCLIB
            </p>
          </div>

          <!-- Kontrol ringkas (mobile saja; desktop memakai player bar di bawah) -->
          <div class="md:hidden shrink-0 mt-3">
            <input
              type="range"
              min="0"
              :max="player.duration || 100"
              :value="player.currentTime"
              :style="rangeStyle(progressPct)"
              @input="e => player.seekTo(Number(e.target.value))"
              class="range range-lg w-full"
            />
            <div class="flex justify-between text-[11px] text-white/60 mt-1.5 tabular-nums">
              <span>{{ formatTime(player.currentTime) }}</span>
              <span>{{ formatTime(player.duration) }}</span>
            </div>
            <div class="flex items-center justify-center gap-4 mt-2">
              <button @click="toggleShuffle" aria-label="Acak" :class="['relative w-10 h-10 flex items-center justify-center transition active:scale-90', shuffle ? 'text-[#f5cf5b]' : 'text-white/70']">
                <Shuffle class="w-5 h-5" />
                <span v-if="shuffle" class="absolute bottom-0 w-1 h-1 rounded-full bg-[#f5cf5b]"></span>
              </button>
              <button @click="player.playPrev" class="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition" aria-label="Sebelumnya">
                <SkipBack class="w-7 h-7" />
              </button>
              <button
                @click="player.togglePlay"
                class="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition"
                aria-label="Putar/Jeda"
              >
                <Pause v-if="player.isPlaying" class="w-7 h-7" />
                <Play v-else class="w-7 h-7" />
              </button>
              <button @click="nextTrack" class="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition" aria-label="Berikutnya">
                <SkipForward class="w-7 h-7" />
              </button>
              <button @click="cycleRepeat" :aria-label="repeatLabel" :class="['relative w-10 h-10 flex items-center justify-center transition active:scale-90', repeat !== 'off' ? 'text-[#f5cf5b]' : 'text-white/70']">
                <Repeat1 v-if="repeat === 'one'" class="w-5 h-5" />
                <Repeat v-else class="w-5 h-5" />
                <span v-if="repeat !== 'off'" class="absolute bottom-0 w-1 h-1 rounded-full bg-[#f5cf5b]"></span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <!-- ============ ANTREAN (bottom sheet di mobile, panel di desktop) ============ -->
    <Transition name="sheet" :duration="{ enter: 320, leave: 240 }">
      <div v-if="showQueue" class="fixed inset-0 z-70">
        <div class="sheet-backdrop absolute inset-0 bg-black/60 md:bg-transparent" @click="showQueue = false"></div>
        <div
          class="sheet absolute bottom-0 inset-x-0 max-h-[78dvh] flex flex-col rounded-t-2xl bg-[#16251e] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black md:bottom-[5.25rem] md:top-2 md:right-2 md:left-auto md:inset-x-auto md:w-96 md:max-h-none md:rounded-lg md:border md:border-white/10"
        >
          <div class="md:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-white/25"></div>
          <div class="flex items-center justify-between px-5 pt-3 pb-2">
            <h3 class="text-lg font-bold">Antrean</h3>
            <button @click="showQueue = false" aria-label="Tutup antrean" class="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center">
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-thin px-3 pb-2">
            <template v-if="player.currentTrack">
              <p class="px-2 pt-2 pb-1 text-sm font-bold text-[#a3b3aa]">Sedang diputar</p>
              <div class="flex items-center gap-3 p-2 rounded-md bg-white/10">
                <img :src="player.currentTrack.thumbnail_url" class="w-11 h-11 rounded object-cover shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium truncate text-[#f5cf5b]">{{ player.currentTrack.title }}</p>
                  <p class="text-xs text-[#a3b3aa] truncate">{{ player.currentTrack.artist }}</p>
                </div>
                <span v-if="player.isPlaying" class="eq mr-2"><i></i><i></i><i></i></span>
              </div>
            </template>
            <div class="flex items-center justify-between px-2 pt-4 pb-1">
              <p class="text-sm font-bold text-[#a3b3aa]">Berikutnya</p>
              <button v-if="queueUpcoming.length" @click="player.clearUpcoming()" class="text-xs font-bold text-[#a3b3aa] hover:text-white">Kosongkan</button>
            </div>
            <p v-if="player.shuffle" class="px-2 pb-2 text-xs text-[#a3b3aa]">Mode acak aktif, urutan berikutnya dipilih acak.</p>
            <div
              v-for="(track, i) in queueUpcoming"
              :key="track.video_id + i"
              class="flex items-center rounded-md hover:bg-white/10 transition"
            >
              <button @click="player.playTrack(track)" class="flex-1 min-w-0 flex items-center gap-3 p-2 text-left">
                <img :src="track.thumbnail_url" loading="lazy" class="w-11 h-11 rounded object-cover shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium truncate">{{ track.title }}</p>
                  <p class="text-xs text-[#a3b3aa] truncate">{{ track.artist }}</p>
                </div>
              </button>
              <button @click="player.removeFromQueue(player.currentIndex + 1 + i)" aria-label="Hapus dari antrean" class="p-2.5 text-[#a3b3aa] hover:text-white shrink-0">
                <X class="w-4 h-4" />
              </button>
            </div>
            <p v-if="!queueUpcoming.length" class="px-2 py-4 text-sm text-[#a3b3aa]">Tidak ada lagu berikutnya.</p>
          </div>
        </div>
      </div>
    </Transition>
    <!-- ============ TAMBAHKAN KE ANTREAN / DAFTAR PUTAR ============ -->
    <Transition name="sheet" :duration="{ enter: 320, leave: 240 }">
      <div v-if="pickerTrack" class="fixed inset-0 z-80">
        <div class="sheet-backdrop absolute inset-0 bg-black/60" @click="pickerTrack = null"></div>
        <div
          class="sheet absolute bottom-0 inset-x-0 max-h-[75dvh] flex flex-col rounded-t-2xl bg-[#16251e] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black md:bottom-auto md:top-1/2 md:left-1/2 md:inset-x-auto md:-translate-x-1/2 md:-translate-y-1/2 md:w-96 md:rounded-lg md:border md:border-white/10"
        >
          <div class="md:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-white/25"></div>
          <div class="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-white/10">
            <img :src="pickerTrack.thumbnail_url" class="w-11 h-11 rounded object-cover shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-xs text-[#a3b3aa]">Tambahkan ke</p>
              <p class="text-sm font-bold truncate">{{ pickerTrack.title }}</p>
            </div>
            <button @click="pickerTrack = null" aria-label="Tutup" class="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center"><X class="w-5 h-5" /></button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-thin p-3">
            <button @click="pickQueue" class="w-full flex items-center gap-3 p-2 rounded-md hover:bg-white/10 transition text-left">
              <div class="w-11 h-11 rounded bg-white/10 flex items-center justify-center shrink-0"><ListMusic class="w-5 h-5" /></div>
              <span class="text-sm font-medium">Antrean</span>
            </button>
            <button v-for="pl in player.playlists" :key="pl.id" @click="pickPlaylist(pl)" class="w-full flex items-center gap-3 p-2 rounded-md hover:bg-white/10 transition text-left">
              <div class="w-11 h-11 rounded overflow-hidden shrink-0 bg-linear-to-br from-teal-700 to-amber-300 flex items-center justify-center">
                <img v-if="pl.tracks[0]" :src="pl.tracks[0].thumbnail_url" class="w-full h-full object-cover" />
                <ListMusic v-else class="w-5 h-5 text-white" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">{{ pl.name }}</p>
                <p class="text-xs text-[#a3b3aa]">{{ pl.tracks.length }} lagu</p>
              </div>
              <Check v-if="player.isInPlaylist(pl.id, pickerTrack.video_id)" class="w-5 h-5 text-[#f5cf5b] shrink-0" />
            </button>
            <button @click="openCreate(pickerTrack)" class="w-full flex items-center gap-3 p-2 rounded-md hover:bg-white/10 transition text-left">
              <div class="w-11 h-11 rounded bg-white/10 flex items-center justify-center shrink-0"><Plus class="w-5 h-5" /></div>
              <span class="text-sm font-medium">Daftar putar baru</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ============ TIMER TIDUR ============ -->
    <Transition name="sheet" :duration="{ enter: 320, leave: 240 }">
      <div v-if="showSleep" class="fixed inset-0 z-80">
        <div class="sheet-backdrop absolute inset-0 bg-black/60" @click="showSleep = false"></div>
        <div
          class="sheet absolute bottom-0 inset-x-0 flex flex-col rounded-t-2xl bg-[#16251e] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black md:bottom-auto md:top-1/2 md:left-1/2 md:inset-x-auto md:-translate-x-1/2 md:-translate-y-1/2 md:w-80 md:rounded-lg md:border md:border-white/10"
        >
          <div class="md:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-white/25"></div>
          <div class="flex items-center justify-between px-5 pt-4 pb-2">
            <h3 class="text-lg font-bold flex items-center gap-2"><Moon class="w-5 h-5" /> Timer tidur</h3>
            <button @click="showSleep = false" aria-label="Tutup" class="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center"><X class="w-5 h-5" /></button>
          </div>
          <p v-if="sleepActive" class="px-5 pb-2 text-sm text-[#f5cf5b]">Aktif: {{ sleepLabel }}</p>
          <div class="p-3 pt-1">
            <button v-for="m in [15, 30, 45, 60]" :key="m" @click="startSleep(m)" class="w-full text-left px-3 py-3 rounded-md hover:bg-white/10 text-sm font-medium transition">{{ m }} menit</button>
            <button @click="sleepAfterTrack" class="w-full text-left px-3 py-3 rounded-md hover:bg-white/10 text-sm font-medium transition">Setelah lagu ini selesai</button>
            <button v-if="sleepActive" @click="cancelSleep" class="w-full text-left px-3 py-3 rounded-md hover:bg-white/10 text-sm font-bold text-red-300 transition">Matikan timer</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ============ DIALOG NAMA DAFTAR PUTAR ============ -->
    <Transition name="fade">
      <div v-if="dialog" class="fixed inset-0 z-80 flex items-center justify-center p-5">
        <div class="absolute inset-0 bg-black/70" @click="dialog = null"></div>
        <form @submit.prevent="submitDialog" class="relative w-full max-w-sm rounded-xl bg-[#16251e] p-5 shadow-2xl shadow-black border border-white/10">
          <h3 class="text-lg font-bold">{{ dialog.mode === 'create' ? 'Daftar putar baru' : 'Ganti nama daftar putar' }}</h3>
          <input
            ref="dialogInput"
            v-model="dialog.value"
            type="text"
            maxlength="60"
            placeholder="Nama daftar putar"
            class="mt-4 w-full h-11 rounded-md bg-[#1a2a23] border border-white/10 focus:border-white px-3 text-sm focus:outline-hidden placeholder-[#a3b3aa]"
          />
          <div class="flex justify-end gap-2 mt-5">
            <button type="button" @click="dialog = null" class="px-4 h-10 rounded-full text-sm font-bold hover:bg-white/10 transition">Batal</button>
            <button type="submit" :disabled="!dialog.value.trim()" class="px-5 h-10 rounded-full bg-[#f5cf5b] text-black text-sm font-bold hover:bg-[#ffe27a] disabled:opacity-40 disabled:pointer-events-none transition">Simpan</button>
          </div>
        </form>
      </div>
    </Transition>

    <!-- ============ TOAST ============ -->
    <Transition name="fade">
      <div
        v-if="toastMsg || player.playbackError"
        role="status"
        aria-live="polite"
        class="fixed left-1/2 -translate-x-1/2 bottom-40 md:bottom-28 z-90 max-w-[90vw] rounded-full bg-white text-black text-sm font-semibold px-5 py-2.5 shadow-xl shadow-black/50 text-center"
      >
        {{ toastMsg || player.playbackError }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Poles dasar */
.app {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.app ::selection {
  background: #f5cf5b;
  color: #000;
}
/* Tailwind v4 membuat tombol berkursor panah; kembalikan jadi tangan */
.app button:not(:disabled),
.app [role='button'] {
  cursor: pointer;
}
.app button {
  user-select: none;
  -webkit-user-select: none;
}
/* Cincin fokus untuk pengguna keyboard */
.app :is(button, a, input, [tabindex]):focus-visible {
  outline: 2px solid #f5cf5b;
  outline-offset: 2px;
}
.app input[type='text']:focus-visible {
  outline: none; /* kolom teks sudah punya border putih saat fokus */
}
.app input[type='range']:focus-visible {
  outline-offset: 4px;
}
/* Gambar yang gagal dimuat tampil sebagai kotak gelap, bukan ikon rusak */
.app img {
  -webkit-user-drag: none;
  background-color: rgba(255, 255, 255, 0.06);
  color: transparent;
}
.app {
  -webkit-tap-highlight-color: transparent;
  font-family: 'Circular Std', 'Figtree', 'Inter', 'Helvetica Neue', Arial, system-ui, sans-serif;
}

/* Slider ala Spotify: putih, jadi hijau saat di-hover; thumb muncul saat hover / sentuh */
.range {
  --fill: #fff;
  --p: 0%;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 9999px;
  outline: none;
  cursor: pointer;
  background: linear-gradient(to right, var(--fill) var(--p), rgba(255, 255, 255, 0.3) var(--p));
}
.range:hover,
.range:active {
  --fill: #f5cf5b;
}
.range-lg {
  height: 6px;
}
.range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.15s;
}
.range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 9999px;
  background: #fff;
  opacity: 0;
  transition: opacity 0.15s;
}
.range:hover::-webkit-slider-thumb,
.range:active::-webkit-slider-thumb,
.range-lg::-webkit-slider-thumb {
  opacity: 1;
}
.range:hover::-moz-range-thumb,
.range:active::-moz-range-thumb,
.range-lg::-moz-range-thumb {
  opacity: 1;
}
@media (hover: none) {
  .range::-webkit-slider-thumb {
    opacity: 1;
  }
  .range::-moz-range-thumb {
    opacity: 1;
  }
}

/* Hati di daftar: muncul saat hover (desktop), selalu terlihat di layar sentuh */
.reveal {
  opacity: 0;
  transition: opacity 0.15s;
}
.group:hover .reveal,
.reveal:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .reveal {
    opacity: 1;
  }
}

/* Bottom sheet: panel meluncur (transform saja, tetap solid), hanya latar gelap yang memudar */
.sheet-backdrop {
  transition: opacity 0.28s ease;
}
.sheet-enter-from .sheet-backdrop,
.sheet-leave-to .sheet-backdrop {
  opacity: 0;
}
.sheet {
  will-change: transform;
}
.sheet-enter-active .sheet {
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}
.sheet-leave-active .sheet {
  transition: transform 0.24s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s ease;
}
.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translate3d(0, 100%, 0);
}
@media (min-width: 768px) {
  .sheet-enter-from .sheet,
  .sheet-leave-to .sheet {
    transform: translate3d(0, 14px, 0);
    opacity: 0;
  }
}

/* Equalizer animasi untuk lagu yang sedang diputar */
.eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}
.eq i {
  display: block;
  width: 3px;
  height: 30%;
  border-radius: 2px;
  background: #f5cf5b;
  animation: eq 0.9s ease-in-out infinite;
}
.eq i:nth-child(2) {
  animation-delay: 0.2s;
}
.eq i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes eq {
  0%,
  100% {
    height: 30%;
  }
  50% {
    height: 100%;
  }
}

/* Transisi antar tab / overlay */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-leave-to {
  opacity: 0;
}

/* Transisi latar dinamis */
.ambient-enter-active,
.ambient-leave-active {
  transition: opacity 0.8s ease;
}
.ambient-enter-from,
.ambient-leave-to {
  opacity: 0;
}

/* Cover bergeser seperti carousel, tanpa opasitas, jadi tidak ada kilatan gelap */
.cover-next-enter-active,
.cover-next-leave-active,
.cover-prev-enter-active,
.cover-prev-leave-active {
  transition: transform 0.4s cubic-bezier(0.22, 0.8, 0.28, 1);
  will-change: transform;
  backface-visibility: hidden;
}
.cover-next-enter-from,
.cover-prev-leave-to {
  transform: translate3d(100%, 0, 0);
}
.cover-next-leave-to,
.cover-prev-enter-from {
  transform: translate3d(-100%, 0, 0);
}

/* Blur murah: gambar dirender kecil (1/16 piksel), diblur, lalu diperbesar 6x.
   Tampilannya mirip scale-150 + blur-3xl, tapi jauh lebih ringan di HP. */
.ambient-blur {
  position: absolute;
  left: 37.5%;
  top: 37.5%;
  width: 25%;
  height: 25%;
  object-fit: cover;
  transform: scale(6);
  filter: blur(12px) saturate(1.5);
  will-change: opacity;
  backface-visibility: hidden;
}

/* Fade atas-bawah pada daftar lirik */
.lyrics-mask {
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
}

/* Kaca */
.glass {
  background: rgba(255, 255, 255, 0.11);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Cahaya aurora bergerak (ringan: hanya gradien + transform) */
.aurora {
  position: absolute;
  inset: 0;
  overflow: hidden;
  opacity: 0.5;
  contain: strict;
}
.aurora span {
  position: absolute;
  width: 60vmax;
  height: 60vmax;
  border-radius: 50%;
  will-change: transform;
  animation: drift 28s ease-in-out infinite alternate;
}
.aurora span:nth-child(1) {
  background: radial-gradient(circle, rgba(245, 207, 91, 0.35), transparent 60%);
  top: -25%;
  left: -35%;
}
.aurora span:nth-child(2) {
  background: radial-gradient(circle, rgba(45, 212, 191, 0.28), transparent 60%);
  bottom: -30%;
  right: -40%;
  animation-duration: 36s;
  animation-direction: alternate-reverse;
}
@keyframes drift {
  to {
    transform: translate3d(12%, 8%, 0) scale(1.15);
  }
}

/* Cover: bercahaya (statis, ukuran tidak berubah saat play / jeda) */
.cover-glow {
  position: absolute;
  inset: 6% 4% -4%;
  width: 92%;
  height: 92%;
  object-fit: cover;
  border-radius: 1.25rem;
  filter: blur(28px) saturate(1.6);
  opacity: 0.7;
  pointer-events: none;
}
.cover-frame {
  box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.7);
}

/* Tombol putar emas dengan cahaya */
.play-glow {
  color: #1a1400;
  background: linear-gradient(135deg, #ffe27a, #f5cf5b 55%, #e0a82e);
  box-shadow: 0 10px 30px -6px rgba(245, 207, 91, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

/* Scrollbar */
.scroll-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
}
.no-scrollbar {
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .eq i {
    animation: none;
  }
  .aurora span {
    animation: none;
  }
  .app *,
  .app *::before,
  .app *::after {
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
</style>
