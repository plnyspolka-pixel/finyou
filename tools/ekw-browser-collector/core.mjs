export const SECTIONS = Object.freeze([
  ["dzial_1o", "I-O"],
  ["dzial_1s", "I-Sp"],
  ["dzial_2", "II"],
  ["dzial_3", "III"],
  ["dzial_4", "IV"],
]);
export function compactKw(value) {
  const clean=String(value??"").trim().toUpperCase().replaceAll("/","").replaceAll(" ","");
  if(!/^[A-Z]{2}[0-9][A-Z0-9][0-9]{9}$/.test(clean)) throw new Error("Wymagany pełny numer KW.");
  return clean;
}
export function isSecurityBlock(text) {
  return /the requested url was rejected|support id|access denied|captcha|nie jestem robotem|hcaptcha|odmowa dostępu/i.test(String(text??""));
}
export function visibleSectionTitle(text, expected) {
  const head=String(text??"").slice(0,700).replace(/\s+/g," ").toUpperCase();
  return new RegExp("DZIAŁ\\s+"+expected.toUpperCase().replace("-","[-‐‑–]")+"\\b").test(head);
}
export function assertSnapshot(result, kw) {
  if (!result||result.kw_number!==compactKw(kw)) throw new Error("Nie zgadza się numer KW");
  for(const [key] of SECTIONS){
    const s=result.sections?.[key];
    if(!s||typeof s.html!=="string"||s.html.length<100||!visibleSectionTitle(s.text, s.label)) {
      throw new Error("Niepotwierdzona kompletność działu "+key);
    }
    if(isSecurityBlock(s.text)) throw new Error("Wykryto blokadę dostępu");
  }
  return true;
}
