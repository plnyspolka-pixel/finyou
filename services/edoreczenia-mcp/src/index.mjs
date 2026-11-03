import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { accessibleBoxes, environment } from './config.mjs';
import { listMessages, readMessage, messageEvidences, sendRawMessage, sendTask } from './ua-client.mjs';
import { createDraft, listDrafts, getDraft, sendApprovedDraft } from './outbox.mjs';

const success = (value) => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }]
});
const safe = (fn) => async (args) => {
  try { return success(await fn(args)); }
  catch (error) {
    return { isError: true, content: [{ type: 'text',
      text: String(error?.message || error).slice(0, 1500) }] };
  }
};

function createServer() {
  const server = new McpServer({ name:'financeyou-edoreczenia', version:'0.1.0' });
  server.registerTool('edoreczenia_list_mailboxes', {
    description:'Pokaż WYŁĄCZNIE skrzynki ADE dozwolone dla tego agenta MCP; bez pełnego odczytu korespondencji.',
    inputSchema:z.object({})
  }, safe(async () => ({
    environment:environment().name,
    liveSendingEnabled:process.env.EDO_ENABLE_LIVE_SEND==='YES',
    boxes:accessibleBoxes().map(({id,label,ade,mode,keyEnv,tokenEnv})=>({
      id,label,ade,mode,
      configured:Boolean(process.env[mode==='system'?keyEnv:tokenEnv]),
      note:mode==='delegated_token'?'Requires a separately obtained valid delegated token':'Requires API system registration and matching certificate'
    }))
  })));

  server.registerTool('edoreczenia_list_messages', {
    description:'Sprawdź listę/metadane pism (nie pobiera treści pojedynczej wiadomości). Zalecane jako pierwsze narzędzie.',
    inputSchema:z.object({
      boxId:z.string().min(2).max(40),
      label:z.enum(['INBOX','OUTBOX','SENT','TRASH']).default('INBOX')
    })
  }, safe(async ({boxId,label})=>listMessages(boxId,label)));

  server.registerTool('edoreczenia_read_message', {
    description:'UWAGA SKUTKI PRAWNE: pobranie pełnej wiadomości może stanowić jej odbiór. Użyj TYLKO na wyraźne żądanie uprawnionego człowieka dotyczące konkretnego pisma. Nie używaj do automatycznego skanowania.',
    inputSchema:z.object({boxId:z.string().min(2).max(40), messageId:z.string().min(1).max(200), ackLegalEffect:z.literal(true)})
  }, safe(async ({boxId,messageId})=>readMessage(boxId,messageId)));

  server.registerTool('edoreczenia_evidences', {
    description:'Pobierz listę dowodów nadania/odbioru dla wskazanego pisma; to nie jest potwierdzenie doręczenia samo w sobie.',
    inputSchema:z.object({boxId:z.string().min(2).max(40),messageId:z.string().min(1).max(200)})
  }, safe(async ({boxId,messageId})=>messageEvidences(boxId,messageId)));

  server.registerTool('edoreczenia_send_task_status', {
    description:'Sprawdź status asynchronicznego zadania wysłania. Status zadania nie zastępuje dowodu doręczenia.',
    inputSchema:z.object({boxId:z.string().min(2).max(40),taskId:z.string().min(1).max(200)})
  }, safe(async ({boxId,taskId})=>sendTask(boxId,taskId)));

  server.registerTool('edoreczenia_create_draft', {
    description:'Zapisz projekt pisma lokalnie. NIE wysyła. Do rzeczywistej wysyłki wymagany jest oficjalny obiekt uaPayload zgodny z UA API 3, a następnie zatwierdzenie przez człowieka poza MCP.',
    inputSchema:z.object({
      boxId:z.string().min(2).max(40),
      recipients:z.array(z.string().min(1).max(180)).min(1).max(100),
      subject:z.string().min(1).max(500),
      text:z.string().min(1).max(100000),
      uaPayload:z.record(z.string(),z.unknown()).optional()
    })
  }, safe(async (args)=>createDraft(args)));

  server.registerTool('edoreczenia_list_drafts', {
    description:'Pokaż projekty w dostępnym dla agenta katalogu (bez wysyłki i bez zatwierdzania).',
    inputSchema:z.object({})
  }, safe(async ()=>listDrafts()));

  server.registerTool('edoreczenia_get_draft', {
    description:'Odczytaj przygotowany projekt wraz z numerem kontrolnym SHA-256 (bez zatwierdzania).',
    inputSchema:z.object({draftId:z.string().uuid()})
  }, safe(async ({draftId})=>{
    const row=await getDraft(draftId);
    return {id:row.id,status:row.status,hash:row.hash,data:row.data,createdAt:row.createdAt};
  }));

  server.registerTool('edoreczenia_send_approved', {
    description:'Wyślij wcześniej i OSOBNO zatwierdzony przez człowieka projekt. Nie pozwala zatwierdzać z MCP. Jedna próba wysyłki; stan niepewny wymaga kontroli ręcznej. Domyślnie wyłączone.',
    inputSchema:z.object({draftId:z.string().uuid()})
  }, safe(async ({draftId})=>sendApprovedDraft(draftId,sendRawMessage)));

  return server;
}

serveStdio(createServer);
