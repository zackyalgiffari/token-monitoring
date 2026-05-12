import { useMetricsStore } from '../state/useMetricsStore';
import { useProjectStore } from '../state/useProjectStore';
import { BurnRateChart } from '../panels/BurnRateChart';
import { ModelMatrix } from '../panels/ModelMatrix';
import { ActiveSessionsList } from '../panels/ActiveSessionsList';
import { fmtTokens, todayStartMs } from '../lib/format';
import type { UsageEvent } from '../lib/ipc';

export function LiveRoute() {
  const { recentEvents } = useMetricsStore();
  const { groups, selectedGroup } = useProjectStore();

  const today = todayStartMs();
  const selectedGroupObj = groups.find((g) => g.name === selectedGroup) ?? null;

  const filtered: UsageEvent[] = recentEvents.filter((e) => {
    if (e.timestamp_ms < today) return false;
    if (selectedGroupObj) return e.project !== null && selectedGroupObj.projects.includes(e.project);
    return true;
  });

  const totalInput = filtered.reduce((s, e) => s + e.input_tokens, 0);
  const totalOutput = filtered.reduce((s, e) => s + e.output_tokens, 0);
  const totalCache = filtered.reduce((s, e) => s + e.cache_read_tokens, 0);
  const sessionCount = new Set(filtered.map((e) => e.session_id)).size;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gridTemplateRows: 'auto 1fr 1fr', height: '100%', gap: 1, background: 'var(--grid)' }}>

      {/* Stat cards — span full width */}
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--grid)' }}>
        <StatCard label="Total Tokens" value={fmtTokens(totalInput + totalOutput)} sub={`today${selectedGroup ? ` · ${selectedGroup}` : ''}`} color="var(--amber)" />
        <StatCard label="Input" value={fmtTokens(totalInput)} sub="prompt tokens" color="var(--fg-0)" />
        <StatCard label="Output" value={fmtTokens(totalOutput)} sub="completion tokens" color="var(--cyan)" />
        <StatCard label="Sessions" value={String(sessionCount)} sub={`${totalCache > 0 ? `${fmtTokens(totalCache)} cache · ` : ''}active last 5m`} color="var(--green)" />
      </div>

      {/* Burn rate chart */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="panel-header">
          <span className="panel-title">Token Burn Rate — K tokens/min · 60m window</span>
        </div>
        <div style={{ height: 'calc(100% - 22px)' }}>
          <BurnRateChart />
        </div>
      </div>

      {/* Model matrix */}
      <div style={{ gridRow: '2 / 4' }}>
        <ModelMatrix events={filtered} />
      </div>

      {/* Active sessions */}
      <div style={{ gridColumn: 1 }}>
        <ActiveSessionsList events={filtered} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="panel" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.12em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', marginTop: 6 }}>
        {sub}
      </div>
    </div>
  );
}
