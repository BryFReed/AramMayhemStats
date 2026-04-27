import { useEffect, useState } from 'react';

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';

export default function Settings() {
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');

  useEffect(() => {
    window.api.settings.hasAnthropicKey().then(setHasKey);
  }, []);

  async function save() {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await window.api.settings.saveAnthropicKey(keyInput.trim());
      setHasKey(true);
      setKeyInput('');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    await window.api.settings.deleteAnthropicKey();
    setHasKey(false);
    setTestStatus('idle');
  }

  async function test() {
    setTestStatus('testing');
    try {
      const ok = await window.api.settings.testAnthropicKey();
      setTestStatus(ok ? 'ok' : 'fail');
    } catch {
      setTestStatus('fail');
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-semibold mb-6">Settings</h2>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium mb-1">Anthropic API key</h3>
          <p className="text-sm text-zinc-500">
            Stored encrypted on this Mac via Electron <code className="text-zinc-400">safeStorage</code>.
            Used for post-game insights and live champ-select advice. The key never leaves your machine
            except for direct calls to api.anthropic.com.
          </p>
        </div>

        {hasKey ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-emerald-400 flex-1">✓ Key saved</span>
            {testStatus === 'ok' && <span className="text-xs text-emerald-400">verified</span>}
            {testStatus === 'fail' && <span className="text-xs text-rose-400">failed</span>}
            <button
              onClick={test}
              className="text-sm px-3 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800"
              disabled={testStatus === 'testing'}
            >
              {testStatus === 'testing' ? 'Testing…' : 'Test'}
            </button>
            <button
              onClick={clear}
              className="text-sm px-3 py-1.5 rounded border border-rose-900 hover:bg-rose-950 text-rose-400"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-ant-…"
              className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:border-zinc-600 outline-none text-sm font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={!keyInput.trim() || saving}
                className="text-sm px-4 py-1.5 rounded bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save key'}
              </button>
              <button
                onClick={() => window.api.shell.openExternal('https://console.anthropic.com')}
                className="text-sm text-zinc-400 hover:text-zinc-100"
              >
                Get a key →
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
