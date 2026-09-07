import { getJson, postWebhook, loadState, saveState, log } from '../lib.js'

const API = 'https://api.star-citizen.wiki/api/comm-links?limit=15'

function excerpt(item) {
  const text = item.translations?.en_EN || ''
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 350 ? clean.slice(0, 347) + '…' : clean
}

export async function commLinks(feed) {
  const { data = [] } = await getJson(API)
  const state = await loadState('commLinks')
  const seen = new Set(state.seen || [])
  const firstRun = seen.size === 0

  // API returns newest first; post oldest→newest so the channel reads in order.
  const fresh = data
    .filter(it => !seen.has(it.id))
    .filter(it => {
      if (!feed.filter.length) return true
      const hay = `${it.title} ${it.channel} ${it.category}`.toLowerCase()
      return feed.filter.some(f => hay.includes(f.toLowerCase()))
    })
    .reverse()

  for (const id of data.map(d => d.id)) seen.add(id)
  await saveState('commLinks', { seen: [...seen].slice(-200), at: new Date().toISOString() })

  if (firstRun) { log(`commLinks: baseline stored (${seen.size} ids)`); return }

  for (const it of fresh) {
    await postWebhook(feed.webhook, {
      embeds: [{
        title: it.title,
        url: it.rsi_url,
        description: excerpt(it),
        color: 0xc9a227,
        footer: { text: `RSI Comm-Link · ${it.channel}${it.category && it.category !== 'Undefined' ? ' · ' + it.category : ''}` },
      }],
    })
    log(`commLinks: posted "${it.title}"`)
  }
}
