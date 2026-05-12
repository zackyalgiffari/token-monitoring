import { useState, useEffect, useRef } from 'react';
import uPlot from 'uplot';
import { useMetricsStore } from '../state/useMetricsStore';
import { useProjectStore } from '../state/useProjectStore';
import { ProjectTreemap } from '../panels/ProjectTreemap';
import { DateRangePicker, type DateRange } from '../components/DateRangePicker';
import { fmtTokens, modelColor, modelShort } from '../lib/format';
import { exportCsv } from '../lib/ipc';
import type { DailyRollup } from '../lib/ipc';

function defaultRange(): DateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - 29);
  from.setHours(0, 0, 0, 0);
  return { from: from.getTime(), to: to.getTime() };
}

export function HistoryRoute() {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const { dailyRollup } = useMetricsStore();
  const { groups, selectedGroup } = useProjectStore();
  const chartRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const [treemapSize, setTreemapSize] = useState({ w: 0, h: 0 });
  const treemapRef = useRef<HTMLDivElement>(null);

  const selectedGroupObj = groups.find((g) => g.name === selectedGroup) ?? null;

  const filtered: DailyRollup[] = dailyRollup.filter((r) => {
    const ms = new Date(r.date).getTime();
    if (ms < range.from || ms > range.to) return false;
    if (selectedGroupObj && r.project !== null && !selectedGroupObj.projects.includes(r.project)) return false;
    return true;
  });

  // Synthetic UsageEvent-like objects for treemap (uses dailyRollup as proxy)
  const treemapEvents = filtered.map((r) => ({
    id: r.date + r.project,
    source: r.source as 'Claude' | 'Codex',
    timestamp_ms: new Date(r.date).getTime(),
    session_id: '',
    project: r.project,
    git_branch: null,
    model: r.model,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cache_creation_tokens: r.cache_creation_tokens,
    cache_read_tokens: r.cache_read_tokens,
    reasoning_tokens: r.reasoning_tokens,
    cost_usd: 0,
  }));

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
        return row ? (row.input_tokens + row.output_tokens) / 1000 : 0; // K tokens
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
        { stroke: 'var(--fg-2)', ticks: { stroke: 'var(--grid)' }, grid: { stroke: 'var(--grid)' }, font: '10px JetBrains Mono', size: 60, values: (_s, ticks) => ticks.map(t => `${t.toFixed(0)}K`) },
      ],
      scales: { x: { time: true }, y: { auto: true } },
      series: seriesDefs,
    };

    uplotRef.current?.destroy();
    uplotRef.current = new uPlot(opts, [timestamps, ...series], chartRef.current);
    return () => { uplotRef.current?.destroy(); uplotRef.current = null; };
  }, [filtered, range]);

  useEffect(() => {
    if (!treemapRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setTreemapSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(treemapRef.current);
    return () => obs.disconnect();
  }, []);

  const handleExport = async () => {
    const csv = await exportCsv(range.from);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `token-usage.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalInput = filtered.reduce((s, r) => s + r.input_tokens, 0);
  const totalOutput = filtered.reduce((s, r) => s + r.output_tokens, 0);
  const totalSessions = filtered.reduce((s, r) => s + r.event_count, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gridTemplateRows: '48px 1fr 200px', height: '100%', gap: 1, background: 'var(--grid)' }}>

      {/* Controls bar */}
      <div className="panel" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12 }}>
        <DateRangePicker value={range} onChange={setRange} />

        {groups.length > 0 && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--grid)' }} />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.08em' }}>GROUP</span>
            <select
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', background: 'var(--bg-0)', border: 'var(--border)', color: 'var(--fg-0)', padding: '3px 8px', outline: 'none' }}
              value={selectedGroup ?? ''}
              onChange={(e) => useProjectStore.getState().selectGroup(e.target.value || null)}
            >
              <option value="">All Projects</option>
              {groups.map((g) => (
                <option key={g.name} value={g.name}>{g.name}</option>
              ))}
            </select>
          </>
        )}

        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--fg-1)', fontSize: 'var(--font-size-sm)' }}>
          {fmtTokens(totalInput + totalOutput)} tokens
          <span style={{ color: 'var(--fg-2)' }}> · </span>
          {fmtTokens(totalInput)} in
          <span style={{ color: 'var(--fg-2)' }}> / </span>
          <span style={{ color: 'var(--cyan)' }}>{fmtTokens(totalOutput)} out</span>
          <span style={{ color: 'var(--fg-2)' }}> · {totalSessions} requests</span>
        </span>
        <button className="btn" onClick={handleExport}>EXPORT CSV</button>
      </div>

      {/* Daily token chart */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="panel-header">
          <span className="panel-title">Daily Tokens by Model — K</span>
        </div>
        <div ref={chartRef} style={{ height: 'calc(100% - 22px)', overflow: 'hidden' }} />
      </div>

      {/* Treemap */}
      <div ref={treemapRef} style={{ gridRow: '2 / 4', overflow: 'hidden' }}>
        {treemapSize.w > 0 && (
          <ProjectTreemap width={treemapSize.w} height={treemapSize.h} events={treemapEvents} />
        )}
      </div>

      {/* Daily table */}
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
  const byDate: Record<string, { input: number; output: number; cache: number; count: number }> = {};
  for (const r of rows) {
    if (!byDate[r.date]) byDate[r.date] = { input: 0, output: 0, cache: 0, count: 0 };
    byDate[r.date].input += r.input_tokens;
    byDate[r.date].output += r.output_tokens;
    byDate[r.date].cache += r.cache_read_tokens;
    byDate[r.date].count += r.event_count;
  }
  const sorted = Object.entries(byDate).sort(([a], [b]) => (a < b ? 1 : -1));
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th style={{ textAlign: 'right' }}>Input</th>
          <th style={{ textAlign: 'right' }}>Output</th>
          <th style={{ textAlign: 'right' }}>Cache</th>
          <th style={{ textAlign: 'right' }}>Req</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(([date, { input, output, cache, count }]) => (
          <tr key={date}>
            <td style={{ color: 'var(--fg-1)' }}>{date}</td>
            <td style={{ textAlign: 'right' }}>{fmtTokens(input)}</td>
            <td style={{ textAlign: 'right', color: 'var(--cyan)' }}>{fmtTokens(output)}</td>
            <td style={{ textAlign: 'right', color: 'var(--green)' }}>{fmtTokens(cache)}</td>
            <td style={{ textAlign: 'right', color: 'var(--fg-2)' }}>{count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmtDay(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
