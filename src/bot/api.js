import { config } from '../config.js'
import { log } from '../lib.js'

const UA = config.userAgent

function authHeaders() {
  return {
    authorization: `Bot ${config.bot.token}`,
    'user-agent': UA,
  }
}

async function req(method, path, body) {
  const url = `${config.bot.apiBase}/api/v1${path}`
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders(),
      ...(body ? { 'content-type': 'application/json' } : {}),
      accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`${method} ${path} → ${res.status} ${t.slice(0, 200)}`)
  }
  return res.status === 204 ? null : res.json()
}

// Discord-wire-compatible gateway bootstrap. Returns { url, shards, ... }.
export async function getBotGateway() {
  return req('GET', '/gateway/bot')
}

export async function sendMessage(channelId, payload) {
  return req('POST', `/channels/${channelId}/messages`, payload)
}

export async function getChannel(channelId) {
  return req('GET', `/channels/${channelId}`)
}

export async function deleteMessage(channelId, messageId) {
  return req('DELETE', `/channels/${channelId}/messages/${messageId}`)
}

export async function startTyping(channelId) {
  try { await req('POST', `/channels/${channelId}/typing`) } catch {}
}

export { log }
