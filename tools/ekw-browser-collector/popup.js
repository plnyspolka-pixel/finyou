import { SECTIONS, compactKw, isSecurityBlock, visibleSectionTitle, assertSnapshot } from "./core.mjs";

const log=document.querySelector("#log");
const button=document.querySelector("#collect");
const input=document.querySelector("#kw");
const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

function status(message){ log.textContent=message; }

function inspectOfficialPage(expectedKw, expectedSection) {
  const pageText=(document.body?.innerText||"").slice(0,150000);
  if(/the requested url was rejected|support id|access denied|captcha|hcaptcha|nie jestem robotem/i.test(pageText)) {
    return { error: "EKW_BLOCKED" };
  }
  const compact=pageText.toUpperCase().replace(/[\\/\s]/g,"");
  if(!compact.includes(expectedKw)) return {error:"KW_NUMBER_NOT_VISIBLE"};
  const selected=document.querySelector("#contentDzialu");
  if(!selected) return { error:"NO_OFFICIAL_SECTION_CONTAINER" };
  const text=selected.innerText||selected.textContent||"";
  const head=text.slice(0,700).replace(/\s+/g," ").toUpperCase();
  const target=new RegExp("DZIAŁ\\s+"+expectedSection.toUpperCase().replace("-","[-‐‑–]")+"\\b");
  if(!target.test(head)) return { error:"WRONG_TAB", heading:head.slice(0,80) };
  const clone=selected.cloneNode(true);
  clone.querySelectorAll("script,style,iframe,object,embed,form,input,button,svg,link,meta").forEach(el=>el.remove());
  for(const el of [clone,...clone.querySelectorAll("*")]){
    for(const a of [...el.attributes]){
      const ok=(a.name==="class"&&/^[\w -]{1,120}$/.test(a.value)) ||
        (["colspan","rowspan"].includes(a.name)&&/^[1-9][0-9]?$/.test(a.value));
      if(!ok)el.removeAttribute(a.name);
    }
  }
  return {html:clone.outerHTML,text,sourceUrl:location.origin+location.pathname,capturedAt:new Date().toISOString()};
}

function openSection(target) {
  const normalized=s=>String(s||"").replace(/\s+/g," ").trim().toLowerCase();
  const desired=normalized("Dział "+target);
  const elements=[...document.querySelectorAll('input[value],button,a')];
  const matching=elements.find(el=>normalized(el.value||el.textContent)===desired);
  if(!matching)return {error:"TAB_CONTROL_MISSING"};
  matching.click();
  return {clicked:true};
}

async function execute(tabId,func,args) {
  const r=await chrome.scripting.executeScript({target:{tabId},func,args});
  return r?.[0]?.result;
}
async function captureTab(tabId,kw,section){
  const until=Date.now()+20000;
  let last="UNKNOWN";
  while(Date.now()<until){
    try{
      const r=await execute(tabId,inspectOfficialPage,[kw,section]);
      if(r?.html)return r;
      if(r?.error==="EKW_BLOCKED")throw new Error("EKW zablokowało sesję. Przerywam bez ponawiania.");
      if(r?.error==="KW_NUMBER_NOT_VISIBLE")throw new Error("Numer KW nie jest widoczny na stronie. Otwórz aktualną treść księgi.");
      if(r?.error==="NO_OFFICIAL_SECTION_CONTAINER")throw new Error("Brak kontenera EKW #contentDzialu. Sprawdź wersję strony.");
      last=r?.error||"UNKNOWN";
    }catch(e){
      if(/zablokowało|Numer KW|Brak kontenera/.test(String(e.message)))throw e;
      last=e?.message||"SCRIPT_ERROR";
    }
    await delay(600);
  }
  throw new Error("Nie można potwierdzić otwartego działu "+section+" ("+last+"). Nie zapisuję niepełnego wyniku.");
}

button.addEventListener("click",async()=>{
  button.disabled=true;
  try{
    const kw=compactKw(input.value);
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const url=new URL(tab?.url||"about:blank");
    if(!["ekw.ms.gov.pl","przegladarka-ekw.ms.gov.pl"].includes(url.hostname)||url.protocol!=="https:"){
      throw new Error("Najpierw otwórz oficjalną stronę EKW w tej karcie.");
    }
    const output={
      schema:"financeyou.ekw.browser-snapshot.v1",
      kw_number:kw,
      source:"https://ekw.ms.gov.pl/",
      collected_at:new Date().toISOString(),
      acquisition:"human-opened-official-browser-view",
      sections:{},
    };
    for(let i=0;i<SECTIONS.length;i++){
      const [key,label]=SECTIONS[i];
      status("Odczytuję dział "+label+" ("+(i+1)+"/5)…");
      if(i){
        const click=await execute(tab.id,openSection,[label]);
        if(click?.error)throw new Error("Nie znaleziono zakładki "+label+" w EKW.");
        await delay(900);
      }
      const section=await captureTab(tab.id,kw,label);
      if(isSecurityBlock(section.text)||!visibleSectionTitle(section.text,label))throw new Error("Błąd weryfikacji działu "+label);
      output.sections[key]={...section,label};
    }
    assertSnapshot(output,kw);
    const blob=new Blob([JSON.stringify(output,null,2)],{type:"application/json;charset=utf-8"});
    const downloadUrl=URL.createObjectURL(blob);
    const saved=await chrome.downloads.download({
      url:downloadUrl,
      filename:"FinanceYou-EKW-"+kw+"-"+new Date().toISOString().slice(0,10)+".json",
      saveAs:true,
      conflictAction:"uniquify"
    });
    if(!Number.isInteger(saved))throw new Error("Nie udało się zapisać pliku.");
    status("Gotowe. Zapisano 5 działów do lokalnego pliku JSON. To NIE potwierdza poprawności wszystkich wzmianek; wymaga porównania.");
    setTimeout(()=>URL.revokeObjectURL(downloadUrl),10000);
  }catch(e){
    status("STOP: "+(e instanceof Error?e.message:"Nieznany błąd"));
  }finally{button.disabled=false}
});
