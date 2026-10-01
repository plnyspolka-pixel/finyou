/**
 * Regulamin klienta v3 (consent_documents, kind = terms).
 *
 * Jedyna zmiana merytoryczna względem v2: prowizja Finance You należna od
 * Klienta nazywa się „prowizja od pożyczkobiorcy” zamiast „Prowizja
 * Klientowska” (decyzja właściciela 2026-09-30). Wersja 2 była już
 * zaakceptowana, więc nie zmieniamy jej treści — zostaje w tabeli jako
 * dokument historyczny, a klienci akceptują v3 przy następnym wejściu
 * do panelu (ConsentGate). Od 2026-10-01 v3 wprowadza też prowizję 5% (zamiast 7%)
 * Kwoty Udzielonej; minimum 5 000,00 zł bez zmian. Polityka prywatności się nie zmienia (v2).
 */
import { Transform } from "./pakiet-v7";

export const ZGODY_V3_DATA_PL = "30 września 2026 r.";
export const REGULAMIN_V3_VERSION = 3;

export function transformRegulaminV3(v2: string): string {
  return new Transform(v2)
    .replaceOnce(
      "**wersja 2 — obowiązuje od dnia 29 września 2026 r.**",
      `**wersja 3 — obowiązuje od dnia ${ZGODY_V3_DATA_PL}**`,
    )
    .replaceOnce(
      "**Prowizja Finance You** (Prowizja Klientowska) –",
      "**Prowizja Finance You** (prowizja od pożyczkobiorcy) –",
    )
    .replaceOnce(
      "Regulamin w wersji 2 obowiązuje od dnia 29 września 2026 r.. ",
      `Regulamin w wersji 3 obowiązuje od dnia ${ZGODY_V3_DATA_PL} `,
    )
    // Obniżenie prowizji Finance You z 7% do 5% Kwoty Udzielonej (decyzja właściciela 2026-10-01).
    .replaceOnce(
      "skutecznego zorganizowania finansowania: 7% Kwoty Udzielonej",
      "skutecznego zorganizowania finansowania: 5% Kwoty Udzielonej",
    )
    .replaceOnce(
      "wynosi **7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT**",
      "wynosi **5% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT**",
    )
    .replaceOnce(
      "Prowizja Finance You wynosi 7 000,00 zł, a Klient otrzymuje 93 000,00 zł",
      "Prowizja Finance You wynosi 5 000,00 zł, a Klient otrzymuje 95 000,00 zł",
    )
    .value();
}

/** Znaczniki sekcji w migracji 20260930190000 (drizzle 0024) wypełnianej przez skrypt. */
export const ZGODY_V3_SEKCJA_START =
  "-- >>> REGULAMIN KLIENTA v3 (generowane: npx tsx scripts/legal/build-zgody-v3.ts)";
export const ZGODY_V3_SEKCJA_KONIEC = "-- <<< REGULAMIN KLIENTA v3";

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Wstawia regulamin v3 (is_active = true) i wyłącza starsze wersje.
 * Wersja 2 zostaje w tabeli (akceptacje klientów wskazują numer wersji).
 * Idempotentna.
 */
export function migracjaRegulaminV3(content: string): string {
  const v = REGULAMIN_V3_VERSION;
  return `${ZGODY_V3_SEKCJA_START}
insert into public.consent_documents (kind, title, content, version, is_active)
select 'terms'::public.consent_kind, 'Akceptuję regulamin klienta',
${sqlStr(content)},
  ${v}, true
where not exists (
  select 1 from public.consent_documents
   where kind = 'terms'::public.consent_kind and version = ${v}
);

update public.consent_documents
   set is_active = false
 where kind = 'terms'::public.consent_kind and version < ${v} and is_active;
${ZGODY_V3_SEKCJA_KONIEC}`;
}
