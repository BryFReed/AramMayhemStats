import { useEffect, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Matches from './pages/Matches';
import MatchDetail from './pages/MatchDetail';
import Champions from './pages/Champions';
import ChampionDetail from './pages/ChampionDetail';
import Augments from './pages/Augments';
import Insights from './pages/Insights';
import Settings from './pages/Settings';

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `px-3 py-2 rounded text-sm transition ${
          isActive
            ? 'bg-zinc-800 text-zinc-50'
            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<{ games: number; wins: number }>({ games: 0, wins: 0 });

  useEffect(() => {
    const offStatus = window.api.on.lcuStatus((s) => setConnected(s.connected));
    const refreshStats = () => {
      window.api.db.overallStats().then(setStats).catch(() => {});
    };
    refreshStats();
    const offGames = window.api.on.gamesUpdated(refreshStats);
    return () => {
      offStatus();
      offGames();
    };
  }, []);

  const winrate = stats.games ? Math.round((stats.wins / stats.games) * 100) : 0;

  return (
    <div className="flex h-screen flex-col">
      <div className="titlebar h-9 shrink-0" />
      <div className="flex flex-1 min-h-0">
        <aside className="w-52 border-r border-zinc-800 px-3 pb-4 flex flex-col gap-1">
          <h1 className="text-base font-semibold mb-2 px-2">ARAM Mayhem</h1>
          <NavItem to="/" label="Matches" />
          <NavItem to="/champions" label="Champions" />
          <NavItem to="/augments" label="Augments" />
          <NavItem to="/insights" label="Insights" />
          <NavItem to="/settings" label="Settings" />

          <div className="mt-auto flex flex-col gap-2 text-xs px-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-emerald-500' : 'bg-zinc-600'
                }`}
              />
              <span className="text-zinc-400">
                {connected ? 'Client connected' : 'Waiting for client…'}
              </span>
            </div>
            {stats.games > 0 && (
              <div className="text-zinc-500">
                {stats.games} games · {winrate}% win
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Matches />} />
            <Route path="/matches/:gameId" element={<MatchDetail />} />
            <Route path="/champions" element={<Champions />} />
            <Route path="/champions/:championId" element={<ChampionDetail />} />
            <Route path="/augments" element={<Augments />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

