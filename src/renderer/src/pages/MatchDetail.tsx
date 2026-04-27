import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStaticData } from '../lib/DataContext';
import { RichMarkdown } from '../lib/RichMarkdown';
import { fmtDuration, fmtKda, kdaRatio } from '../lib/format';

interface Identity {
  participantId: number;
  player?: { puuid?: string; summonerName?: string; gameName?: string; tagLine?: string };
}

interface Participant {
  participantId: number;
  championId: number;
  teamId: number;
  stats?: Record<string, unknown>;
  [k: string]: unknown;
}

interface Game {
  gameId: number;
  queueId: number;
  gameCreation?: number;
  gameDuration?: number;
  participants?: Participant[];
  participantIdentities?: Identity[];
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function getStats(p: Participant): Record<string, unknown> {
  return (p.stats ?? p) as Record<string, unknown>;
}

function getAugmentIds(p: Participant): number[] {
  const stats = getStats(p);
  const ids: number[] = [];
  for (let i = 1; i <= 6; i++) {
    const v = num(stats[`playerAugment${i}`] ?? p[`playerAugment${i}`]);
    if (v > 0) ids.push(v);
  }
  return ids;
}

export default function MatchDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [myPuuid, setMyPuuid] = useState<string | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const { champions, augments } = useStaticData();

  useEffect(() => {
    if (!gameId) return;
    setInsight(null);
    setInsightError(null);
    Promise.all([
      window.api.db.gameDetail(parseInt(gameId, 10)),
      window.api.db.myPuuid(),
      window.api.settings.hasAnthropicKey()
    ]).then(([g, p, k]) => {
      setGame(g as Game);
      setMyPuuid(p as string | null);
      setHasKey(k);
    });
  }, [gameId]);

  async function generateInsight() {
    if (!gameId) return;
    setInsightLoading(true);
    setInsightError(null);
    try {
      const result = await window.api.llm.postGame(parseInt(gameId, 10));
      setInsight(result);
    } catch (err) {
      setInsightError((err as Error).message);
    } finally {
      setInsightLoading(false);
    }
  }

  if (!game) return <div className="p-6 text-zinc-500">Loading…</div>;

  const idMap = new Map<number, Identity['player']>();
  for (const i of game.participantIdentities ?? []) idMap.set(i.participantId, i.player ?? {});

  const teams = [100, 200].map((teamId) => ({
    teamId,
    players: (game.participants ?? []).filter((p) => p.teamId === teamId)
  }));

  return (
    <div className="p-6">
      <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-100 mb-4 inline-block">
        ← Back to matches
      </Link>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold mb-1">Match {game.gameId}</h2>
          <p className="text-sm text-zinc-500">
            {game.gameCreation && new Date(game.gameCreation).toLocaleString()}
            {' · '}
            {fmtDuration(num(game.gameDuration) * (num(game.gameDuration) > 100000 ? 1 : 1000))}
          </p>
        </div>
        {hasKey && (
          <button
            onClick={generateInsight}
            disabled={insightLoading}
            className="text-sm px-3 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
          >
            {insightLoading ? 'Analyzing…' : insight ? 'Re-analyze' : 'Get Claude insight'}
          </button>
        )}
      </div>

      {insightError && (
        <div className="mb-4 p-3 rounded border border-rose-900/60 bg-rose-950/20 text-sm text-rose-300">
          {insightError}
        </div>
      )}
      {insight && (
        <div className="mb-6 p-5 rounded-lg border border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            <span className="text-xs text-zinc-400 uppercase tracking-wide">Claude · post-game</span>
          </div>
          <RichMarkdown>{insight}</RichMarkdown>
        </div>
      )}

      {teams.map((team) => {
        const won = Boolean(getStats(team.players[0] ?? ({} as Participant))['win']);
        return (
          <div key={team.teamId} className="mb-6">
            <h3
              className={`text-sm font-semibold uppercase mb-2 ${
                won ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              Team {team.teamId === 100 ? 'Blue' : 'Red'} — {won ? 'Victory' : 'Defeat'}
            </h3>
            <div className="space-y-1.5">
              {team.players.map((p) => {
                const identity = idMap.get(p.participantId) ?? {};
                const isMe = identity?.puuid === myPuuid;
                const stats = getStats(p);
                const champ = champions.get(p.championId);
                const augIds = getAugmentIds(p);
                const k = num(stats['kills']);
                const d = num(stats['deaths']);
                const a = num(stats['assists']);
                return (
                  <div
                    key={p.participantId}
                    className={`flex items-center gap-3 p-2 rounded ${
                      isMe ? 'bg-zinc-800/80 ring-1 ring-zinc-700' : 'bg-zinc-900/40'
                    }`}
                  >
                    {champ?.iconUrl && (
                      <img src={champ.iconUrl} alt={champ.name} className="w-9 h-9 rounded" />
                    )}
                    <div className="min-w-0 w-44">
                      <div className={`text-sm truncate ${isMe ? 'font-semibold' : ''}`}>
                        {identity?.gameName ?? identity?.summonerName ?? `Player ${p.participantId}`}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">
                        {champ?.name ?? `Champion ${p.championId}`}
                      </div>
                    </div>
                    <div className="text-sm tabular-nums w-16">{fmtKda(k, d, a)}</div>
                    <div className="text-xs text-zinc-500 tabular-nums w-16 text-right">
                      {kdaRatio(k, d, a).toFixed(1)} KDA
                    </div>
                    <div className="text-xs text-zinc-500 tabular-nums w-24 text-right">
                      {num(stats['totalDamageDealtToChampions']).toLocaleString()} dmg
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                      {augIds.map((id) => {
                        const aug = augments.get(id);
                        return aug?.iconSmall ? (
                          <img
                            key={id}
                            src={aug.iconSmall}
                            alt={aug.name}
                            title={aug.name}
                            className="w-7 h-7 rounded"
                          />
                        ) : (
                          <span
                            key={id}
                            className="w-7 h-7 rounded bg-zinc-800 text-[8px] flex items-center justify-center text-zinc-500"
                            title={`Augment ${id}`}
                          >
                            ?
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
