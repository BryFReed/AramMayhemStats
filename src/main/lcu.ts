import {
  authenticate,
  createHttp1Request,
  createWebSocketConnection,
  type Credentials,
  type HttpRequestOptions,
  type LeagueWebSocket
} from 'league-connect';
import { upsertSummoner, insertGameFull, hasGame } from './db';

const QUEUE_ID_MAYHEM = 2400;
const CONNECT_INTERVAL_MS = 5_000;
const POLL_INTERVAL_MS = 60_000;

type Emit = (event: string, payload: unknown) => void;
export type LcuEvent = 'phase' | 'champ-select-session';
export type LcuEventListener = (event: LcuEvent, data: unknown) => void;

let credentials: Credentials | null = null;
let ws: LeagueWebSocket | null = null;
let connectTimer: NodeJS.Timeout | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let emit: Emit | null = null;
let busy = false;

const eventListeners = new Set<LcuEventListener>();

export function onLcuEvent(listener: LcuEventListener): () => void {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

function emitLcuEvent(event: LcuEvent, data: unknown): void {
  for (const l of eventListeners) {
    try {
      l(event, data);
    } catch (err) {
      console.warn('LCU event listener threw', err);
    }
  }
}

interface LcuSummoner {
  puuid: string;
  summonerId: number;
  gameName?: string;
  tagLine?: string;
  displayName?: string;
}

interface LcuMatchSummary {
  gameId: number;
  queueId: number;
}

interface LcuMatchPage {
  games?: { games?: LcuMatchSummary[] };
}

async function lcuRequest<T>(url: string, method: HttpRequestOptions['method'] = 'GET'): Promise<T> {
  if (!credentials) throw new Error('Not connected to LCU');
  const response = await createHttp1Request({ url, method }, credentials);
  if (!response.ok) throw new Error(`LCU request failed: ${response.status} ${url}`);
  return (await response.json()) as T;
}

async function fetchNewGames(): Promise<number> {
  const me = await lcuRequest<LcuSummoner>('/lol-summoner/v1/current-summoner');
  upsertSummoner(me);

  let added = 0;
  let begIndex = 0;
  const pageSize = 20;
  const maxScan = 200;

  while (begIndex < maxScan) {
    const url = `/lol-match-history/v1/products/lol/${me.puuid}/matches?begIndex=${begIndex}&endIndex=${begIndex + pageSize - 1}`;
    let page: LcuMatchPage;
    try {
      page = await lcuRequest<LcuMatchPage>(url);
    } catch {
      break;
    }
    const games = page?.games?.games ?? [];
    if (games.length === 0) break;

    let stop = false;
    for (const game of games) {
      if (game.queueId !== QUEUE_ID_MAYHEM) continue;
      if (hasGame(game.gameId)) {
        stop = true;
        continue;
      }
      try {
        const detail = await lcuRequest<unknown>(`/lol-match-history/v1/games/${game.gameId}`);
        insertGameFull(detail, me.puuid);
        added++;
      } catch (err) {
        console.warn('Failed to fetch game detail', game.gameId, err);
      }
    }
    if (stop) break;
    begIndex += pageSize;
  }

  return added;
}

async function openWebSocket(): Promise<void> {
  if (ws || !credentials) return;
  try {
    ws = await createWebSocketConnection({ authenticationOptions: {}, pollInterval: 5000 });

    ws.subscribe<string>('/lol-gameflow/v1/gameflow-phase', (data) => {
      if (typeof data === 'string') emitLcuEvent('phase', data);
    });
    ws.subscribe('/lol-champ-select/v1/session', (data) => {
      if (data) emitLcuEvent('champ-select-session', data);
    });

    ws.on('close', () => {
      ws = null;
    });
    ws.on('error', () => {
      ws = null;
    });

    // Hydrate current state in case we connected mid-flow
    try {
      const phase = await lcuRequest<string>('/lol-gameflow/v1/gameflow-phase');
      if (typeof phase === 'string') emitLcuEvent('phase', phase);
      if (phase === 'ChampSelect') {
        const session = await lcuRequest<unknown>('/lol-champ-select/v1/session');
        if (session) emitLcuEvent('champ-select-session', session);
      }
    } catch {
      // hydration is best-effort
    }
  } catch (err) {
    console.warn('LCU WebSocket connect failed', err);
    ws = null;
  }
}

function closeWebSocket(): void {
  if (!ws) return;
  try {
    ws.close();
  } catch {
    // ignore
  }
  ws = null;
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    if (!credentials) {
      credentials = await authenticate();
      emit?.('lcu:status', { connected: true });
      void openWebSocket();
    }
    const added = await fetchNewGames();
    emit?.('lcu:games-updated', { added });

    if (connectTimer) {
      clearInterval(connectTimer);
      connectTimer = null;
    }
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        tick().catch(() => {});
      }, POLL_INTERVAL_MS);
    }
  } catch {
    credentials = null;
    closeWebSocket();
    emit?.('lcu:status', { connected: false });
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (!connectTimer) {
      connectTimer = setInterval(() => {
        tick().catch(() => {});
      }, CONNECT_INTERVAL_MS);
    }
  } finally {
    busy = false;
  }
}

export function startLcuPolling(emitter: Emit): void {
  emit = emitter;
  if (connectTimer || pollTimer) return;
  connectTimer = setInterval(() => {
    tick().catch(() => {});
  }, CONNECT_INTERVAL_MS);
  tick().catch(() => {});
}

export function stopLcuPolling(): void {
  if (connectTimer) clearInterval(connectTimer);
  if (pollTimer) clearInterval(pollTimer);
  connectTimer = null;
  pollTimer = null;
  closeWebSocket();
}

export async function refreshNow(): Promise<{ added: number; connected: boolean }> {
  try {
    if (!credentials) {
      credentials = await authenticate();
      void openWebSocket();
    }
    const added = await fetchNewGames();
    emit?.('lcu:status', { connected: true });
    if (added > 0) emit?.('lcu:games-updated', { added });
    return { added, connected: true };
  } catch {
    credentials = null;
    closeWebSocket();
    emit?.('lcu:status', { connected: false });
    return { added: 0, connected: false };
  }
}
