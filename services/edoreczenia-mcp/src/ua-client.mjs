import { createSign, randomUUID } from 'node:crypto';
import { environment, requireBox } from './config.mjs';

const cachedTokens = new Map();
const b64u = (value) => Buffer.from(value).toString('base64url');

export function signedClientAssertion(box, privateKey, audience, nowSec=Math.floor(Date.now()/1000)) {
  if (box.mode !== 'system') throw new Error('System mailbox required');
  if (!privateKey) throw new Error('Missing signing key for ' + box.id);
  const subject = box.ade + '.SYSTEM.' + box.system;
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: subject, sub: subject, aud: audience, jti: randomUUID(),
    iat: nowSec, nbf: nowSec, exp: nowSec + 120
  };
  const unsigned = b64u(JSON.stringify(header)) + '.' + b64u(JSON.stringify(claims));
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(privateKey.replace(/\\n/g, '\n')).toString('base64url');
  return unsigned + '.' + signature;
}

async function requestJson(url, options={}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), ...options });
  const raw = await response.text();
  let json;
  try { json = raw ? JSON.parse(raw) : null; }
  catch { json = { raw: raw.slice(0, 2000) }; }
  if (!response.ok) {
    const error = new Error('e-Doręczenia HTTP ' + response.status + ': ' +
      JSON.stringify(json).slice(0, 600));
    error.status = response.status;
    throw error;
  }
  return json;
}

export async function accessToken(box, env=process.env) {
  if (box.mode === 'delegated_token') {
    const token = env[box.tokenEnv];
    if (!token) throw new Error('No delegated access token for ' + box.id +
      '. Interactive authorization must be completed outside MCP.');
    return token;
  }
  const { token, audience } = environment(env);
  const cacheId = box.id + '@' + environment(env).name;
  const old = cachedTokens.get(cacheId);
  if (old && old.expiry > Date.now() + 30000) return old.token;
  const key = env[box.keyEnv];
  if (!key) throw new Error('Missing private key ' + box.keyEnv);
  const assertion = signedClientAssertion(box, key, audience);
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion
  });
  const url = token + '?login_hint=' + encodeURIComponent('ADE.' + box.ade);
  const body = await requestJson(url, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  if (!body?.access_token) throw new Error('No access_token in OAuth reply');
  const ttl = Number.isFinite(body.expires_in) ? body.expires_in : 300;
  cachedTokens.set(cacheId, { token: body.access_token, expiry: Date.now() + ttl*1000 });
  return body.access_token;
}

export function uaUrl(box, suffix, env=process.env) {
  if (!suffix.startsWith('/') || suffix.includes('..')) throw new Error('Invalid UA path');
  return environment(env).ua + '/' + encodeURIComponent(box.ade) + suffix;
}

export async function uaRequest(boxId, method, suffix, options={}, env=process.env) {
  const box = requireBox(boxId, env);
  const auth = await accessToken(box, env);
  const url = new URL(uaUrl(box, suffix, env));
  if (options.query) for (const [key,value] of Object.entries(options.query)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return requestJson(url.toString(), {
    method, headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + auth,
      ...(options.body !== undefined ? {'Content-Type':'application/json'} : {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
}

export function listMessages(boxId, label='INBOX', env=process.env) {
  if (!['INBOX','SENT','DRAFT','TRASH'].includes(label)) throw new Error('Invalid folder');
  // Only list-level metadata, NEVER individual FULL read or bulk archive here.
  return uaRequest(boxId, 'GET', '/messages', { query: { label } }, env);
}
export function readMessage(boxId, messageId, env=process.env) {
  // LEGAL EFFECT: individual GET can count as opening the correspondence.
  // This function MUST only run as an explicit user-initiated MCP tool call.
  return uaRequest(boxId, 'GET', '/messages/' + encodeURIComponent(messageId), {}, env);
}
export function messageEvidences(boxId, messageId, env=process.env) {
  return uaRequest(boxId, 'GET',
    '/messages/' + encodeURIComponent(messageId) + '/evidences', {}, env);
}
export function sendRawMessage(boxId, payload, env=process.env) {
  // For UA API v3.0.8 the sender returns an asynchronous task, not final delivery.
  // Do not automatically retry if the response is lost: delivery may have happened.
  if (env.EDO_ENABLE_LIVE_SEND !== 'YES') throw new Error('Sending disabled: EDO_ENABLE_LIVE_SEND != YES');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('UA payload required');
  return uaRequest(boxId, 'POST', '/messages', { body: payload }, env);
}
