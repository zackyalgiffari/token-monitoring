import { create } from 'zustand';
import type { AlertFired, Budget } from '../lib/ipc';

interface AlertState {
  budgets: Budget[];
  alertsFired: AlertFired[];
  setBudgets: (b: Budget[]) => void;
  setAlertsFired: (a: AlertFired[]) => void;
  addAlertFired: (a: AlertFired) => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  budgets: [],
  alertsFired: [],
  setBudgets: (budgets) => set({ budgets }),
  setAlertsFired: (alertsFired) => set({ alertsFired }),
  addAlertFired: (a) => set((s) => ({ alertsFired: [a, ...s.alertsFired].slice(0, 200) })),
}));
