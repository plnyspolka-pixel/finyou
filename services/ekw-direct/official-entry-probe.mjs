// EKW diagnostics using the same methods used for the official MSiG project:
// server-side fetch and browser-observed navigation. Zero personal data and no KW.
import { chromium } from "playwright";

const targets=[
  ["official-entry","https://ekw.ms.gov.pl/eukw_ogol/KsiegiWieczyste"],
  ["viewer-menu","https://przegladarka-ekw.ms.gov.pl/eukw_prz/menu.do"],
  ["viewer-search","https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW"]
];
const mask=url=>{try{const u=new URL(url);return u.origin+u.pathname}catch{return "(invalid URL)"}};
const getStatus=async (label,url) => {
  try {
    const response=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(16000)});
    await response.body?.cancel();
    console.log("FETCH",JSON.stringify({label,status:response.status,final:mask(response.url),
      contentType:response.headers.get("content-type")||null,hasSetCookie:response.headers.has("set-cookie")}));
  }catch(error){console.log("FETCH",JSON.stringify({label,error:error?.name||"FetchError"}))}
};
for(const [label,url] of targets)await getStatus(label,url);

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({locale:"pl-PL",serviceWorkers:"block"});
const page=await ctx.newPage();
const trace=[];
page.on("response",r=>{
  if(/\.ms\.gov\.pl/.test(new URL(r.url()).hostname) && trace.length<30)
    trace.push({status:r.status(),url:mask(r.url()),type:r.request().resourceType()});
});
async function inspect(label,page,response){
 const txt=(await page.locator("body").innerText().catch(()=>"")).slice(0,400);
 const iframes=await page.locator("iframe").count();
 const fields=await page.locator("#kodWydzialuInput, input[name=numerKw]").count();
 console.log("BROWSER",JSON.stringify({label,status:response?.status()??null,final:mask(page.url()),
  blocked:/access denied|captcha|requested url was rejected|support id/i.test(txt)||[403,429].includes(response?.status()),iframes,fields,
  bodySnippet:txt.replace(/\s+/g," ").slice(0,110)}));
}
try{
 const home=await page.goto("https://ekw.ms.gov.pl/eukw_ogol/menu.do",{waitUntil:"domcontentloaded",timeout:25000}).catch(()=>null);
 await inspect("home",page,home);
 const link=page.getByRole("link",{name:/Przeglądanie księgi wieczystej/i}).first();
 if(await link.count()){
   let opened=null;
   const popup=page.waitForEvent("popup",{timeout:5000}).catch(()=>null);
   const nav=page.waitForNavigation({timeout:8000}).catch(()=>null);
   await link.click({timeout:8000}).catch(()=>null);
   const pop=await popup;
   opened=pop||page;
   if(pop)await pop.waitForLoadState("domcontentloaded",{timeout:9000}).catch(()=>{});
   const response=pop?null:await nav;
   await inspect("official-home-link",opened,response);
 }
 const entry=await page.goto(targets[0][1],{waitUntil:"domcontentloaded",timeout:25000}).catch(()=>null);
 await inspect("official-entry",page,entry);
 const menu=await page.goto(targets[1][1],{waitUntil:"domcontentloaded",timeout:25000}).catch(()=>null);
 await inspect("viewer-menu",page,menu);
 const search=await page.goto(targets[2][1],{waitUntil:"domcontentloaded",timeout:25000}).catch(()=>null);
 await inspect("viewer-search",page,search);
 console.log("EKW_HTTP_TRACE",JSON.stringify(trace));
}finally{await browser.close()}
