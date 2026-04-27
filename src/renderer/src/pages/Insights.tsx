import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStaticData } from '../lib/DataContext';
import { RichMarkdown } from '../lib/RichMarkdown';

interface AdvicePayload {
  snapshot: {
    myCurrentChampion: number;
    bench: number[];
    rerollsRemaining: number;
    teammates: Array<{ championId: number }>;
    enemies: Array<{ championId: number }>;
  };
  advice: string;
}

export default function Insights() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<string>('None');
  const [advisingNow, setAdvisingNow] = useState(false);
  const [latestAdvice, setLatestAdvice] = useState<AdvicePayload | null>(null);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trend, setTrend] = useState<string | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  const { champions } = useStaticData();

  useEffect(() => {
    window.api.settings.hasAnthropicKey().then(setHasKey);
    const offPhase = window.api.on.phase((p) => setPhase(p.phase));
    const offAdvising = window.api.on.champSelectAdvising(() => {
      setAdvisingNow(true);
      setAdviceError(null);
    });
    const offAdvice = window.api.on.champSelectAdvice((d) => {
      setAdvisingNow(false);
      setLatestAdvice(d);
    });
    const offError = window.api.on.champSelectError((e) => {
      setAdvisingNow(false);
      setAdviceError(e.message);
    });
    return () => {
      offPhase();
      offAdvising();
      offAdvice();
      offError();
    };
  }, []);

  async function generateTrend() {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const result = await window.api.llm.trend(20);
      setTrend(result);
    } catch (err) {
      setTrendError((err as Error).message);
    } finally {
      setTrendLoading(false);
    }
  }

  if (hasKey === null) return <div className="p-6 text-zinc-500">Loading…</div>;

  if (hasKey === false) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Insights</h2>
        <div className="rounded border border-zinc-800 p-6 max-w-md">
          <p className="text-zinc-300 mb-1">No Anthropic API key configured.</p>
          <p className="text-zinc-500 text-sm mb-4">
            Add your key in Settings to enable LLM-powered insights and live champ-select advice.
          </p>
          <Link
            to="/settings"
            className="text-sm px-4 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800 inline-block"
          >
            Open Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <h2 className="text-2xl font-semibold">Insights</h2>

      {/* Live champ-select advice */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-zinc-500 mb-2">Live champ select</h3>
        {phase === 'ChampSelect' ? (
          <div className="space-y-2">
            {latestAdvice && (
              <ChampSelectContext snapshot={latestAdvice.snapshot} champions={champions} />
            )}
            {advisingNow && !latestAdvice ? (
              <div className="rounded border border-zinc-700 bg-zinc-900/60 p-4 text-sm">
                <span className="inline-block w-3 h-3 rounded-full bg-amber-500 animate-pulse mr-2 align-middle" />
                Generating advice…
              </div>
            ) : latestAdvice ? (
              <div className="rounded-lg border border-emerald-900/40 bg-zinc-900/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-zinc-400 uppercase tracking-wide">
                    Claude · live advice {advisingNow && '(updating…)'}
                  </span>
                </div>
                <RichMarkdown>{latestAdvice.advice}</RichMarkdown>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">In champ select. Waiting for picks to settle…</p>
            )}
            {adviceError && (
              <p className="text-sm text-rose-400">Advice error: {adviceError}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            No active champ select. Current phase:{' '}
            <code className="text-zinc-400">{phase}</code>
          </p>
        )}
      </section>

      {/* Trend analysis */}
      <section>
        <div className="flex items-end justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase text-zinc-500">Recent trends</h3>
          <button
            onClick={generateTrend}
            disabled={trendLoading}
            className="text-sm px-3 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
          >
            {trendLoading ? 'Analyzing…' : 'Analyze last 20 games'}
          </button>
        </div>
        {trendError && <p className="text-sm text-rose-400 mb-2">{trendError}</p>}
        {trend ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              <span className="text-xs text-zinc-400 uppercase tracking-wide">
                Claude · trend analysis
              </span>
            </div>
            <RichMarkdown>{trend}</RichMarkdown>
          </div>
        ) : !trendError ? (
          <p className="text-sm text-zinc-500">
            Click Analyze to get a Claude-powered breakdown of patterns across your recent games.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function ChampSelectContext({
  snapshot,
  champions
}: {
  snapshot: AdvicePayload['snapshot'];
  champions: Map<number, { name: string; iconUrl: string }>;
}) {
  function ChampIcon({ id, size = 8 }: { id: number; size?: number }) {
    const c = champions.get(id);
    if (!c?.iconUrl) {
      return (
        <span
          className={`w-${size} h-${size} rounded bg-zinc-800 inline-block`}
          title={`Champion ${id}`}
        />
      );
    }
    return <img src={c.iconUrl} alt={c.name} title={c.name} className={`w-${size} h-${size} rounded inline-block`} />;
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">You</span>
          <ChampIcon id={snapshot.myCurrentChampion} />
        </div>
        {snapshot.bench.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">Bench</span>
            {snapshot.bench.slice(0, 8).map((id) => (
              <ChampIcon key={id} id={id} />
            ))}
            <span className="text-xs text-zinc-500">({snapshot.rerollsRemaining} rerolls)</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-zinc-500">vs</span>
          {snapshot.enemies.map((e, i) => (
            <ChampIcon key={i} id={e.championId} />
          ))}
        </div>
      </div>
    </div>
  );
}
