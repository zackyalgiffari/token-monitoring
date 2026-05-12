import { useEffect, useState } from 'react';
import { TickerBar } from './panels/TickerBar';
import { StatusBar } from './panels/StatusBar';
import { LiveRoute } from './routes/live';
import { HistoryRoute } from './routes/history';
import { ProjectsRoute } from './routes/projects';
import { SettingsRoute } from './routes/settings';
import { useMetricsStore } from './state/useMetricsStore';
import { useWatcherStore } from './state/useWatcherStore';
import {
  onUsageEvent, onWatcherStatus,
  queryRecentEvents, queryDailyRollup,
} from './lib/ipc';

type Route = 'live' | 'history' | 'projects' | 'settings';

const NAV: Array<{ route: Route; icon: string; label: string }> = [
  { route: 'live',     icon: '◈', label: 'Dashboard' },
  { route: 'history',  icon: '◷', label: 'Analytics' },
  { route: 'projects', icon: '◧', label: 'Projects' },
  { route: 'settings', icon: '◉', label: 'Settings' },
];

export function App() {
  const [route, setRoute] = useState<Route>('live');
  const { setRecentEvents, setDailyRollup, addEvent } = useMetricsStore();
  const { setClaudeStatus, setCodexStatus } = useWatcherStore();

  useEffect(() => {
    queryRecentEvents(500).then(setRecentEvents).catch(console.error);
    queryDailyRollup(90).then(setDailyRollup).catch(console.error);

    const unlisten = Promise.all([
      onUsageEvent((ev) => {
        addEvent(ev);
        queryDailyRollup(90).then(setDailyRollup).catch(() => {});
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
        {route === 'live'     && <LiveRoute />}
        {route === 'history'  && <HistoryRoute />}
        {route === 'projects' && <ProjectsRoute />}
        {route === 'settings' && <SettingsRoute />}
      </main>

      <div className="status-bar">
        <StatusBar />
      </div>
    </div>
  );
}
