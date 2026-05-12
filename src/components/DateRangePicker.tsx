import { toDateInput } from '../lib/format';

export interface DateRange {
  from: number; // ms
  to: number;   // ms
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS = [
  { label: '7D',  days: 7 },
  { label: '30D', days: 30 },
  { label: '3M',  days: 90 },
  { label: 'YTD', days: -1 },
] as const;

function presetRange(days: number): DateRange {
  const to = endOfToday();
  if (days === -1) {
    const from = new Date();
    from.setMonth(0, 1);
    from.setHours(0, 0, 0, 0);
    return { from: from.getTime(), to };
  }
  const from = new Date();
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);
  return { from: from.getTime(), to };
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function isPresetActive(range: DateRange, days: number): boolean {
  const p = presetRange(days);
  return Math.abs(range.from - p.from) < 86_400_000 && Math.abs(range.to - p.to) < 86_400_000;
}

export function DateRangePicker({ value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {PRESETS.map(({ label, days }) => (
        <button
          key={label}
          className={`btn ${isPresetActive(value, days) ? 'btn-accent' : ''}`}
          onClick={() => onChange(presetRange(days))}
        >
          {label}
        </button>
      ))}
      <div style={{ width: 1, height: 16, background: 'var(--grid)' }} />
      <input
        type="date"
        className="input"
        style={{ width: 120 }}
        value={toDateInput(value.from)}
        onChange={(e) => {
          const ms = new Date(e.target.value).getTime();
          if (!isNaN(ms)) onChange({ ...value, from: ms });
        }}
      />
      <span style={{ color: 'var(--fg-2)', fontSize: 'var(--font-size-xs)' }}>→</span>
      <input
        type="date"
        className="input"
        style={{ width: 120 }}
        value={toDateInput(value.to)}
        onChange={(e) => {
          const ms = new Date(e.target.value).getTime();
          if (!isNaN(ms)) onChange({ ...value, to: ms + 86_399_999 }); // end of day
        }}
      />
    </div>
  );
}
