import { NextRequest } from 'next/server'

const APIFY_TOKEN = process.env.APIFY_API_KEY

async function startRun(actorId: string, input: object) {
  const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${APIFY_TOKEN}`,
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`Apify start run failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return { runId: json.data.id as string, datasetId: json.data.defaultDatasetId as string }
}

async function pollRun(runId: string, datasetId: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
    })
    const json = await res.json()
    const { status, defaultDatasetId } = json.data
    if (status === 'SUCCEEDED') return defaultDatasetId || datasetId
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Apify run ${status}`)
    }
  }
  throw new Error('Run timed out after 2 minutes')
}

async function getItems(datasetId: string): Promise<any[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?limit=20`,
    { headers: { Authorization: `Bearer ${APIFY_TOKEN}` } }
  )
  if (!res.ok) throw new Error(`Failed to fetch dataset: ${res.status}`)
  return res.json()
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function processTikTok(username: string, items: any[]) {
  if (!items.length) return null
  const author = items[0]?.authorMeta || {}
  const videos = items.map((item: any) => ({
    id: item.id || String(Math.random()),
    thumbnail: item.covers?.default || item.video?.cover || item.imageUrl || '',
    videoUrl: item.video?.downloadAddr || '',
    postUrl: item.webVideoUrl || `https://www.tiktok.com/@${username}`,
    views: item.playCount || 0,
    likes: item.diggCount || 0,
    comments: item.commentCount || 0,
    shares: item.shareCount || 0,
    caption: (item.text || '').slice(0, 120),
  }))
  const totalViews = videos.reduce((s: number, v: any) => s + v.views, 0)
  return {
    username: username.replace('@', ''),
    platform: 'tiktok',
    displayName: author.nickName || author.name || username,
    profilePic: author.avatar || '',
    followers: author.fans || 0,
    totalLikes: author.heart || 0,
    totalViews,
    avgViews: videos.length ? Math.round(totalViews / videos.length) : 0,
    postCount: videos.length,
    videos,
  }
}

function processInstagram(username: string, items: any[]) {
  if (!items.length) return null
  const profile = items.find((i: any) => i.followersCount !== undefined || i.type === 'user') || {}
  const posts = items.filter((i: any) => i.displayUrl || i.videoUrl || i.imageUrl)
  const videos = posts.map((item: any) => ({
    id: item.id || item.shortCode || String(Math.random()),
    thumbnail: item.displayUrl || item.thumbnailUrl || item.imageUrl || '',
    videoUrl: item.videoUrl || '',
    postUrl: item.url || item.postUrl || `https://www.instagram.com/${username}/`,
    views: item.videoViewCount || 0,
    likes: item.likesCount || 0,
    comments: item.commentsCount || 0,
    shares: 0,
    caption: (item.caption || '').slice(0, 120),
    isVideo: item.isVideo || !!item.videoUrl,
  }))
  const videoItems = videos.filter((v: any) => v.isVideo)
  const totalViews = videoItems.reduce((s: number, v: any) => s + v.views, 0)
  return {
    username: username.replace('@', ''),
    platform: 'instagram',
    displayName: profile.fullName || profile.name || username,
    profilePic: profile.profilePicUrlHD || profile.profilePicUrl || '',
    followers: profile.followersCount || 0,
    totalLikes: posts.reduce((s: number, p: any) => s + (p.likesCount || 0), 0),
    totalViews,
    avgViews: videoItems.length ? Math.round(totalViews / videoItems.length) : 0,
    postCount: posts.length,
    videos,
  }
}

export async function POST(request: NextRequest) {
  if (!APIFY_TOKEN) {
    return Response.json({ error: 'APIFY_API_KEY not set in .env.local' }, { status: 500 })
  }
  const { username, platform } = await request.json()
  try {
    if (platform === 'tiktok') {
      const { runId, datasetId } = await startRun('clockworks~tiktok-scraper', {
        profiles: [`https://www.tiktok.com/@${username.replace('@', '')}`],
        resultsType: 'videos',
        resultsPerPage: 12,
      })
      const finalDatasetId = await pollRun(runId, datasetId)
      const items = await getItems(finalDatasetId)
      const data = processTikTok(username, items)
      if (!data) return Response.json({ error: 'No data returned from Apify' }, { status: 404 })
      return Response.json(data)
    } else {
      const { runId, datasetId } = await startRun('apify~instagram-scraper', {
        usernames: [username.replace('@', '')],
        resultsType: 'posts',
        resultsLimit: 12,
      })
      const finalDatasetId = await pollRun(runId, datasetId)
      const items = await getItems(finalDatasetId)
      const data = processInstagram(username, items)
      if (!data) return Response.json({ error: 'No data returned from Apify' }, { status: 404 })
      return Response.json(data)
    }
  } catch (err: any) {
    return Response.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
