import { Cron } from 'croner'
import { config, assertConfig } from './config.js'
import { log } from './lib.js'
import { rsiStatus } from './monitors/rsiStatus.js'
import { commLinks } from './monitors/commLinks.js'
import { funding } from './monitors/funding.js'
import { githubReleases } from './monitors/githubReleases.js'
import { startBot } from './bot/index.js'

const MONITORS = { rsiStatus, commLinks, funding, githubReleases }

async function runFeed(name) {
  const feed = config.feeds[name]
  try {
    await MONITORS[name](feed)
  } catch (err) {
    log(`${name}: ERROR ${err.message}`)
  }
}

const active = assertConfig()
log(`fightersguild-sc-tools starting — feeds: [${active.join(', ') || 'none'}]` +
    (config.bot.enabled ? ' + command bot' : ''))

if (config.runOnce) {
  await Promise.all(active.map(runFeed))
  log('run-once complete')
  process.exit(0)
}

for (const name of active) {
  const feed = config.feeds[name]
  runFeed(name) // fire once on boot
  new Cron(feed.cron, { name, protect: true }, () => runFeed(name))
  log(`${name}: scheduled "${feed.cron}"`)
}

let bot = null
if (config.bot.enabled) bot = startBot()

function shutdown() {
  try { bot?.stop() } catch {}
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
