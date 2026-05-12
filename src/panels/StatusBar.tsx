import { useState, useEffect } from 'react';
import { useMetricsStore } from '../state/useMetricsStore';
import { useWatcherStore } from '../state/useWatcherStore';
import { nowHHMMSS, fmtAge } from '../lib/format';

export function StatusBar() {
  const [time, setTime] = useState(nowHHMMSS());
  const { lastEventMs } = useMetricsStore();
  const { claudeStatus, codexStatus } = useWatcherStore();

  useEffect(() => {
    const id = setInterval(() => setTime(nowHHMMSS()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--bg-2)',
      borderTop: 'var(--border)',
      height: 'var(--status-h)',
      padding: '0 8px',
      fontSize: 'var(--font-size-xs)',
      color: 'var(--fg-2)',
    }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <WatcherDot label="claude" status={claudeStatus} />
        <WatcherDot label="codex" status={codexStatus} />
        {lastEventMs > 0 && (
          <span>last event {fmtAge(lastEventMs)}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <span style={{ letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>{time}</span>
      </div>
    </div>
  );
}

function WatcherDot({ label, status }: { label: string; status: string }) {
  const color = status === 'active' ? 'var(--green)' : status === 'stopped' ? 'var(--red)' : 'var(--fg-2)';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label} watch
    </span>
  );
}
