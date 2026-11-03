import { mkdir, open, readFile, rename, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { requireBox, stateDir } from './config.mjs';
import { verifiedPayload } from './message-payload.mjs';

const canonical = (v) => JSON.stringify(v);
export const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex');
const directory = (env) => join(stateDir(env), 'drafts');
const target = (id, env) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid draft id');
  return join(directory(env), id + '.json');
};
async function secureDirs(env) { await mkdir(directory(env), { recursive:true, mode:0o700 }); }

export function draftData(input) {
  const { boxId, recipients, subject, text, uaPayload } = input;
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 500)
    throw new Error('Subject required (max 500)');
  if (typeof text !== 'string' || !text.trim() || text.length > 100000)
    throw new Error('Text required (max 100000)');
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 100 ||
      recipients.some(r => typeof r !== 'string' || !r.trim() || r.length > 180))
    throw new Error('Recipients must be an array (1..100)');
  if (uaPayload != null && (!uaPayload || typeof uaPayload !== 'object' || Array.isArray(uaPayload)))
    throw new Error('uaPayload must be an object (matching official UA API 3 schema)');
  return { boxId, recipients, subject, text, uaPayload: uaPayload || null };
}

export async function createDraft(input, env=process.env) {
  const box = requireBox(input.boxId, env);
  const data = draftData(input);
  // Build a text-only UA API Message automatically; raw payloads must match the visible draft.
  data.uaPayload = verifiedPayload(box,data);
  const id = randomUUID();
  const row = { id, data, hash: digest(data), status:'draft',
    createdAt: new Date().toISOString(), approvedAt:null, sentAt:null, task:null };
  await secureDirs(env);
  const handle = await open(target(id,env), 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(row,null,2)); }
  finally { await handle.close(); }
  return { id, boxId:data.boxId, recipients:data.recipients, subject:data.subject,
    status:row.status, hash:row.hash };
}

export async function getDraft(id, env=process.env) {
  const row = JSON.parse(await readFile(target(id,env), 'utf8'));
  requireBox(row.data?.boxId, env);
  if (row.hash !== digest(row.data)) throw new Error('Draft content altered, approval invalid');
  return row;
}
async function atomicSave(row, env) {
  const file = target(row.id,env);
  const tmp = file + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(row,null,2), { flag:'wx', mode:0o600 });
  await rename(tmp,file);
}
export async function listDrafts(env=process.env) {
  await secureDirs(env);
  const names=(await readdir(directory(env))).filter(n=>/^[0-9a-f-]{36}\.json$/.test(n));
  const rows=[];
  for (const n of names.slice(-200)) {
    try {
      const row=await getDraft(n.slice(0,-5),env);
      rows.push({id:row.id,boxId:row.data.boxId,recipients:row.data.recipients,
        subject:row.data.subject,status:row.status,hash:row.hash,createdAt:row.createdAt});
    } catch { /* Other mailbox or corrupted draft: never expose. */ }
  }
  return rows;
}
export async function approveDraft(id, acceptedHash, env=process.env) {
  const row = await getDraft(id,env);
  if (row.status !== 'draft') throw new Error('Draft not in draft status');
  if (row.hash !== acceptedHash) throw new Error('Payload checksum changed');
  row.status='approved';
  row.approvedAt=new Date().toISOString();
  await atomicSave(row,env);
  return row;
}
export async function sendApprovedDraft(id, sender, env=process.env) {
  if (env.EDO_ENABLE_LIVE_SEND !== 'YES') throw new Error('Live send disabled');
  const row=await getDraft(id,env);
  if (row.status !== 'approved') throw new Error('Draft needs separate human approval');
  if (!row.data.uaPayload) throw new Error('Draft lacks exact official UA API payload');
  // Lock BEFORE the network request; after an uncertain result, never resend automatically.
  const lock = await open(join(directory(env),id+'.send-once.lock'), 'wx', 0o600)
    .catch((e)=>{ if (e.code === 'EEXIST') throw new Error('Send already attempted - verify task before retrying'); throw e; });
  await lock.close();
  row.status='sending';
  await atomicSave(row,env);
  try {
    const task = await sender(row.data.boxId, row.data.uaPayload, env);
    row.status='submitted'; row.sentAt=new Date().toISOString(); row.task=task;
    await atomicSave(row,env);
    return {id:row.id,status:row.status,task,notice:'Submitted for asynchronous UA processing; verify task and evidences'};
  } catch (error) {
    row.status='unknown';
    row.error=String(error?.message||error).slice(0,700);
    await atomicSave(row,env);
    throw new Error('Send outcome UNKNOWN; inspect operator portal before any manual retry: '+row.error);
  }
}
