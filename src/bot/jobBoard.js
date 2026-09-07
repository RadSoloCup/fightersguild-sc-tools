import { config } from '../config.js'
import { sendMessage, deleteMessage } from './api.js'
import { log } from '../lib.js'

const GOLD = 0xc9a227

// canonical field key -> display label, in output order
const FIELDS = [
  ['job', 'Job'],
  ['crew', 'Crew required'],
  ['missionTime', 'Mission time'],
  ['launchTime', 'Launch time'],
  ['objective', 'Objective'],
  ['voice', 'Voice channel'],
  ['pay', 'Pay'],
]

// label synonyms -> canonical key
const SYN = {
  job: ['job', 'activity', 'job / activity', 'job/activity', 'task'],
  crew: ['crew required', 'crew', 'number of crew required', 'crew needed', 'players', 'crew needed'],
  missionTime: ['mission time', 'est length of time', 'est. length of time', 'length', 'duration', 'time', 'est time'],
  launchTime: ['launch time', 'launch', 'start time', 'start', 'when', 'time to launch', 'meet time'],
  objective: ['objective', 'goal'],
  voice: ['voice channel id', 'voice channel', 'voice', 'vc', 'voice id', 'channel id'],
  pay: ['pay', 'payment', 'reward', 'cut', 'compensation', 'split'],
}
const LABEL_TO_KEY = Object.fromEntries(
  Object.entries(SYN).flatMap(([k, list]) => list.map(l => [l, k]))
)

const REQUIRED = ['job', 'crew', 'objective']

export const JOB_TEMPLATE =
  'Post a job like this — the bot reformats it and removes your message:\n' +
  '```\n' + `${config.bot.prefix} job\n` +
  '[JOB] Daymar salvage run\n' +
  '[CREW REQUIRED] 3\n' +
  '[MISSION TIME] ~2 hours\n' +
  '[LAUNCH TIME] 8pm EST / 2026-09-07 00:00 UTC\n' +
  '[OBJECTIVE] Strip the wrecks, sell RMC at Lorville. Bring a Vulture.\n' +
  '[PAY] Split evenly after fees\n' +
  '[VOICE CHANNEL ID] 123456789012345678\n' +
  '```\n' +
  'Labels are flexible (`[JOB]` / `JOB:` / `Job -`). Job, crew and objective are required.'

export function parseJob(body) {
  const out = {}
  let current = null
  for (const raw of String(body || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let m = line.match(/^\[([^\]]+)\]\s*(.*)$/)
      || line.match(/^([A-Za-z][A-Za-z /.]{1,40}?)\s*[:\-–—]\s*(.*)$/)
    if (m) {
      const key = LABEL_TO_KEY[m[1].trim().toLowerCase().replace(/\s+/g, ' ')]
      if (key) {
        current = key
        out[key] = (out[key] ? out[key] + '\n' : '') + m[2].trim()
        continue
      }
    }
    if (current) out[current] += (out[current] ? '\n' : '') + line
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim()
  return out
}

function renderVoice(v) {
  if (!v) return null
  const id = String(v).match(/\d{5,}/)?.[0]
  return id ? `<#${id}>` : v
}

function renderLaunch(v) {
  if (!v) return null
  const s = String(v).trim()
  const unix = s.match(/^\d{9,11}$/)
  if (unix) return `<t:${s}:F> (<t:${s}:R>)`
  return s
}

export async function handleJob(msg, body) {
  const board = config.bot.jobBoardChannelId
  if (board && msg.channel_id !== board) {
    return { content: `Post jobs in <#${board}>.` }
  }
  if (!body || !body.trim()) return { content: JOB_TEMPLATE }

  const job = parseJob(body)
  const missing = REQUIRED.filter(k => !job[k])
  if (missing.length) {
    const names = { job: '[JOB]', crew: '[CREW REQUIRED]', objective: '[OBJECTIVE]' }
    return { content: `Missing ${missing.map(k => names[k]).join(', ')}.\n\n${JOB_TEMPLATE}` }
  }

  job.voice = renderVoice(job.voice)
  job.launchTime = renderLaunch(job.launchTime)

  const poster = msg.author?.id ? `<@${msg.author.id}>` : (msg.author?.username || 'someone')
  const embed = {
    title: `📋 ${job.job}`.slice(0, 250),
    color: GOLD,
    description: `Posted by ${poster}`,
    fields: FIELDS.filter(([k]) => k !== 'job' && job[k])
      .map(([k, name]) => ({
        name,
        value: String(job[k]).slice(0, 1024),
        inline: ['crew', 'missionTime', 'launchTime', 'voice'].includes(k),
      })),
    footer: { text: `Fighters Guild job board · react ✋ to sign up` },
    timestamp: new Date().toISOString(),
  }

  await sendMessage(msg.channel_id, { embeds: [embed] })

  // Remove the raw request so the board stays clean.
  try {
    await deleteMessage(msg.channel_id, msg.id)
    return null // nothing else to say
  } catch (err) {
    log(`jobBoard: could not delete message ${msg.id}: ${err.message}`)
    return { content: `Posted 👆 — I couldn't remove your message (need **Manage Messages**). Delete it manually to keep things tidy.` }
  }
}
