import { useEffect, useMemo, useState } from 'react';
import { useStaticData } from '../lib/DataContext';
import { pct, stripHtml } from '../lib/format';
import { ScopeToggle, type Scope } from '../lib/ScopeToggle';

interface AugStat {
  augmentId: number;
  games: number;
  wins: number;
}

type SortKey = 'games' | 'winrate';

export default function Augments() {
  const [scope, setScope] = useState<Scope>('mine');
  const [stats, setStats] = useState<AugStat[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('games');
  const [minGames, setMinGames] = useState(0);
  const { augments } = useStaticData();

  useEffect(() => {
    const fetcher =
      scope === 'mine' ? window.api.db.augmentStats() : window.api.db.augmentStatsAll();
    fetcher.then((s) => setStats(s as AugStat[]));
  }, [scope]);

  const filtered = useMemo(() => {
    const copy = stats.filter((s) => s.games >= minGames);
    copy.sort((a, b) => {
      if (sortKey === 'winrate') return b.wins / b.games - a.wins / a.games;
      return b.games - a.games;
    });
    return copy;
  }, [stats, sortKey, minGames]);

  return (
    <div className="p-6">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Augments</h2>
          <p className="text-sm text-zinc-500 mt-1">
            {scope === 'mine'
              ? 'Augments you have picked.'
              : 'Augments any player picked across your recorded games.'}
          </p>
        </div>
        <ScopeToggle value={scope} onChange={setScope} />
      </div>

      <div className="mb-3 flex items-center gap-3 text-sm">
        <label className="text-zinc-400">
          Min games:{' '}
          <select
            value={minGames}
            onChange={(e) => setMinGames(parseInt(e.target.value, 10))}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
          >
            <option value={0}>1+</option>
            <option value={3}>3+</option>
            <option value={5}>5+</option>
            <option value={10}>10+</option>
            <option value={20}>20+</option>
          </select>
        </label>
        <label className="text-zinc-400">
          Sort:{' '}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
          >
            <option value="games">Most picked</option>
            <option value="winrate">Win rate</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-zinc-500">No data yet.</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((s) => {
            const a = augments.get(s.augmentId);
            const winrate = s.games ? s.wins / s.games : 0;
            return (
              <div
                key={s.augmentId}
                className="flex items-center gap-3 p-2 rounded bg-zinc-900/60"
              >
                {a?.iconSmall ? (
                  <img src={a.iconSmall} alt={a.name} className="w-9 h-9 rounded" />
                ) : (
                  <span className="w-9 h-9 rounded bg-zinc-800" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{a?.name ?? `Augment ${s.augmentId}`}</div>
                  {a?.desc && (
                    <div className="text-xs text-zinc-500 line-clamp-1">{stripHtml(a.desc)}</div>
                  )}
                </div>
                <div className="text-xs tabular-nums text-zinc-400 w-16 text-right">
                  {s.games} {s.games === 1 ? 'pick' : 'picks'}
                </div>
                <div
                  className={`text-sm tabular-nums w-12 text-right ${
                    winrate >= 0.55
                      ? 'text-emerald-400'
                      : winrate < 0.45
                      ? 'text-rose-400'
                      : 'text-zinc-300'
                  }`}
                >
                  {pct(s.wins, s.games)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
