import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useMetricsStore } from '../state/useMetricsStore';
import { modelColor, modelShort } from '../lib/format';
import type { UsageEvent } from '../lib/ipc';

const WINDOW_MS = 60 * 60 * 1000;
const BUCKET_MS = 60 * 1000;

export function BurnRateChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const { recentEvents } = useMetricsStore();

  useEffect(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const { timestamps, series, models } = buildSeries(recentEvents);

    const seriesDefs: uPlot.Series[] = [
      {},
      ...models.map((model: string) => ({
        label: modelShort(model),
        stroke: modelColor(model),
        fill: modelColor(model).replace(')', ', 0.08)').replace('var', 'rgba'),
        width: 1.5,
        points: { show: false },
      })),
    ];

    const opts: uPlot.Options = {
      width,
      height,
      cursor: { show: false },
      legend: { show: false },
      axes: [
        {
          stroke: 'var(--fg-2)',
          ticks: { stroke: 'var(--grid)', width: 1 },
          grid: { stroke: 'var(--grid)', width: 1 },
          font: '10px JetBrains Mono',
          values: (_self, ticks) => ticks.map((t) => fmtAxisTime(t)),
        },
        {
          stroke: 'var(--fg-2)',
          ticks: { stroke: 'var(--grid)', width: 1 },
          grid: { stroke: 'var(--grid)', width: 1 },
          font: '10px JetBrains Mono',
          size: 55,
          values: (_self, ticks) => ticks.map((t) => `${t.toFixed(0)}K`),
        },
      ],
      scales: { x: { time: true }, y: { auto: true } },
      series: seriesDefs,
    };

    if (uplotRef.current) uplotRef.current.destroy();
    uplotRef.current = new uPlot(opts, [timestamps, ...series], containerRef.current);

    return () => {
      uplotRef.current?.destroy();
      uplotRef.current = null;
    };
  }, [recentEvents]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />;
}

function buildSeries(events: UsageEvent[]) {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const windowEvents = events.filter((e) => e.timestamp_ms >= windowStart);

  const models = [...new Set(windowEvents.map((e) => e.model))];
  const bucketCount = Math.ceil(WINDOW_MS / BUCKET_MS);
  const timestamps: number[] = [];

  for (let i = 0; i <= bucketCount; i++) {
    timestamps.push((windowStart + i * BUCKET_MS) / 1000);
  }

  const series = models.map((model) => {
    const modelEvents = windowEvents.filter((e) => e.model === model);
    return timestamps.map((ts) => {
      const bucket_start = ts * 1000;
      const bucket_end = bucket_start + BUCKET_MS;
      const bucket = modelEvents.filter(
        (e) => e.timestamp_ms >= bucket_start && e.timestamp_ms < bucket_end
      );
      return bucket.reduce((sum, e) => sum + e.input_tokens + e.output_tokens, 0) / 1000;
    });
  });

  return { timestamps, series, models };
}

function fmtAxisTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
