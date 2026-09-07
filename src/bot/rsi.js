import { config } from '../config.js'

// RSI has no public API. The citizen page is public HTML — parse what we need.
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

function field(html, label) {
  const re = new RegExp(`${label}</span>\\s*<strong class="value">([\\s\\S]*?)</strong>`, 'i')
  const m = html.match(re)
  return m ? strip(m[1]) : null
}

export async function lookupCitizen(handle) {
  const h = String(handle).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
  if (!h) return null
  const res = await fetch(`https://robertsspaceindustries.com/en/citizens/${h}`, {
    headers: { 'user-agent': config.userAgent, accept: 'text/html' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  })
  if (res.status === 404) return { notFound: true, handle: h }
  if (!res.ok) throw new Error(`RSI ${res.status}`)
  const html = await res.text()
  if (/citizen not found/i.test(html) || !/profile-content/i.test(html + '')) {
    // fall through — try to parse anyway
  }

  const displayName = strip((html.match(/<div class="info">[\s\S]*?<strong class="value">([^<]+)/) || [])[1])
  const handleReal = strip((html.match(/@([A-Za-z0-9_-]+)<\/span>/) || html.match(/<span class="nick">([^<]+)/) || [])[1])
  const avatar = (html.match(/<div class="thumb">\s*<img src="([^"]+)"/) || [])[1]
  const bio = strip((html.match(/<div class="entry bio">[\s\S]*?<div class="value">([\s\S]*?)<\/div>/) || [])[1])
  const orgName = strip((html.match(/<a[^>]+href="\/orgs\/[^"]+"[^>]*>\s*([^<]+?)\s*<\/a>/) || [])[1])
  const orgRedacted = /Main organization[\s\S]{0,400}REDACTED/i.test(html)

  return {
    handle: handleReal || h,
    displayName: displayName || null,
    enlisted: field(html, 'Enlisted'),
    location: field(html, 'Location'),
    fluency: field(html, 'Fluency'),
    org: orgRedacted ? 'Redacted' : (orgName || null),
    bio: bio || null,
    avatar: avatar && avatar.startsWith('http') ? avatar : (avatar ? `https://robertsspaceindustries.com${avatar}` : null),
    url: `https://robertsspaceindustries.com/en/citizens/${handleReal || h}`,
  }
}
