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
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
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

// Runs an actor and returns dataset items — returns [] on any failure (non-blocking)
async function runAndGetItems(actorId: string, input: object): Promise<any[]> {
  try {
    const { runId, datasetId } = await startRun(actorId, input)
    const finalDatasetId = await pollRun(runId, datasetId)
    return await getItems(finalDatasetId)
  } catch {
    return []
  }
}

function processTikTok(username: string, items: any[]) {
  if (!items.length) return null
  const author = items[0]?.authorMeta || {}
  const videos = items.map((item: any) => ({
    id: item.id || String(Math.random()),
    // Try multiple cover fields — some versions use different keys
    thumbnail: item.covers?.origin || item.covers?.default || item.video?.cover || item.imageUrl || '',
    videoUrl: item.video?.downloadAddr || item.videoMeta?.downloadAddr || '',
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

// Instagram: profile items from "details" scrape + post items from "posts" scrape
function processInstagram(username: string, profileItems: any[], postItems: any[]) {
  const profile = profileItems[0] || {}
  const posts = postItems.filter((i: any) => i.displayUrl || i.videoUrl || i.images?.length)

  const videos = posts.map((item: any) => ({
    id: item.id || item.shortCode || String(Math.random()),
    thumbnail: item.displayUrl || item.images?.[0]?.src || item.thumbnailUrl || '',
    videoUrl: item.videoUrl || '',
    postUrl: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : `https://www.instagram.com/${username}/`),
    views: item.videoViewCount || 0,
    likes: item.likesCount || 0,
    comments: item.commentsCount || 0,
    shares: 0,
    caption: (item.caption || '').slice(0, 120),
    isVideo: !!item.videoUrl || item.productType === 'clips' || item.productType === 'reel' || item.isVideo === true,
  }))

  const videoItems = videos.filter((v: any) => v.isVideo)
  const totalViews = videoItems.reduce((s: number, v: any) => s + v.views, 0)

  // Fall back to extracting display name from post metadata if profile scrape returned nothing
  const displayName = profile.fullName || profile.name || postItems[0]?.ownerFullName || username
  const profilePic = profile.profilePicUrlHD || profile.profilePicUrl || ''
  const followers = profile.followersCount || 0

  return {
    username: username.replace('@', ''),
    platform: 'instagram',
    displayName,
    profilePic,
    followers,
    totalLikes: posts.reduce((s: number, p: any) => s + (p.likesCount || 0), 0),
    totalViews,
    avgViews: videoItems.length ? Math.round(totalViews / videoItems.length) : 0,
    postCount: posts.length,
    videos,
  }
}

// Strip URLs down to bare username server-side as a safety net
function extractUsername(raw: string): string {
  const s = (raw || '').trim()
  try {
    const url = new URL(s.startsWith('http') ? s : `https://x.com/${s}`)
    const seg = url.pathname.split('/').filter(Boolean)[0] || ''
    return seg.replace('@', '')
  } catch {
    return s.replace('@', '').split('?')[0].split('/')[0]
  }
}

export async function POST(request: NextRequest) {
  // Outer safety net — guarantees we never return a raw 503
  try {
    if (!APIFY_TOKEN) {
      return Response.json({ error: 'APIFY_API_KEY not set in .env.local' }, { status: 500 })
    }
    let body: any
    try { body = await request.json() } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const username = extractUsername(body.username || '')
    const platform = body.platform
    if (!username) return Response.json({ error: 'No username provided' }, { status: 400 })

    if (platform === 'tiktok') {
      const { runId, datasetId } = await startRun('clockworks~tiktok-scraper', {
        profiles: [`https://www.tiktok.com/@${username}`],
        resultsType: 'videos',
        resultsPerPage: 12,
      })
      const finalDatasetId = await pollRun(runId, datasetId)
      const items = await getItems(finalDatasetId)
      const data = processTikTok(username, items)
      if (!data) return Response.json({ error: 'No data returned — account may be private or not found' }, { status: 404 })
      return Response.json(data)
    } else {
      // Run profile + posts in parallel — profile gives followers, posts give content
      const [profileItems, postItems] = await Promise.all([
        runAndGetItems('apify~instagram-scraper', {
          directUrls: [`https://www.instagram.com/${username}/`],
          resultsType: 'details',
          resultsLimit: 1,
        }),
        runAndGetItems('apify~instagram-scraper', {
          directUrls: [`https://www.instagram.com/${username}/`],
          resultsType: 'posts',
          resultsLimit: 12,
        }),
      ])
      const data = processInstagram(username, profileItems, postItems)
      return Response.json(data)
    }
  } catch (err: any) {
    return Response.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
