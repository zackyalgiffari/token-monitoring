import { useState, useEffect, useRef } from 'react';
import uPlot from 'uplot';
import { useMetricsStore } from '../state/useMetricsStore';
import { ProjectTreemap } from '../panels/ProjectTreemap';
import { fmtCost, fmtTokens, modelColor, modelShort } from '../lib/format';
import { exportCsv } from '../lib/ipc';
import type { DailyRollup } from '../lib/ipc';

type Period = '7' | '30' | '90';

export function HistoryRoute() {
  const [period, setPeriod] = useState<Period>('30');
  const { dailyRollup } = useMetricsStore();
  const chartRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const [treemapSize, setTreemapSize] = useState({ w: 0, h: 0 });
  const treemapRef = useRef<HTMLDivElement>(null);

  const days = parseInt(period);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const filtered = dailyRollup.filter((r) => new Date(r.date) >= cutoff);

  // Build chart data
  useEffect(() => {
    if (!chartRef.current) return;
    const { width, height } = chartRef.current.getBoundingClientRect();
    if (width === 0) return;

    const models = [...new Set(filtered.map((r) => r.model))];
    const dateSet = [...new Set(filtered.map((r) => r.date))].sort();
    const timestamps = dateSet.map((d) => new Date(d).getTime() / 1000);

    const series = models.map((model) =>
      dateSet.map((date) => {
        const row = filtered.find((r) => r.model === model && r.date === date);
        return row ? row.cost_usd : 0;
      })
    );

    const seriesDefs: uPlot.Series[] = [
      {},
      ...models.map((model) => ({
        label: modelShort(model),
        stroke: modelColor(model),
        fill: modelColor(model),
        width: 0,
        paths: uPlot.paths.bars!({ size: [0.6, 100] }),
        points: { show: false },
      })),
    ];

    const opts: uPlot.Options = {
      width, height,
      cursor: { show: false },
      legend: { show: false },
      axes: [
        { stroke: 'var(--fg-2)', ticks: { stroke: 'var(--grid)' }, grid: { stroke: 'var(--grid)' }, font: '10px JetBrains Mono', values: (_s, ticks) => ticks.map(t => fmtDay(t)) },
        { stroke: 'var(--fg-2)', ticks: { stroke: 'var(--grid)' }, grid: { stroke: 'var(--grid)' }, font: '10px JetBrains Mono', size: 60, values: (_s, ticks) => ticks.map(t => `$${t.toFixed(2)}`) },
      ],
      scales: { x: { time: true }, y: { auto: true } },
      series: seriesDefs,
    };

    uplotRef.current?.destroy();
    uplotRef.current = new uPlot(opts, [timestamps, ...series], chartRef.current);
    return () => { uplotRef.current?.destroy(); uplotRef.current = null; };
  }, [filtered, period]);

  useEffect(() => {
    if (!treemapRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setTreemapSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(treemapRef.current);
    return () => obs.disconnect();
  }, []);

  const handleExport = async () => {
    const since = cutoff.getTime();
    const csv = await exportCsv(since);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `token-usage-${period}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Totals row
  const totals = filtered.reduce(
    (acc, r) => ({ cost: acc.cost + r.cost_usd, tokens: acc.tokens + r.input_tokens + r.output_tokens }),
    { cost: 0, tokens: 0 }
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gridTemplateRows: '48px 1fr 220px', height: '100%', gap: 1, background: 'var(--grid)' }}>
      {/* Controls bar */}
      <div className="panel" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12 }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.1em' }}>PERIOD</span>
        {(['7', '30', '90'] as Period[]).map((p) => (
          <button key={p} className={`btn ${period === p ? 'btn-accent' : ''}`} onClick={() => setPeriod(p)}>
            {p}D
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--fg-1)', fontSize: 'var(--font-size-sm)' }}>
          {fmtTokens(totals.tokens)} tokens · <span style={{ color: 'var(--amber)' }}>{fmtCost(totals.cost, 2)}</span>
        </span>
        <button className="btn" onClick={handleExport}>EXPORT CSV</button>
      </div>

      {/* Stacked bar chart */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="panel-header">
          <span className="panel-title">Daily Cost by Model</span>
        </div>
        <div ref={chartRef} style={{ height: 'calc(100% - 22px)', overflow: 'hidden' }} />
      </div>

      {/* Treemap */}
      <div ref={treemapRef} style={{ gridRow: '2 / 4', overflow: 'hidden' }}>
        {treemapSize.w > 0 && (
          <ProjectTreemap width={treemapSize.w} height={treemapSize.h} />
        )}
      </div>

      {/* Table */}
      <div className="panel" style={{ overflow: 'auto' }}>
        <div className="panel-header">
          <span className="panel-title">By Day</span>
        </div>
        <DailyTable rows={filtered} />
      </div>
    </div>
  );
}

function DailyTable({ rows }: { rows: DailyRollup[] }) {
  const byDate: Record<string, { cost: number; tokens: number }> = {};
  for (const r of rows) {
    if (!byDate[r.date]) byDate[r.date] = { cost: 0, tokens: 0 };
    byDate[r.date].cost += r.cost_usd;
    byDate[r.date].tokens += r.input_tokens + r.output_tokens;
  }
  const sorted = Object.entries(byDate).sort(([a], [b]) => (a < b ? 1 : -1));
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th style={{ textAlign: 'right' }}>Tokens</th>
          <th style={{ textAlign: 'right' }}>Cost</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(([date, { cost, tokens }]) => (
          <tr key={date}>
            <td style={{ color: 'var(--fg-1)' }}>{date}</td>
            <td style={{ textAlign: 'right', color: 'var(--fg-1)' }}>{fmtTokens(tokens)}</td>
            <td style={{ textAlign: 'right', color: 'var(--amber)' }}>{fmtCost(cost, 4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmtDay(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
