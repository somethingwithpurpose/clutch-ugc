'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'instagram' | 'tiktok'

interface VideoItem {
  id: string
  thumbnail: string
  videoUrl: string
  postUrl: string
  views: number
  likes: number
  comments: number
  shares: number
  caption: string
  isVideo?: boolean
}

interface AccountData {
  username: string
  platform: Platform
  displayName: string
  profilePic: string
  followers: number
  totalLikes: number
  totalViews: number
  avgViews: number
  postCount: number
  videos: VideoItem[]
}

type AccountStatus = 'idle' | 'loading' | 'done' | 'error'

interface AccountState {
  username: string
  platform: Platform
  data: AccountData | null
  status: AccountStatus
  error: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_IG = ['', '', '', '']
const DEFAULT_TT = ['', '', '', '']
const IG_GRADIENT = 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)'
const TT_COLOR = '#69C9D0'
const HANDLES_KEY = 'ugc-handles'
const CACHE_KEY = 'ugc-dashboard-v2'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function proxyImg(url: string): string {
  if (!url) return ''
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

function cleanHandle(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  try {
    const url = new URL(s.startsWith('http') ? s : `https://x.com/${s}`)
    const seg = url.pathname.split('/').filter(Boolean)[0] || ''
    return seg.replace('@', '')
  } catch {
    return s.replace('@', '').split('?')[0].split('/')[0]
  }
}

// ─── ProfilePic ───────────────────────────────────────────────────────────────

function ProfilePic({ src, username, accent, isIG }: { src: string; username: string; accent: string; isIG: boolean }) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      <img
        src={proxyImg(src)}
        alt=""
        className="w-9 h-9 rounded-full object-cover border-2"
        style={{ borderColor: accent }}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-none"
      style={{ background: isIG ? IG_GRADIENT : '#111', color: accent, border: `2px solid ${accent}` }}
    >
      {username.charAt(0).toUpperCase()}
    </div>
  )
}

// ─── VideoThumb ───────────────────────────────────────────────────────────────
// Tries: proxy img → <video> first frame → gradient placeholder

function VideoThumb({ thumbnail, videoUrl }: { thumbnail: string; videoUrl: string }) {
  const [imgFailed, setImgFailed] = useState(false)

  if (thumbnail && !imgFailed) {
    return (
      <img
        src={proxyImg(thumbnail)}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setImgFailed(true)}
      />
    )
  }

  if (videoUrl) {
    return (
      <video
        src={`${videoUrl}#t=0.5`}
        muted
        playsInline
        preload="metadata"
        className="w-full h-full object-cover"
      />
    )
  }

  return (
    <div
      className="w-full h-full"
      style={{ background: 'linear-gradient(135deg, #18181b, #27272a)' }}
    />
  )
}

// ─── VideoModal ───────────────────────────────────────────────────────────────

function VideoModal({ video, platform, onClose }: { video: VideoItem; platform: Platform; onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="relative z-10 w-full max-w-sm mx-4 bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-700 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-zinc-400 hover:text-white transition-colors"
        >
          ✕
        </button>
        <div className="relative bg-black aspect-[9/16]">
          {video.videoUrl ? (
            <video
              src={video.videoUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain"
              onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none' }}
            />
          ) : (
            <VideoThumb thumbnail={video.thumbnail} videoUrl="" />
          )}
        </div>
        <div className="p-4 space-y-3">
          {video.caption && (
            <p className="text-sm text-zinc-300 leading-relaxed line-clamp-3">{video.caption}</p>
          )}
          <div className="flex gap-4 text-sm font-mono">
            <span className="text-white font-semibold">{fmt(video.views)} views</span>
            <span className="text-zinc-400">{fmt(video.likes)} likes</span>
            <span className="text-zinc-400">{fmt(video.comments)} comments</span>
          </div>
          <a
            href={video.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: platform === 'instagram' ? IG_GRADIENT : undefined,
              backgroundColor: platform === 'tiktok' ? '#111' : undefined,
              color: platform === 'tiktok' ? TT_COLOR : '#fff',
              border: platform === 'tiktok' ? `1px solid ${TT_COLOR}33` : 'none',
            }}
          >
            View on {platform === 'instagram' ? 'Instagram' : 'TikTok'} ↗
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── VideoStrip ───────────────────────────────────────────────────────────────

function VideoStrip({ videos, platform, onSelect }: { videos: VideoItem[]; platform: Platform; onSelect: (v: VideoItem) => void }) {
  if (!videos.length) return null
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
      {videos.map(v => (
        <button
          key={v.id}
          onClick={() => onSelect(v)}
          className="relative flex-none w-24 aspect-[9/16] rounded-xl overflow-hidden group bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-all hover:scale-[1.03]"
        >
          <VideoThumb thumbnail={v.thumbnail} videoUrl={v.videoUrl} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <span className="text-white text-lg">▶</span>
            </div>
          </div>
          <div className="absolute bottom-1 left-0 right-0 px-1">
            <span className="text-white text-[10px] font-mono font-semibold drop-shadow">{fmt(v.views)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 min-w-[90px]">
      <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">{label}</span>
      <span className="font-mono font-bold text-base leading-tight" style={{ color: accent || '#fff' }}>{value}</span>
    </div>
  )
}

// ─── AccountCard ─────────────────────────────────────────────────────────────

function AccountCard({ account, onRefresh }: { account: AccountState; onRefresh: () => void }) {
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null)
  const { data, status, error, platform, username } = account
  const isIG = platform === 'instagram'
  const accent = isIG ? '#E1306C' : TT_COLOR

  return (
    <>
      {selectedVideo && (
        <VideoModal video={selectedVideo} platform={platform} onClose={() => setSelectedVideo(null)} />
      )}
      <div
        className="rounded-2xl border bg-zinc-900 overflow-hidden flex flex-col"
        style={{ borderColor: status === 'done' ? `${accent}33` : '#27272a' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <ProfilePic src={data?.profilePic || ''} username={username} accent={accent} isIG={isIG} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm truncate">@{username}</span>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold flex-none"
                  style={{ background: `${accent}22`, color: accent }}
                >
                  {isIG ? 'IG' : 'TT'}
                </span>
              </div>
              {data?.displayName && data.displayName !== username && (
                <p className="text-zinc-500 text-xs truncate">{data.displayName}</p>
              )}
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={status === 'loading'}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed p-1 rounded flex-none ml-2"
            title="Refresh"
          >
            <span className={status === 'loading' ? 'inline-block animate-spin' : ''}>↻</span>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {status === 'loading' && (
            <div className="flex flex-col gap-2 py-4">
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <span className="inline-block w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                Fetching data…
              </div>
              <div className="flex gap-2 overflow-hidden">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex-none w-24 aspect-[9/16] rounded-xl bg-zinc-800 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center justify-between py-3 px-3 text-sm text-red-400 bg-red-500/10 rounded-lg border border-red-500/20">
              <span>{error}</span>
              <button onClick={onRefresh} className="text-red-400 hover:text-red-300 ml-3 flex-none font-medium">Retry</button>
            </div>
          )}

          {status === 'idle' && (
            <p className="text-zinc-600 text-sm py-2">Hit ↻ to load data.</p>
          )}

          {status === 'done' && data && (
            <>
              <div className="flex flex-wrap gap-2">
                <StatPill label="Followers" value={fmt(data.followers)} accent={accent} />
                <StatPill label="Total Views" value={fmt(data.totalViews)} />
                <StatPill label="Avg Views" value={fmt(data.avgViews)} />
                <StatPill label="Posts" value={String(data.postCount)} />
              </div>
              <VideoStrip videos={data.videos} platform={platform} onSelect={setSelectedVideo} />
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [igHandles, setIgHandles] = useState<string[]>(DEFAULT_IG)
  const [ttHandles, setTtHandles] = useState<string[]>(DEFAULT_TT)
  const [accounts, setAccounts] = useState<AccountState[]>([])
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // On mount: restore handles + cached dashboard data
  useEffect(() => {
    try {
      const savedHandles = localStorage.getItem(HANDLES_KEY)
      if (savedHandles) {
        const { ig, tt } = JSON.parse(savedHandles)
        if (ig) setIgHandles(ig)
        if (tt) setTtHandles(tt)
      }
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed: AccountState[] = JSON.parse(cached)
        // Restore done accounts as-is; reset anything still loading/error back to idle
        const restored = parsed.map(a => ({
          ...a,
          status: a.status === 'done' ? ('done' as const) : ('idle' as const),
          error: null,
        }))
        setAccounts(restored)
        setSettingsOpen(false)
      }
    } catch {}
  }, [])

  const saveToCache = useCallback((accs: AccountState[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(accs))
      setSavedAt(new Date())
    } catch {}
  }, [])

  const buildAccounts = useCallback((ig: string[], tt: string[]): AccountState[] => {
    const all: AccountState[] = []
    ig.forEach(u => {
      const clean = cleanHandle(u)
      if (clean) all.push({ username: clean, platform: 'instagram', data: null, status: 'idle', error: null })
    })
    tt.forEach(u => {
      const clean = cleanHandle(u)
      if (clean) all.push({ username: clean, platform: 'tiktok', data: null, status: 'idle', error: null })
    })
    return all
  }, [])

  const fetchAccount = useCallback(async (username: string, platform: Platform, index: number, attempt = 0) => {
    setAccounts(prev => prev.map((a, i) => i === index ? { ...a, status: 'loading', error: null } : a))
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, platform }),
      })
      const text = await res.text()
      // Auto-retry up to 2x on 503
      if (res.status === 503 && attempt < 2) {
        await new Promise(r => setTimeout(r, 3000 + attempt * 2000))
        return fetchAccount(username, platform, index, attempt + 1)
      }
      let json: any
      try { json = JSON.parse(text) } catch { throw new Error(`Server error (${res.status})`) }
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
      setAccounts(prev => {
        const updated = prev.map((a, i) => i === index ? { ...a, status: 'done' as const, data: json, error: null } : a)
        saveToCache(updated)
        return updated
      })
    } catch (err: any) {
      setAccounts(prev => prev.map((a, i) => i === index ? { ...a, status: 'error', error: err.message } : a))
    }
  }, [saveToCache])

  const handleLoad = () => {
    localStorage.setItem(HANDLES_KEY, JSON.stringify({ ig: igHandles, tt: ttHandles }))
    const accs = buildAccounts(igHandles, ttHandles)
    setAccounts(accs)
    setSettingsOpen(false)
    accs.forEach((a, i) => fetchAccount(a.username, a.platform, i))
  }

  const handleSave = () => saveToCache(accounts)

  const igAccounts = accounts.filter(a => a.platform === 'instagram')
  const ttAccounts = accounts.filter(a => a.platform === 'tiktok')
  const totalViews = accounts.reduce((s, a) => s + (a.data?.totalViews || 0), 0)
  const allDone = accounts.length > 0 && accounts.every(a => a.status === 'done' || a.status === 'error')

  return (
    <div className="min-h-screen bg-[#08080E] text-white font-sans">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-zinc-500 text-xs font-mono uppercase tracking-widest">Clutch UGC</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Creator Dashboard</h1>
            {totalViews > 0 && (
              <p className="text-zinc-500 text-sm mt-0.5 font-mono">
                {fmt(totalViews)} total views across {accounts.filter(a => a.data).length} accounts
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-none">
            {/* Save button — shown when there's data to save */}
            {accounts.some(a => a.status === 'done') && (
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors"
                style={{ borderColor: '#22d3ee44', color: '#22d3ee' }}
              >
                <span>💾</span>
                <span>{savedAt ? 'Saved ✓' : 'Save'}</span>
              </button>
            )}
            <button
              onClick={() => setSettingsOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors text-sm"
            >
              <span>{settingsOpen ? '↑' : '⚙'}</span>
              <span>{settingsOpen ? 'Collapse' : 'Edit Accounts'}</span>
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {settingsOpen && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-widest" style={{ background: 'linear-gradient(135deg, #833ab422, #fd1d1d22)', color: '#fd1d1d' }}>
                    Instagram
                  </span>
                  <span className="text-zinc-600 text-xs">up to 4 accounts</span>
                </div>
                {igHandles.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-zinc-600 font-mono text-sm w-4 text-right">{i + 1}</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">@</span>
                      <input
                        type="text"
                        value={h}
                        onChange={e => setIgHandles(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                        placeholder={`instagram_handle_${i + 1}`}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2 pl-7 pr-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-widest" style={{ background: `${TT_COLOR}22`, color: TT_COLOR }}>
                    TikTok
                  </span>
                  <span className="text-zinc-600 text-xs">up to 4 accounts</span>
                </div>
                {ttHandles.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-zinc-600 font-mono text-sm w-4 text-right">{i + 1}</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">@</span>
                      <input
                        type="text"
                        value={h}
                        onChange={e => setTtHandles(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                        placeholder={`tiktok_handle_${i + 1}`}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2 pl-7 pr-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleLoad}
              className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Load Dashboard →
            </button>
          </div>
        )}

        {/* Account grid */}
        {accounts.length > 0 && (
          <div className="space-y-6">
            {igAccounts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: 'linear-gradient(135deg, #833ab444, #fd1d1d44)', color: '#fd1d1d' }}>
                    Instagram
                  </span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {igAccounts.map(acc => (
                    <AccountCard
                      key={`ig-${acc.username}`}
                      account={acc}
                      onRefresh={() => fetchAccount(acc.username, acc.platform, accounts.indexOf(acc))}
                    />
                  ))}
                </div>
              </div>
            )}

            {ttAccounts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: `${TT_COLOR}22`, color: TT_COLOR }}>
                    TikTok
                  </span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ttAccounts.map(acc => (
                    <AccountCard
                      key={`tt-${acc.username}`}
                      account={acc}
                      onRefresh={() => fetchAccount(acc.username, acc.platform, accounts.indexOf(acc))}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {accounts.length === 0 && !settingsOpen && (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-4xl mb-3 opacity-20">◉</p>
            <p className="text-sm">No accounts loaded. Open settings to add some.</p>
          </div>
        )}
      </div>
    </div>
  )
}
