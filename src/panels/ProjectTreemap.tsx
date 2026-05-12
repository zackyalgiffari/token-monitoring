import { useMemo } from 'react';
import { Group } from '@visx/group';
import { Treemap, hierarchy, treemapSquarify } from '@visx/hierarchy';
import { useMetricsStore } from '../state/useMetricsStore';
import { fmtCost } from '../lib/format';
import { nowHHMMSS } from '../lib/format';

interface Props {
  width: number;
  height: number;
}

export function ProjectTreemap({ width, height }: Props) {
  const { recentEvents } = useMetricsStore();

  const data = useMemo(() => {
    const projectCost: Record<string, number> = {};
    for (const ev of recentEvents) {
      const key = ev.project ?? '(unknown)';
      projectCost[key] = (projectCost[key] ?? 0) + ev.cost_usd;
    }
    return {
      name: 'root',
      children: Object.entries(projectCost)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value })),
    };
  }, [recentEvents]);

  const inner_w = width - 2;
  const inner_h = height - 24; // subtract panel header

  if (data.children.length === 0) {
    return (
      <div className="panel" style={{ height, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <span className="panel-title">Projects</span>
          <span className="panel-ts">{nowHHMMSS()}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-2)', fontSize: 'var(--font-size-xs)' }}>
          NO DATA
        </div>
      </div>
    );
  }

  const root = hierarchy(data)
    .sum((d) => ('value' in d ? (d as { value: number }).value : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const COLORS = ['var(--amber)', 'var(--cyan)', 'var(--green)', 'var(--purple)', 'var(--orange)', 'var(--fg-1)'];

  return (
    <div className="panel" style={{ height, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="panel-title">Projects</span>
        <span className="panel-ts">{nowHHMMSS()}</span>
      </div>
      <svg width={inner_w} height={inner_h}>
        <Treemap
          root={root}
          size={[inner_w, inner_h]}
          tile={treemapSquarify}
          padding={1}
          round={false}
        >
          {(treemap) =>
            treemap.descendants().filter((node) => node.depth > 0).map((node, i) => {
              const { x0, y0, x1, y1 } = node;
              const w = x1 - x0;
              const h = y1 - y0;
              const color = COLORS[i % COLORS.length];
              const d = node.data as { name?: string; value?: number };
              return (
                <Group key={i} left={x0} top={y0}>
                  <rect
                    width={w}
                    height={h}
                    fill={color}
                    fillOpacity={0.12}
                    stroke={color}
                    strokeOpacity={0.3}
                    strokeWidth={1}
                  />
                  {w > 60 && h > 30 && (
                    <>
                      <text
                        x={4}
                        y={13}
                        fill={color}
                        fontSize={9}
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight={600}
                      >
                        {(d.name ?? '').slice(0, Math.floor(w / 7))}
                      </text>
                      {h > 44 && (
                        <text
                          x={4}
                          y={25}
                          fill={color}
                          fillOpacity={0.7}
                          fontSize={9}
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {fmtCost(d.value ?? 0, 3)}
                        </text>
                      )}
                    </>
                  )}
                </Group>
              );
            })
          }
        </Treemap>
      </svg>
    </div>
  );
}
