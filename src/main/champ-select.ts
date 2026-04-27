import { onLcuEvent } from './lcu';
import { champSelectAdvice, type ChampSelectSnapshot } from './llm';
import { getMyChampionStat } from './db';
import { hasAnthropicKey } from './settings';

type Emit = (event: string, payload: unknown) => void;

let emit: Emit | null = null;
let lastSession: unknown = null;
let debounceTimer: NodeJS.Timeout | null = null;
let currentPhase = 'None';
let advisingFor: string | null = null;

interface ChampSelectCell {
  cellId: number;
  championId: number;
  summonerId?: number;
  rerollsRemaining?: number;
}

interface ChampSelectSession {
  localPlayerCellId: number;
  myTeam?: ChampSelectCell[];
  theirTeam?: ChampSelectCell[];
  benchChampions?: Array<{ championId: number }>;
}

function buildSnapshot(session: ChampSelectSession): ChampSelectSnapshot {
  const myCellId = session.localPlayerCellId;
  const myCell = (session.myTeam ?? []).find((c) => c.cellId === myCellId);
  const myChampionId = myCell?.championId ?? 0;

  const teammates = (session.myTeam ?? [])
    .filter((c) => c.cellId !== myCellId)
    .map((c) => ({ championId: c.championId }));

  const enemies = (session.theirTeam ?? []).map((c) => ({ championId: c.championId }));

  const bench = (session.benchChampions ?? []).map((b) => b.championId).filter((id) => id > 0);
  const rerollsRemaining = myCell?.rerollsRemaining ?? 0;

  const candidates = Array.from(new Set([myChampionId, ...bench].filter(Boolean)));
  const myHistoricalStats = candidates.map((cid) => {
    const stat = getMyChampionStat(cid);
    return { championId: cid, games: stat?.games ?? 0, wins: stat?.wins ?? 0 };
  });

  return { myCurrentChampion: myChampionId, bench, rerollsRemaining, teammates, enemies, myHistoricalStats };
}

function snapshotKey(s: ChampSelectSnapshot): string {
  return `${s.myCurrentChampion}|${s.bench.join(',')}|${s.teammates.map((t) => t.championId).sort().join(',')}|${s.enemies.map((e) => e.championId).sort().join(',')}`;
}

async function runAdvice() {
  if (!lastSession) return;
  const snapshot = buildSnapshot(lastSession as ChampSelectSession);
  const key = snapshotKey(snapshot);
  if (key === advisingFor) return; // already doing this snapshot
  advisingFor = key;

  if (!hasAnthropicKey()) {
    emit?.('champ-select:error', { message: 'Anthropic API key not set' });
    return;
  }

  emit?.('champ-select:advising', { snapshot });
  try {
    const advice = await champSelectAdvice(snapshot);
    emit?.('champ-select:advice', { snapshot, advice });
  } catch (err) {
    emit?.('champ-select:error', { message: (err as Error).message });
  } finally {
    if (advisingFor === key) advisingFor = null;
  }
}

function scheduleAdvice() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void runAdvice();
  }, 1500);
}

export function startChampSelectCoordinator(emitter: Emit): void {
  emit = emitter;
  onLcuEvent((event, data) => {
    if (event === 'phase') {
      const phase = (data as string) ?? 'None';
      currentPhase = phase;
      emit?.('lcu:phase', { phase });
      if (phase !== 'ChampSelect') {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        lastSession = null;
        advisingFor = null;
      }
    } else if (event === 'champ-select-session' && data) {
      lastSession = data;
      if (currentPhase === 'ChampSelect') scheduleAdvice();
    }
  });
}

export function getCurrentPhase(): string {
  return currentPhase;
}
