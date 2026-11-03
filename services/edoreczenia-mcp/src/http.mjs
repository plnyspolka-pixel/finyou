// Internal bridge for the Finance You backend. Not an Internet-facing API.
// Protect with a private network and TLS reverse proxy. MCP still uses stdio.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { accessibleBoxes, requireBox } from './config.mjs';
import { listMessages, readMessage, messageEvidences, sendRawMessage, sendTask } from './ua-client.mjs';
import { createDraft, listDrafts, getDraft, sendApprovedDraft } from './outbox.mjs';

const secret = process.env.EDO_BRIDGE_TOKEN || '';
if (secret.length < 32) throw new Error('EDO_BRIDGE_TOKEN must be a strong secret >=32 chars');
const host = process.env.EDO_BRIDGE_HOST || '127.0.0.1';
const port = Number(process.env.EDO_BRIDGE_PORT || 8765);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Bad EDO_BRIDGE_PORT');

function authenticated(request) {
  const supplied = request.headers['x-edo-bridge-token'] || '';
  if (typeof supplied !== 'string') return false;
  const a = Buffer.from(secret), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a,b);
}
function reply(response, status, data) {
  response.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, private, max-age=0',
    'X-Content-Type-Options':'nosniff'
  });
  response.end(JSON.stringify(data));
}
async function parseBody(request) {
  const chunks=[]; let total=0;
  for await (const chunk of request) {
    total+=chunk.length;
    if (total>1048576) throw new Error('Request too large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  const body=JSON.parse(raw);
  if (!body || typeof body!=='object' || Array.isArray(body))
    throw new Error('Expected JSON object');
  return body;
}
function box(id) { return requireBox(id); }
async function command(body) {
  const action=body.action;
  const args=body.args || {};
  if (!args || typeof args!=='object' || Array.isArray(args)) throw new Error('Invalid args');
  if (action==='list_mailboxes') return {
    boxes:accessibleBoxes().map(({id,label,ade,mode,keyEnv,tokenEnv})=>({
      id,label,ade,mode,configured:Boolean(process.env[mode==='system'?keyEnv:tokenEnv])
    }))
  };
  if (!args.boxId || typeof args.boxId!=='string') throw new Error('boxId required');
  box(args.boxId);
  switch (action) {
    case 'list_messages':
      return listMessages(args.boxId, args.label || 'INBOX');
    case 'read_message':
      if (args.ackLegalEffect!==true) throw new Error('Explicit legal-effect acknowledgement required');
      if (typeof args.messageId!=='string'||!args.messageId) throw new Error('messageId required');
      return readMessage(args.boxId,args.messageId);
    case 'send_task_status':
      if (typeof args.taskId!=='string'||!args.taskId) throw new Error('taskId required');
      return sendTask(args.boxId,args.taskId);
    case 'evidences':
      if (typeof args.messageId!=='string'||!args.messageId) throw new Error('messageId required');
      return messageEvidences(args.boxId,args.messageId);
    case 'create_draft':
      return createDraft({boxId:args.boxId,recipients:args.recipients,
        subject:args.subject,text:args.text,uaPayload:args.uaPayload});
    case 'list_drafts':
      return (await listDrafts()).filter(d=>d.boxId===args.boxId);
    case 'get_draft': {
      const row=await getDraft(args.draftId);
      if(row.data.boxId!==args.boxId) throw new Error('Not found in this mailbox');
      return {id:row.id,data:row.data,hash:row.hash,status:row.status,
        createdAt:row.createdAt,approvedAt:row.approvedAt};
    }
    case 'send_approved': {
      const row=await getDraft(args.draftId);
      if(row.data.boxId!==args.boxId) throw new Error('Not found in this mailbox');
      return sendApprovedDraft(args.draftId,sendRawMessage);
    }
    default:throw new Error('Unsupported action');
  }
}
createServer(async(request,response)=>{
  if(request.url!=='/v1/command'||request.method!=='POST'){
    reply(response,404,{ok:false,error:'not_found'});return;
  }
  if(!authenticated(request)){
    reply(response,401,{ok:false,error:'unauthorized'});return;
  }
  try {
    const body=await parseBody(request);
    const result=await command(body);
    reply(response,200,{ok:true,result});
  } catch(error) {
    // Do not include credentials or raw message contents in error logs.
    const message=String(error?.message||error).slice(0,700);
    reply(response,400,{ok:false,error:message});
  }
}).listen(port,host,()=>{
  console.error('Finance You e-Doręczenia bridge listening on '+host+':'+port+
    ' (private/internal only)');
});
