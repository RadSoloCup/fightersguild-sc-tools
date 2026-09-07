# Fighters Guild — Star Citizen tools

Phase 2 of the [Fighters Guild](https://github.com/RadSoloCup/fightersguild-app)
project: a small service that pushes Star Citizen feeds into a Fluxer channel
via webhook. No bot account, no inbound ports — just outbound HTTPS on a timer.

## Feeds

| Feed | Source | Fires when |
|---|---|---|
| **RSI status** | `status.robertsspaceindustries.com` | overall status or a component (Platform / PU / Arena Commander) changes |
| **Comm-links** | `api.star-citizen.wiki` | a new comm-link is published — patch notes, monthly reports, *This Week in Star Citizen*, etc. (optionally filtered by title/channel) |
| **Funding** | `api.star-citizen.wiki` | crowdfunding total crosses another $1M *(off by default)* |
| **GitHub releases** | GitHub API | a watched repo publishes a new release — [LUG Helper](https://github.com/starcitizen-lug/lug-helper) by default; add more via `GITHUB_RELEASE_REPOS` |

First run of each feed just records a baseline — it won't spam the channel with
back-history.

## Commands (optional bot)

Set `FLUXER_BOT_TOKEN` (a Fluxer bot application token) and guild members can
type these in any channel the bot can see:

| Command | Does |
|---|---|
| `!sc status` | RSI server status right now |
| `!sc version` / `ptu` | current LIVE / PTU patch |
| `!sc patch` | latest patch notes / update comm-link |
| `!sc funding` | crowdfunding total + backers |
| `!sc ship <name>` | ship specs, cargo, crew, pad, roles |
| `!sc buy <name>` | in-game buy + rental locations |
| `!sc pledge <name>` | real-money store price (standalone / warbond / concierge) |
| `!sc compare <a> vs <b>` | two ships side by side |
| `!sc loaner <name>` | loaner ships |
| `!sc trade <commodity>` | best buy/sell prices + spread |
| `!sc sell <commodity>` | top sell terminals |
| `!sc route <commodity>` | most profitable routes (per-SCU, ROI) |
| `!sc profit <commodity> <SCU>` | profit for a given cargo size |
| `!sc fuel` | cheapest hydrogen + quantum fuel |
| `!sc refinery <ore>` | best refinery yield modifiers |
| `!sc find <item>` | where to buy a component / weapon / armor |
| `!sc blueprint <name>` | which contracts reward a blueprint (SCMDB) |
| `!sc mission <name>` | payout, faction, rewards, danger for a contract (SCMDB) |
| `!sc wikelo [name]` | Wikelo Emporium turn-in list (SCMDB) |
| `!sc rep <faction>` | missions that build standing with a faction (SCMDB) |
| `!sc missions <faction>` | a faction's contracts by payout (SCMDB) |
| `!sc citizen <handle>` | RSI citizen record — enlisted, org, country (scraped; RSI has no API) |
| `!sc job` | post a job — the bot reformats it and deletes your message |
| `!sc calc <expr>` | quick math (`k`/`m`/`b` suffixes) |
| `!sc help` | this list |

### `!sc job`

Post a job in the job board channel; the bot reformats it into a clean embed and
**deletes your original message**. Needs **Manage Messages** + Embed Links.

```
!sc job
[JOB] Daymar salvage run
[CREW REQUIRED] 3
[MISSION TIME] ~2 hours
[LAUNCH TIME] 8pm EST      (a bare 10-digit unix timestamp renders as a live time)
[OBJECTIVE] Strip the wrecks, sell RMC at Lorville. Bring a Vulture.
[PAY] Split evenly after fees
[VOICE CHANNEL ID] 123456789012345678   (rendered as a #channel link)
```

Labels are flexible (`[JOB]` / `JOB:` / `Job -`). **Job**, **crew required** and
**objective** are required. Set `JOB_BOARD_CHANNEL_ID` to the job board channel.

Data: UEX Corp (trade, ships, items, refineries), star-citizen.wiki (comm-links,
funding), RSI status. `UEX_API_KEY` is optional — only raises rate limits.

The bot connects to Fluxer's gateway (`v=1`, JSON), listens for `MESSAGE_CREATE`,
and replies via the REST API. Prefix is configurable with `BOT_PREFIX`.

## Setup

1. In Fluxer: target channel → **Integrations → Webhooks → New Webhook**, copy the URL.
2. `cp .env.example sc-tools.env` and paste the URL into `FLUXER_WEBHOOK_URL`.
3. Deploy (see `compose.snippet.yml`) — add the `sc-tools` service to the Fluxer
   Compose project, or run standalone:

   ```bash
   docker run -d --name fluxer-sc-tools --restart unless-stopped \
     --env-file sc-tools.env -v sc-tools-data:/data \
     $(docker build -q .)
   ```

4. Test without waiting for the schedule:

   ```bash
   npm install && npm run once      # runs every enabled feed once and exits
   ```

## Config

All via environment — see `.env.example`. Per-feed webhook overrides
(`FLUXER_WEBHOOK_STATUS`, `_COMMLINK`, `_FUNDING`) let each feed post to a
different channel. Schedules are cron strings.

State (what's already been posted) lives in `/data` — keep that volume.

## Themes

`themes/` holds custom Fluxer CSS themes for the server — see [`themes/README.md`](themes/README.md).
**RSI Blue** is a Star Citizen / RSI-launcher look (navy + cyan).

## Roadmap


| Text in Voice: Adding integrated text-chat spaces directly within voice channels. |
