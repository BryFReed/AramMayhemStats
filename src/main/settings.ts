import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function keyFile(): string {
  return join(app.getPath('userData'), 'anthropic.key.bin');
}

export function saveAnthropicKey(plainKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  const encrypted = safeStorage.encryptString(plainKey);
  writeFileSync(keyFile(), encrypted);
}

export function getAnthropicKey(): string | null {
  const path = keyFile();
  if (!existsSync(path)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = readFileSync(path);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

export function hasAnthropicKey(): boolean {
  return existsSync(keyFile());
}

export function deleteAnthropicKey(): void {
  const path = keyFile();
  if (existsSync(path)) unlinkSync(path);
}

export async function testAnthropicKey(): Promise<boolean> {
  const key = getAnthropicKey();
  if (!key) return false;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      })
    });
    return resp.ok;
  } catch {
    return false;
  }
}
