import { getJson, postWebhook, loadState, saveState, log } from '../lib.js'

const API = 'https://api.star-citizen.wiki/api/stats'

const usd = n => '$' + Math.round(n).toLocaleString('en-US')

export async function funding(feed) {
  const { data = [] } = await getJson(API)
  const latest = data[0]
  if (!latest) return
  const funds = Number(latest.funds)
  if (!Number.isFinite(funds)) return

  const step = feed.stepUsd
  const milestone = Math.floor(funds / step) * step

  const prev = await loadState('funding')
  if (prev.milestone === undefined) {
    await saveState('funding', { milestone, funds, at: latest.timestamp })
    log(`funding: baseline ${usd(funds)}`)
    return
  }
  if (milestone <= prev.milestone) return
  await saveState('funding', { milestone, funds, at: latest.timestamp })

  await postWebhook(feed.webhook, {
    embeds: [{
      title: `Star Citizen crowdfunding passed ${usd(milestone)}`,
      url: 'https://robertsspaceindustries.com/funding-goals',
      description: `Current total: **${usd(funds)}**\nBackers: ${Number(latest.fans).toLocaleString('en-US')}`,
      color: 0x3fbf5f,
      timestamp: new Date().toISOString(),
    }],
  })
  log(`funding: posted milestone ${usd(milestone)}`)
}
