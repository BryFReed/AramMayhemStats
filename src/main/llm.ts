import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from './settings';
import { listAugments, listChampions } from './dragon';

const MODEL_SONNET = 'claude-sonnet-4-6';
const MODEL_HAIKU = 'claude-haiku-4-5-20251001';

let client: Anthropic | null = null;
let cachedKey: string | null = null;
let metadataCache: string | null = null;
let metadataSize = 0;

function getClient(): Anthropic {
  const key = getAnthropicKey();
  if (!key) {
    throw new Error('Anthropic API key not configured — set it in Settings.');
  }
  if (!client || cachedKey !== key) {
    client = new Anthropic({ apiKey: key });
    cachedKey = key;
  }
  return client;
}

function buildMetadataBlock(): string {
  const champs = listChampions();
  const augs = listAugments();
  const size = champs.length + augs.length;
  if (metadataCache && metadataSize === size) return metadataCache;

  const champLines = champs.map((c) => `${c.id}=${c.name}`).join('\n');
  const augLines = augs
    .map((a) => {
      const desc = a.desc
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 250);
      return `${a.id}=${a.name}${desc ? ` — ${desc}` : ''}`;
    })
    .join('\n');
  metadataCache = `# ARAM Mayhem reference data\n\n## Champions (id=name)\n${champLines}\n\n## Augments (id=name — description)\n${augLines}`;
  metadataSize = size;
  return metadataCache;
}

const SYSTEM_PROMPT = `You are an ARAM Mayhem coach for League of Legends. ARAM Mayhem is the augment-rich variant of ARAM (queue 2400). Your job: concise, actionable analysis of games and recommendations during champ select.

Tone: direct and friendly. No flattery, no hedging. Focus on patterns, not single-game variance.

Format: respond in clean markdown.
- **Bold** champion names, augment names, and the key takeaway of each point.
- Use bullet lists for advice with multiple points.
- Use ### headings only when the response splits into clearly distinct sections.
- Keep paragraphs short. Prefer scannable structure over wall-of-text.
- Champ-select advice is time-sensitive — give 2–3 short sentences with the recommendation in **bold**, no headings or bullets.

When citing champions or augments, use their names from the reference table — never raw numeric IDs.`;

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
}

interface PostGameInput {
  myChampionId: number;
  myKills: number;
  myDeaths: number;
  myAssists: number;
  myDamage: number;
  myAugments: number[];
  myTeamChamps: number[];
  enemyTeamChamps: number[];
  durationMs: number;
  win: boolean;
}

export async function postGameInsight(input: PostGameInput): Promise<string> {
  const c = getClient();
  const prompt = `Analyze this ARAM Mayhem game in markdown. Structure as:

### What worked
- 2–3 bullets, **bolded** key champion/augment names

### What hurt
- 1–2 bullets

### Next time
- 1–2 specific, actionable changes

Total under 200 words.

Result: ${input.win ? 'WIN' : 'LOSS'}
My champion: ${input.myChampionId}
My KDA: ${input.myKills}/${input.myDeaths}/${input.myAssists}
My damage to champions: ${input.myDamage.toLocaleString()}
My augments (in pick order): ${input.myAugments.join(', ') || 'none recorded'}
My team comp: ${input.myTeamChamps.join(', ')}
Enemy team comp: ${input.enemyTeamChamps.join(', ')}
Game duration: ${Math.round(input.durationMs / 60000)} min`;

  const resp = await c.messages.create({
    model: MODEL_SONNET,
    max_tokens: 700,
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: buildMetadataBlock(), cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: prompt }]
  });
  return extractText(resp.content);
}

interface RecentGame {
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  durationMs: number;
  augments: number[];
}

export async function trendAnalysis(games: RecentGame[]): Promise<string> {
  if (games.length === 0) return 'No games to analyze yet.';
  const c = getClient();
  const lines = games
    .map(
      (g, i) =>
        `${i + 1}. champ=${g.championId} ${g.win ? 'W' : 'L'} ${g.kills}/${g.deaths}/${g.assists} dmg=${g.damageDealt} augs=[${g.augments.join(',')}] ${Math.round(g.durationMs / 60000)}m`
    )
    .join('\n');

  const prompt = `Find patterns across these ${games.length} recent ARAM Mayhem games. Respond in markdown with this structure:

### Champions
- 2–3 bullets: which champs are working / hurting, with **names bolded**

### Augments
- 2–3 bullets: which augments are paying off / underperforming

### Change one thing
- One specific, actionable shift in habits

Cite champion and augment names — not numeric IDs. Skip stats that are too noisy at this sample size.

Games (most recent first):
${lines}`;

  const resp = await c.messages.create({
    model: MODEL_SONNET,
    max_tokens: 900,
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: buildMetadataBlock(), cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: prompt }]
  });
  return extractText(resp.content);
}

export interface ChampSelectSnapshot {
  myCurrentChampion: number;
  bench: number[];
  rerollsRemaining: number;
  teammates: Array<{ championId: number }>;
  enemies: Array<{ championId: number }>;
  myHistoricalStats: Array<{ championId: number; games: number; wins: number }>;
}

export async function champSelectAdvice(snapshot: ChampSelectSnapshot): Promise<string> {
  const c = getClient();
  const hist = snapshot.myHistoricalStats
    .filter((s) => s.games > 0)
    .map(
      (s) =>
        `- champ ${s.championId}: ${s.games} games, ${Math.round((s.wins / s.games) * 100)}% WR`
    )
    .join('\n');

  const prompt = `ARAM Mayhem champ select — quick advice. 2–3 short sentences, no headings/bullets. Lead with the recommendation in **bold** (e.g. "**Keep [Champ]**" or "**Swap to [Champ]**" or "**Reroll**"). Justify in 1 sentence.

My current champion: ${snapshot.myCurrentChampion}
Available bench: ${snapshot.bench.join(', ') || '(none)'}
Rerolls remaining: ${snapshot.rerollsRemaining}
Teammate picks: ${snapshot.teammates.map((t) => t.championId).join(', ')}
Enemy team: ${snapshot.enemies.map((e) => e.championId).join(', ')}

My winrates on candidates:
${hist || '(no prior history on these champs)'}

Use champion names from the reference table, not numeric IDs.`;

  const resp = await c.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 350,
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: buildMetadataBlock(), cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: prompt }]
  });
  return extractText(resp.content);
}
