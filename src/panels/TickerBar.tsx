import { useMetricsStore } from '../state/useMetricsStore';
import { useProjectStore } from '../state/useProjectStore';
import { fmtTokens, modelShort, modelColor, todayStartMs } from '../lib/format';
import { getTheme, toggleTheme } from '../lib/theme';
import { useState } from 'react';

export function TickerBar() {
  const { recentEvents } = useMetricsStore();
  const { groups, selectedGroup, selectGroup } = useProjectStore();
  const [theme, setTheme] = useState(getTheme());

  const handleToggleTheme = () => {
    const next = toggleTheme();
    setTheme(next);
  };

  const today = todayStartMs();
  const selectedGroupObj = groups.find((g) => g.name === selectedGroup) ?? null;

  const todayEvents = recentEvents.filter((e) => {
    if (e.timestamp_ms < today) return false;
    if (selectedGroupObj) return e.project !== null && selectedGroupObj.projects.includes(e.project);
    return true;
  });

  const totalTokens = todayEvents.reduce((s, e) => s + e.input_tokens + e.output_tokens, 0);
  const sessions = new Set(todayEvents.map((e) => e.session_id)).size;

  const modelStats = todayEvents.reduce<Record<string, number>>((acc, ev) => {
    acc[ev.model] = (acc[ev.model] ?? 0) + ev.input_tokens + ev.output_tokens;
    return acc;
  }, {});
  const modelEntries = Object.entries(modelStats).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: 'var(--bg-2)',
      borderBottom: 'var(--border)',
      height: 'var(--ticker-h)',
      padding: '0 8px',
      gap: '12px',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: 'var(--font-size-md)', flexShrink: 0 }}>
        ◈
      </span>

      {/* Today summary */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
        <TickerItem label="TODAY" value={fmtTokens(totalTokens)} color="var(--amber)" />
        <TickerItem label="SESSIONS" value={String(sessions)} color="var(--cyan)" />
        <div style={{ width: 1, height: 16, background: 'var(--grid)' }} />
      </div>

      {/* Per-model scrolling ticker */}
      <div style={{ display: 'flex', gap: 12, overflow: 'hidden', flex: 1, alignItems: 'center' }}>
        {modelEntries.map(([model, tokens]) => (
          <TickerModel key={model} model={model} tokens={tokens} />
        ))}
        {modelEntries.length === 0 && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', fontStyle: 'italic' }}>
            NO EVENTS TODAY
          </span>
        )}
      </div>

      {/* Project filter */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.08em' }}>PROJECT</span>
          <select
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              background: 'var(--bg-1)',
              border: 'var(--border)',
              color: 'var(--fg-0)',
              padding: '2px 6px',
              outline: 'none',
            }}
            value={selectedGroup ?? ''}
            onChange={(e) => selectGroup(e.target.value || null)}
          >
            <option value="">All</option>
            {groups.map((g) => (
              <option key={g.name} value={g.name}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Theme toggle */}
      <button
        className="btn"
        style={{ flexShrink: 0, padding: '2px 8px', fontSize: 14 }}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        onClick={handleToggleTheme}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </div>
  );
}

function TickerItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color, letterSpacing: '0.03em' }}>
        {value}
      </span>
    </div>
  );
}

function TickerModel({ model, tokens }: { model: string; tokens: number }) {
  const color = modelColor(model);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontSize: 'var(--font-size-xs)', color, fontWeight: 600, letterSpacing: '0.08em' }}>
        {modelShort(model)}
      </span>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-1)' }}>
        {fmtTokens(tokens)}
      </span>
    </div>
  );
}
