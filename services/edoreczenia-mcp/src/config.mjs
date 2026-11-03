import { homedir } from 'node:os';
import { join } from 'node:path';

export const ENVIRONMENTS = Object.freeze({
  int: {
    ua: 'https://uaapi-int-ow.poczta-polska.pl/api/v3',
    token: 'https://int-ow.edoreczenia.gov.pl/auth/realms/EDOR/protocol/openid-connect/token',
    audience: 'https://int-ow.edoreczenia.gov.pl/auth/realms/EDOR'
  },
  prod: {
    ua: 'https://uaapi-ow.poczta-polska.pl/api/v3',
    token: 'https://ow.edoreczenia.gov.pl/auth/realms/EDOR/protocol/openid-connect/token',
    audience: 'https://ow.edoreczenia.gov.pl/auth/realms/EDOR'
  }
});

export function environment(env=process.env) {
  const name = env.EDO_ENV || 'int';
  if (!Object.hasOwn(ENVIRONMENTS, name)) throw new Error('EDO_ENV must be int or prod');
  return { name, ...ENVIRONMENTS[name] };
}

export function loadBoxes(env=process.env) {
  let input;
  try { input = JSON.parse(env.EDO_BOXES_JSON || '[]'); }
  catch { throw new Error('EDO_BOXES_JSON must be JSON'); }
  if (!Array.isArray(input)) throw new Error('EDO_BOXES_JSON must be an array');
  const ids = new Set();
  return input.map((box) => {
    if (!box || !/^[a-z0-9_-]{2,40}$/.test(box.id || '')) throw new Error('Invalid mailbox id');
    if (ids.has(box.id)) throw new Error('Repeated mailbox id');
    ids.add(box.id);
    if (!/^AE:PL-[a-zA-Z0-9-]{5,100}$/.test(box.ade || '')) throw new Error('Invalid ADE for ' + box.id);
    if (box.mode !== 'system' && box.mode !== 'delegated_token') throw new Error('Invalid mailbox mode');
    if (box.mode === 'system' && (!/^[a-zA-Z0-9._-]{2,100}$/.test(box.system || '') ||
        !/^[A-Z][A-Z0-9_]{4,90}$/.test(box.keyEnv || ''))) {
      throw new Error('System name or keyEnv invalid for ' + box.id);
    }
    if (box.mode === 'delegated_token' && !/^[A-Z][A-Z0-9_]{4,90}$/.test(box.tokenEnv || '')) {
      throw new Error('tokenEnv invalid for ' + box.id);
    }
    return { id: box.id, label: box.label || box.id, ade: box.ade, mode: box.mode,
      system: box.system, keyEnv: box.keyEnv, tokenEnv: box.tokenEnv };
  });
}

// Program MCP może być podłączony do różnych agentów, każdy z oddzielną allowlistą.
// Skrzynka prywatna jest ZAWSZE opt-in, niezależnie od wpisu w allowliście.
export function accessibleBoxes(env=process.env) {
  const allowed = new Set((env.EDO_ALLOWED_MAILBOXES || 'financeyou,fundacja')
    .split(',').map((s) => s.trim()).filter(Boolean));
  return loadBoxes(env).filter((b) =>
    allowed.has(b.id) && (b.id !== 'personal' || env.EDO_ALLOW_PERSONAL === 'YES'));
}

export function requireBox(id, env=process.env) {
  const box = accessibleBoxes(env).find((b) => b.id === id);
  if (!box) throw new Error('Mailbox not authorized or not configured: ' + id);
  return box;
}
export function stateDir(env=process.env) {
  return env.EDO_STATE_DIR || join(homedir(), '.local', 'share', 'financeyou-edoreczenia');
}
