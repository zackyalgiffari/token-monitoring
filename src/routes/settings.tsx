import { useEffect, useState } from 'react';
import { load } from '@tauri-apps/plugin-store';

export function SettingsRoute() {
  const [autostart, setAutostart] = useState(false);

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--fg-2)', marginBottom: 20 }}>
        SETTINGS
      </div>

      <SettingRow label="Autostart at login" description="Launch Token Monitor when you log in">
        <input type="checkbox" checked={autostart} onChange={(e) => setAutostart(e.target.checked)} />
      </SettingRow>

      <div style={{ marginTop: 32, borderTop: 'var(--border)', paddingTop: 20 }}>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.1em', marginBottom: 12 }}>PRICING OVERRIDE</div>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', lineHeight: 1.8, marginBottom: 8 }}>
          Create <code style={{ color: 'var(--amber)' }}>$APPDATA/token-monitoring/pricing.json</code> to override per-model prices. Format:
        </p>
        <pre style={{
          background: 'var(--bg-0)', border: 'var(--border)', padding: 12,
          fontSize: 'var(--font-size-xs)', color: 'var(--fg-1)', overflow: 'auto',
        }}>
{`{
  "my-custom-model": {
    "input_per_m": 3.0,
    "output_per_m": 15.0,
    "cache_write_per_m": 3.75,
    "cache_read_per_m": 0.30,
    "reasoning_per_m": 15.0
  }
}`}
        </pre>
      </div>

      <div style={{ marginTop: 32, borderTop: 'var(--border)', paddingTop: 20 }}>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.1em', marginBottom: 12 }}>DATA SOURCES</div>
        <SettingRow label="Claude Code logs" description="~/.claude/projects/**/*.jsonl" />
        <SettingRow label="Codex sessions" description="~/.codex/sessions/**/*.jsonl" />
        <SettingRow label="Codex SQLite" description="~/.codex/state_5.sqlite (thread totals)" />
      </div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description: string; children?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: 'var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--fg-0)' }}>{label}</div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', marginTop: 2 }}>{description}</div>
      </div>
      {children}
    </div>
  );
}
