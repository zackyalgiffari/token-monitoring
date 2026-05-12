import { useMetricsStore } from '../state/useMetricsStore';
import { fmtCost, fmtTokens, fmtAge, modelColor, modelShort } from '../lib/format';
import { nowHHMMSS } from '../lib/format';

const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // sessions with event in last 5m

export function ActiveSessionsList() {
  const { recentEvents } = useMetricsStore();
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;

  // Group by session
  const sessions: Record<string, {
    session_id: string;
    source: string;
    model: string;
    project: string | null;
    last_ms: number;
    tokens: number;
    cost: number;
  }> = {};

  for (const ev of recentEvents) {
    if (ev.timestamp_ms < cutoff) continue;
    const s = sessions[ev.session_id];
    if (!s) {
      sessions[ev.session_id] = {
        session_id: ev.session_id,
        source: ev.source,
        model: ev.model,
        project: ev.project,
        last_ms: ev.timestamp_ms,
        tokens: ev.input_tokens + ev.output_tokens,
        cost: ev.cost_usd,
      };
    } else {
      s.tokens += ev.input_tokens + ev.output_tokens;
      s.cost += ev.cost_usd;
      if (ev.timestamp_ms > s.last_ms) s.last_ms = ev.timestamp_ms;
    }
  }

  const sorted = Object.values(sessions).sort((a, b) => b.last_ms - a.last_ms);

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="panel-title">Active Sessions</span>
        <span className="panel-ts">{nowHHMMSS()}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Project</th>
              <th>Model</th>
              <th style={{ textAlign: 'right' }}>Tokens</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
              <th style={{ textAlign: 'right' }}>Last</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.session_id}>
                <td>
                  <span className={`badge badge-${s.source.toLowerCase()}`}>
                    {s.source}
                  </span>
                </td>
                <td style={{ color: 'var(--fg-1)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.project ?? '—'}
                </td>
                <td>
                  <span className="model-dot" style={{ background: modelColor(s.model) }} />
                  <span style={{ color: modelColor(s.model), fontSize: 'var(--font-size-xs)' }}>
                    {modelShort(s.model)}
                  </span>
                </td>
                <td style={{ textAlign: 'right', color: 'var(--fg-1)' }}>{fmtTokens(s.tokens)}</td>
                <td style={{ textAlign: 'right', color: 'var(--amber)', fontWeight: 600 }}>
                  {fmtCost(s.cost, 4)}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--fg-2)', fontSize: 'var(--font-size-xs)' }}>
                  {fmtAge(s.last_ms)}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-2)', padding: 16 }}>
                  NO ACTIVE SESSIONS
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
