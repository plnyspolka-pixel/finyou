// Diagnostyka publicznej strony — dokładnie ta sama funkcja fetchHtml
// co do pobierania Otodom, Gratka, Morizon. Nie wysyła PESEL/NIP.
import { fetchHtml, htmlToText } from "../src/lib/web-fetch.server.ts";
const url = "https://www.krpu.pl/lista-syndykow/mazowieckie/paulina-pchla";
const p = await fetchHtml(url,{timeoutMs:12000,minLength:300});
const text = htmlToText(p?.html ?? "").replace(/\s+/g," ");
const name = "Marcin Gerbatowski";
const idx = text.toLocaleLowerCase("pl-PL").indexOf(name.toLocaleLowerCase("pl-PL"));
const k = text.indexOf("GD1G/GRz-nu/125/2025");
const snippet = idx >= 0 ? text.slice(Math.max(idx-220,0),idx+240) : "";
const match = text.match(/GD1G\/GRz-nu\/125\/2025/gi);
console.log(JSON.stringify({
  url,available:!!p,via:p?.via??null,htmlLength:p?.html.length??0,
  textLength:text.length,foundName:idx>=0,foundSignature:k>=0,
  signatureMentions:match?.length??0,nameSignatureDistance:idx>=0&&k>=0?Math.abs(idx-k):null,
  relevantExcerpt:snippet,
},null,2));
if (!p) process.exitCode=1;
