/**
 * Dokumenty prawne Finance You — wersja 1.0 (decyzja właściciela 2026-10-19).
 *
 * Wszystkie dokumenty startują od wersji 1.0, bez wersji historycznych:
 *  - Regulamin klienta i Polityka prywatności (consent_documents, version = 1)
 *    — docs/legal/klient/regulamin-klienta.md, polityka-prywatnosci.md,
 *  - pakiet inwestora FY-LEGAL-1.0 (legal_documents, version = "1.0"):
 *    NDA, Ramowa umowa pośrednictwa, umowa RODO — docs/legal/pakiet-inwestora/,
 *  - Regulamin Abonamentu Inwestora (lib/legal/regulamin-abonamentu.ts).
 *
 * Pliki w docs/legal są źródłem treści: zmiana dokumentu = edycja pliku
 * (a dla pakietu także .docx) i ponowne `npx tsx scripts/legal/build-dokumenty.ts`,
 * które przepisuje skróty SHA-256 i moduł danych `dokumenty-1-0.dane.ts`.
 *
 * Do bazy wgrywa je narzędzie administratora `apply_legal_documents_1_0`
 * (zastosujDokumenty niżej), a nie migracja SQL: z plikami .docx migracja
 * miałaby ~410 KB, czego nie przyjmuje proces wdrożenia Lovable. Narzędzie
 * jest idempotentne — gdy baza ma już te same dokumenty, nic nie zmienia,
 * więc nie skasuje akceptacji złożonych po wdrożeniu.
 */
import { createHash } from "node:crypto";

export const DOKUMENTY_DATA_PL = "19 października 2026 r.";
/** Wersja w treści dokumentów i w interfejsie. */
export const WERSJA_DOKUMENTOW = "1.0";

/** consent_documents.version — liczba całkowita; w interfejsie „1.0”. */
export const KLIENT_DOCS_VERSION = 1;

export const PAKIET_ID = "FY-LEGAL-1.0";
export const PAKIET_WERSJA = "1.0";

/** Kwoty Abonamentu w treści umowy — muszą zgadzać się z lib/investor-plan/plans.ts. */
export const ABONAMENT_UMOWA = "1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni";
/** Sprzedawca Abonamentu (i wystawca faktur za niego) — decyzja właściciela 2026-09-30. */
export const SPRZEDAWCA_ABONAMENTU =
  "Fundacja Krzewienia Edukacji Finansowej im. Pieczaka z siedzibą w Lublinie (KRS 0001140846, NIP 9462747637)";

export const PAKIET_PLIKI = {
  nda: "01_NDA_i_zakaz_obchodzenia_Finance_You_1.0",
  umowa_ramowa: "02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_1.0",
  rodo: "03_Umowa_udostepniania_i_powierzenia_danych_RODO_Finance_You_1.0",
} as const;

export type KodPakietu = keyof typeof PAKIET_PLIKI;

export const sha256Hex = (d: string | Uint8Array) =>
  createHash("sha256")
    .update(typeof d === "string" ? Buffer.from(d, "utf8") : d)
    .digest("hex");

export { wersjaDokumentu } from "./wersja";

export interface DaneDokumentow {
  regulamin: string;
  polityka: string;
  pakiet: Record<KodPakietu, { content_text: string; docx_base64: string }>;
}

export interface WynikZastosowania {
  zastosowano: boolean;
  usunieteAkceptacjeZgod: number;
  usunieteAkceptacjeUmow: number;
  dokumenty: string[];
}

const ZGODY = [
  ["terms", "Akceptuję regulamin klienta", "regulamin"],
  ["privacy", "Akceptuję politykę prywatności", "polityka"],
] as const;

const KODY = Object.keys(PAKIET_PLIKI) as KodPakietu[];

/** Czy baza ma już dokładnie te dokumenty 1.0 (wtedy nic nie robimy). */
async function juzZastosowane(db: any, dane: DaneDokumentow): Promise<boolean> {
  const { data: zgody, error: e1 } = await db
    .from("consent_documents")
    .select("kind, version, content, is_active")
    .in("kind", ["terms", "privacy"]);
  if (e1) throw new Error(`consent_documents: ${e1.message}`);
  const okZgody = ZGODY.every(([kind, , pole]) => {
    const rows = (zgody ?? []).filter((r: any) => r.kind === kind);
    return (
      rows.length === 1 &&
      rows[0].version === KLIENT_DOCS_VERSION &&
      rows[0].is_active &&
      rows[0].content === dane[pole]
    );
  });
  const { data: umowy, error: e2 } = await db
    .from("legal_documents")
    .select("code, version, package_id, sha256");
  if (e2) throw new Error(`legal_documents: ${e2.message}`);
  const okUmowy = KODY.every((code) => {
    const r = (umowy ?? []).find((x: any) => x.code === code);
    return (
      r &&
      r.version === PAKIET_WERSJA &&
      r.package_id === PAKIET_ID &&
      r.sha256 === sha256Hex(dane.pakiet[code].content_text)
    );
  });
  return okZgody && okUmowy;
}

/**
 * Wgrywa dokumenty 1.0: usuwa wcześniejsze wersje regulaminu i polityki
 * oraz wszystkie ich akceptacje, wstawia wersję 1, usuwa akceptacje pakietu
 * inwestora i przenumerowuje pakiet na FY-LEGAL-1.0. `db` — klient z rolą
 * serwisową. Idempotentne.
 */
export async function zastosujDokumenty(db: any, dane: DaneDokumentow): Promise<WynikZastosowania> {
  if (await juzZastosowane(db, dane)) {
    return {
      zastosowano: false,
      usunieteAkceptacjeZgod: 0,
      usunieteAkceptacjeUmow: 0,
      dokumenty: [],
    };
  }
  const must = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };

  const { data: delZgody, error: e1 } = await db
    .from("consent_acceptances")
    .delete()
    .in("kind", ["terms", "privacy"])
    .select("id");
  must("consent_acceptances", e1);
  const { error: e2 } = await db
    .from("consent_documents")
    .delete()
    .in("kind", ["terms", "privacy"]);
  must("consent_documents (usunięcie)", e2);
  const { error: e3 } = await db.from("consent_documents").insert(
    ZGODY.map(([kind, title, pole]) => ({
      kind,
      title,
      content: dane[pole],
      version: KLIENT_DOCS_VERSION,
      is_active: true,
    })),
  );
  must("consent_documents (wstawienie)", e3);

  const { data: delUmowy, error: e4 } = await db
    .from("investor_agreement_acceptances")
    .delete()
    .not("id", "is", null)
    .select("id");
  must("investor_agreement_acceptances", e4);
  for (const code of KODY) {
    const d = dane.pakiet[code];
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
  }

  return {
    zastosowano: true,
    usunieteAkceptacjeZgod: delZgody?.length ?? 0,
    usunieteAkceptacjeUmow: delUmowy?.length ?? 0,
    dokumenty: [
      `Regulamin klienta ${WERSJA_DOKUMENTOW}`,
      `Polityka prywatności ${WERSJA_DOKUMENTOW}`,
      ...KODY.map((c) => `${PAKIET_PLIKI[c]} (${PAKIET_ID})`),
    ],
  };
}
