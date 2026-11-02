import { test } from "node:test";
import assert from "node:assert/strict";
import {assessExtract,queryApify,ProviderError} from "./apify-client.mjs";
const fake={
  success:true,kwNumber:"WA1M/00012345/6",viewType:"aktualna",
  dzialIO:{available:true,empty:false,entries:[{label:"Numer działki",value:"10"}]},
  dzialISp:{available:true,empty:true,rawText:"BRAK WPISÓW"},
  dzialII:{available:true,empty:false,entries:[{label:"Właściciel",value:"TEST"}]},
  dzialIII:{available:true,empty:true,rawText:"BRAK WPISÓW"},
  dzialIV:{available:true,empty:true,rawText:"BRAK WPISÓW"}
};
test("five current sections accepted but mentions unverified",()=>{
 const a=assessExtract(fake,"WA1M/00012345/6");
 assert.equal(a.fiveSectionsPresent,true);
 assert.equal(a.readyForLegalAnalysis,false);
 assert.equal(a.mentionsVerified,false);
});
test("reject missing mortgage section",()=>{
 const {dzialIV,...incomplete}=fake;
 assert.throws(()=>assessExtract(incomplete,fake.kwNumber),e=>e.code==="MISSING_SECTION");
});
test("reject empty section missing proof",()=>{
 assert.throws(()=>assessExtract({...fake,dzialIV:{empty:true,available:true}},fake.kwNumber),e=>e.code==="AMBIGUOUS_SECTION");
});
test("reject stale or different KW",()=>{
 assert.throws(()=>assessExtract({...fake,viewType:"zupelna"},fake.kwNumber));
 assert.throws(()=>assessExtract(fake,"WR1K/00094598/3"),e=>e.code==="MISMATCH");
});
test("POST is single, capped, authorized, and no auto retries",async()=>{
 let count=0;
 const fakeFetch=async(url,opts)=>{
  count++;
  assert.match(url,/maxTotalChargeUsd=0.1/);
  assert.equal(opts.headers.Authorization,"Bearer test_secret");
  const body=JSON.parse(opts.body);
  assert.equal(body.kwNumbers[0],fake.kwNumber);
  assert.equal(body.includeRawHtml,true);
  return {ok:true,json:async()=>[fake]};
 };
 const r=await queryApify(fake.kwNumber,{token:"test_secret",fetchImpl:fakeFetch});
 assert.equal(r.assessment.sections.length,5);
 assert.equal(count,1);
});
