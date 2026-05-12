import { create } from 'zustand';
import type { UsageEvent, DailyRollup } from '../lib/ipc';

interface MetricsState {
  recentEvents: UsageEvent[];
  dailyRollup: DailyRollup[];
  lastEventMs: number;

  addEvent: (ev: UsageEvent) => void;
  setRecentEvents: (evs: UsageEvent[]) => void;
  setDailyRollup: (rows: DailyRollup[]) => void;
}

export const useMetricsStore = create<MetricsState>((set) => ({
  recentEvents: [],
  dailyRollup: [],
  lastEventMs: 0,

  addEvent: (ev) =>
    set((s) => ({
      recentEvents: [ev, ...s.recentEvents].slice(0, 1000),
      lastEventMs: Math.max(s.lastEventMs, ev.timestamp_ms),
    })),

  setRecentEvents: (evs) => {
    const lastMs = evs.length > 0 ? Math.max(...evs.map((e) => e.timestamp_ms)) : 0;
    set({ recentEvents: evs, lastEventMs: lastMs });
  },
  setDailyRollup: (rows) => set({ dailyRollup: rows }),
}));
