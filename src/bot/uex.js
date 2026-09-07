import { config } from '../config.js'
import { getJson } from '../lib.js'

const BASE = 'https://api.uexcorp.space/2.0'

export function uexHeaders() {
  return config.bot.uexApiKey ? { authorization: `Bearer ${config.bot.uexApiKey}` } : {}
}

export async function uexJson(path) {
  const res = await getJson(`${BASE}${path}`, { headers: uexHeaders() })
  return res.data ?? res
}

// ── cached reference lists ──────────────────────────────────────────────────
function cached(fetchFn, ttlMs) {
  let value = null
  let at = 0
  return async () => {
    if (value && Date.now() - at < ttlMs) return value
    value = await fetchFn()
    at = Date.now()
    return value
  }
}

export const commodities = cached(() => uexJson('/commodities'), 60 * 60 * 1000)
export const vehicles = cached(() => uexJson('/vehicles'), 12 * 60 * 60 * 1000)

function pick(list, q, nameKey = 'name') {
  const n = q.trim().toLowerCase()
  const exact = list.filter(x => (x[nameKey] || '').toLowerCase() === n)
  if (exact.length) return exact
  const nameFull = list.filter(x => (x.name_full || '').toLowerCase() === n)
  if (nameFull.length) return nameFull
  const starts = list.filter(x => (x[nameKey] || '').toLowerCase().startsWith(n))
  if (starts.length) return starts
  const code = list.filter(x => (x.code || '').toLowerCase() === n)
  if (code.length) return code
  return list.filter(x =>
    (x[nameKey] || '').toLowerCase().includes(n) ||
    (x.name_full || '').toLowerCase().includes(n))
}

export async function findCommodity(q) {
  return pick(await commodities(), q)
}

export async function findVehicle(q) {
  return pick(await vehicles(), q)
}

// resolve "1,2,3" style loaner id lists to names
export async function vehicleNames(idsCsv) {
  if (!idsCsv) return []
  const want = new Set(String(idsCsv).split(',').map(s => s.trim()).filter(Boolean))
  return (await vehicles()).filter(v => want.has(String(v.id))).map(v => v.name)
}

// location label from any UEX price row
export function placeLabel(r) {
  const spot = [r.terminal_name, r.city_name, r.space_station_name, r.outpost_name, r.poi_name]
    .filter(Boolean)[0]
  const body = r.moon_name || r.planet_name
  const sys = r.star_system_name
  return [spot, body && body !== spot ? body : null, sys && sys !== 'Stanton' ? sys : null]
    .filter(Boolean).join(' · ')
}
