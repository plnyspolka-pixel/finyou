// Wzory DOCX dostarczane razem z kodem (nie tylko w Storage). Gdy pliku wzoru
// nie ma jeszcze w Storage, generator bierze go stąd i — w miarę możliwości —
// wgrywa do Storage pod `template_file_path`, żeby działały też linki do pobrania.
import { PROCEDURA_AML_CFT_B2B_DOCX_B64 } from "./procedura-aml-cft-b2b.b64";

const BUNDLED_TEMPLATES: Record<string, string> = {
  "templates/Procedura_AML_CFT_wzor_B2B.docx": PROCEDURA_AML_CFT_B2B_DOCX_B64,
};

/** Bajty wzoru dołączonego do kodu dla danej ścieżki Storage (lub null). */
export function bundledTemplateBytes(path: string): Uint8Array<ArrayBuffer> | null {
  const b64 = BUNDLED_TEMPLATES[path];
  if (!b64) return null;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
