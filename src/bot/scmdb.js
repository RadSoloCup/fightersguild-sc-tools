import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { config } from '../config.js'
import { getJson, log } from '../lib.js'

const SITE = 'https://scmdb.net'
const VERSION_CHECK_TTL = 6 * 60 * 60 * 1000

let db = null            // { version, bpByName: Map, poolContracts: Map }
let loading = null
let versionCheckedAt = 0

async function latestMergedFile() {
  const list = await getJson(`${SITE}/data/game-versions.json`)
  const live = (Array.isArray(list) ? list : []).find(v => /-live\./.test(v.version)) || list[0]
  return live // { version, file }
}

function cachePath(version) {
  return join(config.stateDir, `scmdb-${version.replace(/[^a-z0-9.-]/gi, '_')}.json`)
}

function buildIndexes(merged) {
  const factions = merged.factions || {}
  const facName = g => factions[g]?.name || factions[g]?.shortName || null
  const resPools = merged.resourcePools || {}
  const bpPools = merged.blueprintPools || {}
  const factionRewards = merged.factionRewardsPools || []

  const bpByName = new Map()
  for (const [poolId, pool] of Object.entries(bpPools)) {
    const list = pool.blueprints || []
    const total = list.reduce((s, b) => s + (b.weight || 1), 0) || 1
    for (const b of list) {
      const key = b.name.toLowerCase()
      if (!bpByName.has(key)) bpByName.set(key, { name: b.name, entries: [] })
      bpByName.get(key).entries.push({ poolId, poolName: pool.name, weight: b.weight || 1, total })
    }
  }

  const poolContracts = new Map()
  const missions = []
  const wikelo = []
  for (const c of merged.contracts || []) {
    for (const r of c.blueprintRewards || []) {
      if (!poolContracts.has(r.blueprintPool)) poolContracts.set(r.blueprintPool, [])
      poolContracts.get(r.blueprintPool).push({
        title: c.title, type: c.missionType, faction: facName(c.factionGuid),
        uec: typeof c.rewardUEC === 'number' ? c.rewardUEC : null,
        illegal: !!c.illegal, pyro: !!c.pyroRegion, chance: r.chance ?? 1,
      })
    }

    const bpNames = (c.blueprintRewards || []).flatMap(r =>
      (bpPools[r.blueprintPool]?.blueprints || []).map(b => b.name))
    const repGains = (factionRewards[c.factionRewardsIndex] || [])
      .map(g => ({ faction: facName(g.factionGuid), amount: g.amount }))
      .filter(g => g.faction && g.amount)

    const m = {
      title: c.title, type: c.missionType, category: c.category,
      faction: facName(c.factionGuid),
      uec: typeof c.rewardUEC === 'number' ? c.rewardUEC : null,
      standing: c.minStanding?.name || null,
      illegal: !!c.illegal, shareable: !!c.canBeShared, pyro: !!c.pyroRegion,
      time: c.timeToComplete || null,
      systems: c.availableSystems || c.systems || [],
      blueprints: [...new Set(bpNames)],
      items: (c.itemRewards || []).map(i => ({ name: i.name, type: i.itemType, amount: i.amount || 1 })),
      repGains,
      description: (c.description || '')
        .replace(/<\/?[A-Za-z0-9]+>/g, '')      // strip <EM4> etc.
        .replace(/[*_~`]{2,}/g, ' ')            // strip decorative runs
        .replace(/\\n|\s+/g, ' ').trim(),
    }
    missions.push(m)

    if (/wikelo/i.test(c.missionType || '')) {
      wikelo.push({
        ...m,
        turnIn: (c.haulingOrders || []).map(h => ({
          name: resPools[h.resource]?.name || h.resource,
          amount: h.maxAmount || h.minAmount || 1,
        })),
      })
    }
  }
  return { bpByName, poolContracts, missions, wikelo }
}

async function loadDb() {
  const { version, file } = await latestMergedFile()
  versionCheckedAt = Date.now()
  if (db && db.version === version) return db

  const cf = cachePath(version)
  let merged
  try {
    merged = JSON.parse(await readFile(cf, 'utf8'))
    log(`scmdb: loaded ${version} from cache`)
  } catch {
    log(`scmdb: fetching ${file} …`)
    merged = await getJson(`${SITE}/data/${file}`)
    try { await mkdir(config.stateDir, { recursive: true }); await writeFile(cf, JSON.stringify(merged)) } catch {}
  }
  db = { version, ...buildIndexes(merged) }
  log(`scmdb: indexed ${db.bpByName.size} blueprints (${version})`)
  return db
}

async function ensureDb() {
  if (db && Date.now() - versionCheckedAt < VERSION_CHECK_TTL) return db
  if (!loading) loading = loadDb().finally(() => { loading = null })
  return db && !loading ? db : loading
}

export function warmScmdb() {
  ensureDb().catch(err => log(`scmdb: warm failed (${err.message})`))
}

function oddsText(weight, total) {
  if (weight >= total) return 'guaranteed in pool'
  const pct = Math.round((weight / total) * 100)
  return pct >= 5 ? `~${pct}% of pool` : `1-in-${Math.round(total / weight)} of pool`
}

export async function findBlueprints(query) {
  const d = await ensureDb()
  const q = query.trim().toLowerCase()
  const all = [...d.bpByName.values()]
  let matches = all.filter(v => v.name.toLowerCase() === q)
  if (!matches.length) matches = all.filter(v => v.name.toLowerCase().startsWith(q))
  if (!matches.length) matches = all.filter(v => v.name.toLowerCase().includes(q))

  return matches.map(bp => {
    const sources = []
    const seen = new Set()
    for (const e of bp.entries) {
      for (const c of d.poolContracts.get(e.poolId) || []) {
        const k = `${c.title}|${c.type}`
        if (seen.has(k)) continue
        seen.add(k)
        sources.push({ ...c, odds: oddsText(e.weight, e.total) })
      }
    }
    sources.sort((a, b) => (b.uec || 0) - (a.uec || 0))
    return { name: bp.name, sources }
  })
}

function dedupe(list, keyFn) {
  const seen = new Set()
  return list.filter(x => { const k = keyFn(x); if (seen.has(k)) return false; seen.add(k); return true })
}

export async function findMissions(query) {
  const d = await ensureDb()
  const q = query.trim().toLowerCase()
  let hits = d.missions.filter(m => (m.title || '').toLowerCase() === q)
  if (!hits.length) hits = d.missions.filter(m => (m.title || '').toLowerCase().includes(q))
  return dedupe(hits, m => `${m.title}|${m.type}|${m.uec}`)
    .sort((a, b) => (b.uec || 0) - (a.uec || 0))
}

export async function factionList() {
  const d = await ensureDb()
  return [...new Set(d.missions.map(m => m.faction).filter(Boolean))].sort()
}

function matchFaction(missions, query, field) {
  const q = query.trim().toLowerCase()
  const names = [...new Set(missions.map(field).filter(Boolean))]
  const name = names.find(n => n.toLowerCase() === q)
    || names.find(n => n.toLowerCase().replace(/\s+/g, '') === q.replace(/\s+/g, ''))
    || names.find(n => n.toLowerCase().includes(q))
  return name
}

export async function factionMissions(query) {
  const d = await ensureDb()
  const name = matchFaction(d.missions, query, m => m.faction)
  if (!name) return null
  const list = dedupe(d.missions.filter(m => m.faction === name), m => `${m.title}|${m.type}`)
    .sort((a, b) => (b.uec || 0) - (a.uec || 0))
  return { name, missions: list }
}

export async function factionRep(query) {
  const d = await ensureDb()
  const withRep = d.missions.filter(m => m.repGains.length)
  const name = matchFaction(
    withRep.flatMap(m => m.repGains.map(g => ({ f: g.faction }))), query, x => x.f)
  if (!name) return null
  const rows = []
  const seen = new Set()
  for (const m of withRep) {
    const g = m.repGains.find(g => g.faction === name)
    if (!g) continue
    const k = `${m.title}|${m.type}`
    if (seen.has(k)) continue
    seen.add(k)
    rows.push({ title: m.title, type: m.type, uec: m.uec, amount: g.amount, illegal: m.illegal })
  }
  rows.sort((a, b) => (b.amount || 0) - (a.amount || 0))
  return { name, rows }
}

export async function findWikelo(query) {
  const d = await ensureDb()
  const q = (query || '').trim().toLowerCase()
  let hits = d.wikelo
  if (q) {
    hits = d.wikelo.filter(w =>
      (w.title || '').toLowerCase().includes(q) ||
      w.items.some(i => (i.name || '').toLowerCase().includes(q)))
  }
  return dedupe(hits, w => w.title).sort((a, b) => a.title.localeCompare(b.title))
}
