import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';

let db: Database.Database;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS summoner (
  puuid TEXT PRIMARY KEY,
  summoner_id INTEGER,
  game_name TEXT,
  tag_line TEXT,
  display_name TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS games (
  game_id INTEGER PRIMARY KEY,
  queue_id INTEGER NOT NULL,
  creation_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  game_version TEXT,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_creation ON games(creation_ms DESC);

CREATE TABLE IF NOT EXISTS player_stats (
  game_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  puuid TEXT NOT NULL,
  summoner_name TEXT,
  team_id INTEGER NOT NULL,
  champion_id INTEGER NOT NULL,
  win INTEGER NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  damage_dealt INTEGER NOT NULL DEFAULT 0,
  damage_taken INTEGER NOT NULL DEFAULT 0,
  gold_earned INTEGER NOT NULL DEFAULT 0,
  vision_score INTEGER NOT NULL DEFAULT 0,
  total_heal INTEGER NOT NULL DEFAULT 0,
  largest_multi_kill INTEGER NOT NULL DEFAULT 0,
  is_me INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, participant_id),
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_player_me_champ ON player_stats(is_me, champion_id);

CREATE TABLE IF NOT EXISTS game_augments (
  game_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  augment_id INTEGER NOT NULL,
  PRIMARY KEY (game_id, participant_id, slot),
  FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_aug_id ON game_augments(augment_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'aram-mayhem.db');
  db = new Database(dbPath);
  db.exec(SCHEMA);
}

export function getDb(): Database.Database {
  return db;
}

export function upsertSummoner(s: {
  puuid: string;
  summonerId: number;
  gameName?: string;
  tagLine?: string;
  displayName?: string;
}): void {
  db.prepare(
    `INSERT INTO summoner (puuid, summoner_id, game_name, tag_line, display_name, updated_at)
     VALUES (@puuid, @summonerId, @gameName, @tagLine, @displayName, @now)
     ON CONFLICT(puuid) DO UPDATE SET
       summoner_id = excluded.summoner_id,
       game_name = excluded.game_name,
       tag_line = excluded.tag_line,
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`
  ).run({
    puuid: s.puuid,
    summonerId: s.summonerId,
    gameName: s.gameName ?? null,
    tagLine: s.tagLine ?? null,
    displayName: s.displayName ?? null,
    now: Date.now()
  });
}

export function getMyPuuid(): string | null {
  const row = db
    .prepare('SELECT puuid FROM summoner ORDER BY updated_at DESC LIMIT 1')
    .get() as { puuid: string } | undefined;
  return row?.puuid ?? null;
}

export function hasGame(gameId: number): boolean {
  return Boolean(db.prepare('SELECT 1 FROM games WHERE game_id = ?').get(gameId));
}

interface ParticipantLike {
  participantId: number;
  championId?: number;
  teamId?: number;
  stats?: Record<string, unknown>;
  [k: string]: unknown;
}

interface IdentityLike {
  participantId: number;
  player?: {
    puuid?: string;
    summonerName?: string;
    gameName?: string;
    tagLine?: string;
  };
}

interface GameLike {
  gameId: number;
  queueId: number;
  gameCreation?: number;
  gameDuration?: number;
  gameVersion?: string;
  participants?: ParticipantLike[];
  participantIdentities?: IdentityLike[];
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function insertGameFull(rawGame: unknown, myPuuid: string): void {
  const game = rawGame as GameLike;
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO games (game_id, queue_id, creation_ms, duration_ms, game_version, raw_json)
       VALUES (@gameId, @queueId, @creationMs, @durationMs, @gameVersion, @rawJson)`
    ).run({
      gameId: game.gameId,
      queueId: game.queueId,
      creationMs: num(game.gameCreation, Date.now()),
      durationMs: num(game.gameDuration) * (num(game.gameDuration) > 100000 ? 1 : 1000),
      gameVersion: game.gameVersion ?? null,
      rawJson: JSON.stringify(game)
    });

    const identities = new Map<number, IdentityLike['player']>();
    for (const i of game.participantIdentities ?? []) {
      identities.set(i.participantId, i.player ?? {});
    }

    const insertPlayer = db.prepare(
      `INSERT OR REPLACE INTO player_stats (
         game_id, participant_id, puuid, summoner_name, team_id, champion_id, win,
         kills, deaths, assists, damage_dealt, damage_taken, gold_earned,
         vision_score, total_heal, largest_multi_kill, is_me
       ) VALUES (
         @gameId, @participantId, @puuid, @summonerName, @teamId, @championId, @win,
         @kills, @deaths, @assists, @damageDealt, @damageTaken, @goldEarned,
         @visionScore, @totalHeal, @largestMultiKill, @isMe
       )`
    );
    const insertAugment = db.prepare(
      `INSERT OR REPLACE INTO game_augments (game_id, participant_id, slot, augment_id)
       VALUES (@gameId, @participantId, @slot, @augmentId)`
    );

    for (const p of game.participants ?? []) {
      const player = identities.get(p.participantId) ?? {};
      const puuid = player.puuid ?? '';
      const stats = (p.stats ?? p) as Record<string, unknown>;

      insertPlayer.run({
        gameId: game.gameId,
        participantId: p.participantId,
        puuid,
        summonerName: player.summonerName ?? player.gameName ?? null,
        teamId: num(p.teamId),
        championId: num(p.championId),
        win: stats['win'] ? 1 : 0,
        kills: num(stats['kills']),
        deaths: num(stats['deaths']),
        assists: num(stats['assists']),
        damageDealt: num(stats['totalDamageDealtToChampions']),
        damageTaken: num(stats['totalDamageTaken']),
        goldEarned: num(stats['goldEarned']),
        visionScore: num(stats['visionScore']),
        totalHeal: num(stats['totalHeal']),
        largestMultiKill: num(stats['largestMultiKill']),
        isMe: puuid === myPuuid ? 1 : 0
      });

      for (let slot = 1; slot <= 6; slot++) {
        const augId = num(stats[`playerAugment${slot}`] ?? p[`playerAugment${slot}`]);
        if (augId > 0) {
          insertAugment.run({
            gameId: game.gameId,
            participantId: p.participantId,
            slot,
            augmentId: augId
          });
        }
      }
    }
  });
  tx();
}

export interface MatchSummaryRow {
  gameId: number;
  creationMs: number;
  durationMs: number;
  championId: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  augmentIds: string;
}

export function getMyRecentGames(limit = 100, offset = 0): MatchSummaryRow[] {
  return db.prepare(
    `SELECT g.game_id AS gameId, g.creation_ms AS creationMs, g.duration_ms AS durationMs,
            p.champion_id AS championId, p.win, p.kills, p.deaths, p.assists,
            p.damage_dealt AS damageDealt,
            COALESCE((
              SELECT GROUP_CONCAT(a.augment_id, ',') FROM game_augments a
              WHERE a.game_id = g.game_id AND a.participant_id = p.participant_id
              ORDER BY a.slot
            ), '') AS augmentIds
     FROM games g
     JOIN player_stats p ON p.game_id = g.game_id AND p.is_me = 1
     ORDER BY g.creation_ms DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset) as MatchSummaryRow[];
}

export function getMyChampionStat(championId: number): { games: number; wins: number } | null {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS games, COALESCE(SUM(win), 0) AS wins FROM player_stats WHERE is_me = 1 AND champion_id = ?'
    )
    .get(championId) as { games: number; wins: number };
  return row.games > 0 ? row : null;
}

export interface ChampionPoolRow {
  championId: number;
  games: number;
  wins: number;
  myGames: number;
}

/** Winrate per champion across ALL participants in our recorded games (including teammates + enemies). */
export function getAllChampionWinrates(): ChampionPoolRow[] {
  return db
    .prepare(
      `SELECT champion_id AS championId,
              COUNT(*) AS games,
              COALESCE(SUM(win), 0) AS wins,
              COALESCE(SUM(is_me), 0) AS myGames
       FROM player_stats
       GROUP BY champion_id
       ORDER BY games DESC`
    )
    .all() as ChampionPoolRow[];
}

export interface MatchupRow {
  championId: number;
  games: number;
  wins: number;
}

/** When I played `championId`, my winrate vs each enemy champion. */
export function getMyMatchups(championId: number): MatchupRow[] {
  return db
    .prepare(
      `SELECT enemy.champion_id AS championId,
              COUNT(*) AS games,
              SUM(me.win) AS wins
       FROM player_stats me
       JOIN player_stats enemy
         ON enemy.game_id = me.game_id
        AND enemy.team_id != me.team_id
       WHERE me.is_me = 1 AND me.champion_id = ?
       GROUP BY enemy.champion_id
       ORDER BY games DESC`
    )
    .all(championId) as MatchupRow[];
}

/** When I played `championId`, my winrate by teammate champion. */
export function getMySynergies(championId: number): MatchupRow[] {
  return db
    .prepare(
      `SELECT mate.champion_id AS championId,
              COUNT(*) AS games,
              SUM(me.win) AS wins
       FROM player_stats me
       JOIN player_stats mate
         ON mate.game_id = me.game_id
        AND mate.team_id = me.team_id
        AND mate.participant_id != me.participant_id
       WHERE me.is_me = 1 AND me.champion_id = ?
       GROUP BY mate.champion_id
       ORDER BY games DESC`
    )
    .all(championId) as MatchupRow[];
}

/** All matchups across all my games (any champ I played) vs each enemy champion. */
export function getMyMatchupsAll(): MatchupRow[] {
  return db
    .prepare(
      `SELECT enemy.champion_id AS championId,
              COUNT(*) AS games,
              SUM(me.win) AS wins
       FROM player_stats me
       JOIN player_stats enemy
         ON enemy.game_id = me.game_id
        AND enemy.team_id != me.team_id
       WHERE me.is_me = 1
       GROUP BY enemy.champion_id
       ORDER BY games DESC`
    )
    .all() as MatchupRow[];
}

/** All synergies across all my games (any champ I played) by teammate champion. */
export function getMySynergiesAll(): MatchupRow[] {
  return db
    .prepare(
      `SELECT mate.champion_id AS championId,
              COUNT(*) AS games,
              SUM(me.win) AS wins
       FROM player_stats me
       JOIN player_stats mate
         ON mate.game_id = me.game_id
        AND mate.team_id = me.team_id
        AND mate.participant_id != me.participant_id
       WHERE me.is_me = 1
       GROUP BY mate.champion_id
       ORDER BY games DESC`
    )
    .all() as MatchupRow[];
}

export interface ChampionStatRow {
  championId: number;
  games: number;
  wins: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDamage: number;
}

export function getMyChampionStats(): ChampionStatRow[] {
  return db.prepare(
    `SELECT p.champion_id AS championId,
            COUNT(*) AS games,
            SUM(p.win) AS wins,
            AVG(p.kills) AS avgKills,
            AVG(p.deaths) AS avgDeaths,
            AVG(p.assists) AS avgAssists,
            AVG(p.damage_dealt) AS avgDamage
     FROM player_stats p
     WHERE p.is_me = 1
     GROUP BY p.champion_id
     ORDER BY games DESC`
  ).all() as ChampionStatRow[];
}

export interface AugmentStatRow {
  augmentId: number;
  games: number;
  wins: number;
}

export function getMyAugmentStats(championId?: number): AugmentStatRow[] {
  if (typeof championId === 'number') {
    return db.prepare(
      `SELECT a.augment_id AS augmentId, COUNT(*) AS games, SUM(p.win) AS wins
       FROM game_augments a
       JOIN player_stats p ON p.game_id = a.game_id AND p.participant_id = a.participant_id
       WHERE p.is_me = 1 AND p.champion_id = ?
       GROUP BY a.augment_id
       ORDER BY games DESC`
    ).all(championId) as AugmentStatRow[];
  }
  return db.prepare(
    `SELECT a.augment_id AS augmentId, COUNT(*) AS games, SUM(p.win) AS wins
     FROM game_augments a
     JOIN player_stats p ON p.game_id = a.game_id AND p.participant_id = a.participant_id
     WHERE p.is_me = 1
     GROUP BY a.augment_id
     ORDER BY games DESC`
  ).all() as AugmentStatRow[];
}

/** Augment performance across ALL participants in our recorded games (not just the local user). */
export function getAllAugmentStats(championId?: number): AugmentStatRow[] {
  if (typeof championId === 'number') {
    return db.prepare(
      `SELECT a.augment_id AS augmentId, COUNT(*) AS games, SUM(p.win) AS wins
       FROM game_augments a
       JOIN player_stats p ON p.game_id = a.game_id AND p.participant_id = a.participant_id
       WHERE p.champion_id = ?
       GROUP BY a.augment_id
       ORDER BY games DESC`
    ).all(championId) as AugmentStatRow[];
  }
  return db.prepare(
    `SELECT a.augment_id AS augmentId, COUNT(*) AS games, SUM(p.win) AS wins
     FROM game_augments a
     JOIN player_stats p ON p.game_id = a.game_id AND p.participant_id = a.participant_id
     GROUP BY a.augment_id
     ORDER BY games DESC`
  ).all() as AugmentStatRow[];
}

export function getGameDetail(gameId: number): unknown {
  const row = db.prepare('SELECT raw_json FROM games WHERE game_id = ?').get(gameId) as
    | { raw_json: string }
    | undefined;
  return row ? JSON.parse(row.raw_json) : null;
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export function getOverallStats(): { games: number; wins: number } {
  const row = db.prepare(
    'SELECT COUNT(*) AS games, COALESCE(SUM(win), 0) AS wins FROM player_stats WHERE is_me = 1'
  ).get() as { games: number; wins: number };
  return row;
}
