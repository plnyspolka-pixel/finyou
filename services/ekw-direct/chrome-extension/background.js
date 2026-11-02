// Finance You EKW capture – browser-native experiment.
// Collects only after user opens a particular KW in the official viewer.
// No proxies, CAPTCHA-solving, fingerprint spoofing or third-party data upload.
// Unverified sections are NEVER fed automatically into credit/risk decisions.
const LABELS=[
  ["dzial_1o","Dział I-O"],["dzial_1s","Dział I-Sp"],
  ["dzial_2","Dział II"],["dzial_3","Dział III"],["dzial_4","Dział IV"]
];
const STATUS_KEY="fy_ekw_capture_status";
const processing=new Set();

function keyFor(tabId){return "fy_ekw_capture_"+tabId}
async function getJob(tabId){return (await chrome.storage.session.get(keyFor(tabId)))[keyFor(tabId)]||null}
async function setJob(tabId,job){await chrome.storage.session.set({[keyFor(tabId)]:job})}
async function setStatus(message,done=false,error=false){
  await chrome.storage.session.set({[STATUS_KEY]:{message,done,error}})
}
async function resetJob(tabId){await chrome.storage.session.remove(keyFor(tabId))}
function isViewer(url){try{const u=new URL(url);return u.protocol==="https:"&&u.hostname==="przegladarka-ekw.ms.gov.pl"}catch{return false}}

function pageAction(mode,label){
  const body=(document.body?.innerText||"").slice(0,3000);
  if (/access denied|requested url was rejected|support id:|captcha|nie jestem robotem/i.test(body)) {
    return {ok:false,error:"Portal EKW zablokował stronę lub wymaga weryfikacji użytkownika."};
  }
  const root=document.getElementById("contentDzialu");
  const inputs=Array.from(document.querySelectorAll('input')).filter(el=>el.type==="submit"||el.type==="button");
  const exact=txt=>inputs.find(el=>(el.value||"").trim().toLocaleLowerCase("pl-PL")===txt.toLocaleLowerCase("pl-PL"));
  if(mode==="check"){
    return {ok:!!root&&["Dział I-O","Dział I-Sp","Dział II","Dział III","Dział IV"].every(exact),
      error:"Otwórz najpierw aktualną treść konkretnej księgi (wszystkie pięć zakładek) w EKW."};
  }
  if(mode==="open"){
    const btn=exact(label);
    if(!btn||!root)return {ok:false,error:"Nie znaleziono zakładki "+label+" lub kontenera treści."};
    btn.click();
    return {ok:true};
  }
  if(mode!=="capture")return {ok:false,error:"Nieprawidłowa operacja."};
  if(!root)return {ok:false,error:"Brak kontenera #contentDzialu po przejściu do "+label};
  const clone=root.cloneNode(true);
  clone.querySelectorAll("script,style,iframe,object,embed,form,input,button,svg,link,meta").forEach(el=>el.remove());
  for(const element of [clone,...clone.querySelectorAll("*")]){
    for(const attr of [...element.attributes]){
      const keep=(attr.name==="class" && /^[\w -]{1,180}$/.test(attr.value))||
        ((attr.name==="colspan"||attr.name==="rowspan")&&/^[1-9]\d?$/.test(attr.value));
      if(!keep)element.removeAttribute(attr.name);
    }
  }
  const rawHtml=clone.innerHTML;
  const rawText=(root.innerText||"").trim();
  if(rawHtml.length<50||rawText.length<8)return {ok:false,error:"Niepełna lub pusta treść: "+label};
  if(rawHtml.length>600000||rawText.length>250000)return {ok:false,error:"Dział przekracza limit bezpiecznego eksportu: "+label};
  return {ok:true,section:{label,rawHtml,rawText,capturedAt:new Date().toISOString()}};
}

async function invoke(tabId,mode,label){
  const result=await chrome.scripting.executeScript({
    target:{tabId},func:pageAction,args:[mode,label]
  });
  return result?.[0]?.result||{ok:false,error:"Przeglądarka nie zwróciła wyniku odczytu."};
}
async function fail(tabId,message){
  await resetJob(tabId);
  await setStatus("Przerwano: "+message,true,true);
}
async function finish(tabId,job){
  const complete=LABELS.every(([key])=>job.sections[key]?.rawHtml&&job.sections[key]?.rawText);
  if(!complete)throw new Error("Brakuje danych z co najmniej jednego działu");
  const data={
    schema:"financeyou-ekw-local-v1",
    source:"https://przegladarka-ekw.ms.gov.pl",
    capturedAt:new Date().toISOString(),
    provider:"browser-local",
    completeness:"NOT_VERIFIED",
    manualReviewRequired:true,
    notes:"Zapis HTML widoczny w przeglądarce użytkownika. Nie stanowi urzędowego odpisu. Wzmianki, właściciele, hipoteki wymagają porównania z widokiem urzędowym.",
    sections:job.sections
  };
  const encoded=encodeURIComponent(JSON.stringify(data));
  await chrome.downloads.download({
    url:"data:application/json;charset=utf-8,"+encoded,
    filename:"FinanceYou/ekw-local-"+Date.now()+".json",
    saveAs:true,conflictAction:"uniquify"
  });
  await resetJob(tabId);
  await setStatus("Zapisano pięć działów do JSON. Zawartość wymaga weryfikacji z EKW. Nie wysłano danych do żadnego API.",true,false);
}
async function drive(tabId){
  if(processing.has(tabId))return;
  processing.add(tabId);
  try{
    const job=await getJob(tabId);
    if(!job||job.done)return;
    if(Date.now()-job.startedAt>180000)throw new Error("Upłynął limit 3 minut. Spróbuj ponownie po sprawdzeniu EKW.");
    const tab=await chrome.tabs.get(tabId);
    if(!isViewer(tab.url))throw new Error("Opuściłeś urzędową przeglądarkę EKW.");
    if(tab.status==="loading")return;
    if(job.index>=LABELS.length){await finish(tabId,job);return}
    const [key,label]=LABELS[job.index];
    if(job.phase==="open"){
      job.phase="capture";
      await setJob(tabId,job);
      await setStatus("Otwieram "+label+" ("+(job.index+1)+"/5)");
      const result=await invoke(tabId,"open",label);
      if(!result.ok)throw new Error(result.error||"Nie udało się otworzyć zakładki.");
      setTimeout(()=>{void drive(tabId)},2300);
    }else{
      const result=await invoke(tabId,"capture",label);
      if(!result.ok)throw new Error(result.error||"Błąd odczytu sekcji.");
      job.sections[key]=result.section;
      job.index++;
      job.phase="open";
      await setJob(tabId,job);
      await setStatus("Odczytano "+label+" ("+job.index+"/5)");
      setTimeout(()=>{void drive(tabId)},250);
    }
  }catch(error){
    await fail(tabId,error instanceof Error?error.message:"Błąd przeglądarki");
  }finally{processing.delete(tabId)}
}
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(change.status==="complete")void drive(tabId);
});
chrome.tabs.onRemoved.addListener(tabId=>{void resetJob(tabId)});
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  void (async()=>{
    try{
      if(msg?.type==="STATUS"){
        const v=(await chrome.storage.session.get(STATUS_KEY))[STATUS_KEY];
        sendResponse({ok:true,...(v||{message:"Gotowe do testu."})});return
      }
      if(msg?.type!=="START"){sendResponse({ok:false,error:"Nieznana komenda"});return}
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(!tab?.id||!isViewer(tab.url)){sendResponse({ok:false,error:"Otwórz w bieżącej karcie aktualną treść KW na przegladarka-ekw.ms.gov.pl."});return}
      if(await getJob(tab.id)){sendResponse({ok:false,error:"Pobieranie już trwa."});return}
      const checked=await invoke(tab.id,"check","");
      if(!checked.ok){sendResponse({ok:false,error:checked.error});return}
      await setJob(tab.id,{startedAt:Date.now(),index:0,phase:"open",sections:{}});
      await setStatus("Uruchomiono pobieranie pięciu działów.");
      sendResponse({ok:true});
      void drive(tab.id);
    }catch(error){sendResponse({ok:false,error:error instanceof Error?error.message:"Błąd rozszerzenia"})}
  })();
  return true;
});
