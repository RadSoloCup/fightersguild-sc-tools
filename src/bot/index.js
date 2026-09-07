import { config } from '../config.js'
import { log } from '../lib.js'
import { GatewayClient } from './gateway.js'
import { sendMessage, startTyping } from './api.js'
import { parseCommand, runCommand } from './commands.js'
import { warmItemIndex } from './uexItems.js'
import { warmScmdb } from './scmdb.js'

export function startBot() {
  const gw = new GatewayClient()
  warmItemIndex() // build the UEX item index in the background so `!sc find` is fast
  warmScmdb()     // fetch + index the SCMDB blueprint data in the background

  gw.on('ready', () => log(`bot: listening for "${config.bot.prefix} …" commands`))
  gw.on('fatal', code => log(`bot: fatal gateway error ${code} — check FLUXER_BOT_TOKEN`))

  gw.on('message', async d => {
    const parsed = parseCommand(d.content)
    if (!parsed) return
    log(`bot: ${d.author?.username ?? '?'} → ${parsed.cmd} ${parsed.arg}`.trim())
    startTyping(d.channel_id)
    try {
      const reply = await runCommand(parsed, d)
      // A handler may return null/undefined when it has already produced its
      // own output (e.g. the job board posts + deletes the request itself).
      if (reply && (reply.content || reply.embeds)) {
        await sendMessage(d.channel_id, {
          ...reply,
          message_reference: { message_id: d.id, channel_id: d.channel_id },
        })
      }
    } catch (err) {
      log(`bot: reply failed: ${err.message}`)
      try { await sendMessage(d.channel_id, { content: `Error: ${err.message}` }) } catch {}
    }
  })

  gw.start().catch(err => log(`bot: failed to start: ${err.message}`))
  return gw
}
