/**
 * Regulamin klienta v4 i Polityka prywatności v3 (consent_documents) —
 * „Serwis” zamiast „Platformy”.
 *
 * Jedyna zmiana względem obowiązujących wersji (regulamin v3, polityka v2):
 * Finance You nie nazywa się już „platformą” (decyzja właściciela
 * 2026-10-19) — zdefiniowane pojęcie „Platforma” zastępuje „Serwis”
 * (z odmianą i uzgodnieniem rodzaju), bez zmian merytorycznych. Zostają:
 * zastrzeżenie „nie jest … platformą finansowania społecznościowego”
 * (pojęcie ustawowe) i nazwa „Meta Platforms”.
 *
 * Starsze wersje były już zaakceptowane, więc zostają w tabeli jako
 * dokumenty historyczne, a użytkownicy akceptują nowe przy następnym
 * wejściu do panelu (ConsentGate).
 */
import { Transform } from "./pakiet-v7";

export const ZGODY_V4_DATA_PL = "19 października 2026 r.";
export const REGULAMIN_V4_VERSION = 4;
export const POLITYKA_V3_VERSION = 3;

/**
 * Zamienia zdefiniowane pojęcie „Platforma” na „Serwis” we wszystkich
 * przypadkach i poprawia uzgodnienia rodzaju (żeński → męski) tam, gdzie
 * występują w tekście. Nie rusza „platformą finansowania
 * społecznościowego” ani „Meta Platforms”.
 */
export function bezPlatformy(md: string): string {
  const out = md
    // Nagłówki wersalikami.
    .replace(/\bPLATFORMY\b/g, "SERWISU")
    // Definicja pojęcia.
    .replace(
      "**Platforma** albo **Platforma Finance You** – serwis internetowy,",
      "**Serwis** albo **Serwis Finance You** – strona internetowa,",
    )
    // Uzgodnienia rodzaju, zanim zmieni się sam rzeczownik.
    .replace(
      "aby Platforma działała prawidłowo i była dostępna",
      "aby Serwis działał prawidłowo i był dostępny",
    )
    .replace(
      "Platforma ma charakter organizacyjny, informacyjny i pośredniczący w znaczeniu faktycznym. Jej celem",
      "Serwis ma charakter organizacyjny, informacyjny i pośredniczący w znaczeniu faktycznym. Jego celem",
    )
    .replace("Prawa do Platformy, jej układu", "Prawa do Serwisu, jego układu")
    .replace("Platforma może być dostępna", "Serwis może być dostępny")
    .replace("Platformy Finance You prowadzonej przez", "Serwisu Finance You prowadzonego przez")
    .replace("Platforma Finance You nie jest kierowana", "Serwis Finance You nie jest kierowany")
    // Odmiana (wielka litera = zdefiniowane pojęcie; „platformą finansowania
    // społecznościowego” jest pisana małą literą i zostaje).
    .replace(/\bna Platformie\b/g, "w Serwisie")
    .replace(/\bPlatformie\b/g, "Serwisie")
    .replace(/\bPlatformy\b/g, "Serwisu")
    .replace(/\bPlatformą\b/g, "Serwisem")
    .replace(/\bPlatformę\b/g, "Serwis")
    .replace(/\bPlatforma\b/g, "Serwis");
  return out;
}

export function transformRegulaminV4(v3: string): string {
  const t = new Transform(v3)
    .replaceOnce(
      "**wersja 3 — obowiązuje od dnia 30 września 2026 r.**",
      `**wersja 4 — obowiązuje od dnia ${ZGODY_V4_DATA_PL}**`,
    )
    .replaceOnce(
      "Regulamin w wersji 3 obowiązuje od dnia 30 września 2026 r. ",
      `Regulamin w wersji 4 obowiązuje od dnia ${ZGODY_V4_DATA_PL} `,
    )
    .value();
  return bezPlatformy(t);
}

export function transformPolitykaV3(v2: string): string {
  const t = new Transform(v2)
    .replaceOnce(
      "**wersja 2 — obowiązuje od dnia 29 września 2026 r.**",
      `**wersja 3 — obowiązuje od dnia ${ZGODY_V4_DATA_PL}**`,
    )
    .replaceOnce(
      "Polityka prywatności w wersji 2 obowiązuje od dnia 29 września 2026 r..",
      `Polityka prywatności w wersji 3 obowiązuje od dnia ${ZGODY_V4_DATA_PL}`,
    )
    .value();
  return bezPlatformy(t);
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

function blok(kind: "terms" | "privacy", title: string, content: string, v: number): string {
  return `
-- ${kind} v${v}
insert into public.consent_documents (kind, title, content, version, is_active)
select ${sqlStr(kind)}::public.consent_kind, ${sqlStr(title)},
${sqlStr(content)},
  ${v}, true
where not exists (
  select 1 from public.consent_documents
   where kind = ${sqlStr(kind)}::public.consent_kind and version = ${v}
);

update public.consent_documents
   set is_active = false
 where kind = ${sqlStr(kind)}::public.consent_kind and version < ${v} and is_active;
`;
}

/**
 * Migracja: wstawia regulamin v4 i politykę v3 (is_active = true) i wyłącza
 * starsze wersje, które zostają w tabeli (akceptacje wskazują numer wersji).
 * Idempotentna.
 */
export function migracjaZgodV4(regulamin: string, polityka: string): string {
  return `-- =====================================================================
-- REGULAMIN KLIENTA v4 i POLITYKA PRYWATNOŚCI v3 — „Serwis” zamiast „Platformy”
--
-- Plik wygenerowany: npx tsx scripts/legal/build-zgody-v4.ts
-- (nie edytować ręcznie — zmiany w src/lib/legal/zgody-v4.ts).
-- Treść: docs/legal/klient/regulamin-klienta-v4.md, polityka-prywatnosci-v3.md.
--
-- Jedyna zmiana: pojęcie „Platforma” zastąpione „Serwisem” (bez zmian
-- merytorycznych). Starsze wersje zostają w tabeli (is_active = false);
-- użytkownicy akceptują nowe przy następnym wejściu do panelu.
-- =====================================================================
${blok("terms", "Akceptuję regulamin klienta", regulamin, REGULAMIN_V4_VERSION)}${blok(
    "privacy",
    "Akceptuję politykę prywatności",
    polityka,
    POLITYKA_V3_VERSION,
  )}`;
}
