export type Scope = 'mine' | 'all';

interface Props {
  value: Scope;
  onChange: (v: Scope) => void;
  mineLabel?: string;
  allLabel?: string;
}

export function ScopeToggle({
  value,
  onChange,
  mineLabel = 'My picks',
  allLabel = 'All players'
}: Props) {
  return (
    <div className="inline-flex rounded border border-zinc-800 overflow-hidden">
      <button
        onClick={() => onChange('mine')}
        className={`px-3 py-1.5 text-sm transition ${
          value === 'mine' ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900'
        }`}
      >
        {mineLabel}
      </button>
      <button
        onClick={() => onChange('all')}
        className={`px-3 py-1.5 text-sm transition border-l border-zinc-800 ${
          value === 'all' ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900'
        }`}
      >
        {allLabel}
      </button>
    </div>
  );
}
