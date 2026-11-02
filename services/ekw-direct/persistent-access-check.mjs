// One-shot local diagnostic: official portal -> official link, installed Chrome, persistent profile.
// No KW numbers, searches, retries, proxies, CAPTCHA solving or upload to Finance You.
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
const profileDir = process.env.EKW_BROWSER_PROFILE_DIR ||
  path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".financeyou"), "FinanceYou", "ekw-dedicated-chrome");
const home="https://ekw.ms.gov.pl/eukw_ogol/menu.do";
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const mask=(s)=>{try{const u=new URL(s);return u.origin+u.pathname}catch{return "(unknown)"}};
const isBlocked=s=>/access denied|error 15|requested url was rejected|support id:|the request was blocked|captcha/i.test(s);
let context;
try{
  context=await chromium.launchPersistentContext(profileDir,{
    channel:process.env.EKW_BROWSER_CHANNEL || "chrome",
    headless:false,locale:"pl-PL",acceptDownloads:false,
  });
  const page=await context.newPage();
  const trace=[];
  context.on("response",r=>{
    if(r.request().resourceType()==="document"&&trace.length<8)
      trace.push({status:r.status(),at:mask(r.url())});
  });
  const entry=await page.goto(home,{waitUntil:"domcontentloaded",timeout:20000});
  const link=page.getByRole("link",{name:/Przeglądanie księgi wieczystej/i}).first();
  let opened=null;
  if(entry?.status()===200&&await link.count()){
    const popupPromise=page.waitForEvent("popup",{timeout:3000}).catch(()=>null);
    await link.click({timeout:8000});
    opened=await popupPromise;
    if(opened){
      await opened.waitForLoadState("domcontentloaded",{timeout:16000}).catch(()=>{});
    }
  }
  const viewer=opened||page;
  await pause(1200);
  const docs=await Promise.all(viewer.frames().slice(0,6).map(async f=>{
    try{return(await f.locator("body").innerText({timeout:1500})).slice(0,800)}
    catch{return ""}
  }));
  const inputs={
    court:(await viewer.locator("#kodWydzialuInput").count())>0,
    number:(await viewer.locator('input[name="numerKw"]').count())>0,
    check:(await viewer.locator('input[name="cyfraKontrolna"]').count())>0,
  };
  const blocked=trace.some(x=>x.status===403||x.status===429)||docs.some(isBlocked);
  const form=Object.values(inputs).every(Boolean);
  const record={
    browser:"installed Chrome",
    mode:"separate persistent profile",
    homeStatus:entry?.status()??null,
    final:mask(viewer.url()),
    documentResponses:trace,
    blocked,kwFormAvailable:form,inputs,
    conclusion:form&&!blocked?"KW_FORM_ACCESSIBLE":"NO_CONFIRMED_KW_ACCESS",
  };
  console.log("EKW_PERSISTENT_CHECK "+JSON.stringify(record));
  console.log(form&&!blocked
    ? "Wynik: formularz dostępny w trwałej sesji. Dopiero teraz można wykonać uprawniony test odczytu konkretnej KW."
    : "Wynik: dostęp niepotwierdzony. Nie uruchamiaj pętli ani masowych powtórzeń. Sprawdź w zwykłym Chrome, czy EKW działa na tym samym łączu.");
  console.log("Profil zapisany lokalnie w: "+profileDir);
  process.exitCode=form&&!blocked?0:2;
}catch(err){
  console.error("EKW_PERSISTENT_CHECK_ERROR",err?.code||err?.name||"ERROR",String(err?.message||"").split("\n")[0]);
  process.exitCode=1;
}finally{
  if(context)await context.close().catch(()=>{});
}
