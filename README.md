# Fighters Guild, Star Citizen tools

A small service that pushes Star Citizen feeds into a Fighters Guild chat channel
and answers `!sc` commands in chat. It runs next to the guild's
[Fluxer](https://github.com/fluxerapp/fluxer) server. The feeds need only
outbound HTTPS on a timer; the command bot needs a bot token and a gateway
connection.

Part of the wider Fighters Guild toolset alongside the
[desktop client](https://github.com/RadSoloCup/fightersguild-app),
[Portal](https://github.com/RadSoloCup/fightersguild-portal),
[DJ bot](https://github.com/RadSoloCup/fightersguild-dj), and
[Discord bridge](https://github.com/RadSoloCup/fightersguild-crosstalk).

---

## Feeds

Each feed posts to a chat channel through a webhook when something changes.

| Feed | Source | Fires when |
|---|---|---|
| **RSI status** | `status.robertsspaceindustries.com` | overall status, or a component (Platform, Persistent Universe, Arena Commander), changes |
| **Comm-links** | `api.star-citizen.wiki` | a new comm-link is published: patch notes, monthly reports, This Week in Star Citizen, and so on. Optionally filtered by title or channel. |
| **Funding** | `api.star-citizen.wiki` | the crowdfunding total crosses another million dollars. Off by default. |
| **GitHub releases** | GitHub API | a watched repo publishes a new release. [LUG Helper](https://github.com/starcitizen-lug/lug-helper) by default; add more with `GITHUB_RELEASE_REPOS`. |

The first run of each feed records a baseline only, so it does not backfill the
channel with history.

---

## Command bot

Set `FLUXER_BOT_TOKEN` to a bot application token and guild members can type
these in any channel the bot can see. Prefix is `!sc`, configurable with
`BOT_PREFIX`.

### Status and patches

| Command | Result |
|---|---|
| `!sc status` | RSI service status right now |
| `!sc version` / `!sc ptu` | current LIVE or PTU patch |
| `!sc patch` | latest patch notes or update comm-link |
| `!sc funding` | crowdfunding total and backer count |

### Ships

| Command | Result |
|---|---|
| `!sc ship <name>` | specs, cargo, crew, pad size, roles |
| `!sc buy <name>` | in game buy and rental locations |
| `!sc pledge <name>` | real money store price (standalone, warbond, concierge) |
| `!sc compare <a> vs <b>` | two ships side by side |
| `!sc loaner <name>` | loaner ships |

### Trade and industry

| Command | Result |
|---|---|
| `!sc trade <commodity>` | best buy and sell prices with the spread |
| `!sc sell <commodity>` | top sell terminals |
| `!sc route <commodity>` | most profitable routes, per SCU and ROI |
| `!sc profit <commodity> <SCU>` | profit for a given cargo size |
| `!sc fuel` | cheapest hydrogen and quantum fuel |
| `!sc refinery <ore>` | best refinery yield modifiers |
| `!sc find <item>` | where to buy a component, weapon, or armour piece |

### Missions and reputation (SCMDB)

| Command | Result |
|---|---|
| `!sc blueprint <name>` | which contracts reward a blueprint |
| `!sc mission <name>` | payout, faction, rewards, danger for a contract |
| `!sc wikelo [name]` | Wikelo Emporium turn in list |
| `!sc rep <faction>` | missions that build standing with a faction |
| `!sc missions <faction>` | a faction's contracts by payout |

### Other

| Command | Result |
|---|---|
| `!sc citizen <handle>` | RSI citizen record: enlisted date, org, country (scraped, RSI has no public API) |
| `!sc job` | post a job, the bot reformats it and deletes your message |
| `!sc calc <expr>` | quick math with `k`, `m`, `b` suffixes |
| `!sc help` | the command list |

### `!sc job`

Post a job in the job board channel and the bot turns it into a clean embed, then
**deletes your original message**. It needs Manage Messages and Embed Links.

```
!sc job
[JOB] Daymar salvage run
[CREW REQUIRED] 3
[MISSION TIME] ~2 hours
[LAUNCH TIME] 8pm EST      (a bare 10 digit unix timestamp renders as a live time)
[OBJECTIVE] Strip the wrecks, sell RMC at Lorville. Bring a Vulture.
[PAY] Split evenly after fees
[VOICE CHANNEL ID] 123456789012345678   (rendered as a #channel link)
```

Labels are flexible (`[JOB]`, `JOB:`, `Job -`). Job, crew required, and objective
are required. Set `JOB_BOARD_CHANNEL_ID` to the job board channel.

For a full sign up sheet with crew roles and ship coverage, use the
[Portal](https://github.com/RadSoloCup/fightersguild-portal) mission board; `!sc
job` is the quick chat version.

The bot connects to the chat gateway, listens for message events, and replies
over the REST API.

---

## Setup

1. In the chat server: target channel, then Integrations, then Webhooks, then New
   Webhook. Copy the URL.
2. `cp .env.example sc-tools.env` and paste the URL into `FLUXER_WEBHOOK_URL`.
3. Deploy. Add the `sc-tools` service from `compose.snippet.yml` to the Fluxer
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

Everything is set through the environment, see `.env.example`. Per feed webhook
overrides (`FLUXER_WEBHOOK_STATUS`, `_COMMLINK`, `_FUNDING`) let each feed post to
a different channel. Schedules are cron strings. `UEX_API_KEY` is optional and
only raises rate limits.

State (what has already been posted) lives in `/data`. Keep that volume.

## Themes

`themes/` holds custom chat CSS themes for the server, see
[`themes/README.md`](themes/README.md). **RSI Blue** is a navy and cyan Star
Citizen launcher look, and is the theme the desktop client and Portal use too.

## Credits

| Source | Used for | |
|---|---|---|
| [**UEX Corp**](https://uexcorp.space) | trade prices, routes, ship and item locations, refinery yields, fuel | community run, [support UEX](https://uexcorp.space/apps) |
| [**Star Citizen Wiki**](https://star-citizen.wiki) (`api.star-citizen.wiki`) | comm-links, crowdfunding stats | community run |
| [**SCMDB**](https://scmdb.net), Star Citizen Master Database | blueprints, contract payouts, Wikelo turn ins, faction reputation | community run |
| [**RSI status page**](https://status.robertsspaceindustries.com) | live service status | Cloud Imperium Games |
| [robertsspaceindustries.com](https://robertsspaceindustries.com) | citizen records, scraped because RSI has no public API | Cloud Imperium Games |
| [GitHub REST API](https://docs.github.com/rest) | new release notifications | GitHub |
| [`croner`](https://github.com/hexagon/croner) | the scheduler | MIT |
| [**Fluxer**](https://github.com/fluxerapp/fluxer) | the chat platform, gateway and webhook protocol | AGPL-3.0 |

**Star Citizen&reg;**, **Squadron 42&reg;**, **Roberts Space Industries&reg;**,
and **Cloud Imperium&reg;** are trademarks of Cloud Imperium Rights LLC. This is
an unofficial fan project and is not affiliated with or endorsed by Cloud
Imperium Games, nor by UEX Corp, the Star Citizen Wiki, or SCMDB. All game data
belongs to its respective owners.

## License

Copyright &copy; 2026 Fighters Guild. Licensed under the
[GNU AGPL v3](https://www.gnu.org/licenses/agpl-3.0.html), see [`LICENSE`](LICENSE).

Running a modified version as a network service obliges you to offer its source
to users (AGPL section 13). The `themes/` CSS is under the same license.

---

Made in Canada 🇨🇦
