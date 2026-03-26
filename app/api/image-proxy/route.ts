import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return new Response('Missing url', { status: 400 })

  try {
    const decoded = decodeURIComponent(url)
    const res = await fetch(decoded, {
      headers: {
        // Spoof a browser-like request so CDNs don't block us
        Referer: decoded.includes('tiktok') ? 'https://www.tiktok.com/' : 'https://www.instagram.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/webp,image/avif,image/apng,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    })
    if (!res.ok) return new Response('Image not found', { status: res.status })
    const buffer = await res.arrayBuffer()
    return new Response(buffer, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new Response('Failed to fetch image', { status: 500 })
  }
}
