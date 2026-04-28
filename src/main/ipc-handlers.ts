import { ipcMain, shell } from 'electron';
import {
  getMyRecentGames,
  getMyChampionStats,
  getMyAugmentStats,
  getGameDetail,
  getMyPuuid,
  getOverallStats,
  getAllChampionWinrates,
  getMyMatchups,
  getMyMatchupsAll,
  getMySynergies,
  getMySynergiesAll,
  getAllAugmentStats
} from './db';
import { getChampion, getAugment, listChampions, listAugments, getGameVersion } from './dragon';
import { refreshNow } from './lcu';
import {
  hasAnthropicKey,
  saveAnthropicKey,
  deleteAnthropicKey,
  testAnthropicKey
} from './settings';
import { postGameInsight, trendAnalysis, chatStream, type ChatMessage } from './llm';

export function registerIpcHandlers(): void {
  ipcMain.handle('db:my-puuid', () => getMyPuuid());
  ipcMain.handle('db:overall-stats', () => getOverallStats());
  ipcMain.handle('db:recent-games', (_e, limit?: number, offset?: number) =>
    getMyRecentGames(limit, offset)
  );
  ipcMain.handle('db:champion-stats', () => getMyChampionStats());
  ipcMain.handle('db:augment-stats', (_e, championId?: number) => getMyAugmentStats(championId));
  ipcMain.handle('db:augment-stats-all', (_e, championId?: number) => getAllAugmentStats(championId));
  ipcMain.handle('db:game-detail', (_e, gameId: number) => getGameDetail(gameId));
  ipcMain.handle('db:champion-pool', () => getAllChampionWinrates());
  ipcMain.handle('db:matchups', (_e, championId?: number) =>
    typeof championId === 'number' ? getMyMatchups(championId) : getMyMatchupsAll()
  );
  ipcMain.handle('db:synergies', (_e, championId?: number) =>
    typeof championId === 'number' ? getMySynergies(championId) : getMySynergiesAll()
  );

  ipcMain.handle('dragon:champion', (_e, id: number) => getChampion(id));
  ipcMain.handle('dragon:augment', (_e, id: number) => getAugment(id));
  ipcMain.handle('dragon:champions', () => listChampions());
  ipcMain.handle('dragon:augments', () => listAugments());
  ipcMain.handle('dragon:version', () => getGameVersion());

  ipcMain.handle('lcu:refresh', () => refreshNow());

  ipcMain.handle('settings:has-anthropic-key', () => hasAnthropicKey());
  ipcMain.handle('settings:save-anthropic-key', (_e, key: string) => {
    saveAnthropicKey(key);
    return true;
  });
  ipcMain.handle('settings:delete-anthropic-key', () => {
    deleteAnthropicKey();
    return true;
  });
  ipcMain.handle('settings:test-anthropic-key', () => testAnthropicKey());

  ipcMain.handle('shell:open-external', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });

  ipcMain.handle('llm:trend', async (_e, limit?: number) => {
    const games = getMyRecentGames(limit ?? 20, 0);
    const formatted = games.map((g) => ({
      championId: g.championId,
      win: Boolean(g.win),
      kills: g.kills,
      deaths: g.deaths,
      assists: g.assists,
      damageDealt: g.damageDealt,
      durationMs: g.durationMs,
      augments: g.augmentIds
        ? g.augmentIds.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
        : []
    }));
    return trendAnalysis(formatted);
  });

  ipcMain.handle('llm:chat', async (event, history: ChatMessage[]) => {
    const wc = event.sender;
    try {
      const full = await chatStream(history, (chunk) => {
        wc.send('llm:chat-chunk', { text: chunk });
      });
      wc.send('llm:chat-done', { full });
      return { ok: true, full };
    } catch (err) {
      const message = (err as Error).message;
      wc.send('llm:chat-error', { message });
      return { ok: false, message };
    }
  });

  ipcMain.handle('llm:post-game', async (_e, gameId: number) => {
    const myPuuid = getMyPuuid();
    if (!myPuuid) throw new Error('No summoner found yet');
    const game = getGameDetail(gameId) as
      | {
          gameDuration?: number;
          participants?: Array<Record<string, unknown>>;
          participantIdentities?: Array<{
            participantId: number;
            player?: { puuid?: string };
          }>;
        }
      | null;
    if (!game) throw new Error('Game not found');

    const idMap = new Map<number, string>();
    for (const i of game.participantIdentities ?? []) {
      if (i.player?.puuid) idMap.set(i.participantId, i.player.puuid);
    }

    const me = (game.participants ?? []).find((p) => {
      const pid = p['participantId'] as number;
      return idMap.get(pid) === myPuuid;
    });
    if (!me) throw new Error('Could not find your participant');

    const stats = (me['stats'] ?? me) as Record<string, unknown>;
    const augments: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const v = stats[`playerAugment${i}`] ?? me[`playerAugment${i}`];
      if (typeof v === 'number' && v > 0) augments.push(v);
    }

    const myTeamId = me['teamId'] as number;
    const myTeamChamps: number[] = [];
    const enemyTeamChamps: number[] = [];
    for (const p of game.participants ?? []) {
      const cid = p['championId'] as number;
      if (p['teamId'] === myTeamId) myTeamChamps.push(cid);
      else enemyTeamChamps.push(cid);
    }

    const dur = typeof game.gameDuration === 'number' ? game.gameDuration : 0;
    const durationMs = dur > 100000 ? dur : dur * 1000;

    return postGameInsight({
      myChampionId: (me['championId'] as number) ?? 0,
      myKills: (stats['kills'] as number) ?? 0,
      myDeaths: (stats['deaths'] as number) ?? 0,
      myAssists: (stats['assists'] as number) ?? 0,
      myDamage: (stats['totalDamageDealtToChampions'] as number) ?? 0,
      myAugments: augments,
      myTeamChamps,
      enemyTeamChamps,
      durationMs,
      win: Boolean(stats['win'])
    });
  });
}
