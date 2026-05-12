import { useMetricsStore } from '../state/useMetricsStore';
import { DigitOdometer } from '../panels/DigitOdometer';
import { BurnRateChart } from '../panels/BurnRateChart';
import { ModelMatrix } from '../panels/ModelMatrix';
import { ActiveSessionsList } from '../panels/ActiveSessionsList';
import { fmtCost } from '../lib/format';

export function LiveRoute() {
  const { todayCost, mtdCost } = useMetricsStore();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gridTemplateRows: '120px 1fr 1fr', height: '100%', gap: 1, background: 'var(--grid)' }}>
      {/* Cost summary top-left */}
      <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 24px' }}>
        <div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.12em', marginBottom: 4 }}>TODAY</div>
          <DigitOdometer value={todayCost} decimals={4} fontSize="var(--font-size-3xl)" />
        </div>
        <div style={{ width: 1, height: 60, background: 'var(--grid)' }} />
        <div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.12em', marginBottom: 4 }}>MTD</div>
          <DigitOdometer value={mtdCost} decimals={2} fontSize="var(--font-size-2xl)" color="var(--fg-0)" />
        </div>
      </div>

      {/* Model matrix top-right spans 2 rows */}
      <div style={{ gridRow: '1 / 3' }}>
        <ModelMatrix />
      </div>

      {/* Burn rate chart */}
      <div className="panel" style={{ gridRow: 2, overflow: 'hidden' }}>
        <div className="panel-header">
          <span className="panel-title">Burn Rate — tokens/min (60m window)</span>
        </div>
        <div style={{ height: 'calc(100% - 22px)' }}>
          <BurnRateChart />
        </div>
      </div>

      {/* Active sessions spans full width bottom */}
      <div style={{ gridColumn: '1 / -1', gridRow: 3 }}>
        <ActiveSessionsList />
      </div>
    </div>
  );
}
