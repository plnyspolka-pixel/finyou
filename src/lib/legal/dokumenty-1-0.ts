/**
 * Dokumenty prawne Finance You (plik nazwany od wersji startowej 1.0 z 2026-10-19).
 *
 * Aktualne wersje (decyzja właściciela 2026-10-21: Prowizja od Pożyczkobiorcy 7%):
 *  - Regulamin klienta 2.0 (consent_documents, kind = terms, version = 2),
 *  - Polityka prywatności 1.0 (consent_documents, kind = privacy, version = 1),
 *    — docs/legal/klient/regulamin-klienta.md, polityka-prywatnosci.md,
 *  - pakiet inwestora FY-LEGAL-2.0 (legal_documents, version = "2.0"):
 *    NDA, Ramowa umowa pośrednictwa, umowa RODO — docs/legal/pakiet-inwestora/,
 *  - Regulamin Abonamentu Inwestora (lib/legal/regulamin-abonamentu.ts).
 *
 * Pliki w docs/legal są źródłem treści: zmiana dokumentu = edycja pliku
 * (a dla pakietu także .docx), podniesienie wersji niżej i ponowne
 * `npx tsx scripts/legal/build-dokumenty.ts`, które przepisuje skróty
 * SHA-256 i moduł danych `dokumenty-1-0.dane.ts`.
 *
 * Do bazy wgrywa je narzędzie administratora `publish_legal_documents`
 * (opublikujDokumenty niżej), a nie migracja SQL: z plikami .docx migracja
 * miałaby ~410 KB, czego nie przyjmuje proces wdrożenia Lovable. Publikacja
 * niczego nie usuwa — akceptacje poprzednich wersji zostają jako ślad, a
 * użytkownik akceptuje nową wersję przy następnym wejściu do panelu.
 */
import { createHash } from "node:crypto";
import { wersjaDokumentu } from "./wersja";

export const DOKUMENTY_DATA_PL = "21 października 2026 r.";

/** consent_documents.version — liczba całkowita; w interfejsie „2.0”. */
export const WERSJE_ZGOD = { terms: 2, privacy: 1 } as const;

export const PAKIET_ID = "FY-LEGAL-2.0";
export const PAKIET_WERSJA = "2.0";

/** Kwoty Abonamentu w treści umowy — muszą zgadzać się z lib/investor-plan/plans.ts. */
export const ABONAMENT_UMOWA = "1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni";
/** Sprzedawca Abonamentu (i wystawca faktur za niego) — decyzja właściciela 2026-09-30. */
export const SPRZEDAWCA_ABONAMENTU =
  "Fundacja Krzewienia Edukacji Finansowej im. Pieczaka z siedzibą w Lublinie (KRS 0001140846, NIP 9462747637)";

export const PAKIET_PLIKI = {
  nda: "01_NDA_i_zakaz_obchodzenia_Finance_You_2.0",
  umowa_ramowa: "02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_2.0",
  rodo: "03_Umowa_udostepniania_i_powierzenia_danych_RODO_Finance_You_2.0",
} as const;

export type KodPakietu = keyof typeof PAKIET_PLIKI;

export const sha256Hex = (d: string | Uint8Array) =>
  createHash("sha256")
    .update(typeof d === "string" ? Buffer.from(d, "utf8") : d)
    .digest("hex");

export { wersjaDokumentu };

export interface DaneDokumentow {
  regulamin: string;
  polityka: string;
  pakiet: Record<KodPakietu, { content_text: string; docx_base64: string }>;
}

export interface WynikPublikacji {
  zastosowano: boolean;
  /** Opublikowane (nowe albo przywrócone) dokumenty. */
  dokumenty: string[];
}

const ZGODY = [
  ["terms", "Akceptuję regulamin klienta", "regulamin"],
  ["privacy", "Akceptuję politykę prywatności", "polityka"],
] as const;

const KODY = Object.keys(PAKIET_PLIKI) as KodPakietu[];

/**
 * Publikuje aktualne wersje dokumentów. `db` — klient z rolą serwisową.
 *
 * Regulamin i polityka: poprzednie wersje zostają w consent_documents jako
 * nieaktywne, nowa wersja jest wstawiana jako aktywna. Pakiet inwestora:
 * wiersz legal_documents dostaje nową wersję i treść; akceptacje zostają
 * z poprzednią wersją i skrótem, więc investor_legal_pack_complete wymaga
 * akceptacji nowej wersji. Akceptacje nie są usuwane.
 *
 * Idempotentne. Gdy baza ma już wersję o tym samym numerze, ale z inną
 * treścią, przerywa — zaakceptowanej treści nie zmieniamy bez podniesienia
 * wersji.
 */
export async function opublikujDokumenty(db: any, dane: DaneDokumentow): Promise<WynikPublikacji> {
  const must = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };
  const dokumenty: string[] = [];

  const { data: zgody, error: e1 } = await db
    .from("consent_documents")
    .select("kind, version, content, is_active")
    .in("kind", ["terms", "privacy"]);
  must("consent_documents", e1);
  const { data: umowy, error: e2 } = await db
    .from("legal_documents")
    .select("code, version, package_id, sha256");
  must("legal_documents", e2);

  // Najpierw sprawdzenie wszystkiego, potem zapisy — błąd nie zostawia połowy zmian.
  for (const [kind, , pole] of ZGODY) {
    const r = (zgody ?? []).find((x: any) => x.kind === kind && x.version === WERSJE_ZGOD[kind]);
    if (r && r.content !== dane[pole]) {
      throw new Error(
        `consent_documents ${kind} v${WERSJE_ZGOD[kind]} ma w bazie inną treść — podnieś wersję w WERSJE_ZGOD.`,
      );
    }
  }
  for (const code of KODY) {
    const r = (umowy ?? []).find((x: any) => x.code === code);
    if (!r) throw new Error(`legal_documents: brak dokumentu ${code}`);
    if (r.version === PAKIET_WERSJA && r.sha256 !== sha256Hex(dane.pakiet[code].content_text)) {
      throw new Error(
        `legal_documents ${code} ${PAKIET_WERSJA} ma w bazie inną treść — podnieś PAKIET_WERSJA.`,
      );
    }
  }

  for (const [kind, title, pole] of ZGODY) {
    const wersja = WERSJE_ZGOD[kind];
    const rows = (zgody ?? []).filter((x: any) => x.kind === kind);
    const docelowy = rows.find((x: any) => x.version === wersja);
    const inneAktywne = rows.some((x: any) => x.version !== wersja && x.is_active);
    if (docelowy?.is_active && !inneAktywne) continue;
    const { error: e3 } = await db
      .from("consent_documents")
      .update({ is_active: false })
      .eq("kind", kind)
      .neq("version", wersja);
    must(`consent_documents ${kind} (dezaktywacja)`, e3);
    if (docelowy) {
      const { error } = await db
        .from("consent_documents")
        .update({ is_active: true })
        .eq("kind", kind)
        .eq("version", wersja);
      must(`consent_documents ${kind} (aktywacja)`, error);
    } else {
      const { error } = await db
        .from("consent_documents")
        .insert([{ kind, title, content: dane[pole], version: wersja, is_active: true }]);
      must(`consent_documents ${kind} (wstawienie)`, error);
    }
    dokumenty.push(`${title.replace(/^Akceptuję /, "")} ${wersjaDokumentu(wersja)}`);
  }

  for (const code of KODY) {
    const d = dane.pakiet[code];
    const r = (umowy ?? []).find((x: any) => x.code === code);
    if (r.version === PAKIET_WERSJA && r.package_id === PAKIET_ID) continue;
    const { error } = await db
      .from("legal_documents")
      .update({
        package_id: PAKIET_ID,
        version: PAKIET_WERSJA,
        sha256: sha256Hex(d.content_text),
        content_text: d.content_text,
        docx_base64: d.docx_base64,
        docx_filename: `${PAKIET_PLIKI[code]}.docx`,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code);
    must(`legal_documents ${code}`, error);
    dokumenty.push(`${PAKIET_PLIKI[code]} (${PAKIET_ID})`);
  }

  return { zastosowano: dokumenty.length > 0, dokumenty };
}
