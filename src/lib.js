import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { config } from './config.js'

export function log(...a) {
  console.log(new Date().toISOString(), ...a)
}

export async function getJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'user-agent': config.userAgent, accept: 'application/json', ...opts.headers },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.json()
}

// Discord-wire-compatible webhook payload: { content?, username?, embeds? }.
export async function postWebhook(webhookUrl, payload) {
  if (process.env.DRY_RUN === '1') {
    log('DRY_RUN would post:', JSON.stringify(payload).slice(0, 500))
    return
  }
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': config.userAgent },
    body: JSON.stringify({ username: 'Star Citizen', ...payload }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`POST webhook → ${res.status} ${body.slice(0, 200)}`)
  }
}

// Tiny JSON key/value store, one file per feed, under STATE_DIR.
export async function loadState(name) {
  try {
    return JSON.parse(await readFile(join(config.stateDir, `${name}.json`), 'utf8'))
  } catch {
    return {}
  }
}
export async function saveState(name, data) {
  const file = join(config.stateDir, `${name}.json`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(data, null, 2))
}
