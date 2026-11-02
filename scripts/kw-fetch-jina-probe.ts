// Diagnostyka istniejącego fetchHtml() i fetchReadableMarkdown() w Finance You.
// Bez danych wrażliwych; testowane są wyłącznie publiczne strony.
import { fetchHtml, fetchReadableMarkdown, htmlToText } from "../src/lib/web-fetch.server.ts";

const sources = [
  { name: "KRZ landing", url: "https://krz.ms.gov.pl/" },
  { name: "KRPU public index", url: "https://www.krpu.pl/lista-syndykow/mazowieckie/paulina-pchla" },
  { name: "iMSiG public page", url: "https://www.imsig.pl/" },
] as const;
const BLOCKED = /access denied|403 forbidden|incapsula|captcha|unusual traffic|nietypowy ruch|access to this page has been denied/i;
const results: Array<{ name:string; html:boolean; via:string|null; readable:boolean; meaningful:boolean; htmlLength:number; markdownLength:number; url:string; note:string }> = [];
for (const site of sources) {
  let page = null;
  let md = "";
  let err = "";
  try { page = await fetchHtml(site.url, { timeoutMs: 9000, minLength: 300 }); }
  catch (e) { err = String(e).slice(0,120); }
  try { md = await fetchReadableMarkdown(site.url, { timeoutMs: 14000 }); }
  catch (e) { err += " " + String(e).slice(0,120); }
  const clean = htmlToText(page?.html ?? "").slice(0,2500);
  const meaningful = /w wyszukiwaniu podmiot|postępowani|sygnatur|syndyk|ogłoszeni|monitor sądowy/i.test(clean + " " + md.slice(0,2500)) &&
    !BLOCKED.test((page?.html ?? "").slice(0,4000) + md.slice(0,1200));
  results.push({ name:site.name,url:site.url,html:!!page,via:page?.via??null,
    readable: md.length>300, meaningful,htmlLength:page?.html.length??0, markdownLength:md.length,
    note:err || (meaningful ? "content_indicators" : "no_content_indicators") });
}
console.log(JSON.stringify(results,null,2));
