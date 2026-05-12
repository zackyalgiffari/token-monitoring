import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface UsageEvent {
  id: string;
  source: 'Claude' | 'Codex';
  timestamp_ms: number;
  session_id: string;
  project: string | null;
  git_branch: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
}

export interface DailyRollup {
  date: string;
  source: string;
  model: string;
  project: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  event_count: number;
}

export interface Budget {
  id: number;
  name: string;
  scope: { All: null } | { Source: string } | { Model: string };
  limit_usd: number;
  period: 'Daily' | 'Monthly';
  enabled: boolean;
}

export interface AlertFired {
  id: number;
  budget_id: number;
  budget_name: string;
  fired_at_ms: number;
  spent_usd: number;
  limit_usd: number;
}

export interface WatcherStatus {
  source: 'claude' | 'codex';
  status: 'active' | 'stopped' | 'no_dir';
}

// Commands
export const queryRecentEvents = (limit?: number) =>
  invoke<UsageEvent[]>('query_recent_events', { limit });

export const queryEventsSince = (since_ms: number) =>
  invoke<UsageEvent[]>('query_events_since', { since_ms });

export const queryDailyRollup = (days?: number) =>
  invoke<DailyRollup[]>('query_daily_rollup', { days });

export const queryCostToday = () =>
  invoke<number>('query_cost_today');

export const queryCostMtd = () =>
  invoke<number>('query_cost_mtd');

export const listBudgets = () =>
  invoke<Budget[]>('list_budgets');

export const saveBudget = (budget: Budget) =>
  invoke<number>('save_budget', { budget });

export const deleteBudget = (id: number) =>
  invoke<void>('delete_budget', { id });

export const listAlertsFired = (limit?: number) =>
  invoke<AlertFired[]>('list_alerts_fired', { limit });

export const exportCsv = (since_ms?: number) =>
  invoke<string>('export_csv', { since_ms });

// Event subscriptions
export const onUsageEvent = (handler: (ev: UsageEvent) => void): Promise<UnlistenFn> =>
  listen<UsageEvent>('usage_event', (e) => handler(e.payload));

export const onAlertFired = (handler: (a: AlertFired) => void): Promise<UnlistenFn> =>
  listen<AlertFired>('alert_fired', (e) => handler(e.payload));

export const onWatcherStatus = (handler: (s: WatcherStatus) => void): Promise<UnlistenFn> =>
  listen<WatcherStatus>('watcher_status', (e) => handler(e.payload));
