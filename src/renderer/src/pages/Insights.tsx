import { useEffect, useRef, useState } from 'react';
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

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
}

const STARTER_PROMPTS = [
  'What champs am I doing best on?',
  'Analyze patterns across my last 20 games',
  "Which augments are paying off and which aren't?",
  'What should I work on to climb my win rate?'
];

export default function Insights() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<string>('None');
  const [advisingNow, setAdvisingNow] = useState(false);
  const [latestAdvice, setLatestAdvice] = useState<AdvicePayload | null>(null);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  useEffect(() => {
    const offChunk = window.api.on.chatChunk(({ text }) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          next[next.length - 1] = { ...last, content: last.content + text };
        }
        return next;
      });
    });
    const offDone = window.api.on.chatDone(() => {
      setStreaming(false);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = { ...last, streaming: false };
        }
        return next;
      });
    });
    const offError = window.api.on.chatError(({ message }) => {
      setStreaming(false);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            content: last.content || `Error: ${message}`,
            streaming: false,
            error: true
          };
        }
        return next;
      });
    });
    return () => {
      offChunk();
      offDone();
      offError();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput('');
    const userMsg: ChatMsg = { role: 'user', content };
    const placeholder: ChatMsg = { role: 'assistant', content: '', streaming: true };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, placeholder]);
    setStreaming(true);
    try {
      // Send only role+content (strip streaming flag) to the model
      await window.api.llm.chat(
        newMessages.map((m) => ({ role: m.role, content: m.content }))
      );
    } catch {
      // Errors handled via chatError event listener
    }
  }

  function clearChat() {
    if (streaming) return;
    setMessages([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
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
            Add your key in Settings to chat with Fish about your games and get live champ-select advice.
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
    <div className="flex flex-col h-full">
      {/* Live champ-select advice (only when active) */}
      {phase === 'ChampSelect' && (
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h3 className="text-xs font-semibold uppercase text-zinc-500 mb-2">Live champ select</h3>
          {latestAdvice && (
            <ChampSelectContext snapshot={latestAdvice.snapshot} champions={champions} />
          )}
          {advisingNow && !latestAdvice ? (
            <div className="rounded border border-zinc-700 bg-zinc-900/60 p-3 text-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse mr-2 align-middle" />
              Generating advice…
            </div>
          ) : latestAdvice ? (
            <div className="mt-2 rounded-lg border border-emerald-900/40 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-zinc-400 uppercase tracking-wide">
                  Fish · live advice {advisingNow && '(updating…)'}
                </span>
              </div>
              <RichMarkdown>{latestAdvice.advice}</RichMarkdown>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">In champ select. Waiting for picks to settle…</p>
          )}
          {adviceError && <p className="text-sm text-rose-400 mt-2">Advice error: {adviceError}</p>}
        </div>
      )}

      {/* Chat */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Chat with Fish</h2>
            <p className="text-xs text-zinc-500">
              Has full context on your games, champion stats, and augment performance.
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              disabled={streaming}
              className="text-xs px-2.5 py-1 rounded border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-40"
            >
              Clear
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-500">
                Ask anything about your performance. A few starters:
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="text-xs px-3 py-1.5 rounded-full border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <Message key={i} msg={m} />)
          )}
        </div>

        <div className="border-t border-zinc-800 p-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={streaming ? 'Fish is typing…' : 'Ask about your games. Enter to send, Shift+Enter for newline.'}
              disabled={streaming}
              rows={2}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-zinc-600 disabled:opacity-50"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || streaming}
              className="px-4 py-2 rounded bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ msg }: { msg: ChatMsg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-zinc-800 text-zinc-100 px-3.5 py-2 text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[85%] rounded-lg border px-4 py-3 ${
          msg.error
            ? 'border-rose-900/60 bg-rose-950/20'
            : 'border-zinc-800 bg-zinc-900/40'
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              msg.streaming ? 'bg-amber-500 animate-pulse' : msg.error ? 'bg-rose-500' : 'bg-zinc-500'
            }`}
          />
          <span className="text-xs text-zinc-400 uppercase tracking-wide">
            {msg.error ? 'Error' : 'Fish'}
          </span>
        </div>
        {msg.content ? (
          <RichMarkdown>{msg.content}</RichMarkdown>
        ) : (
          <span className="text-sm text-zinc-500 italic">Thinking…</span>
        )}
      </div>
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
  function ChampIcon({ id }: { id: number }) {
    const c = champions.get(id);
    if (!c?.iconUrl) {
      return <span className="w-7 h-7 rounded bg-zinc-800 inline-block" title={`Champion ${id}`} />;
    }
    return <img src={c.iconUrl} alt={c.name} title={c.name} className="w-7 h-7 rounded inline-block" />;
  }
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2 text-sm mb-2">
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
