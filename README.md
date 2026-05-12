# Token Monitor

A Tauri 2 desktop app that tracks local Claude Code and OpenAI Codex CLI token usage with a Bloomberg-terminal-style dashboard.

## Prerequisites

### Linux / WSL2

```bash
sudo apt-get update && sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libssl-dev \
  libgtk-3-dev \
  pkg-config \
  build-essential
```

### Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

### Node.js 20+

```bash
npm install
```

## Run in development

```bash
npm run tauri dev
```

## Data Sources

| Source | Location | What's read |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` | `type=assistant` events with `message.usage` |
| Codex sessions | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` | `event_msg` token_count events |
| Codex SQLite | `~/.codex/state_5.sqlite` | `threads` table (aggregate totals) |

## Build for release

```bash
npm run tauri build
```

Produces `.AppImage` (Linux), `.msi` (Windows), `.dmg` (macOS) in `src-tauri/target/release/bundle/`.

## Pricing Override

Create `$APPDATA/token-monitoring/pricing.json` to override any model price:

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

## Architecture

See [plan.md](./plan.md) for full architecture and module breakdown.
