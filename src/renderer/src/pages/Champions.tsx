import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaticData } from '../lib/DataContext';
import { pct } from '../lib/format';
import { ScopeToggle } from '../lib/ScopeToggle';

interface MyChampStat {
  championId: number;
  games: number;
  wins: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDamage: number;
}

interface PoolStat {
  championId: number;
  games: number;
  wins: number;
  myGames: number;
}

type Mode = 'mine' | 'all';
type SortKey = 'games' | 'winrate' | 'kda' | 'damage' | 'mine';

export default function Champions() {
  const [mode, setMode] = useState<Mode>('mine');
  const [mineStats, setMineStats] = useState<MyChampStat[]>([]);
  const [poolStats, setPoolStats] = useState<PoolStat[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('games');
  const [minGames, setMinGames] = useState(0);
  const { champions } = useStaticData();

  useEffect(() => {
    window.api.db.championStats().then((s) => setMineStats(s as MyChampStat[]));
    window.api.db.championPool().then((s) => setPoolStats(s as PoolStat[]));
  }, []);

  const sortedMine = useMemo(() => {
    const copy = mineStats.slice();
    copy.sort((a, b) => {
      switch (sortKey) {
        case 'winrate':
          return b.wins / b.games - a.wins / a.games;
        case 'kda':
          return (
            (b.avgKills + b.avgAssists) / Math.max(1, b.avgDeaths) -
            (a.avgKills + a.avgAssists) / Math.max(1, a.avgDeaths)
          );
        case 'damage':
          return b.avgDamage - a.avgDamage;
        default:
          return b.games - a.games;
      }
    });
    return copy;
  }, [mineStats, sortKey]);

  const sortedPool = useMemo(() => {
    const copy = poolStats.filter((s) => s.games >= minGames);
    copy.sort((a, b) => {
      switch (sortKey) {
        case 'winrate':
          return b.wins / b.games - a.wins / a.games;
        case 'mine':
          return b.myGames - a.myGames;
        default:
          return b.games - a.games;
      }
    });
    return copy;
  }, [poolStats, sortKey, minGames]);

  return (
    <div className="p-6">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Champions</h2>
          <p className="text-sm text-zinc-500 mt-1">
            {mode === 'mine'
              ? 'Champions you have played in Mayhem.'
              : 'Every champion that appeared in your games (you + teammates + enemies).'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScopeToggle
            value={mode}
            onChange={setMode}
            mineLabel="My picks"
            allLabel="All champions"
          />
        </div>
      </div>

      {mode === 'all' && (
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
        </div>
      )}

      {mode === 'mine' ? (
        sortedMine.length === 0 ? (
          <p className="text-zinc-500">No games yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-zinc-500 border-b border-zinc-800">
                <th className="py-2 px-3">Champion</th>
                <SortHeader label="Games" current={sortKey} value="games" onClick={setSortKey} />
                <SortHeader label="Win Rate" current={sortKey} value="winrate" onClick={setSortKey} />
                <SortHeader label="Avg KDA" current={sortKey} value="kda" onClick={setSortKey} />
                <SortHeader label="Avg Damage" current={sortKey} value="damage" onClick={setSortKey} />
              </tr>
            </thead>
            <tbody>
              {sortedMine.map((s) => {
                const champ = champions.get(s.championId);
                const winrate = s.games ? s.wins / s.games : 0;
                return (
                  <tr key={s.championId} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                    <td className="py-2 px-3">
                      <Link
                        to={`/champions/${s.championId}`}
                        className="flex items-center gap-2 hover:text-zinc-50"
                      >
                        {champ?.iconUrl && (
                          <img src={champ.iconUrl} alt={champ.name} className="w-7 h-7 rounded" />
                        )}
                        <span>{champ?.name ?? `Champion ${s.championId}`}</span>
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{s.games}</td>
                    <td
                      className={`py-2 px-3 text-right tabular-nums ${
                        winrate >= 0.55
                          ? 'text-emerald-400'
                          : winrate < 0.45
                          ? 'text-rose-400'
                          : 'text-zinc-300'
                      }`}
                    >
                      {pct(s.wins, s.games)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-300">
                      {s.avgKills.toFixed(1)}/{s.avgDeaths.toFixed(1)}/{s.avgAssists.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-300">
                      {Math.round(s.avgDamage).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : sortedPool.length === 0 ? (
        <p className="text-zinc-500">No data yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500 border-b border-zinc-800">
              <th className="py-2 px-3">Champion</th>
              <SortHeader label="Total Games" current={sortKey} value="games" onClick={setSortKey} />
              <SortHeader label="Win Rate" current={sortKey} value="winrate" onClick={setSortKey} />
              <SortHeader label="My Picks" current={sortKey} value="mine" onClick={setSortKey} />
            </tr>
          </thead>
          <tbody>
            {sortedPool.map((s) => {
              const champ = champions.get(s.championId);
              const winrate = s.games ? s.wins / s.games : 0;
              return (
                <tr key={s.championId} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                  <td className="py-2 px-3">
                    <Link
                      to={`/champions/${s.championId}`}
                      className="flex items-center gap-2 hover:text-zinc-50"
                    >
                      {champ?.iconUrl && (
                        <img src={champ.iconUrl} alt={champ.name} className="w-7 h-7 rounded" />
                      )}
                      <span>{champ?.name ?? `Champion ${s.championId}`}</span>
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{s.games}</td>
                  <td
                    className={`py-2 px-3 text-right tabular-nums ${
                      winrate >= 0.55
                        ? 'text-emerald-400'
                        : winrate < 0.45
                        ? 'text-rose-400'
                        : 'text-zinc-300'
                    }`}
                  >
                    {pct(s.wins, s.games)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-400">
                    {s.myGames > 0 ? s.myGames : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SortHeader({
  label,
  current,
  value,
  onClick
}: {
  label: string;
  current: SortKey;
  value: SortKey;
  onClick: (v: SortKey) => void;
}) {
  return (
    <th
      className="py-2 px-3 text-right cursor-pointer select-none hover:text-zinc-200"
      onClick={() => onClick(value)}
    >
      {label} {current === value ? '↓' : ''}
    </th>
  );
}
