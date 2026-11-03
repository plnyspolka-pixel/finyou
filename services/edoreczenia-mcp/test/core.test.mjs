import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accessibleBoxes, environment, requireBox } from '../src/config.mjs';
import { signedClientAssertion, uaUrl } from '../src/ua-client.mjs';
import { createDraft, getDraft, approveDraft, sendApprovedDraft } from '../src/outbox.mjs';

const boxes=[
  {id:'financeyou',label:'FY',ade:'AE:PL-01234567',mode:'system',system:'FYSYS',keyEnv:'EDO_TEST_KEY'},
  {id:'personal',label:'Private',ade:'AE:PL-12345678',mode:'delegated_token',tokenEnv:'EDO_PERSONAL_ACCESS_TOKEN'}
];
const env={EDO_ENV:'int',EDO_BOXES_JSON:JSON.stringify(boxes),
  EDO_ALLOWED_MAILBOXES:'financeyou,personal'};
test('private inbox is inaccessible without separate opt-in',()=>{
  assert.deepEqual(accessibleBoxes(env).map(b=>b.id),['financeyou']);
  assert.throws(()=>requireBox('personal',env),/not authorized/);
  assert.deepEqual(accessibleBoxes({...env,EDO_ALLOW_PERSONAL:'YES'}).map(b=>b.id),
    ['financeyou','personal']);
});
test('environment is test-only by default and URL always fixed-host',()=>{
  assert.equal(environment(env).name,'int');
  const url=uaUrl(boxes[0],'/messages',env);
  assert.ok(url.startsWith('https://uaapi-int-ow.poczta-polska.pl/api/v3/'));
  assert.throws(()=>environment({...env,EDO_ENV:'bad'}),/EDO_ENV/);
});
test('signed JWT has correct claims and valid signature',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,
    privateKeyEncoding:{type:'pkcs8',format:'pem'},
    publicKeyEncoding:{type:'spki',format:'pem'}});
  const jwt=signedClientAssertion(boxes[0],privateKey,environment(env).audience,1800000000);
  const [header,body,sig]=jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(header,'base64url')).alg,'RS256');
  const claims=JSON.parse(Buffer.from(body,'base64url'));
  assert.equal(claims.sub,'AE:PL-01234567.SYSTEM.FYSYS');
  assert.equal(claims.exp-claims.iat,120);
  const check=createVerify('RSA-SHA256'); check.update(header+'.'+body); check.end();
  assert.ok(check.verify(publicKey,Buffer.from(sig,'base64url')));
});
test('draft needs independent approval, cannot send twice',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fy-edo-'));
  const local={...env,EDO_STATE_DIR:dir,EDO_ENABLE_LIVE_SEND:'YES'};
  try {
    const created=await createDraft({boxId:'financeyou',recipients:['AE:PL-99999999'],
      subject:'Test',text:'Only test'},local);
    await assert.rejects(()=>sendApprovedDraft(created.id,async()=>({ok:true}),local),/needs separate human approval/);
    const row=await getDraft(created.id,local);
    assert.equal(row.data.uaPayload.messageMetadata.from.eDeliveryAddress,'AE:PL-01234567');
    assert.equal(row.data.uaPayload.messageMetadata.shippingService,'electronic');
    assert.equal(row.data.uaPayload.textBody,'Only test');
    await approveDraft(created.id,row.hash,local);
    let sends=0;
    const submitted=await sendApprovedDraft(created.id,async()=>{sends++;return {taskId:'test'};},local);
    assert.equal(submitted.status,'submitted'); assert.equal(sends,1);
    await assert.rejects(()=>sendApprovedDraft(created.id,async()=>{sends++;},local));
    assert.equal(sends,1);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('unknown transport outcome never causes resend',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fy-edo-'));
  const local={...env,EDO_STATE_DIR:dir,EDO_ENABLE_LIVE_SEND:'YES'};
  try {
    const d=await createDraft({boxId:'financeyou',recipients:['AE:PL-99999999'],
      subject:'Test',text:'Only test'},local);
    await approveDraft(d.id,d.hash,local);
    await assert.rejects(()=>sendApprovedDraft(d.id,async()=>{throw new Error('network timeout');},local),/UNKNOWN/);
    assert.equal((await getDraft(d.id,local)).status,'unknown');
    await assert.rejects(()=>sendApprovedDraft(d.id,async()=>({ok:true}),local));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
