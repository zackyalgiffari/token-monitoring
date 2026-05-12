# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Full dev (Rust + Vite hot-reload, opens app window)
npm run tauri dev

# Production binaries → src-tauri/target/release/bundle/
npm run tauri build

# Frontend only (no Rust compile — useful for pure UI work)
npm run dev

# Rust compile check without running
cd src-tauri && cargo check
```

**Linux/WSL2 — required system packages before first build:**
```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libgtk-3-dev pkg-config build-essential
```

If port 1420 is already in use from a previous dev session: `lsof -ti:1420 | xargs kill -9`

There is no automated test suite. Use `cargo check` to validate Rust compilation.

## Architecture

This is a **Tauri 2** desktop app: Rust backend exposes IPC commands, a React/Vite/TS frontend renders the dashboard.

### Data Flow

```
~/.claude/projects/**/*.jsonl  ──► parsers/claude.rs ─┐
~/.codex/sessions/**/*.jsonl   ──► parsers/codex.rs  ─┤─► store/db.rs (SQLite)
~/.codex/state_5.sqlite        ──► parsers/codex.rs  ─┘         │
                                                           commands.rs (IPC)
                                                                  │
                                                         src/lib/ipc.ts
                                                                  │
                                                    Zustand stores → React panels
                                                         alerts.rs → OS notifications
```

### Startup Sequence (`src-tauri/src/lib.rs`)

1. Open/create `$APPDATA/token-monitoring/token-monitoring.sqlite` in WAL mode
2. Load pricing table (built-in, optionally merged with `$APPDATA/pricing.json`)
3. Backfill Claude JSONL history — tracks `(mtime_ms, byte_offset)` per file in `scan_state` table so re-runs skip already-parsed content
4. Spawn two long-running async watchers: `claude_watcher` on `~/.claude/projects/` and `codex_watcher` on `~/.codex/`

### Backend Modules (`src-tauri/src/`)

| Module | Responsibility |
|---|---|
| `lib.rs` | App init, plugin registration, backfill, watcher spawn |
| `commands.rs` | All `#[tauri::command]` handlers — thin wrappers over `Db` methods |
| `store/db.rs` | SQLite: tables `usage_events`, `scan_state`, `budgets`, `alerts_fired` |
| `store/schema.rs` | `UsageEvent`, `Budget`/`BudgetScope`/`BudgetPeriod`, `AlertFired`, `DailyRollup` |
| `pricing.rs` | Hard-coded model prices for Claude 3/4 + Codex; override via `pricing.json` |
| `parsers/claude.rs` | JSONL parser: `type=assistant` records → `UsageEvent`; supports byte-offset resume |
| `parsers/codex.rs` | Codex session JSONL (`token_count` events) + `state_5.sqlite` threads table |
| `watchers/claude_watcher.rs` | `notify` file watcher → parse → insert → emit `usage_event` → evaluate alerts |
| `watchers/codex_watcher.rs` | Same for Codex; also polls SQLite on startup |
| `alerts.rs` | `AlertEngine::evaluate()` — fires native OS notification + `alert_fired` event |

**Event deduplication:** `insert_event()` uses `INSERT OR IGNORE`. Event IDs are `SHA256("source:session_id:message_id")` truncated to 12 hex bytes.

**Alert re-arm:** `AlertEngine` keeps `last_fired: HashMap<budget_id, date>` in memory only — alerts re-arm on process restart.

### Frontend (`src/`)

**Routing:** Manual — `App.tsx` renders one of four route components (`live`, `history`, `alerts`, `settings`) based on local state. `react-router-dom` is a dependency but not used for routing.

**State (Zustand):**
- `state/useMetricsStore.ts` — `recentEvents`, `dailyRollup`, `todayCost`, `mtdCost`
- `state/useAlertStore.ts` — `budgets`, `alertsFired`
- `state/useWatcherStore.ts` — watcher status per source (`active | stopped | no_dir`)

**IPC (`src/lib/ipc.ts`):** All `invoke()` calls and `listen()` subscriptions are typed here. Commands: `queryRecentEvents`, `queryEventsSince`, `queryDailyRollup`, `queryCostToday`, `queryCostMtd`, `listBudgets`, `saveBudget`, `deleteBudget`, `listAlertsFired`, `exportCsv`. Events received: `usage_event`, `alert_fired`, `watcher_status`.

**Charting:** `BurnRateChart` uses `uPlot` (fast canvas-based time-series). `ProjectTreemap` uses `@visx/hierarchy`.

**Styling:** Bloomberg-terminal aesthetic — JetBrains Mono, `#09090b` background, `#ffb000` amber accent. CSS custom properties in `src/styles/tokens.css`; layout grid in `src/styles/globals.css`.

### Pricing Override

Create `$APPDATA/token-monitoring/pricing.json` to add or override model prices:
```json
{
  "my-custom-model": {
    "input_per_m": 3.0,
    "output_per_m": 15.0,
    "cache_write_per_m": 3.75,
    "cache_read_per_m": 0.30,
    "reasoning_per_m": 15.0
  }
}
```
