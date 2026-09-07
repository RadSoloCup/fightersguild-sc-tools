import { getJson, postWebhook, loadState, saveState, log } from '../lib.js'
import { config } from '../config.js'

const COLOR = 0x5b8def

function trimBody(body) {
  const clean = String(body || '').replace(/\r/g, '').trim()
  if (!clean) return null
  return clean.length > 600 ? clean.slice(0, 597) + '…' : clean
}

async function checkRepo(repo, feed, state) {
  const releases = await getJson(
    `https://api.github.com/repos/${repo}/releases?per_page=10`,
    { headers: { accept: 'application/vnd.github+json' } }
  )
  const list = (Array.isArray(releases) ? releases : [])
    .filter(r => !r.draft && (feed.includePrereleases || !r.prerelease))
  if (!list.length) return

  const seen = new Set(state.seen?.[repo] || [])
  const firstRun = seen.size === 0

  // oldest → newest so the channel reads in order
  const fresh = list.filter(r => !seen.has(r.id)).reverse()
  for (const r of list) seen.add(r.id)
  state.seen = { ...state.seen, [repo]: [...seen].slice(-50) }

  if (firstRun) {
    log(`githubReleases: baseline for ${repo} (latest ${list[0].tag_name})`)
    return
  }

  for (const r of fresh) {
    await postWebhook(feed.webhook, {
      username: repo.split('/')[1],
      embeds: [{
        title: `${r.name || r.tag_name}${r.prerelease ? ' (pre-release)' : ''}`,
        url: r.html_url,
        description: trimBody(r.body),
        color: COLOR,
        footer: { text: `${repo} · new release` },
        timestamp: r.published_at || new Date().toISOString(),
      }],
    })
    log(`githubReleases: posted ${repo} ${r.tag_name}`)
  }
}

export async function githubReleases(feed) {
  const state = await loadState('githubReleases')
  for (const repo of feed.repos) {
    try {
      await checkRepo(repo, feed, state)
    } catch (err) {
      log(`githubReleases: ${repo} ERROR ${err.message}`)
    }
  }
  await saveState('githubReleases', { ...state, at: new Date().toISOString() })
}
