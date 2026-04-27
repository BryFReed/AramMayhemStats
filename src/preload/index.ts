import { contextBridge, ipcRenderer } from 'electron';

const api = {
  db: {
    myPuuid: (): Promise<string | null> => ipcRenderer.invoke('db:my-puuid'),
    overallStats: (): Promise<{ games: number; wins: number }> =>
      ipcRenderer.invoke('db:overall-stats'),
    recentGames: (limit?: number, offset?: number) =>
      ipcRenderer.invoke('db:recent-games', limit, offset),
    championStats: () => ipcRenderer.invoke('db:champion-stats'),
    augmentStats: (championId?: number) => ipcRenderer.invoke('db:augment-stats', championId),
    augmentStatsAll: (championId?: number) =>
      ipcRenderer.invoke('db:augment-stats-all', championId),
    gameDetail: (gameId: number) => ipcRenderer.invoke('db:game-detail', gameId),
    championPool: () => ipcRenderer.invoke('db:champion-pool'),
    matchups: (championId?: number) => ipcRenderer.invoke('db:matchups', championId),
    synergies: (championId?: number) => ipcRenderer.invoke('db:synergies', championId)
  },
  dragon: {
    champion: (id: number) => ipcRenderer.invoke('dragon:champion', id),
    augment: (id: number) => ipcRenderer.invoke('dragon:augment', id),
    champions: () => ipcRenderer.invoke('dragon:champions'),
    augments: () => ipcRenderer.invoke('dragon:augments'),
    version: (): Promise<string> => ipcRenderer.invoke('dragon:version')
  },
  lcu: {
    refresh: (): Promise<{ added: number; connected: boolean }> =>
      ipcRenderer.invoke('lcu:refresh')
  },
  settings: {
    hasAnthropicKey: (): Promise<boolean> => ipcRenderer.invoke('settings:has-anthropic-key'),
    saveAnthropicKey: (key: string): Promise<boolean> =>
      ipcRenderer.invoke('settings:save-anthropic-key', key),
    deleteAnthropicKey: (): Promise<boolean> => ipcRenderer.invoke('settings:delete-anthropic-key'),
    testAnthropicKey: (): Promise<boolean> => ipcRenderer.invoke('settings:test-anthropic-key')
  },
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url)
  },
  llm: {
    trend: (limit?: number): Promise<string> => ipcRenderer.invoke('llm:trend', limit),
    postGame: (gameId: number): Promise<string> => ipcRenderer.invoke('llm:post-game', gameId)
  },
  on: {
    lcuStatus: (cb: (s: { connected: boolean }) => void): (() => void) => {
      const handler = (_: unknown, payload: { connected: boolean }) => cb(payload);
      ipcRenderer.on('lcu:status', handler);
      return () => {
        ipcRenderer.off('lcu:status', handler);
      };
    },
    gamesUpdated: (cb: (s: { added: number }) => void): (() => void) => {
      const handler = (_: unknown, payload: { added: number }) => cb(payload);
      ipcRenderer.on('lcu:games-updated', handler);
      return () => {
        ipcRenderer.off('lcu:games-updated', handler);
      };
    },
    phase: (cb: (s: { phase: string }) => void): (() => void) => {
      const handler = (_: unknown, payload: { phase: string }) => cb(payload);
      ipcRenderer.on('lcu:phase', handler);
      return () => {
        ipcRenderer.off('lcu:phase', handler);
      };
    },
    champSelectAdvising: (cb: (s: { snapshot: unknown }) => void): (() => void) => {
      const handler = (_: unknown, payload: { snapshot: unknown }) => cb(payload);
      ipcRenderer.on('champ-select:advising', handler);
      return () => {
        ipcRenderer.off('champ-select:advising', handler);
      };
    },
    champSelectAdvice: (
      cb: (s: { snapshot: ChampSelectSnapshotShape; advice: string }) => void
    ): (() => void) => {
      const handler = (
        _: unknown,
        payload: { snapshot: ChampSelectSnapshotShape; advice: string }
      ) => cb(payload);
      ipcRenderer.on('champ-select:advice', handler);
      return () => {
        ipcRenderer.off('champ-select:advice', handler);
      };
    },
    champSelectError: (cb: (s: { message: string }) => void): (() => void) => {
      const handler = (_: unknown, payload: { message: string }) => cb(payload);
      ipcRenderer.on('champ-select:error', handler);
      return () => {
        ipcRenderer.off('champ-select:error', handler);
      };
    }
  }
};

interface ChampSelectSnapshotShape {
  myCurrentChampion: number;
  bench: number[];
  rerollsRemaining: number;
  teammates: Array<{ championId: number }>;
  enemies: Array<{ championId: number }>;
  myHistoricalStats: Array<{ championId: number; games: number; wins: number }>;
}

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
