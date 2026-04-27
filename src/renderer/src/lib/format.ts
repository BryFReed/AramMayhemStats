export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtKda(k: number, d: number, a: number): string {
  return `${k}/${d}/${a}`;
}

export function kdaRatio(k: number, d: number, a: number): number {
  return d === 0 ? k + a : (k + a) / d;
}

export function pct(num: number, den: number): string {
  return den === 0 ? '0%' : `${Math.round((num / den) * 100)}%`;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
