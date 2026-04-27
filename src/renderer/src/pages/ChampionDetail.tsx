import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStaticData } from '../lib/DataContext';
import { pct, stripHtml } from '../lib/format';
import { ScopeToggle, type Scope } from '../lib/ScopeToggle';

interface AugStat {
  augmentId: number;
  games: number;
  wins: number;
}

interface MatchupRow {
  championId: number;
  games: number;
  wins: number;
}

export default function ChampionDetail() {
  const { championId } = useParams<{ championId: string }>();
  const id = parseInt(championId ?? '0', 10);
  const [augScope, setAugScope] = useState<Scope>('mine');
  const [augStats, setAugStats] = useState<AugStat[]>([]);
  const [matchups, setMatchups] = useState<MatchupRow[]>([]);
  const [synergies, setSynergies] = useState<MatchupRow[]>([]);
  const { champions, augments } = useStaticData();
  const champ = champions.get(id);

  useEffect(() => {
    if (!id) return;
    Promise.all([window.api.db.matchups(id), window.api.db.synergies(id)]).then(([m, s]) => {
      setMatchups(m as MatchupRow[]);
      setSynergies(s as MatchupRow[]);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const fetcher =
      augScope === 'mine'
        ? window.api.db.augmentStats(id)
        : window.api.db.augmentStatsAll(id);
    fetcher.then((a) => setAugStats(a as AugStat[]));
  }, [id, augScope]);

  return (
    <div className="p-6 space-y-8">
      <div>
        <Link to="/champions" className="text-sm text-zinc-400 hover:text-zinc-100 mb-4 inline-block">
          ← Back to champions
        </Link>
        <div className="flex items-center gap-3">
          {champ?.iconUrl && (
            <img src={champ.iconUrl} alt={champ.name} className="w-12 h-12 rounded" />
          )}
          <h2 className="text-2xl font-semibold">{champ?.name ?? `Champion ${id}`}</h2>
        </div>
      </div>

      <Section
        title="Augments on this champion"
        action={
          <ScopeToggle
            value={augScope}
            onChange={setAugScope}
            mineLabel="My picks"
            allLabel="All players"
          />
        }
      >
        {augStats.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            {augScope === 'mine'
              ? "You haven't picked augments on this champion yet."
              : 'No augment data on this champion yet.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {augStats.slice(0, 50).map((s) => {
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
                    {s.games} games
                  </div>
                  <div
                    className={`text-sm tabular-nums w-12 text-right ${
                      s.games >= 3 && winrate >= 0.6 ? 'text-emerald-400' : 'text-zinc-300'
                    }`}
                  >
                    {pct(s.wins, s.games)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Synergies — when paired with this teammate">
        <ChampionStatList rows={synergies} champions={champions} emptyText="No teammate data yet." />
      </Section>

      <Section title="Matchups — when this enemy is on the other team">
        <ChampionStatList rows={matchups} champions={champions} emptyText="No matchup data yet." />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  action
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase text-zinc-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChampionStatList({
  rows,
  champions,
  emptyText
}: {
  rows: MatchupRow[];
  champions: Map<number, { name: string; iconUrl: string }>;
  emptyText: string;
}) {
  const [sortBy, setSortBy] = useState<'games' | 'winrate'>('games');

  const sorted = [...rows].sort((a, b) => {
    if (sortBy === 'winrate') {
      const aWr = a.games ? a.wins / a.games : 0;
      const bWr = b.games ? b.wins / b.games : 0;
      return bWr - aWr;
    }
    return b.games - a.games;
  });

  if (rows.length === 0) {
    return <p className="text-zinc-500 text-sm">{emptyText}</p>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="text-zinc-500">Sort:</span>
        <button
          onClick={() => setSortBy('games')}
          className={`px-2 py-0.5 rounded ${
            sortBy === 'games' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900'
          }`}
        >
          By games
        </button>
        <button
          onClick={() => setSortBy('winrate')}
          className={`px-2 py-0.5 rounded ${
            sortBy === 'winrate' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900'
          }`}
        >
          By win rate
        </button>
      </div>
      <div className="space-y-1">
        {sorted.slice(0, 25).map((r) => {
          const c = champions.get(r.championId);
          const wr = r.games ? r.wins / r.games : 0;
          return (
            <div key={r.championId} className="flex items-center gap-3 p-2 rounded bg-zinc-900/40">
              {c?.iconUrl ? (
                <img src={c.iconUrl} alt={c.name} className="w-8 h-8 rounded" />
              ) : (
                <span className="w-8 h-8 rounded bg-zinc-800" />
              )}
              <Link
                to={`/champions/${r.championId}`}
                className="flex-1 text-sm hover:text-zinc-50"
              >
                {c?.name ?? `Champion ${r.championId}`}
              </Link>
              <div className="text-xs tabular-nums text-zinc-400 w-16 text-right">
                {r.games} game{r.games === 1 ? '' : 's'}
              </div>
              <div
                className={`text-sm tabular-nums w-12 text-right ${
                  r.games >= 3 && wr >= 0.6
                    ? 'text-emerald-400'
                    : r.games >= 3 && wr <= 0.4
                    ? 'text-rose-400'
                    : 'text-zinc-300'
                }`}
              >
                {pct(r.wins, r.games)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
