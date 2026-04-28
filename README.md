# AramMayhemStats

Personal tracker for **ARAM Mayhem** (queue 2400) games in League of Legends. Reads match data straight from the local League Client (LCU API) — Riot's public match-v5 API doesn't expose Mayhem-specific augment data, so the LCU is the only source.

## Features

- **Match history** — every Mayhem game with augment picks per player
- **Champion stats** — per-champ win rates / KDA / damage, sortable
  - Toggle between *My picks* and *All champions* (every champ that appeared in your games)
- **Augment stats** — per-augment win rates, filterable by min games
  - Toggle between *My picks* and *All players*
- **Champion drilldown** — best augments, matchups vs enemy champs, synergies with teammates
- **Chat with Fish** — conversational AI coach (powered by Claude) with full context on your stats; ask "what champs am I best on?" and get specific answers grounded in your data
- **Post-game insights** — Fish analyzes a single match and tells you what worked and what hurt
- **Live champ-select advice** — when you're picking, Fish analyzes your bench, teammate picks, enemy team, and your historical winrates and tells you whether to keep, swap, or reroll
- **Local-only data** — everything stored in a SQLite file on your machine; no servers

---

## For end users (your friends)

### macOS

1. Download `ARAM Mayhem Stats-<version>-arm64.dmg` (Apple Silicon) or `…-x64.dmg` (Intel) from a release.
2. Open the `.dmg` and drag the app to **Applications**.
3. First launch: **right-click** the app and choose **Open** → **Open** when Gatekeeper warns it's unsigned. After that, double-click works normally.
4. Open your **League of Legends** client.
5. Open the app. Within 5–10 seconds the green dot in the bottom-left corner should appear ("Client connected") and your recent Mayhem games will populate.

### Windows 10 / 11

1. Download `ARAM Mayhem Stats-<version>-win-x64.exe` from a release.
2. Double-click the `.exe`. Windows SmartScreen will warn it's unsigned — click **More info** → **Run anyway**.
3. Open your **League of Legends** client.
4. The app auto-detects the client and starts pulling games.

### First-run setup (both platforms)

- **Anthropic API key** (optional, for Fish chat + insights): open **Settings** in the sidebar and paste your key. Get one at https://console.anthropic.com — typical use is well under $1/month for personal tracking. Fish is built on Claude under the hood, so the key goes to api.anthropic.com directly. The key is encrypted with the OS keychain (Electron `safeStorage`); it never leaves your machine.
- **Storage**: your local SQLite database lives at:
  - macOS: `~/Library/Application Support/aram-mayhem-stats/aram-mayhem.db`
  - Windows: `%APPDATA%\aram-mayhem-stats\aram-mayhem.db`

### What you'll see

| Tab | What it shows |
|-----|---------------|
| Matches | Recent Mayhem games. Click any row for the full scoreboard. |
| Champions | Per-champion win rates, sortable. Toggle "My picks" vs "All champions". |
| Augments | Per-augment win rates with min-games filter. Toggle "My picks" vs "All players". |
| Insights | Chat with Fish + live champ-select advice. Requires Anthropic key. |
| Settings | Add or remove your Anthropic API key. |

---

## For developers

### Requirements

- **Node 20+** (tested on Node 24)
- **Python 3.11+** (used during native module builds; if on Python 3.12+ this project pins `node-gyp` v11 via `overrides` because older versions imported the removed `distutils` module)
- **macOS or Windows** (Linux not currently configured)
- **League of Legends client** installed (the app reads its lockfile at runtime)

### Develop

```bash
git clone git@github.com:BryFReed/AramMayhemStats.git
cd AramMayhemStats
npm install
npm run dev
```

`npm run dev` starts `electron-vite` in watch mode and launches Electron with HMR. Edit any source file and the renderer reloads (and the main process relaunches).

### Build distributables

```bash
# macOS dmg (arm64 + x64)
npm run build:mac

# Windows portable .exe (x64)
npm run build:win

# Both platforms in one go
npm run build:all
```

Output goes to `dist/`.

> **Note on cross-building**: `build:win` from macOS works because `better-sqlite3` ships prebuilt Windows binaries on npm; `@electron/rebuild` downloads them automatically. The trailing `electron-builder install-app-deps` in the build scripts restores your host-arch binaries so `npm run dev` keeps working after a cross-build.

### Other scripts

```bash
npm run typecheck   # tsc on main + renderer
npm run build       # electron-vite production build (no installer)
npm run rebuild     # rebuild native modules for the current arch (rarely needed)
```

---

## Architecture

```
src/
├── main/               # Electron main process (Node)
│   ├── index.ts        # App bootstrap
│   ├── lcu.ts          # League Client API: HTTP polling + WebSocket
│   ├── champ-select.ts # Champ-select coordinator (snapshot → LLM)
│   ├── llm.ts          # Anthropic SDK wrapper, prompt caching
│   ├── db.ts           # better-sqlite3 schema + queries
│   ├── dragon.ts       # Static metadata: Data Dragon + Community Dragon
│   ├── settings.ts     # API key storage via Electron safeStorage
│   └── ipc-handlers.ts # IPC channel registrations
├── preload/
│   └── index.ts        # contextBridge — typed `window.api`
└── renderer/           # React 19 + Tailwind v4 UI
    └── src/
        ├── App.tsx
        ├── lib/        # DataContext, RichMarkdown, ScopeToggle, formatters
        └── pages/      # Matches, MatchDetail, Champions, Augments, Insights, Settings
```

### How match data flows

1. `lcu.ts` calls `league-connect.authenticate()` → discovers the lockfile and connects.
2. Every 60s, it walks `/lol-match-history/v1/products/lol/{puuid}/matches`, filters to `queueId === 2400`, fetches per-game detail via `/lol-match-history/v1/games/{gameId}`.
3. Full game JSON is stored in `games.raw_json`; per-participant stats and augments are normalized into `player_stats` and `game_augments` for fast queries. **All 10 participants** are stored, not just yours.

### How live champ-select advice works

1. WebSocket subscription on `/lol-gameflow/v1/gameflow-phase` + `/lol-champ-select/v1/session`.
2. When phase becomes `ChampSelect`, session updates fire repeatedly (someone picks, swaps, rerolls).
3. `champ-select.ts` debounces 1.5s, snapshots `myTeam` + `theirTeam` + `benchChampions` + your historical winrates on each candidate.
4. Snapshot → `llm.champSelectAdvice()` → Claude Haiku 4.5 with prompt caching on the static metadata block (champion + augment reference table).
5. Result streamed via IPC event `champ-select:advice` to the Insights page.

Post-game and trend insights use Claude Sonnet 4.6 over the same cached metadata block.

---

## Reference

Inspired by [Yhprum/mayhem-tracker](https://github.com/Yhprum/mayhem-tracker) — same queue (2400), same `league-connect` library. AramMayhemStats is built fresh from those patterns and adds: macOS support, Windows portable build, LLM analytics, all-player aggregates (champion pool / matchups / synergies / shared augment stats), live champ-select advice.
