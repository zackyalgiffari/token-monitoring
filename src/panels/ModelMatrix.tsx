import { useMetricsStore } from '../state/useMetricsStore';
import { fmtTokens, modelColor, modelShort, todayStartMs, nowHHMMSS } from '../lib/format';
import type { UsageEvent } from '../lib/ipc';

interface Props {
  events?: UsageEvent[];
}

export function ModelMatrix({ events }: Props) {
  const { recentEvents } = useMetricsStore();
  const source = events ?? recentEvents;

  const today = todayStartMs();
  const rows = source
    .filter((e) => e.timestamp_ms >= today)
    .reduce<Record<string, { model: string; input: number; output: number; cache: number; count: number }>>((acc, ev) => {
      if (!acc[ev.model]) acc[ev.model] = { model: ev.model, input: 0, output: 0, cache: 0, count: 0 };
      acc[ev.model].input += ev.input_tokens;
      acc[ev.model].output += ev.output_tokens;
      acc[ev.model].cache += ev.cache_read_tokens;
      acc[ev.model].count += 1;
      return acc;
    }, {});

  const sorted = Object.values(rows).sort((a, b) => (b.input + b.output) - (a.input + a.output));
  const maxTokens = sorted[0] ? sorted[0].input + sorted[0].output : 1;

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="panel-title">Models · Today</span>
        <span className="panel-ts">{nowHHMMSS()}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sorted.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--fg-2)', fontSize: 'var(--font-size-xs)' }}>
            NO DATA TODAY
          </div>
        ) : (
          sorted.map((row) => {
            const total = row.input + row.output;
            const pct = total / maxTokens;
            const color = modelColor(row.model);
            return (
              <div key={row.model} style={{ padding: '8px 12px', borderBottom: 'var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="model-dot" style={{ background: color }} />
                    <span style={{ color, fontWeight: 600, fontSize: 'var(--font-size-xs)', letterSpacing: '0.08em' }}>
                      {modelShort(row.model)}
                    </span>
                  </div>
                  <span style={{ color: 'var(--fg-0)', fontSize: 'var(--font-size-xs)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtTokens(total)}
                  </span>
                </div>
                {/* Bar */}
                <div style={{ height: 3, background: 'var(--bg-3)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct * 100}%`, background: color, opacity: 0.6 }} />
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)' }}>
                  <span>in {fmtTokens(row.input)}</span>
                  <span>out {fmtTokens(row.output)}</span>
                  {row.cache > 0 && <span style={{ color: 'var(--green)' }}>cache {fmtTokens(row.cache)}</span>}
                  <span style={{ marginLeft: 'auto' }}>{row.count} req</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
