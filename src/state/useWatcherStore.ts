import { create } from 'zustand';

interface WatcherState {
  claudeStatus: 'active' | 'stopped' | 'no_dir' | 'unknown';
  codexStatus: 'active' | 'stopped' | 'no_dir' | 'unknown';
  setClaudeStatus: (s: WatcherState['claudeStatus']) => void;
  setCodexStatus: (s: WatcherState['codexStatus']) => void;
}

export const useWatcherStore = create<WatcherState>((set) => ({
  claudeStatus: 'unknown',
  codexStatus: 'unknown',
  setClaudeStatus: (claudeStatus) => set({ claudeStatus }),
  setCodexStatus: (codexStatus) => set({ codexStatus }),
}));
