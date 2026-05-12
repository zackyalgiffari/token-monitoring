import { useEffect, useRef } from 'react';
import { useMetricsStore } from '../state/useMetricsStore';
import { fmtCost, fmtTokens, modelShort, modelColor } from '../lib/format';

export function TickerBar() {
  const { todayCost, mtdCost, recentEvents } = useMetricsStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Aggregate per-model stats from today
  const modelStats = recentEvents
    .filter((e) => e.timestamp_ms >= todayStartMs())
    .reduce<Record<string, { tokens: number; cost: number }>>((acc, ev) => {
      const key = ev.model;
      if (!acc[key]) acc[key] = { tokens: 0, cost: 0 };
      acc[key].tokens += ev.input_tokens + ev.output_tokens;
      acc[key].cost += ev.cost_usd;
      return acc;
    }, {});

  const modelEntries = Object.entries(modelStats).sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="ticker-bar" style={{
      display: 'flex',
      alignItems: 'center',
      background: 'var(--bg-2)',
      borderBottom: 'var(--border)',
      height: 'var(--ticker-h)',
      padding: '0 8px',
      gap: '16px',
      overflow: 'hidden',
    }}>
      {/* Fixed totals section */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexShrink: 0 }}>
        <TickerItem label="TODAY" value={fmtCost(todayCost, 4)} color="var(--amber)" />
        <TickerItem label="MTD" value={fmtCost(mtdCost, 2)} color="var(--fg-0)" />
        <div style={{ width: 1, height: 16, background: 'var(--grid)' }} />
      </div>

      {/* Scrolling model ticker */}
      <div ref={scrollRef} style={{
        display: 'flex',
        gap: '16px',
        overflow: 'hidden',
        flex: 1,
      }}>
        {modelEntries.map(([model, stats]) => (
          <TickerModel key={model} model={model} tokens={stats.tokens} cost={stats.cost} />
        ))}
        {modelEntries.length === 0 && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', fontStyle: 'italic' }}>
            NO EVENTS TODAY — WAITING FOR USAGE
          </span>
        )}
      </div>
    </div>
  );
}

function TickerItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color, letterSpacing: '0.03em' }}>
        {value}
      </span>
    </div>
  );
}

function TickerModel({ model, tokens, cost }: { model: string; tokens: number; cost: number }) {
  const color = modelColor(model);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontSize: 'var(--font-size-xs)', color, fontWeight: 600, letterSpacing: '0.08em' }}>
        {modelShort(model)}
      </span>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-1)' }}>
        {fmtTokens(tokens)}
      </span>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)' }}>
        {fmtCost(cost, 3)}
      </span>
    </div>
  );
}

function todayStartMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
