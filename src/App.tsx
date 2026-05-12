import { useEffect, useState } from 'react';
import { TickerBar } from './panels/TickerBar';
import { StatusBar } from './panels/StatusBar';
import { LiveRoute } from './routes/live';
import { HistoryRoute } from './routes/history';
import { AlertsRoute } from './routes/alerts';
import { SettingsRoute } from './routes/settings';
import { useMetricsStore } from './state/useMetricsStore';
import { useAlertStore } from './state/useAlertStore';
import { useWatcherStore } from './state/useWatcherStore';
import {
  onUsageEvent, onAlertFired, onWatcherStatus,
  queryRecentEvents, queryDailyRollup, queryCostToday, queryCostMtd,
  listBudgets, listAlertsFired,
} from './lib/ipc';

type Route = 'live' | 'history' | 'alerts' | 'settings';

const NAV: Array<{ route: Route; icon: string; label: string }> = [
  { route: 'live', icon: '◈', label: 'Live' },
  { route: 'history', icon: '◷', label: 'History' },
  { route: 'alerts', icon: '◎', label: 'Alerts' },
  { route: 'settings', icon: '◉', label: 'Settings' },
];

export function App() {
  const [route, setRoute] = useState<Route>('live');
  const { setRecentEvents, setDailyRollup, setTodayCost, setMtdCost, addEvent } = useMetricsStore();
  const { setBudgets, setAlertsFired, addAlertFired } = useAlertStore();
  const { setClaudeStatus, setCodexStatus } = useWatcherStore();

  // Bootstrap: load historical data and subscribe to live events
  useEffect(() => {
    queryRecentEvents(500).then(setRecentEvents).catch(console.error);
    queryDailyRollup(90).then(setDailyRollup).catch(console.error);
    queryCostToday().then(setTodayCost).catch(console.error);
    queryCostMtd().then(setMtdCost).catch(console.error);
    listBudgets().then(setBudgets).catch(console.error);
    listAlertsFired().then(setAlertsFired).catch(console.error);

    const unlisten = Promise.all([
      onUsageEvent((ev) => {
        addEvent(ev);
        // Refresh daily rollup periodically (debounce: only for history route)
        queryDailyRollup(90).then(setDailyRollup).catch(() => {});
        queryCostToday().then(setTodayCost).catch(() => {});
        queryCostMtd().then(setMtdCost).catch(() => {});
      }),
      onAlertFired((a) => {
        addAlertFired(a);
      }),
      onWatcherStatus((s) => {
        if (s.source === 'claude') setClaudeStatus(s.status);
        else setCodexStatus(s.status);
      }),
    ]);

    return () => {
      unlisten.then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);

  return (
    <div className="app-layout">
      <div className="ticker-bar">
        <TickerBar />
      </div>

      <nav className="nav-rail">
        {NAV.map(({ route: r, icon, label }) => (
          <button
            key={r}
            className={`nav-btn ${route === r ? 'active' : ''}`}
            title={label}
            onClick={() => setRoute(r)}
          >
            {icon}
          </button>
        ))}
      </nav>

      <main className="main-content">
        {route === 'live' && <LiveRoute />}
        {route === 'history' && <HistoryRoute />}
        {route === 'alerts' && <AlertsRoute />}
        {route === 'settings' && <SettingsRoute />}
      </main>

      <div className="status-bar">
        <StatusBar />
      </div>
    </div>
  );
}
