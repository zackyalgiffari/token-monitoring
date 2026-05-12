export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });
}

export function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

export function nowHHMMSS(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

export function ageSec(ms: number): number {
  return Math.floor((Date.now() - ms) / 1000);
}

export function fmtAge(ms: number): string {
  const s = ageSec(ms);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function modelColor(model: string): string {
  if (model.includes('opus')) return 'var(--m-opus)';
  if (model.includes('sonnet')) return 'var(--m-sonnet)';
  if (model.includes('haiku')) return 'var(--m-haiku)';
  if (model.includes('gpt-5.3') || model.includes('codex')) return 'var(--m-gpt53)';
  if (model.includes('gpt-5') || model.includes('gpt5')) return 'var(--m-gpt5)';
  return 'var(--m-other)';
}

export function modelShort(model: string): string {
  const map: Record<string, string> = {
    'claude-opus-4-7': 'OPS-4.7',
    'claude-opus-4': 'OPS-4',
    'claude-sonnet-4-6': 'SON-4.6',
    'claude-sonnet-4': 'SON-4',
    'claude-haiku-4-5': 'HAI-4.5',
    'claude-haiku-4': 'HAI-4',
    'gpt-5.5': 'GPT-5.5',
    'gpt-5.3-codex': 'CDX-5.3',
    'gpt-4o': 'GPT-4O',
    'gpt-4o-mini': '4O-MINI',
    'o1': 'O1',
    'o3': 'O3',
    'o4-mini': 'O4-MINI',
  };
  for (const [key, short] of Object.entries(map)) {
    if (model.includes(key) || model === key) return short;
  }
  return model.slice(0, 8).toUpperCase();
}

export function todayStartMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function monthStartMs(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function toDateInput(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateInput(s: string): number {
  return new Date(s).getTime();
}
