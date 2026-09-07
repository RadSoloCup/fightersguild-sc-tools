import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { config } from '../config.js'
import { getJson, log } from '../lib.js'

const BASE = 'https://api.uexcorp.space/2.0'
const CACHE_FILE = join(config.stateDir, 'uex-items.json')
const TTL_MS = 12 * 60 * 60 * 1000

function headers() {
  return config.bot.uexApiKey ? { authorization: `Bearer ${config.bot.uexApiKey}` } : {}
}

let index = null        // { builtAt, items: [{id,name,section,category,company,slug}] }
let building = null      // in-flight promise

async function loadDisk() {
  try {
    const j = JSON.parse(await readFile(CACHE_FILE, 'utf8'))
    if (j && Array.isArray(j.items) && Date.now() - j.builtAt < TTL_MS) return j
  } catch {}
  return null
}

async function saveDisk(j) {
  try {
    await mkdir(config.stateDir, { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify(j))
  } catch {}
}

// Fetch every item category's items (66-ish requests, small concurrency).
async function build() {
  log('uex-items: building index…')
  const cats = (await getJson(`${BASE}/categories`, { headers: headers() })).data || []
  const itemCats = cats.filter(c => c.type === 'item').map(c => c.id)
  const items = []
  const queue = [...itemCats]
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()
      try {
        const rows = (await getJson(`${BASE}/items?id_category=${id}`, { headers: headers() })).data || []
        for (const r of rows) {
          items.push({
            id: r.id, name: r.name, section: r.section, category: r.category,
            company: r.company_name || null, slug: r.slug || null,
          })
        }
      } catch (err) {
        log(`uex-items: category ${id} failed (${err.message})`)
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  const j = { builtAt: Date.now(), items }
  await saveDisk(j)
  log(`uex-items: indexed ${items.length} items`)
  return j
}

async function ensureIndex() {
  if (index && Date.now() - index.builtAt < TTL_MS) return index
  if (!index) {
    const disk = await loadDisk()
    if (disk) { index = disk; return index }
  }
  if (!building) building = build().finally(() => { building = null })
  index = await building
  return index
}

// Kick off index build in the background at startup so the first command is fast.
export function warmItemIndex() {
  ensureIndex().catch(err => log(`uex-items: warm failed (${err.message})`))
}

export function indexReady() {
  return !!index || !building
}

export async function findItems(query) {
  const idx = await ensureIndex()
  const q = query.trim().toLowerCase()
  const exact = idx.items.filter(i => i.name.toLowerCase() === q)
  if (exact.length) return exact
  const starts = idx.items.filter(i => i.name.toLowerCase().startsWith(q))
  if (starts.length) return starts
  return idx.items.filter(i => i.name.toLowerCase().includes(q))
}

export async function itemLocations(id) {
  const rows = (await getJson(`${BASE}/items_prices?id_item=${id}`, { headers: headers() })).data || []
  return rows
    .filter(r => r.price_buy > 0)
    .map(r => ({
      price: r.price_buy,
      terminal: r.terminal_name || 'unknown terminal',
      place: [r.city_name, r.space_station_name, r.outpost_name].filter(Boolean)[0] || null,
      body: r.moon_name || r.planet_name || null,
      system: r.star_system_name || null,
    }))
    .sort((a, b) => a.price - b.price)
}
