import {describe,it,expect} from "vitest";
import {eligibleForWindykatorCall,classifyVoiceAnalysis} from "./voice-guard";
import {normalizeWindPhone,voiceCallAllowedAt} from "./voice.server";
import {verifyWindVoiceHmac} from "./voice-hmac";
import {createHmac} from "node:crypto";
const now=new Date("2026-11-02T11:00:00.000Z"); // poniedziałek 12:00 Warszawa
const base={
  status:"analysis_ready",collectionState:"active",paidAt:"2026-10-01T10:00:00Z",
  activatedAt:"2026-10-01T10:00:00Z",expiresAt:"2026-12-30T10:00:00Z",
  latestBalanceConfirmedAt:"2026-11-02T10:00:00Z",
  phone:"+48500111222",voiceOptOut:false,disputed:false,
  lastOutboundCallAt:null,now,configured:true
};
describe("Nowy ElevenLabs A5 — bezpieczna automatyka",()=>{
  it("dozwolony pojedynczy telefon tylko dla aktywnej opłaconej sprawy",()=>{
    expect(eligibleForWindykatorCall(base).ok).toBe(true);
    expect(eligibleForWindykatorCall({...base,status:"draft"}).ok).toBe(false);
    expect(eligibleForWindykatorCall({...base,collectionState:"disputed"}).ok).toBe(false);
    expect(eligibleForWindykatorCall({...base,voiceOptOut:true}).ok).toBe(false);
  });
  it("wymaga salda potwierdzonego w 48h",()=>{
    expect(eligibleForWindykatorCall({...base,latestBalanceConfirmedAt:null}).ok).toBe(false);
    expect(eligibleForWindykatorCall({...base,latestBalanceConfirmedAt:"2026-10-29T10:00:00Z"}).ok).toBe(false);
  });
  it("blokuje telefony częściej niż raz na 7 dni i poza godzinami",()=>{
    expect(eligibleForWindykatorCall({...base,lastOutboundCallAt:"2026-10-30T10:00:00Z"}).ok).toBe(false);
    expect(eligibleForWindykatorCall({...base,now:new Date("2026-11-01T11:00:00Z")}).ok).toBe(false);
    expect(eligibleForWindykatorCall({...base,now:new Date("2026-11-02T23:00:00Z")}).ok).toBe(false);
  });
  it("telefon prywatny nie przechodzi walidacji",()=>{
    expect(normalizeWindPhone("500 111 222")).toBe("+48500111222");
    expect(normalizeWindPhone("xxx")).toBeNull();
    expect(voiceCallAllowedAt(now)).toBe(true);
  });
  it("spór, wpłata i opt-out wstrzymują nowe monity",()=>{
    expect(classifyVoiceAnalysis({tozsamosc_potwierdzona:true,status_sporny:true})).toBe("disputed");
    expect(classifyVoiceAnalysis({tozsamosc_potwierdzona:true,zgloszona_wplata:true})).toBe("payment_reported");
    expect(classifyVoiceAnalysis({nie_kontaktowac:true})).toBe("opt_out");
    expect(classifyVoiceAnalysis({tozsamosc_potwierdzona:false})).toBe("identity_unverified");
  });
  it("webhook A5 przyjmuje tylko świeży podpis HMAC",()=>{
    const body='{"type":"post_call_transcription","data":{"agent_id":"A5"}}';
    const t=Math.floor(now.getTime()/1000);
    const hex=createHmac("sha256","secret").update(t+"."+body).digest("hex");
    expect(verifyWindVoiceHmac(body,"t="+t+",v0="+hex,"wsec_secret",now.getTime())).toBe(true);
    expect(verifyWindVoiceHmac(body,"t="+t+",v0=bad","wsec_secret",now.getTime())).toBe(false);
    expect(verifyWindVoiceHmac(body,"t="+t+",v0="+hex,"wsec_secret",now.getTime()+900000)).toBe(false);
  });
});
