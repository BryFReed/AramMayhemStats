import { app, net } from 'electron';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ChampionEntry {
  id: number;
  key: string;
  name: string;
  iconUrl: string;
}

export interface AugmentEntry {
  id: number;
  name: string;
  desc: string;
  rarity: number;
  iconLarge: string;
  iconSmall: string;
}

const champions = new Map<number, ChampionEntry>();
const augments = new Map<number, AugmentEntry>();
let gameVersion = '14.1.1';

function cacheDir(): string {
  const dir = join(app.getPath('userData'), 'cache');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await net.fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${url}`);
  return (await resp.json()) as T;
}

async function fetchOrCache<T>(url: string, file: string, maxAgeHours = 24): Promise<T> {
  const path = join(cacheDir(), file);
  if (existsSync(path)) {
    const ageHours = (Date.now() - statSync(path).mtimeMs) / 3_600_000;
    if (ageHours < maxAgeHours) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }
  }
  try {
    const data = await fetchJson<T>(url);
    writeFileSync(path, JSON.stringify(data));
    return data;
  } catch (err) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }
    throw err;
  }
}

function communityDragonAsset(path: string | undefined): string {
  if (!path) return '';
  // LCU paths look like "/lol-game-data/assets/ASSETS/UX/Kiwi/Augments/Icons/Foo_small.png".
  // Lowercase and rebase under the Community Dragon plugin mirror.
  const lower = path.toLowerCase().replace(/^.*?\/lol-game-data\/assets/, '/plugins/rcp-be-lol-game-data/global/default');
  const png = lower.replace(/\.dds$/, '.png').replace(/\.tex$/, '.png');
  return `https://raw.communitydragon.org/latest${png}`;
}

function rarityToNumber(r: unknown): number {
  if (typeof r === 'number') return r;
  if (typeof r !== 'string') return 0;
  const lower = r.toLowerCase();
  if (lower.includes('prismatic')) return 2;
  if (lower.includes('gold')) return 1;
  return 0; // silver / unknown
}

export async function loadStaticData(): Promise<void> {
  // Latest game version
  try {
    const versions = await fetchOrCache<string[]>(
      'https://ddragon.leagueoflegends.com/api/versions.json',
      'versions.json'
    );
    if (versions[0]) gameVersion = versions[0];
  } catch (err) {
    console.warn('versions.json fetch failed, using default', err);
  }

  // Champions (Data Dragon)
  try {
    const champs = await fetchOrCache<{ data: Record<string, { id: string; key: string; name: string; image: { full: string } }> }>(
      `https://ddragon.leagueoflegends.com/cdn/${gameVersion}/data/en_US/champion.json`,
      `champions-${gameVersion}.json`
    );
    champions.clear();
    for (const champ of Object.values(champs.data)) {
      const id = parseInt(champ.key, 10);
      if (!Number.isFinite(id)) continue;
      champions.set(id, {
        id,
        key: champ.id,
        name: champ.name,
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/${gameVersion}/img/champion/${champ.image.full}`
      });
    }
  } catch (err) {
    console.warn('Champion data fetch failed', err);
  }

  // Augments (Community Dragon — cherry/Mayhem augment table)
  try {
    const data = await fetchOrCache<unknown>(
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json',
      'cherry-augments.json'
    );
    const list: Array<Record<string, unknown>> = Array.isArray(data)
      ? (data as Array<Record<string, unknown>>)
      : ((data as { augments?: Array<Record<string, unknown>> }).augments ?? []);
    augments.clear();
    for (const a of list) {
      const id =
        typeof a.id === 'number'
          ? a.id
          : typeof a.augmentId === 'number'
          ? a.augmentId
          : undefined;
      if (typeof id !== 'number' || id <= 0) continue;
      // Cherry/Mayhem augments file uses nameTRA + augmentSmallIconPath.
      // Arena en_us.json (different file) uses name + iconSmall + desc.
      const name =
        (a.name as string) ?? (a.nameTRA as string) ?? (a.simpleNameTRA as string) ?? `Augment ${id}`;
      const desc = (a.desc as string) ?? (a.tooltip as string) ?? (a.descriptionTRA as string) ?? '';
      const iconPath =
        (a.augmentSmallIconPath as string) ?? (a.iconSmall as string) ?? (a.iconLarge as string);
      const iconLargePath = (a.iconLarge as string) ?? iconPath;
      augments.set(id, {
        id,
        name,
        desc,
        rarity: rarityToNumber(a.rarity),
        iconLarge: communityDragonAsset(iconLargePath),
        iconSmall: communityDragonAsset(iconPath)
      });
    }
  } catch (err) {
    console.warn('Augment data fetch failed', err);
  }
}

export function getChampion(id: number): ChampionEntry | undefined {
  return champions.get(id);
}

export function getAugment(id: number): AugmentEntry | undefined {
  return augments.get(id);
}

export function listChampions(): ChampionEntry[] {
  return Array.from(champions.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function listAugments(): AugmentEntry[] {
  return Array.from(augments.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getGameVersion(): string {
  return gameVersion;
}
