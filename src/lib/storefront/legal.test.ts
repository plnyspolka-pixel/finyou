import {describe,it,expect} from "vitest";
import {STORE_TERMS,STORE_DPA,legalDigest,legalText,legalVersion} from "./legal";
import {freeLoanAgreementBlocks,freeLoanAgreementDocx} from "./free-loan-agreement";

describe("storefront electronic legal agreements",()=>{
  it("has distinct and immutable version identifiers",()=>{
    expect(legalVersion("store_terms")).not.toBe(legalVersion("store_dpa"));
    expect(legalText("store_terms")).toBe(STORE_TERMS);
    expect(legalText("store_dpa")).toBe(STORE_DPA);
    expect(STORE_DPA).toContain("art. 28 ust. 3 i 9 RODO");
    expect(STORE_DPA).toContain("udokumentowane polecenie");
    expect(STORE_DPA).toContain("podprocesor");
  });
  it("produces a deterministic SHA-256 of the whole agreed text",async()=>{
    const a=await legalDigest("store_terms");
    const b=await legalDigest("store_terms");
    const c=await legalDigest("store_dpa");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(c).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(c);
  });
});
describe("free standalone loan agreement",()=>{
  it("includes a usable contract with separate mortgage formalities and no annexes",()=>{
    const blocks=freeLoanAgreementBlocks();
    const txt=blocks.map(b=>("tekst" in b ? b.tekst : ("runs" in b?b.runs.map(r=>r.tekst).join(""):""))).join("\n");
    expect(txt).toContain("UMOWA POŻYCZKI");
    expect(txt).toContain("§ 5. Zabezpieczenie");
    expect(txt).toContain("aktu notarialnego");
    expect(txt).toContain("Pożyczkobiorca:");
    expect(blocks.filter(b=>b.t==="tytul")).toHaveLength(1);
    expect(blocks.some(b=>b.t==="tytul"&&b.tekst.includes("ZAŁĄCZNIK"))).toBe(false);
  });
  it("generates a real DOCX zip archive",async()=>{
    const docx=await freeLoanAgreementDocx();
    expect(docx.length).toBeGreaterThan(1200);
    expect(Array.from(docx.slice(0,2))).toEqual([0x50,0x4b]);
  });
});
