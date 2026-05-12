import { useMetricsStore } from '../state/useMetricsStore';
import { fmtCost, fmtTokens, modelColor, modelShort, todayStartMs } from '../lib/format';
import { nowHHMMSS } from '../lib/format';

export function ModelMatrix() {
  const { recentEvents } = useMetricsStore();

  const today = todayStartMs();
  const rows = recentEvents
    .filter((e) => e.timestamp_ms >= today)
    .reduce<Record<string, { model: string; tokens: number; cost: number; cache: number }>>((acc, ev) => {
      if (!acc[ev.model]) acc[ev.model] = { model: ev.model, tokens: 0, cost: 0, cache: 0 };
      acc[ev.model].tokens += ev.input_tokens + ev.output_tokens;
      acc[ev.model].cost += ev.cost_usd;
      acc[ev.model].cache += ev.cache_read_tokens;
      return acc;
    }, {});

  const sorted = Object.values(rows).sort((a, b) => b.cost - a.cost);

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="panel-title">Model Matrix</span>
        <span className="panel-ts">{nowHHMMSS()}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th style={{ textAlign: 'right' }}>Tokens</th>
              <th style={{ textAlign: 'right' }}>Cache</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.model}>
                <td>
                  <span className="model-dot" style={{ background: modelColor(row.model) }} />
                  <span style={{ color: modelColor(row.model), fontWeight: 600 }}>
                    {modelShort(row.model)}
                  </span>
                  <span style={{ color: 'var(--fg-2)', marginLeft: 6, fontSize: 'var(--font-size-xs)' }}>
                    {row.model}
                  </span>
                </td>
                <td style={{ textAlign: 'right', color: 'var(--fg-1)' }}>{fmtTokens(row.tokens)}</td>
                <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmtTokens(row.cache)}</td>
                <td style={{ textAlign: 'right', color: 'var(--amber)', fontWeight: 600 }}>
                  {fmtCost(row.cost, 4)}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--fg-2)', padding: 16 }}>
                  NO DATA TODAY
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
