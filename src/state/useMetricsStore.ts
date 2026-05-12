import { create } from 'zustand';
import type { UsageEvent, DailyRollup } from '../lib/ipc';
import { todayStartMs, monthStartMs } from '../lib/format';

interface MetricsState {
  recentEvents: UsageEvent[];
  dailyRollup: DailyRollup[];
  todayCost: number;
  mtdCost: number;
  lastEventMs: number;

  addEvent: (ev: UsageEvent) => void;
  setRecentEvents: (evs: UsageEvent[]) => void;
  setDailyRollup: (rows: DailyRollup[]) => void;
  setTodayCost: (v: number) => void;
  setMtdCost: (v: number) => void;
}

export const useMetricsStore = create<MetricsState>((set, get) => ({
  recentEvents: [],
  dailyRollup: [],
  todayCost: 0,
  mtdCost: 0,
  lastEventMs: 0,

  addEvent: (ev) =>
    set((s) => {
      const updated = [ev, ...s.recentEvents].slice(0, 1000);
      const todayDelta = ev.timestamp_ms >= todayStartMs() ? ev.cost_usd : 0;
      const mtdDelta = ev.timestamp_ms >= monthStartMs() ? ev.cost_usd : 0;
      return {
        recentEvents: updated,
        todayCost: s.todayCost + todayDelta,
        mtdCost: s.mtdCost + mtdDelta,
        lastEventMs: Math.max(s.lastEventMs, ev.timestamp_ms),
      };
    }),

  setRecentEvents: (evs) => {
    const lastMs = evs.length > 0 ? Math.max(...evs.map((e) => e.timestamp_ms)) : 0;
    set({ recentEvents: evs, lastEventMs: lastMs });
  },
  setDailyRollup: (rows) => set({ dailyRollup: rows }),
  setTodayCost: (v) => set({ todayCost: v }),
  setMtdCost: (v) => set({ mtdCost: v }),
}));
