import test from "node:test";
import assert from "node:assert/strict";
import {compactKw,isSecurityBlock,visibleSectionTitle,assertSnapshot,SECTIONS} from "./core.mjs";
const kw="LU1I/00012345/6";
const snapshot={
  kw_number:compactKw(kw),
  sections:Object.fromEntries(SECTIONS.map(([key,label])=>[key,{
    label,
    text:"DZIAŁ "+label+" - DANE "+("Numer bieżący nieruchomości ".repeat(8)),
    html:"<div><table>"+("<tr><td>Dane EKW</td></tr>".repeat(5))+"</table></div>",
  }]))
};
test("normalizes exact KW format",()=>assert.equal(compactKw(kw),"LU1I000123456"));
test("rejects partial and malformed KW",()=>assert.throws(()=>compactKw("LU1I/123/1")));
test("understands the five official section titles",()=>{
  assert.equal(visibleSectionTitle("DZIAŁ I-Sp - SPIS PRAW", "I-Sp"),true);
  assert.equal(visibleSectionTitle("DZIAŁ IV - HIPOTEKA","III"),false);
});
test("rejects EKW WAF and CAPTCHA",()=>{
  assert.ok(isSecurityBlock("The requested URL was rejected. Your support ID is: 123"));
  assert.ok(isSecurityBlock("CAPTCHA"));
});
test("accepts complete five section snapshot without claiming full legal correctness",()=>assert.equal(assertSnapshot(snapshot,kw),true));
test("rejects missing and wrong section",()=>{
  const missing={...snapshot,sections:{...snapshot.sections,dzial_4:null}};
  assert.throws(()=>assertSnapshot(missing,kw));
  const wrong={...snapshot,sections:{...snapshot.sections,dzial_2:{...snapshot.sections.dzial_2,text:"DZIAŁ IV - HIPOTEKA"}}};
  assert.throws(()=>assertSnapshot(wrong,kw));
});
test("rejects mismatch",()=>assert.throws(()=>assertSnapshot(snapshot,"WA1M/00012345/6")));
