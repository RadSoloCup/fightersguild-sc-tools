import { getJson } from '../lib.js'
import { config } from '../config.js'
import { findItems, itemLocations } from './uexItems.js'
import { uexJson, findCommodity, findVehicle, vehicleNames, placeLabel } from './uex.js'
import { calc } from './calc.js'
import { handleJob, JOB_TEMPLATE } from './jobBoard.js'
import { findBlueprints, findMissions, findWikelo, factionMissions, factionRep } from './scmdb.js'
import { lookupCitizen } from './rsi.js'

const GOLD = 0xc9a227
const GREEN = 0x3fbf5f
const RED = 0xe0483d

const num = n => Number(n).toLocaleString('en-US')
const auec = n => num(Math.round(n)) + ' aUEC'
const p = () => config.bot.prefix

export function parseCommand(content) {
  if (typeof content !== 'string') return null
  const trimmed = content.trim()
  const prefix = config.bot.prefix
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return null
  const rest = trimmed.slice(prefix.length).trim()
  const m = rest.match(/^(\S+)([\s\S]*)$/)
  const cmd = (m ? m[1] : 'help').toLowerCase()
  const rawArg = m ? m[2].trim() : '' // preserves newlines (job board needs them)
  return { cmd, arg: rawArg.replace(/\s+/g, ' '), rawArg, args: rawArg.split(/\s+/).filter(Boolean) }
}

// ── helpers ────────────────────────────────────────────────────────────────

function disambig(matches, key = 'name') {
  const names = [...new Set(matches.slice(0, 12).map(m => m[key]))]
  return { content: `${matches.length} matches — be more specific:\n${names.map(n => `• ${n}`).join('\n')}` }
}

async function resolveVehicle(arg) {
  const matches = await findVehicle(arg)
  if (!matches.length) return { error: `No ship matching "${arg}".` }
  if (matches.length > 1 && matches[0].name.toLowerCase() !== arg.trim().toLowerCase()) {
    return { list: disambig(matches) }
  }
  return { v: matches[0] }
}

async function resolveCommodity(arg) {
  const matches = await findCommodity(arg)
  if (!matches.length) return { error: `No commodity matching "${arg}".` }
  if (matches.length > 1 && matches[0].name.toLowerCase() !== arg.trim().toLowerCase()) {
    return { list: disambig(matches) }
  }
  return { c: matches[0] }
}

// ── commands ───────────────────────────────────────────────────────────────

async function cmdStatus() {
  const d = await getJson('https://status.robertsspaceindustries.com/index.json')
  const summary = d.summaryStatus || 'unknown'
  const fields = (d.systems || []).map(s => ({
    name: s.name,
    value: (s.unresolvedIssues || []).length
      ? `⚠️ ${s.unresolvedIssues.map(i => i.title || i.name).join('; ')}`
      : `✅ ${s.status || 'operational'}`,
    inline: true,
  }))
  return {
    embeds: [{
      title: `RSI status: ${summary}`,
      url: 'https://status.robertsspaceindustries.com/',
      color: /operational/i.test(summary) ? GREEN : RED,
      fields,
      timestamp: new Date().toISOString(),
    }],
  }
}

async function cmdVersion() {
  const d = await uexJson('/game_versions')
  return {
    embeds: [{
      title: 'Star Citizen — game versions',
      color: GOLD,
      fields: [
        { name: 'LIVE', value: d.live || 'unknown', inline: true },
        { name: 'PTU', value: d.ptu || '— (closed)', inline: true },
      ],
      footer: { text: 'UEX Corp' },
    }],
  }
}

async function cmdPatch() {
  const data = await getJson('https://api.star-citizen.wiki/api/comm-links?limit=25')
    .then(r => r.data || [])
  const hit = data.find(it => /patch|alpha \d|\d\.\d.*(ptu|live|patch)/i.test(`${it.title} ${it.category}`))
    || data.find(it => /inside star citizen|this week in star citizen|monthly report/i.test(it.title))
    || data[0]
  if (!hit) return { content: 'No comm-links found right now.' }
  const text = (hit.translations?.en_EN || '').replace(/\s+/g, ' ').trim()
  return {
    embeds: [{
      title: hit.title,
      url: hit.rsi_url,
      description: text.length > 400 ? text.slice(0, 397) + '…' : text,
      color: GOLD,
      footer: { text: `RSI Comm-Link · ${hit.channel}` },
    }],
  }
}

async function cmdFunding() {
  const data = await getJson('https://api.star-citizen.wiki/api/stats').then(r => r.data || [])
  const l = data[0]
  if (!l) return { content: 'Funding data unavailable.' }
  return {
    embeds: [{
      title: 'Star Citizen crowdfunding',
      url: 'https://robertsspaceindustries.com/funding-goals',
      description: `**${auec(l.funds).replace(' aUEC', '')} USD** raised\n${num(l.fans)} backers`,
      color: GREEN,
      footer: { text: `as of ${new Date(l.timestamp).toISOString().slice(0, 10)}` },
    }],
  }
}

async function cmdShip(arg) {
  if (!arg) return { content: `Usage: \`${p()} ship <name>\`` }
  const r = await resolveVehicle(arg)
  if (r.error) return { content: r.error }
  if (r.list) return r.list
  const v = r.v
  const roles = Object.entries(v).filter(([k, val]) => k.startsWith('is_') && val === 1)
    .map(([k]) => k.slice(3).replace(/_/g, ' '))
    .filter(x => !['spaceship', 'civilian', 'concept'].includes(x))
  const fields = [
    ['Manufacturer', v.company_name],
    ['Crew', v.crew],
    ['Cargo', v.scu ? `${v.scu} SCU` : null],
    ['Size / pad', [v.length && `${v.length}×${v.width}×${v.height} m`, v.pad_type && `pad ${v.pad_type}`].filter(Boolean).join(' · ')],
    ['Roles', roles.slice(0, 6).join(', ') || null],
    ['Quantum', v.is_quantum_capable ? 'yes' : 'no'],
  ].filter(([, val]) => val).map(([name, value]) => ({ name, value: String(value), inline: true }))
  return {
    embeds: [{
      title: v.name_full || v.name,
      url: v.url_store || undefined,
      color: GOLD,
      thumbnail: v.url_photo ? { url: v.url_photo } : undefined,
      fields,
      footer: { text: `UEX Corp · try "${p()} buy ${v.name}" for locations` },
    }],
  }
}

async function cmdPledge(arg) {
  if (!arg) return { content: `Usage: \`${p()} pledge <ship>\`` }
  const r = await resolveVehicle(arg)
  if (r.error) return { content: r.error }
  if (r.list) return r.list
  const rows = await uexJson(`/vehicles_prices?id_vehicle=${r.v.id}`)
  const row = rows[0]
  if (!row) return { content: `**${r.v.name}** — no store pricing in UEX.` }
  const lines = [
    ['Standalone', row.price],
    ['Warbond', row.price_warbond],
    ['Game package', row.price_package],
    ['Concierge', row.price_concierge],
  ].filter(([, v]) => v > 0).map(([k, v]) => `${k}: **$${num(v)}**`)
  return {
    embeds: [{
      title: `${r.v.name_full || r.v.name} — pledge store`,
      url: r.v.url_store || undefined,
      description: lines.join('\n') || 'No current store price (not available / CCU-only).',
      color: GOLD,
      footer: { text: 'UEX Corp · real-money prices' },
    }],
  }
}

async function cmdBuy(arg) {
  if (!arg) return { content: `Usage: \`${p()} buy <ship>\`` }
  const r = await resolveVehicle(arg)
  if (r.error) return { content: r.error }
  if (r.list) return r.list
  const [purchases, rentals] = await Promise.all([
    uexJson(`/vehicles_purchases_prices?id_vehicle=${r.v.id}`).catch(() => []),
    uexJson(`/vehicles_rentals_prices?id_vehicle=${r.v.id}`).catch(() => []),
  ])
  const buy = purchases.filter(x => x.price_buy > 0).sort((a, b) => a.price_buy - b.price_buy)
  const rent = rentals.filter(x => x.price_rent > 0).sort((a, b) => a.price_rent - b.price_rent)
  const fields = []
  if (buy.length) fields.push({
    name: 'Buy (in-game)',
    value: buy.slice(0, 5).map(x => `**${auec(x.price_buy)}** — ${placeLabel(x)}`).join('\n'),
  })
  if (rent.length) fields.push({
    name: 'Rent / day',
    value: rent.slice(0, 5).map(x => `**${auec(x.price_rent)}** — ${placeLabel(x)}`).join('\n'),
  })
  if (!fields.length) return { content: `**${r.v.name}** — not sold or rented in-game right now (pledge-only). Try \`${p()} pledge ${r.v.name}\`.` }
  return {
    embeds: [{ title: `${r.v.name_full || r.v.name} — where to acquire`, color: GOLD, fields, footer: { text: 'UEX Corp' } }],
  }
}

async function cmdLoaner(arg) {
  if (!arg) return { content: `Usage: \`${p()} loaner <ship>\`` }
  const r = await resolveVehicle(arg)
  if (r.error) return { content: r.error }
  if (r.list) return r.list
  const names = await vehicleNames(r.v.ids_vehicles_loaners)
  return {
    content: names.length
      ? `**${r.v.name}** loaner${names.length > 1 ? 's' : ''}: ${names.join(', ')}`
      : `**${r.v.name}** has no loaner (or it's flyable).`,
  }
}

async function cmdCompare(arg) {
  const m = arg.split(/\s+(?:vs\.?|\/|,)\s+/i)
  if (m.length !== 2) return { content: `Usage: \`${p()} compare <ship A> vs <ship B>\`` }
  const [ra, rb] = await Promise.all([resolveVehicle(m[0]), resolveVehicle(m[1])])
  for (const r of [ra, rb]) { if (r.error) return { content: r.error }; if (r.list) return r.list }
  const a = ra.v, b = rb.v
  const row = (label, fa, fb) => `**${label}** — ${fa ?? '—'}  |  ${fb ?? '—'}`
  return {
    embeds: [{
      title: `${a.name} vs ${b.name}`,
      color: GOLD,
      description: [
        `_${a.company_name}  |  ${b.company_name}_`,
        row('Cargo', a.scu && `${a.scu} SCU`, b.scu && `${b.scu} SCU`),
        row('Crew', a.crew, b.crew),
        row('Length', a.length && `${a.length} m`, b.length && `${b.length} m`),
        row('Mass', a.mass && `${num(a.mass)} kg`, b.mass && `${num(b.mass)} kg`),
        row('Pad', a.pad_type, b.pad_type),
        row('Quantum', a.is_quantum_capable ? 'yes' : 'no', b.is_quantum_capable ? 'yes' : 'no'),
      ].join('\n'),
      footer: { text: 'UEX Corp' },
    }],
  }
}

async function cmdTrade(arg) {
  if (!arg) return { content: `Usage: \`${p()} trade <commodity>\`` }
  const r = await resolveCommodity(arg)
  if (r.error) return { content: r.error }
  if (r.list) return r.list
  const rows = await uexJson(`/commodities_prices?id_commodity=${r.c.id}`)
  const buys = rows.filter(x => x.price_buy > 0).sort((a, b) => a.price_buy - b.price_buy).slice(0, 4)
  const sells = rows.filter(x => x.price_sell > 0).sort((a, b) => b.price_sell - a.price_sell).slice(0, 4)
  const spread = buys[0] && sells[0] ? sells[0].price_sell - buys[0].price_buy : null
  return {
    embeds: [{
      title: `${r.c.name} — trade prices`,
      url: r.c.slug ? `https://uexcorp.space/commodities/info/name/${r.c.slug}` : undefined,
      description: spread != null ? `Best spread: **${num(spread)} aUEC/SCU**` : undefined,
      color: GOLD,
      fields: [
        { name: 'Buy (cheapest)', value: buys.map(x => `**${num(x.price_buy)}** — ${placeLabel(x)}`).join('\n') || '—', inline: true },
        { name: 'Sell (highest)', value: sells.map(x => `**${num(x.price_sell)}** — ${placeLabel(x)}`).join('\n') || '—', inline: true },
      ],
      footer: { text: 'UEX Corp · aUEC/SCU' },
    }],
  }
}

async function cmdSell(arg) {
  if (!arg) return { content: `Usage: \`${p()} sell <commodity>\`` }
  const r = await resolveCommodity(arg)
  if (r.error) return { content: r.error }
  if (r.list) return r.list
  const rows = (await uexJson(`/commodities_prices?id_commodity=${r.c.id}`))
    .filter(x => x.price_sell > 0).sort((a, b) => b.price_sell - a.price_sell).slice(0, 8)
  if (!rows.length) return { content: `Nowhere is buying **${r.c.name}** right now.` }
  return {
    embeds: [{
      title: `Sell ${r.c.name}`,
      color: GREEN,
      description: rows.map(x => `**${num(x.price_sell)}** — ${placeLabel(x)}`).join('\n'),
      footer: { text: 'UEX Corp · aUEC/SCU' },
    }],
  }
}

async function cmdRoute(arg) {
  if (!arg) return { content: `Usage: \`${p()} route <commodity>\`` }
  const r = await resolveCommodity(arg)
  if (r.error) return { content: r.error }
  if (r.list) return r.list
  const routes = (await uexJson(`/commodities_routes?id_commodity=${r.c.id}`))
    .filter(x => x.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)
  if (!routes.length) return { content: `No profitable routes for **${r.c.name}** right now.` }
  const line = x => {
    const from = x.origin_terminal_name || x.origin_planet_name || x.origin_star_system_name || '?'
    const to = x.destination_terminal_name || x.destination_planet_name || x.destination_star_system_name || '?'
    const perScu = Math.round(x.price_destination - x.price_origin)
    const roi = Number.isFinite(x.price_roi) ? ` · ROI ${Math.round(x.price_roi)}%` : ''
    return `${from} → ${to}\n  **${num(perScu)}/SCU** · ~${num(x.profit)} for ${num(x.scu_reachable)} SCU${roi}`
  }
  return {
    embeds: [{
      title: `${r.c.name} — top trade routes`,
      color: GOLD,
      description: routes.map(line).join('\n'),
      footer: { text: 'UEX Corp · "for N SCU" = origin stock' },
    }],
  }
}

async function cmdProfit(args) {
  const [name, scuRaw] = [args.slice(0, -1).join(' '), args.at(-1)]
  const scu = Number(scuRaw)
  if (!name || !Number.isFinite(scu) || scu <= 0) {
    return { content: `Usage: \`${p()} profit <commodity> <SCU>\` — e.g. \`${p()} profit gold 576\`` }
  }
  const r = await resolveCommodity(name)
  if (r.error) return { content: r.error }
  if (r.list) return r.list
  const rows = await uexJson(`/commodities_prices?id_commodity=${r.c.id}`)
  const buy = rows.filter(x => x.price_buy > 0).sort((a, b) => a.price_buy - b.price_buy)[0]
  const sell = rows.filter(x => x.price_sell > 0).sort((a, b) => b.price_sell - a.price_sell)[0]
  if (!buy || !sell) return { content: `Not enough price data for **${r.c.name}**.` }
  const per = sell.price_sell - buy.price_buy
  return {
    embeds: [{
      title: `${r.c.name} × ${num(scu)} SCU`,
      color: per > 0 ? GREEN : RED,
      description: [
        `Buy **${num(buy.price_buy)}** @ ${placeLabel(buy)}`,
        `Sell **${num(sell.price_sell)}** @ ${placeLabel(sell)}`,
        '',
        `Cost: ${auec(buy.price_buy * scu)}`,
        `Revenue: ${auec(sell.price_sell * scu)}`,
        `**Profit: ${auec(per * scu)}**  (${num(per)}/SCU)`,
      ].join('\n'),
      footer: { text: 'UEX Corp · best split buy/sell, ignores travel' },
    }],
  }
}

async function cmdFuel() {
  const map = { Hydrogen: 41, 'Quantum Fuel': 87 }
  const parts = []
  for (const [label, id] of Object.entries(map)) {
    const rows = await uexJson(`/commodities_prices?id_commodity=${id}`).catch(() => [])
    const cheap = rows.filter(x => x.price_buy > 0).sort((a, b) => a.price_buy - b.price_buy).slice(0, 3)
    parts.push({
      name: label,
      value: cheap.map(x => `**${num(x.price_buy)}** — ${placeLabel(x)}`).join('\n') || '—',
      inline: true,
    })
  }
  return { embeds: [{ title: 'Fuel prices', color: GOLD, fields: parts, footer: { text: 'UEX Corp · aUEC/SCU' } }] }
}

async function cmdRefinery(arg) {
  if (!arg) return { content: `Usage: \`${p()} refinery <ore>\` — e.g. \`${p()} refinery quantainium\`` }
  const all = await uexJson('/refineries_yields').catch(() => [])
  const q = arg.trim().toLowerCase()
  const base = n => String(n).replace(/\s*\((ore|raw)\)$/i, '').toLowerCase()
  const names = [...new Set(all.map(x => x.commodity_name))]
  const name = names.find(n => base(n) === q) || names.find(n => base(n).startsWith(q))
    || names.find(n => base(n).includes(q))
  if (!name) {
    return { content: `No refinery data for "${arg}". Known: ${names.map(base).join(', ')}` }
  }
  const rows = all.filter(x => x.commodity_name === name)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 6)
  return {
    embeds: [{
      title: `${name} — refinery yield modifiers`,
      color: GOLD,
      description: rows.map(x => `**${x.value > 0 ? '+' : ''}${x.value}%** — ${placeLabel(x)}`).join('\n'),
      footer: { text: 'UEX Corp · higher = better yield at that refinery' },
    }],
  }
}

async function cmdFind(arg) {
  if (!arg) return { content: `Usage: \`${p()} find <item>\` — e.g. \`${p()} find Omnisky IX\`` }
  let matches
  try { matches = await findItems(arg) }
  catch (err) { return { content: `Item index unavailable right now (${err.message}). Try again shortly.` } }
  if (!matches.length) return { content: `No item matching "${arg}".` }
  if (matches.length > 1 && matches[0].name.toLowerCase() !== arg.trim().toLowerCase()) return disambig(matches)
  const it = matches[0]
  const locs = await itemLocations(it.id)
  if (!locs.length) return { content: `**${it.name}** — no known sale locations in UEX right now.` }
  return {
    embeds: [{
      title: `Where to buy: ${it.name}`,
      url: it.slug ? `https://uexcorp.space/items/info/name/${it.slug}` : undefined,
      description: locs.slice(0, 8).map(l =>
        `**${num(l.price)}** — ${[l.terminal, l.place, l.body].filter(Boolean).join(' · ')}`).join('\n'),
      color: GOLD,
      footer: { text: `${it.section} / ${it.category}${it.company ? ' · ' + it.company : ''} · UEX Corp · aUEC` },
    }],
  }
}

async function cmdBlueprint(arg) {
  if (!arg) return { content: `Usage: \`${p()} blueprint <name>\` — e.g. \`${p()} blueprint Bolide\`` }
  let matches
  try { matches = await findBlueprints(arg) }
  catch (err) { return { content: `Blueprint data unavailable right now (${err.message}).` } }
  if (!matches.length) return { content: `No blueprint matching "${arg}".` }

  if (matches.length > 1 && matches[0].name.toLowerCase() !== arg.trim().toLowerCase()) {
    const names = [...new Set(matches.slice(0, 15).map(m => m.name))]
    return { content: `${matches.length} blueprints match — be more specific:\n${names.map(n => `• ${n}`).join('\n')}` }
  }

  const bp = matches[0]
  if (!bp.sources.length) {
    return { content: `**${bp.name}** — in the game data but not currently rewarded by any live contract.` }
  }
  const lines = bp.sources.slice(0, 8).map(s => {
    const bits = [s.type, s.faction, s.uec ? `${num(s.uec)} aUEC` : null, s.pyro ? 'Pyro' : null,
      s.illegal ? '⚠ illegal' : null, s.odds].filter(Boolean)
    return `**${s.title}**\n  ${bits.join(' · ')}`
  })
  const more = bp.sources.length > 8 ? `\n…and ${bp.sources.length - 8} more contracts` : ''
  return {
    embeds: [{
      title: `📘 ${bp.name}`,
      url: 'https://scmdb.net/',
      description: `Rewarded by:\n${lines.join('\n')}${more}`,
      color: 0x5b8def,
      footer: { text: 'SCMDB · scmdb.net' },
    }],
  }
}

async function cmdMission(arg) {
  if (!arg) return { content: `Usage: \`${p()} mission <name>\`` }
  let hits
  try { hits = await findMissions(arg) }
  catch (err) { return { content: `Mission data unavailable (${err.message}).` } }
  if (!hits.length) return { content: `No mission matching "${arg}".` }
  if (hits.length > 1 && hits[0].title.toLowerCase() !== arg.trim().toLowerCase()) {
    const titles = [...new Set(hits.slice(0, 15).map(m => `${m.title} — ${m.type}`))]
    return { content: `${hits.length} missions match — be more specific:\n${titles.map(t => `• ${t}`).join('\n')}` }
  }
  const m = hits[0]
  const fields = [
    ['Faction', m.faction],
    ['Type', m.type],
    ['Payout', m.uec ? `${num(m.uec)} aUEC` : null],
    ['Standing req', m.standing],
    ['Time limit', m.time ? `${m.time} min` : null],
    ['Systems', m.systems.length ? m.systems.join(', ') : null],
    ['Blueprint rewards', m.blueprints.length ? m.blueprints.join(', ') : null],
    ['Item rewards', m.items.length ? m.items.map(i => `${i.amount}× ${i.name}`).join(', ') : null],
    ['Reputation', m.repGains.length ? m.repGains.map(g => `+${g.amount} ${g.faction}`).join(', ') : null],
  ].filter(([, v]) => v).map(([name, value]) => ({ name, value: String(value).slice(0, 1024), inline: ['Faction', 'Type', 'Payout', 'Standing req', 'Time limit'].includes(name) }))
  return {
    embeds: [{
      title: `${m.illegal ? '⚠ ' : ''}${m.title}`,
      description: m.description ? (m.description.length > 350 ? m.description.slice(0, 347) + '…' : m.description) : undefined,
      color: m.illegal ? RED : 0x5b8def,
      fields,
      footer: { text: `SCMDB${m.shareable ? ' · shareable' : ''}${m.pyro ? ' · Pyro' : ''}` },
    }],
  }
}

async function cmdWikelo(arg) {
  let hits
  try { hits = await findWikelo(arg) }
  catch (err) { return { content: `Wikelo data unavailable (${err.message}).` } }
  if (!hits.length) return { content: arg ? `No Wikelo trade matching "${arg}".` : 'No Wikelo trades in the data.' }

  if (!arg || (hits.length > 3 && !hits.some(h => h.title.toLowerCase() === arg.trim().toLowerCase()))) {
    const reward = h => h.items[0]?.name || h.blueprints[0] || null
    const list = hits.slice(0, 30).map(h => `• ${h.title}${reward(h) ? ` → ${reward(h)}` : ''}`)
    return {
      embeds: [{
        title: `Wikelo Emporium — ${hits.length} trade${hits.length > 1 ? 's' : ''}`,
        description: list.join('\n').slice(0, 3800),
        color: GOLD,
        footer: { text: `${p()} wikelo <name> for the shopping list · SCMDB` },
      }],
    }
  }
  const w = hits[0]
  return {
    embeds: [{
      title: `🪙 Wikelo: ${w.title}`,
      description: w.description ? (w.description.length > 300 ? w.description.slice(0, 297) + '…' : w.description) : undefined,
      color: GOLD,
      fields: [
        { name: 'You bring', value: (w.turnIn.length ? w.turnIn.map(t => `**${t.amount}×** ${t.name}`).join('\n') : 'unknown').slice(0, 1024), inline: false },
        { name: 'You get', value: (w.items.length ? w.items.map(i => `${i.amount}× ${i.name} _(${i.type})_`).join('\n') : (w.blueprints.join(', ') || 'unknown')).slice(0, 1024), inline: false },
      ],
      footer: { text: 'Wikelo Emporium, Pyro · SCMDB' },
    }],
  }
}

async function cmdRep(arg) {
  if (!arg) return { content: `Usage: \`${p()} rep <faction>\` — e.g. \`${p()} rep Battaglia\`` }
  const r = await factionRep(arg)
  if (!r) return { content: `No reputation missions for a faction matching "${arg}".` }
  const rows = r.rows.slice(0, 10).map(x =>
    `**+${num(x.amount)}** · ${x.title}${x.illegal ? ' ⚠' : ''} _(${x.type}${x.uec ? `, ${num(x.uec)} aUEC` : ''})_`)
  return {
    embeds: [{
      title: `${r.name} — standing missions`,
      description: rows.join('\n') + (r.rows.length > 10 ? `\n…and ${r.rows.length - 10} more` : ''),
      color: 0x5b8def,
      footer: { text: 'SCMDB · rep gained per completion' },
    }],
  }
}

async function cmdFactionMissions(arg) {
  if (!arg) return { content: `Usage: \`${p()} missions <faction>\`` }
  const r = await factionMissions(arg)
  if (!r) return { content: `No faction matching "${arg}".` }
  const rows = r.missions.slice(0, 12).map(m =>
    `${m.uec ? `**${num(m.uec)}**` : '—'} · ${m.title}${m.illegal ? ' ⚠' : ''} _(${m.type})_`)
  return {
    embeds: [{
      title: `${r.name} — ${r.missions.length} contract${r.missions.length > 1 ? 's' : ''}`,
      description: rows.join('\n') + (r.missions.length > 12 ? `\n…and ${r.missions.length - 12} more` : ''),
      color: 0x5b8def,
      footer: { text: 'SCMDB · by payout' },
    }],
  }
}

async function cmdCitizen(arg) {
  if (!arg) return { content: `Usage: \`${p()} citizen <handle>\`` }
  let c
  try { c = await lookupCitizen(arg) }
  catch (err) { return { content: `RSI lookup failed (${err.message}).` } }
  if (!c || c.notFound) return { content: `No RSI citizen "${arg}".` }
  const fields = [
    ['Enlisted', c.enlisted],
    ['Location', c.location],
    ['Fluency', c.fluency],
    ['Main org', c.org],
  ].filter(([, v]) => v).map(([name, value]) => ({ name, value: String(value), inline: true }))
  return {
    embeds: [{
      title: c.displayName && c.displayName !== c.handle ? `${c.displayName} (@${c.handle})` : `@${c.handle}`,
      url: c.url,
      description: c.bio ? (c.bio.length > 300 ? c.bio.slice(0, 297) + '…' : c.bio) : undefined,
      thumbnail: c.avatar ? { url: c.avatar } : undefined,
      color: GOLD,
      fields,
      footer: { text: 'RSI citizen record · profile "Location" is a country, not in-game' },
    }],
  }
}

function cmdCalc(arg) {
  if (!arg) return { content: `Usage: \`${p()} calc <expression>\` — e.g. \`${p()} calc (31000-24360)*576\`` }
  try {
    const r = calc(arg)
    return { content: `\`${arg}\` = **${num(Number(r.toFixed(4)))}**` }
  } catch (err) {
    return { content: `Can't parse that: ${err.message}` }
  }
}

function cmdHelp() {
  const x = p()
  return {
    embeds: [{
      title: 'Star Citizen commands',
      color: GOLD,
      description: [
        `**Game** · \`${x} status\` \`${x} version\` \`${x} patch\` \`${x} funding\``,
        `**Ships** · \`${x} ship <n>\` \`${x} buy <n>\` \`${x} pledge <n>\` \`${x} compare <a> vs <b>\` \`${x} loaner <n>\``,
        `**Trade** · \`${x} trade <c>\` \`${x} sell <c>\` \`${x} route <c>\` \`${x} profit <c> <scu>\` \`${x} fuel\` \`${x} refinery <ore>\``,
        `**Items** · \`${x} find <item>\` \`${x} blueprint <name>\``,
        `**Missions** · \`${x} mission <name>\` \`${x} missions <faction>\` \`${x} rep <faction>\` \`${x} wikelo [name]\``,
        `**Players** · \`${x} citizen <handle>\``,
        `**Guild** · \`${x} job\` — post a job (makes a channel for it)`,
        `**Misc** · \`${x} calc <expr>\``,
      ].join('\n'),
    }],
  }
}

const HANDLERS = {
  help: () => cmdHelp(),
  status: () => cmdStatus(),
  version: () => cmdVersion(),
  ptu: () => cmdVersion(),
  patch: () => cmdPatch(),
  patchnotes: () => cmdPatch(),
  funding: () => cmdFunding(),
  ship: ({ arg }) => cmdShip(arg),
  buy: ({ arg }) => cmdBuy(arg),
  pledge: ({ arg }) => cmdPledge(arg),
  compare: ({ arg }) => cmdCompare(arg),
  loaner: ({ arg }) => cmdLoaner(arg),
  trade: ({ arg }) => cmdTrade(arg),
  sell: ({ arg }) => cmdSell(arg),
  route: ({ arg }) => cmdRoute(arg),
  profit: ({ args }) => cmdProfit(args),
  fuel: () => cmdFuel(),
  refinery: ({ arg }) => cmdRefinery(arg),
  refine: ({ arg }) => cmdRefinery(arg),
  find: ({ arg }) => cmdFind(arg),
  where: ({ arg }) => cmdFind(arg),
  item: ({ arg }) => cmdFind(arg),
  blueprint: ({ arg }) => cmdBlueprint(arg),
  bp: ({ arg }) => cmdBlueprint(arg),
  mission: ({ arg }) => cmdMission(arg),
  contract: ({ arg }) => cmdMission(arg),
  wikelo: ({ arg }) => cmdWikelo(arg),
  rep: ({ arg }) => cmdRep(arg),
  standing: ({ arg }) => cmdRep(arg),
  missions: ({ arg }) => cmdFactionMissions(arg),
  faction: ({ arg }) => cmdFactionMissions(arg),
  citizen: ({ arg }) => cmdCitizen(arg),
  handle: ({ arg }) => cmdCitizen(arg),
  calc: ({ arg }) => cmdCalc(arg),
  job: ({ rawArg }, msg) => handleJob(msg, rawArg),
  jobs: () => ({ content: JOB_TEMPLATE }),
}

export async function runCommand(parsed, msg) {
  const h = HANDLERS[parsed.cmd]
  if (!h) return { content: `Unknown command \`${parsed.cmd}\`. Try \`${p()} help\`.` }
  try {
    return await h(parsed, msg)
  } catch (err) {
    return { content: `That failed: ${err.message}` }
  }
}
