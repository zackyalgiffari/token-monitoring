# Token Monitoring Dashboard — Implementation Plan

## Context

A cross-platform desktop application that reads **local** Claude Code and OpenAI Codex CLI usage data from disk and presents it as a Bloomberg-terminal-style monitoring dashboard. Goal: give the user a single pane of glass across both CLI tools for token burn, cost, historical trends, and budget alerts — without ever calling a remote API or shipping data off the machine.

**Why now:** the user runs both Claude Code (`~/.claude/projects/*.jsonl`) and Codex CLI (`~/.codex/sessions/...`, `~/.codex/state_5.sqlite`) heavily. Token costs are real and opaque. Existing tools (`rtk gain`, Anthropic console) only cover one side; nothing aggregates both.

**Outcome:** a Tauri 2 desktop app that watches local log directories in real time, parses both formats into a unified schema, persists rolled-up metrics to a local SQLite cache, and renders a data-dense terminal UI.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Shell | **Tauri 2** | ~5–10 MB binary, Rust backend ideal for file/JSONL/SQLite parsing, native FS watchers, low memory footprint for a tray-resident app |
| Frontend | **React 18 + Vite + TypeScript** | Mature ecosystem for data-dense UIs; charting libs (visx/uPlot) |
| Charts | **uPlot** (primary) + **visx** (sparkline/treemap) | uPlot is the fastest JS time-series renderer (~1 ms for 100k pts) — required for "live tail" feel |
| State | **Zustand** | Tiny, no boilerplate; one store per domain (sessions, metrics, alerts) |
| Backend cache | **SQLite via `tauri-plugin-sql`** | Embedded, zero-config, query-friendly for historical analytics |
| File watching | **`notify` crate** (already used by `tauri-plugin-fs`) | Detect new sessions / appended JSONL lines |
| Notifications | **`tauri-plugin-notification`** | Budget alerts |
| Tray | **`tauri-plugin-tray-icon`** (built into Tauri 2 core) | Background-resident monitor |

---

## Architecture

```
┌──────────────────────────── Tauri 2 App ────────────────────────────┐
│                                                                      │
│  ┌─── Rust Core ──────────────────────┐    ┌─── React UI ────────┐  │
│  │                                    │    │                     │  │
│  │  watchers/                         │    │  routes/            │  │
│  │   ├ claude_watcher.rs  (JSONL)     │    │   ├ live.tsx        │  │
│  │   └ codex_watcher.rs   (JSONL+SQL) │    │   ├ history.tsx     │  │
│  │                                    │    │   ├ costs.tsx       │  │
│  │  parsers/                          │◀──▶│   ├ sessions.tsx    │  │
│  │   ├ claude.rs                      │ IPC│   └ alerts.tsx      │  │
│  │   └ codex.rs                       │    │                     │  │
│  │                                    │    │  panels/            │  │
│  │  store/                            │    │   ├ TickerBar       │  │
│  │   ├ schema.rs   (unified events)   │    │   ├ BurnRateChart   │  │
│  │   └ db.rs       (SQLite cache)     │    │   ├ ModelMatrix     │  │
│  │                                    │    │   └ ProjectTreemap  │  │
│  │  pricing.rs   (model→USD table)    │    │                     │  │
│  │  alerts.rs    (budget engine)      │    │  state/ (zustand)   │  │
│  │  commands.rs  (Tauri commands)     │    │                     │  │
│  └────────────────────────────────────┘    └─────────────────────┘  │
│                          ▲                                           │
│                          │ emit() events: usage_event, alert_fired   │
└──────────────────────────┼───────────────────────────────────────────┘
                           │
                  Local Disk (read-only):
                  ~/.claude/projects/**/*.jsonl
                  ~/.codex/sessions/YYYY/MM/DD/*.jsonl
                  ~/.codex/state_5.sqlite (threads table)
                  ~/.codex/history.jsonl
```

---

## Data Model (Unified)

All events parsed from either source normalize into one row type stored in the local SQLite cache:

```rust
// src-tauri/src/store/schema.rs
pub struct UsageEvent {
    pub id: String,              // hash(source + session_id + message_id)
    pub source: Source,          // Claude | Codex
    pub timestamp: i64,          // unix millis
    pub session_id: String,
    pub project: Option<String>, // cwd or repo name
    pub git_branch: Option<String>,
    pub model: String,           // e.g. "claude-sonnet-4-6", "gpt-5.3-codex"
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64, // Claude-specific; 0 for Codex
    pub cache_read_tokens: u64,
    pub reasoning_tokens: u64,      // Codex-specific; 0 for Claude
    pub cost_usd: f64,              // computed via pricing.rs
}
```

### Source mapping

| Field | Claude Code path | Codex path |
|---|---|---|
| timestamp | `timestamp` (ISO) | `timestamp` (ISO) in event_msg |
| session_id | `sessionId` | filename UUID / `session_meta.payload.id` |
| project | `cwd` | `state_5.sqlite.threads.cwd` |
| git_branch | `gitBranch` | `state_5.sqlite.threads.git_branch` |
| model | `message.model` | `state_5.sqlite.threads.model` or `turn_context.model` |
| input_tokens | `message.usage.input_tokens` | `event_msg.payload.info.total_token_usage.input_tokens` |
| output_tokens | `message.usage.output_tokens` | `…total_token_usage.output_tokens` |
| cache_creation | `message.usage.cache_creation_input_tokens` | n/a |
| cache_read | `message.usage.cache_read_input_tokens` | `…total_token_usage.cached_input_tokens` |
| reasoning | n/a | `…total_token_usage.reasoning_output_tokens` |

### Pricing

`pricing.rs` ships an embedded table keyed by model name with per-million-token rates (input / output / cache-write / cache-read / reasoning). User can override via Settings → `pricing.json` in `$APPDATA`.

---

## Project Layout

```
token-monitoring/
├── plan.md                       ← this file
├── README.md
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/                          ← React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   ├── panels/
│   ├── state/
│   ├── lib/
│   │   ├── ipc.ts                ← typed wrappers around invoke()
│   │   └── format.ts             ← number/USD/duration formatters
│   └── styles/
│       ├── tokens.css            ← design tokens (CSS vars)
│       └── globals.css
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json          ← fs scope: $HOME/.claude/**, $HOME/.codex/**
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── watchers/
        ├── parsers/
        ├── store/
        ├── pricing.rs
        ├── alerts.rs
        └── commands.rs
```

---

## Aesthetic Direction — "Bloomberg Terminal, but for AI burn"

**Concept:** a financial-terminal screen for AI token spend. Data-dense, multi-panel, monospace-leaning, with high-contrast accents that signal state at a glance.

### Design tokens

```css
:root {
  /* Backgrounds */
  --bg-0:  #0a0a0b;   /* deepest — chrome */
  --bg-1:  #111114;   /* panel */
  --bg-2:  #16161a;   /* panel-elevated */
  --grid:  #1f1f25;   /* subtle gridlines */

  /* Text */
  --fg-0:  #e8e6df;   /* primary */
  --fg-1:  #9a988f;   /* secondary */
  --fg-2:  #5a584f;   /* tertiary / axis */

  /* Semantic */
  --pos:   #ffb000;   /* amber — "live", accumulating spend */
  --neg:   #ff3b3b;   /* over-budget */
  --neut:  #6cb6ff;   /* idle / informational */
  --cool:  #00d4aa;   /* cache savings (good thing) */

  /* Tickers (one per model family) */
  --m-sonnet: #ffb000;
  --m-opus:   #ff7a59;
  --m-haiku:  #b08eff;
  --m-gpt5:   #00d4aa;
  --m-gpt53:  #6cb6ff;
}
```

### Typography

- **Display / numeric:** `JetBrains Mono` (tabular figures) — non-negotiable for a terminal aesthetic; aligns columns of numbers.
- **UI labels:** `Berkeley Mono` if licensed, fallback `IBM Plex Mono`. Avoid Inter/Roboto/system-ui entirely.
- **Headings:** `Söhne Mono` or `Commit Mono` (display weight) — set in ALL CAPS with wide tracking for panel titles, mimicking ticker headers.

### Layout

- **Top:** fixed ticker bar showing today/MTD totals scrolling horizontally per model, color-coded.
- **Body:** 12-col grid; panels are first-class citizens with sharp 1px borders (`--grid`), no rounded corners > 2px. Asymmetric — left rail wider for the live chart, right rail stacked with model matrix + alerts.
- **Bottom:** status bar with watcher state ("● claude watch · ● codex watch · last event 2s ago"), keybind hints.
- Every panel has a tiny `[ HH:MM:SS ]` heartbeat in the corner.

### Motion (sparingly)

- New events flash the relevant cell amber for 200 ms (CSS `@keyframes flash`).
- Charts redraw on event without full re-render (uPlot incremental `setData`).
- No page transitions. No bouncy spring physics. This is a terminal.

### Memorable detail

- A **CRT-grain overlay** (`background: url(noise.png); mix-blend-mode: overlay; opacity: .04`) on the chrome.
- The cost number in the header ticks up digit-by-digit when a new event lands (like an odometer / Mission Control fuel gauge).

---

## Implementation Milestones (each = one GitHub issue → one branch off `dev`)

> Note: per the user's workflow rules, `dev` does not yet exist on origin. **First action** is `git push origin main:dev` (or create via gh) so future branches can target it.

### Issue #1 — Repo & dev workflow setup
- Create `dev` branch on origin
- Add `.gitignore` (Node + Rust + Tauri targets)
- Add `CLAUDE.md` with project conventions
- gh: `gh repo edit --default-branch main`, confirm `dev` exists

### Issue #2 — Tauri 2 scaffold
- `npm create tauri-app@latest` → React + TS + Vite template
- Add plugins: `tauri-plugin-fs`, `tauri-plugin-sql` (SQLite), `tauri-plugin-notification`, `tauri-plugin-store`, `tauri-plugin-log`
- Configure `capabilities/default.json` with `scope-home` style permissions limited to `$HOME/.claude/**` and `$HOME/.codex/**` (read-only)
- App launches with a single empty panel; `cargo tauri dev` works

### Issue #3 — Claude JSONL parser (Rust)
- `parsers/claude.rs`: stream-parse `*.jsonl`, filter `type == "assistant" && message.usage`, emit `UsageEvent`
- Unit tests against 3 real fixture files copied into `tests/fixtures/`
- One-shot CLI command `cargo run --bin scan-claude` that prints aggregates — useful for verification

### Issue #4 — Codex parser (Rust)
- `parsers/codex.rs`: handle both data sources
  - SQLite: `SELECT id, model, tokens_used, cwd, git_branch, created_at FROM threads`
  - JSONL: per-turn deltas from `~/.codex/sessions/**/*.jsonl` token_count events
- Reconcile so a thread isn't double-counted (treat SQLite as authoritative for totals, JSONL for per-turn timeline)

### Issue #5 — SQLite cache + initial backfill
- `store/db.rs`: schema migrations (`usage_events`, `daily_rollup`, `budgets`)
- On app start, scan all historical files once → populate DB; persist last-scanned mtime per file to skip on next launch

### Issue #6 — Live watchers
- `watchers/claude_watcher.rs` + `codex_watcher.rs` using the `notify` crate
- Debounce, parse only new lines (track byte offset per file)
- `app.emit("usage_event", event)` to frontend

### Issue #7 — Pricing engine
- `pricing.rs` with embedded table for Claude (Opus 4.x, Sonnet 4.x, Haiku 4.x) and OpenAI (gpt-5.x, codex variants)
- Optional override file `$APPDATA/pricing.json`
- Recompute `cost_usd` on every event

### Issue #8 — Frontend shell + design tokens
- Implement `tokens.css`, `globals.css`, base layout grid
- Build the **TickerBar** and **StatusBar** components first (they exercise the whole IPC pipeline)
- Set up Zustand stores; subscribe to `usage_event` via `listen()`

### Issue #9 — Live route
- BurnRateChart (uPlot, rolling 60-min window, per-model series)
- ActiveSessionsList (compact table)
- DigitOdometer cost component

### Issue #10 — History route
- Day/Week/Month tabs, stacked area chart of cost-by-model
- ProjectTreemap (visx) sized by spend
- CSV export command

### Issue #11 — Budget alerts
- `alerts.rs` engine evaluates rules on every event (daily $, monthly $, per-model token caps)
- Native notification via `tauri-plugin-notification`
- Alerts route shows history + rule editor

### Issue #12 — Tray icon + autostart
- Minimize-to-tray; click tray to toggle window
- Optional autostart at login via `tauri-plugin-autostart`

### Issue #13 — Packaging
- macOS `.dmg`, Windows `.msi`, Linux `.AppImage` via `tauri build`
- GitHub Actions workflow for tagged releases (`.github/workflows/release.yml`)
- Code-signing left as a follow-up (documented in README)

---

## Critical Files To Create

| Path | Purpose |
|---|---|
| `src-tauri/src/parsers/claude.rs` | JSONL → `UsageEvent` |
| `src-tauri/src/parsers/codex.rs` | JSONL + SQLite → `UsageEvent` |
| `src-tauri/src/watchers/*.rs` | `notify`-based file watchers |
| `src-tauri/src/store/schema.rs` | Unified event type + SQL migrations |
| `src-tauri/src/pricing.rs` | Model → USD table, cost compute |
| `src-tauri/src/alerts.rs` | Budget rule engine |
| `src-tauri/src/commands.rs` | `invoke` surface: `query_events`, `get_rollup`, `list_budgets`, `save_budget`, `export_csv` |
| `src-tauri/capabilities/default.json` | Sandboxed FS scope |
| `src/lib/ipc.ts` | Typed `invoke<T>()` + `listen()` wrappers |
| `src/styles/tokens.css` | Design tokens (see above) |
| `src/routes/live.tsx`, `history.tsx`, `costs.tsx`, `sessions.tsx`, `alerts.tsx` | Pages |
| `src/panels/TickerBar.tsx`, `BurnRateChart.tsx`, `ModelMatrix.tsx`, `ProjectTreemap.tsx`, `StatusBar.tsx` | Panel components |

---

## Verification

After each milestone:

1. **Parsers** — `cargo test -p token-monitoring-core` against fixture JSONL/SQLite files. Confirm aggregates match what `rtk gain` and a manual `jq` sum produce.
2. **Live watcher** — open Claude Code in another terminal, send one message; new event must appear in the dashboard within 2 s.
3. **Cost** — pick one historical day, manually compute expected USD from `jq` sums × pricing table, compare to dashboard.
4. **Alerts** — set a $0.01 daily budget, trigger a Claude session, confirm native notification fires.
5. **Packaging** — `cargo tauri build` produces a working `.AppImage` (and `.msi` if on Windows); double-clicking launches the app and history is intact.
6. **End-to-end** — leave the app running for 24 h with both Claude Code and Codex CLI in active use; on the next morning the history view should show that day's burn rate with no parse errors in `tauri-plugin-log`.

---

## Out of Scope (v1)

- Multi-machine sync (would require a cloud component — violates "local only")
- Remote API polling (Anthropic console, OpenAI usage API) — could be a v2 plugin
- Mobile builds — Tauri 2 supports it but the data lives on the desktop
- AI-generated summaries of usage patterns ("you spent 40% more on Opus this week because…") — v2

---

## Open questions to revisit before coding

- Do you want session-level **prompt content** visible in the dashboard (privacy-sensitive) or only **metadata + token counts**? Default plan: metadata only; raw prompts stay on disk.
- Should the app try to also read any **RTK** sqlite or analytics it keeps? (If yes, point me at the path.)
- Preferred monospace font — JetBrains Mono is the default; swap if you have a licensed alternative (Berkeley Mono, Commit Mono, MonoLisa).
