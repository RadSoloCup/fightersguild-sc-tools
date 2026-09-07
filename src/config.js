// Configuration from environment. Each feed can post to its own channel
// webhook, or fall back to FLUXER_WEBHOOK_URL.
const env = process.env

function webhook(name) {
  return (
    env[`FLUXER_WEBHOOK_${name}`] ||
    env.FLUXER_WEBHOOK_URL ||
    (env.DRY_RUN === '1' ? 'dry-run' : null)
  )
}

function apiBase() {
  if (env.FLUXER_API_BASE) return env.FLUXER_API_BASE.replace(/\/$/, '')
  const wh = env.FLUXER_WEBHOOK_URL || env.FLUXER_WEBHOOK_STATUS || env.FLUXER_WEBHOOK_COMMLINK
  try { return new URL(wh).origin } catch { return null }
}

export const config = {
  runOnce: env.RUN_ONCE === '1' || env.RUN_ONCE === 'true',
  stateDir: env.STATE_DIR || '/data',
  userAgent:
    env.USER_AGENT ||
    'fightersguild-sc-tools (+https://github.com/RadSoloCup/fightersguild-app)',

  // Interactive command bot (optional — needs a Fluxer bot application token).
  bot: {
    enabled: !!env.FLUXER_BOT_TOKEN,
    token: env.FLUXER_BOT_TOKEN || null,
    apiBase: apiBase(),
    prefix: env.BOT_PREFIX || '!sc',
    uexApiKey: env.UEX_API_KEY || null,
    // If set, `!sc job` only works in this channel; new job channels are
    // created under its category.
    jobBoardChannelId: env.JOB_BOARD_CHANNEL_ID || null,
  },

  feeds: {
    // RSI service status — posts when the overall status or a component changes.
    rsiStatus: {
      enabled: env.FEED_RSI_STATUS !== 'off',
      webhook: webhook('STATUS'),
      cron: env.CRON_RSI_STATUS || '*/5 * * * *',
    },
    // New comm-links (patch notes, monthly reports, This Week in Star Citizen…).
    commLinks: {
      enabled: env.FEED_COMM_LINKS !== 'off',
      webhook: webhook('COMMLINK'),
      cron: env.CRON_COMM_LINKS || '*/20 * * * *',
      // Substring match (case-insensitive) on title OR channel; empty = all.
      filter: (env.COMM_LINK_FILTER || '').split(',').map(s => s.trim()).filter(Boolean),
    },
    // Crowdfunding milestones — posts each time funding crosses another $1M.
    funding: {
      enabled: env.FEED_FUNDING === 'on',
      webhook: webhook('FUNDING'),
      cron: env.CRON_FUNDING || '0 */6 * * *',
      stepUsd: Number(env.FUNDING_STEP_USD || 1_000_000),
    },
    // New GitHub releases for watched repos (LUG Helper by default — the
    // Star Citizen Linux User Group's launcher/helper).
    githubReleases: {
      enabled: env.FEED_GITHUB_RELEASES !== 'off',
      webhook: webhook('RELEASES'),
      cron: env.CRON_GITHUB_RELEASES || '17 * * * *',
      repos: (env.GITHUB_RELEASE_REPOS || 'starcitizen-lug/lug-helper')
        .split(',').map(s => s.trim()).filter(Boolean),
      includePrereleases: env.GITHUB_RELEASE_PRERELEASES === 'on',
    },
  },
}

export function assertConfig() {
  const active = Object.entries(config.feeds).filter(([, f]) => f.enabled)
  const missing = active.filter(([, f]) => !f.webhook).map(([n]) => n)
  if (missing.length) {
    throw new Error(
      `Missing webhook URL for: ${missing.join(', ')}. ` +
      `Set FLUXER_WEBHOOK_URL or a per-feed FLUXER_WEBHOOK_* var.`
    )
  }
  if (config.bot.enabled && !config.bot.apiBase) {
    throw new Error('FLUXER_BOT_TOKEN is set but no API base — set FLUXER_API_BASE or FLUXER_WEBHOOK_URL.')
  }
  if (active.length === 0 && !config.bot.enabled) {
    throw new Error('Nothing to do — enable a feed or set FLUXER_BOT_TOKEN')
  }
  return active.map(([n]) => n)
}
