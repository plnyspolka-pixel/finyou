// Diagnostic only: test official MSiG public browser and existing Finance You HTML fetch.
// Does not log cookies, tokens, PII or fetch restricted content.
import { fetchHtml, htmlToText } from "../src/lib/web-fetch.server.ts";

const targets = [
  {label:"official", url:"https://wyszukiwarka-msig.ms.gov.pl/"},
  {label:"commercial_search", url:"https://www.imsig.pl/szukaj"},
  {label:"commercial_search_example_krs", url:"https://www.imsig.pl/szukaj?krs=0000304735"},
  {label:"commercial_insolvency", url:"https://www.imsig.pl/lista-upadlosci"},
] as const;
const out=[];
for (const target of targets) {
  const began=Date.now();
  let http=null, html="",err="",via=null;
  try {
    const response=await fetch(target.url,{
      headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36","Accept-Language":"pl-PL,pl;q=0.9"},
      signal:AbortSignal.timeout(10000),
    });
    http=response.status;
    html=(await response.text()).slice(0,450000);
  }catch(e){err=String(e?.message??e).slice(0,130)}
  const direct={http,htmlSize:html.length,hasForm:/<form\b/i.test(html),hasAngularOrReact:/ng-version|__NEXT_DATA__|app-root|id=["']root["']|_nuxt/i.test(html),scriptPaths:[...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map(x=>x[1]).slice(0,10)};
  let rendered=null;
  try{
    const p=await fetchHtml(target.url,{timeoutMs:9000,minLength:300});
    via=p?.via??null;
    rendered=p?htmlToText(p.html).slice(0,1500):"";
  }catch(e){err += " fetchHtml:"+String(e?.message??e).slice(0,90)}
  out.push({label:target.label,url:target.url,ms:Date.now()-began,direct,via,contentIndicators:/Wyszukiwanie ogłoszeń|Nazwa podmiotu|Sygnatura sprawy|ogłoszeni|upadłoś/i.test(rendered??""),renderedLength:rendered?.length??0,preview:(rendered??"").slice(0,220),error:err||null});
}
console.log(JSON.stringify(out,null,2));

// Playwright test of official search UI (without performing any search).
try {
  const {chromium}=await import("playwright");
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({locale:"pl-PL"});
    const responses=[];
    page.on("response",r=>{try{
      const url=new URL(r.url());
      if(url.hostname.endsWith("ms.gov.pl")){
        const key=r.request().method()+" "+url.pathname;
        if(!responses.some(x=>x.path===key))responses.push({path:key,status:r.status()});
      }
    }catch{}});
    const response=await page.goto("https://wyszukiwarka-msig.ms.gov.pl/",{waitUntil:"domcontentloaded",timeout:22000});
    await page.waitForTimeout(3500);
    const info=await page.evaluate(()=>({
      title:document.title,
      body:document.body?.innerText?.slice(0,1300)??"",
      inputs:[...document.querySelectorAll("input")].slice(0,20).map(e=>({placeholder:e.getAttribute("placeholder"),type:e.getAttribute("type"),name:e.getAttribute("name")})),
      buttons:[...document.querySelectorAll("button")].slice(0,20).map(e=>e.innerText.trim()),
    }));
    console.log("MSIG_PLAYWRIGHT "+JSON.stringify({http:response?.status(),url:page.url(),...info,responses:responses.slice(0,30)},null,2));
  }finally{await browser.close()}
}catch(e){console.log("MSIG_PLAYWRIGHT_ERROR "+String(e?.message??e).slice(0,500))}
