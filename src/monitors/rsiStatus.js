import { getJson, postWebhook, loadState, saveState, log } from '../lib.js'

const URL = 'https://status.robertsspaceindustries.com/index.json'
const COLOR = { operational: 0x3fbf5f, degraded: 0xd9a441, partial: 0xd9a441, major: 0xe0483d, maintenance: 0x5b8def }

function pickColor(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('operational')) return COLOR.operational
  if (s.includes('maintenance')) return COLOR.maintenance
  if (s.includes('major') || s.includes('outage') || s.includes('down')) return COLOR.major
  return COLOR.degraded
}

export async function rsiStatus(feed) {
  const data = await getJson(URL)
  const summary = data.summaryStatus || data.status || 'unknown'
  const systems = (data.systems || []).map(s => ({
    name: s.name,
    status: s.status || (s.unresolvedIssues?.length ? 'issue' : 'operational'),
    issues: (s.unresolvedIssues || []).map(i => i.title || i.name).filter(Boolean),
  }))

  const fingerprint = JSON.stringify({ summary, systems })
  const prev = await loadState('rsiStatus')
  if (prev.fingerprint === fingerprint) return
  const firstRun = !prev.fingerprint
  await saveState('rsiStatus', { fingerprint, at: new Date().toISOString() })
  if (firstRun) { log('rsiStatus: baseline stored'); return }

  const fields = systems.map(s => ({
    name: s.name,
    value: s.issues.length ? `⚠️ ${s.issues.join('; ')}` : `✅ ${s.status}`,
    inline: true,
  }))

  await postWebhook(feed.webhook, {
    embeds: [{
      title: `RSI status: ${summary}`,
      url: 'https://status.robertsspaceindustries.com/',
      color: pickColor(summary),
      fields,
      timestamp: new Date().toISOString(),
    }],
  })
  log(`rsiStatus: posted (${summary})`)
}
