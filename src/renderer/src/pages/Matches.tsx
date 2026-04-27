import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaticData } from '../lib/DataContext';
import { fmtDuration, timeAgo } from '../lib/format';

interface MatchRow {
  gameId: number;
  creationMs: number;
  durationMs: number;
  championId: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  augmentIds: string;
}

export default function Matches() {
  const [games, setGames] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { champions, augments } = useStaticData();

  async function load() {
    const g = await window.api.db.recentGames(100, 0);
    setGames(g as MatchRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const off = window.api.on.gamesUpdated(() => load());
    return off;
  }, []);

  const summary = useMemo(() => {
    const wins = games.reduce((acc, g) => acc + (g.win ? 1 : 0), 0);
    return { games: games.length, wins };
  }, [games]);

  return (
    <div className="p-6">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Recent Mayhem Games</h2>
          {games.length > 0 && (
            <p className="text-sm text-zinc-400 mt-1">
              {games.length} games · {summary.wins}W {summary.games - summary.wins}L
            </p>
          )}
        </div>
        <button
          className="text-sm px-3 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              await window.api.lcu.refresh();
              await load();
            } finally {
              setRefreshing(false);
            }
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : games.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-800 p-8 text-center">
          <p className="text-zinc-400 mb-1">No Mayhem games yet.</p>
          <p className="text-zinc-600 text-sm">
            Open the League client and play a game — it'll show up here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {games.map((g) => {
            const champ = champions.get(g.championId);
            const augIds = g.augmentIds
              ? g.augmentIds.split(',').map(Number).filter(Boolean)
              : [];
            return (
              <Link
                key={g.gameId}
                to={`/matches/${g.gameId}`}
                className={`flex items-center gap-4 p-3 rounded border transition hover:brightness-125 ${
                  g.win
                    ? 'border-emerald-900/60 bg-emerald-950/30'
                    : 'border-rose-900/60 bg-rose-950/20'
                }`}
              >
                {champ?.iconUrl && (
                  <img
                    src={champ.iconUrl}
                    alt={champ.name}
                    className="w-12 h-12 rounded"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {champ?.name ?? `Champion ${g.championId}`}
                  </div>
                  <div className="text-sm text-zinc-400">
                    {g.kills}/{g.deaths}/{g.assists} · {fmtDuration(g.durationMs)} ·{' '}
                    {timeAgo(g.creationMs)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {augIds.map((id) => {
                    const a = augments.get(id);
                    return a?.iconSmall ? (
                      <img
                        key={id}
                        src={a.iconSmall}
                        alt={a.name}
                        title={a.name}
                        className="w-7 h-7 rounded"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        key={id}
                        className="w-7 h-7 rounded bg-zinc-800 text-[9px] flex items-center justify-center text-zinc-500"
                        title={`Augment ${id}`}
                      >
                        ?
                      </span>
                    );
                  })}
                </div>
                <div
                  className={`text-sm font-semibold w-12 text-right ${
                    g.win ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {g.win ? 'WIN' : 'LOSS'}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
