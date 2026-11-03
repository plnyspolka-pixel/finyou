import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { approveDraft, getDraft } from './outbox.mjs';

const id=process.argv[2];
if (!id || !stdin.isTTY || !stdout.isTTY) {
  console.error('Run in an interactive terminal: node src/approve.mjs <draftUUID>');
  process.exit(2);
}
const row=await getDraft(id);
if (row.status!=='draft') throw new Error('Draft must be in draft status');
console.log('ACCOUNT: ' + row.data.boxId);
console.log('RECIPIENTS: ' + row.data.recipients.join(', '));
console.log('SUBJECT: ' + row.data.subject);
console.log('MESSAGE CONTENT:\n' + row.data.text);
console.log('UA API PAYLOAD:\n' + JSON.stringify(row.data.uaPayload,null,2));
console.log('SHA-256: ' + row.hash);
if (!row.data.uaPayload) {
  console.error('No verified UA API payload. Human approval is blocked until payload is prepared.');
  process.exit(3);
}
const rl=createInterface({input:stdin,output:stdout});
try {
  const phrase='ZATWIERDZAM ' + row.hash.slice(0,12);
  const answer=await rl.question('To approve this immutable payload type exactly [' + phrase + ']: ');
  if (answer !== phrase) { console.error('Not approved.'); process.exitCode=4; }
  else {
    await approveDraft(id,row.hash);
    console.log('Approved. Sending is a SEPARATE action.');
  }
} finally { rl.close(); }
