/**
 * Regulamin klienta v2 i Polityka prywatności v2 (consent_documents).
 *
 * Treść v1 istnieje tylko w bazie — jej kopia jest w
 * docs/legal/klient/*-v1.md. Wersję 2 budujemy deterministycznie przez
 * podmiany (jak pakiet inwestora v7) i naprawę spłaszczonych list.
 *
 * Regulamin v2: finansowanie wyłącznie na Cel Gospodarczy (B2B),
 * oświadczenie o celu gospodarczym przy wniosku, Prowizja Finance You
 * 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, potrącana
 * z wypłaty; ochrona przed obejściem 5 lat; decyzje odmowne podejmuje
 * człowiek; odsetki nie wyższe niż maksymalne.
 * Polityka v2: brak IOD, lista głównych podmiotów przetwarzających
 * (Supabase/AWS, Didit, Dilisense, ElevenLabs, Twilio, Tpay, Meta),
 * udział człowieka w decyzjach odmownych (§ 17), nagrywanie rozmów z AI.
 */
import { Transform } from "./pakiet-v7";

export const ZGODY_V2_DATA_PL = "29 września 2026 r.";
export const ZGODY_V2_VERSION = 2;

/**
 * Naprawia listy spłaszczone przy imporcie: w obrębie sekcji (## …) pozycje
 * numerowane na najwyższym poziomie zaczynające się małą literą, które
 * następują po akapicie zakończonym dwukropkiem, stają się podpunktami
 * („   1. …”), a pozostałe ustępy sekcji są numerowane od nowa.
 */
export function naprawListy(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let ust = 0;
  let sub = 0;
  let wPodliscie = false;
  for (const line of lines) {
    if (/^#{1,2} /.test(line)) {
      ust = 0;
      wPodliscie = false;
      out.push(line);
      continue;
    }
    const m = /^(\d+)\. (.*)$/.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const tekst = m[2];
    if (wPodliscie && /^[a-ząćęłńóśźż]/.test(tekst)) {
      sub += 1;
      out.push(`   ${sub}. ${tekst}`);
      continue;
    }
    ust += 1;
    wPodliscie = /:$/.test(tekst);
    sub = 0;
    out.push(`${ust}. ${tekst}`);
  }
  // Podpunkty tej samej listy nie potrzebują pustych linii między sobą.
  return out.join("\n").replace(/(\n {3}\d+\. [^\n]*)\n\n(?= {3}\d+\. )/g, "$1\n");
}

export function transformRegulaminV2(v1: string): string {
  const t = new Transform(naprawListy(v1));

  t.replaceOnce(
    "**obowiązuje od dnia 8 czerwca 2026 r.**",
    `**wersja 2 — obowiązuje od dnia ${ZGODY_V2_DATA_PL}**`,
  );

  // § 1 ust. 6 — wyłącznie B2B.
  t.replaceOnce(
    "6. Platforma może być dostępna zarówno dla konsumentów, jak i dla przedsiębiorców.",
    "6. Za pośrednictwem Platformy Finance You organizuje wyłącznie finansowanie przeznaczone na Cel Gospodarczy (finansowanie B2B). Klientem może być przedsiębiorca, w tym osoba fizyczna prowadząca działalność gospodarczą, spółka albo inna jednostka organizacyjna, a także osoba fizyczna działająca w bezpośrednim związku z działalnością gospodarczą. Finance You nie organizuje finansowania na cele konsumpcyjne ani na zaspokojenie prywatnych potrzeb mieszkaniowych, w tym kredytu konsumenckiego i kredytu hipotecznego dla konsumenta.",
  );

  // § 2 — definicje.
  t.replaceOnce(
    "15. **Opłata za zorganizowanie finansowania** – wynagrodzenie należne Finance You w przypadku skutecznego zorganizowania finansowania, określone w § 12 Regulaminu.",
    "15. **Prowizja Finance You** (Prowizja Klientowska) – jedyne wynagrodzenie Finance You należne od Klienta, wyłącznie w przypadku skutecznego zorganizowania finansowania: 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, potrącane z wypłaty finansowania, określone w § 12 Regulaminu.",
  );
  t.replaceOnce(
    "19. **Regulamin** – niniejszy regulamin Platformy Finance You dla użytkowników składających wniosek o pożyczkę lub poszukujących finansowania.",
    [
      "19. **Regulamin** – niniejszy regulamin Platformy Finance You dla użytkowników składających wniosek o pożyczkę lub poszukujących finansowania.",
      "",
      "20. **Cel Gospodarczy** – cel pozostający w bezpośrednim związku z działalnością gospodarczą lub zawodową Klienta, w szczególności finansowanie bieżącej działalności, inwestycji, zakupu lub remontu nieruchomości w ramach działalności, refinansowanie zobowiązań firmowych. Celem Gospodarczym nie jest cel konsumpcyjny ani zaspokojenie prywatnych potrzeb mieszkaniowych.",
      "",
      "21. **Kwota Udzielona** – kwota finansowania wynikająca z umowy pożyczki albo innej umowy finansowania, przed potrąceniem Prowizji Finance You i innych kosztów. Od Kwoty Udzielonej liczone są odsetki i spłata.",
    ].join("\n"),
  );

  // § 5 — status i oświadczenie o celu gospodarczym.
  t.replaceOnce(
    "   3. status użytkownika, w tym informację, czy działa jako konsument, przedsiębiorca albo osoba reprezentująca podmiot;",
    "   3. status użytkownika, w tym informację o prowadzonej działalności gospodarczej (NIP) albo o reprezentowanym podmiocie;",
  );
  t.replaceOnce(
    "   10. dalsza obsługa sprawy mogłaby narazić Finance You, finansującego albo osobę trzecią na odpowiedzialność, szkodę lub ryzyko prawne.",
    [
      "   10. dalsza obsługa sprawy mogłaby narazić Finance You, finansującego albo osobę trzecią na odpowiedzialność, szkodę lub ryzyko prawne;",
      "   11. finansowanie nie jest przeznaczone na Cel Gospodarczy.",
      "",
      "9. Składając wniosek, Klient oświadcza, że finansowanie przeznaczy wyłącznie na Cel Gospodarczy, i wskazuje ten cel. Oświadczenie jest składane przez zaznaczenie pola w formularzu (pole nie jest zaznaczone domyślnie) albo w innej utrwalonej formie. Bez tego oświadczenia wniosek nie jest przedstawiany inwestorom ani finansującym.",
      "",
      "10. Klient niezwłocznie informuje Finance You, jeżeli cel finansowania ulegnie zmianie. Podanie nieprawdziwej informacji o celu finansowania może skutkować odmową dalszej obsługi sprawy.",
    ].join("\n"),
  );

  // § 9 — decyzje odmowne podejmuje człowiek.
  t.replaceOnce(
    "7. Finance You może, ale nie musi, przedstawić użytkownikowi przyczyny odmowy dalszej obsługi sprawy.",
    [
      "7. Finance You może, ale nie musi, przedstawić użytkownikowi przyczyny odmowy dalszej obsługi sprawy.",
      "",
      "8. Narzędzia automatyczne Platformy, w tym modele sztucznej inteligencji, mogą przygotować wstępną ocenę wniosku albo zaproponować jego status, w tym propozycję odmowy. Decyzję o odmowie dalszej obsługi wniosku albo o jego odrzuceniu zawsze podejmuje pracownik Finance You po zapoznaniu się z propozycją. Użytkownik może przedstawić swoje stanowisko i poprosić o ponowne rozpatrzenie sprawy, pisząc na adres [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).",
    ].join("\n"),
  );

  // § 11 — odsetki maksymalne.
  t.replaceOnce(
    "7. Finance You może uczestniczyć w komunikacji pomiędzy użytkownikiem a finansującym, lecz nie staje się przez to stroną umowy pożyczki, chyba że z konkretnej umowy wyraźnie wynika inaczej.",
    [
      "7. Finance You może uczestniczyć w komunikacji pomiędzy użytkownikiem a finansującym, lecz nie staje się przez to stroną umowy pożyczki, chyba że z konkretnej umowy wyraźnie wynika inaczej.",
      "",
      "8. Oprocentowanie finansowania organizowanego przez Finance You nie może przekraczać odsetek maksymalnych określonych w art. 359 § 2¹ Kodeksu cywilnego, obowiązujących w dniu zawarcia umowy.",
    ].join("\n"),
  );

  // § 12 — Prowizja Finance You.
  t.replaceOnce(
    "3. Wynagrodzenie Finance You wynosi **7% kwoty zorganizowanego finansowania, nie mniej jednak niż 5 000,00 zł netto**, chyba że strony wyraźnie ustalą inaczej w formie dokumentowej, elektronicznej albo pisemnej.",
    "3. Wynagrodzenie Finance You (Prowizja Finance You) wynosi **7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT**, chyba że strony wyraźnie ustalą inaczej w formie dokumentowej, elektronicznej albo pisemnej. Jest to jedyne wynagrodzenie Finance You należne od Klienta.",
  );
  t.replaceOnce(
    "4. Do wynagrodzenia może zostać doliczony podatek VAT, jeżeli jest należny zgodnie z obowiązującymi przepisami. W przypadku użytkownika będącego konsumentem całkowita cena brutto albo sposób jej obliczenia zostanie podany użytkownikowi przed związaniem go odpłatną usługą.",
    "4. Prowizja Finance You nie jest powiększana o podatek VAT. Przykład: przy Kwocie Udzielonej 100 000,00 zł Prowizja Finance You wynosi 7 000,00 zł, a Klient otrzymuje 93 000,00 zł; przy Kwocie Udzielonej 50 000,00 zł Prowizja Finance You wynosi 5 000,00 zł (kwota minimalna), a Klient otrzymuje 45 000,00 zł. Wysokość Prowizji i kwota do wypłaty są podawane Klientowi przed podpisaniem umowy finansowania.",
  );
  t.replaceOnce(
    "7. Użytkownik wyraża zgodę, aby wynagrodzenie Finance You zostało potrącone z kwoty finansowania albo rozliczone przy wypłacie środków, jeżeli takie rozwiązanie zostanie przewidziane w dokumentach transakcyjnych albo zaakceptowane przez właściwe strony.",
    "7. Prowizja Finance You jest potrącana z wypłaty finansowania. Na podstawie dyspozycji wypłaty podpisanej przez Klienta finansujący przekazuje Prowizję Finance You bezpośrednio na rachunek Finance You, a pozostałą część Kwoty Udzielonej wypłaca Klientowi.",
  );
  t.replaceOnce(
    "8. Potrącenie wynagrodzenia z kwoty finansowania oznacza, że użytkownik może otrzymać do dyspozycji kwotę pomniejszoną o należne wynagrodzenie Finance You.",
    "8. Potrącenie oznacza, że Klient otrzymuje do dyspozycji Kwotę Udzieloną pomniejszoną o Prowizję Finance You, a odsetki i spłata są liczone od pełnej Kwoty Udzielonej.",
  );
  t.replaceOnce(
    "13. Postanowienie ust. 12 stosuje się przez okres 12 miesięcy od dnia przedstawienia użytkownikowi finansującego albo przekazania sprawy finansującemu, chyba że strony ustalą inaczej.",
    "13. Postanowienie ust. 12 stosuje się przez okres 5 lat od dnia przedstawienia użytkownikowi finansującego albo przekazania sprawy finansującemu, chyba że strony ustalą inaczej.",
  );
  t.replaceOnce(
    "15. W przypadku konsumentów postanowienia niniejszego paragrafu stosuje się wyłącznie w zakresie dopuszczalnym przez bezwzględnie obowiązujące przepisy prawa oraz po przekazaniu konsumentowi wymaganych informacji o wynagrodzeniu przed związaniem go odpłatną usługą.",
    "15. Wobec przedsiębiorcy na prawach konsumenta postanowienia niniejszego paragrafu stosuje się wyłącznie w zakresie dopuszczalnym przez bezwzględnie obowiązujące przepisy prawa oraz po przekazaniu mu informacji o wynagrodzeniu przed związaniem go odpłatną usługą.",
  );
  t.replaceOnce(
    "16. Samo złożenie wniosku przez konsumenta nie powoduje obowiązku zapłaty wynagrodzenia, jeżeli konsument nie został wcześniej jednoznacznie poinformowany o odpłatnym charakterze usługi zorganizowania finansowania i nie zaakceptował warunków wynagrodzenia.",
    "16. Samo złożenie wniosku nie powoduje obowiązku zapłaty wynagrodzenia. Prowizja Finance You staje się należna dopiero w przypadku zawarcia umowy finansowania i jest pobierana przy wypłacie.",
  );

  // § 29 — data obowiązywania.
  t.replaceOnce(
    "6. Regulamin obowiązuje od dnia 8 czerwca 2026 r.",
    `6. Regulamin w wersji 2 obowiązuje od dnia ${ZGODY_V2_DATA_PL}. Do spraw rozpoczętych przed tym dniem stosuje się § 28 ust. 4.`,
  );
  return t.value();
}

export function transformPolitykaV2(v1: string): string {
  const t = new Transform(naprawListy(v1));

  t.replaceOnce(
    "**obowiązuje od dnia 8 czerwca 2026 r.**",
    `**wersja 2 — obowiązuje od dnia ${ZGODY_V2_DATA_PL}**`,
  );

  // § 2 ust. 3 — IOD.
  t.replaceOnce(
    "3. Administrator nie wyznaczył inspektora ochrony danych, chyba że w przyszłości poinformuje użytkowników o jego wyznaczeniu w odrębnej informacji.",
    "3. Administrator nie wyznaczył inspektora ochrony danych (IOD). We wszystkich sprawach dotyczących danych osobowych właściwy jest adres [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).",
  );

  // § 8 — odbiorcy: operator płatności i lista podmiotów przetwarzających.
  t.replaceOnce(
    "   15. operatorzy płatności, jeżeli w przyszłości zostaną wykorzystani;",
    "   15. operatorzy płatności (Tpay);",
  );
  t.replaceOnce(
    "5. Finance You przekazuje dane osobowe wyłącznie w zakresie niezbędnym do realizacji określonego celu.",
    [
      "5. Finance You przekazuje dane osobowe wyłącznie w zakresie niezbędnym do realizacji określonego celu.",
      "",
      "6. Główni dostawcy przetwarzający dane w imieniu Finance You:",
      "   1. **Supabase** – baza danych, uwierzytelnianie, przechowywanie plików i funkcje serwerowe Platformy (infrastruktura Amazon Web Services);",
      "   2. **Amazon Web Services (AWS Bedrock)** – modele językowe wykorzystywane do wstępnej analizy dokumentów, przygotowania opisów spraw i działania asystentów AI;",
      "   3. **Didit** – weryfikacja tożsamości (KYC), w tym weryfikacja dokumentu tożsamości i zdjęcia twarzy;",
      "   4. **Dilisense** – weryfikacja na listach sankcyjnych i list osób zajmujących eksponowane stanowiska polityczne (AML);",
      "   5. **ElevenLabs** – agenci głosowi i tekstowi AI, synteza i rozpoznawanie mowy, transkrypcja rozmów;",
      "   6. **Twilio** – połączenia telefoniczne i wiadomości SMS;",
      "   7. **Tpay** – obsługa płatności elektronicznych;",
      "   8. **Meta** (Facebook, Instagram, Messenger) – formularze reklamowe, komunikacja przez Messenger oraz narzędzia pomiaru reklam, w zakresie wymagającym zgody – na podstawie zgody.",
      "",
      "7. Aktualną listę podmiotów przetwarzających dane można uzyskać, pisząc na adres [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).",
    ].join("\n"),
  );

  // § 9 — transfer poza EOG.
  t.replaceOnce(
    "4. Użytkownik może uzyskać dodatkowe informacje o stosowanych zabezpieczeniach, kontaktując się z Finance You pod adresem [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).",
    [
      "4. Przekazanie danych poza Europejski Obszar Gospodarczy może dotyczyć w szczególności dostawców z siedzibą lub infrastrukturą w Stanach Zjednoczonych (m.in. Twilio, ElevenLabs, Meta, Amazon Web Services, Supabase — zależnie od regionu usługi). Podstawą jest decyzja Komisji Europejskiej dotycząca EU-US Data Privacy Framework wobec podmiotów certyfikowanych albo standardowe klauzule umowne.",
      "",
      "5. Użytkownik może uzyskać dodatkowe informacje o stosowanych zabezpieczeniach, kontaktując się z Finance You pod adresem [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).",
    ].join("\n"),
  );

  // § 17 — udział człowieka w decyzjach.
  t.replaceOnce(
    "4. Decyzja o udzieleniu finansowania, odmowie finansowania albo zaproponowaniu określonych warunków finansowania nie jest podejmowana automatycznie przez Platformę Finance You. Decyzje te mogą zależeć od indywidualnej analizy sprawy przez Finance You, inwestora, finansującego lub partnera.",
    [
      "4. Decyzja o udzieleniu finansowania, odmowie finansowania albo zaproponowaniu określonych warunków finansowania nie jest podejmowana automatycznie przez Platformę Finance You. Decyzje te mogą zależeć od indywidualnej analizy sprawy przez Finance You, inwestora, finansującego lub partnera.",
      "",
      "5. Narzędzia automatyczne Platformy, w tym modele sztucznej inteligencji, mogą przygotować wstępną ocenę wniosku (np. kompletność dokumentów, relacja kwoty do wartości zabezpieczenia) albo zaproponować status wniosku, w tym propozycję jego odrzucenia. Propozycja nie wywołuje skutków wobec użytkownika. Decyzję o odrzuceniu wniosku albo odmowie dalszej obsługi zawsze podejmuje człowiek – pracownik Finance You – po weryfikacji propozycji.",
      "",
      "6. Użytkownik ma prawo uzyskać interwencję człowieka, wyrazić własne stanowisko i zakwestionować decyzję, pisząc na adres [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).",
    ].join("\n"),
  );

  // § 22 — nagrywanie rozmów z agentem AI.
  t.replaceOnce(
    "2. Rozmowy telefoniczne mogą być nagrywane wyłącznie wtedy, gdy użytkownik zostanie o tym wcześniej poinformowany i istnieje odpowiednia podstawa prawna.",
    "2. Rozmowy telefoniczne mogą być nagrywane wyłącznie wtedy, gdy użytkownik zostanie o tym wcześniej poinformowany i istnieje odpowiednia podstawa prawna. Rozmowy z agentem głosowym AI są nagrywane i transkrybowane; na początku rozmowy agent informuje, że jest asystentem AI i że rozmowa jest nagrywana.",
  );

  // § 25 — data obowiązywania.
  t.replaceOnce(
    "4. Polityka prywatności obowiązuje od dnia 8 czerwca 2026 r.",
    `4. Polityka prywatności w wersji 2 obowiązuje od dnia ${ZGODY_V2_DATA_PL}.`,
  );
  return t.value();
}

export interface ZgodaV2 {
  kind: "terms" | "privacy";
  title: string;
  content: string;
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Migracja: wstawia wersję 2 (is_active = true) i wyłącza wersję 1.
 * Wersja 1 zostaje w tabeli jako dokument historyczny (akceptacje
 * klientów wskazują numer wersji). Idempotentna.
 */
export function migracjaZgodV2(docs: ZgodaV2[]): string {
  const bloki = docs.map(
    (d) => `
-- ${d.kind} v${ZGODY_V2_VERSION}
insert into public.consent_documents (kind, title, content, version, is_active)
select ${sqlStr(d.kind)}::public.consent_kind, ${sqlStr(d.title)},
${sqlStr(d.content)},
  ${ZGODY_V2_VERSION}, true
where not exists (
  select 1 from public.consent_documents
   where kind = ${sqlStr(d.kind)}::public.consent_kind and version = ${ZGODY_V2_VERSION}
);

update public.consent_documents
   set is_active = false
 where kind = ${sqlStr(d.kind)}::public.consent_kind and version < ${ZGODY_V2_VERSION} and is_active;
`,
  );
  return `-- =====================================================================
-- ETAP 5 — REGULAMIN KLIENTA v2 i POLITYKA PRYWATNOŚCI v2
--
-- Plik wygenerowany: npx tsx scripts/legal/build-zgody-v2.ts
-- (nie edytować ręcznie — zmiany w src/lib/legal/zgody-v2.ts).
-- Treść: docs/legal/klient/*-v2.md (v1 zachowana w *-v1.md i w tabeli).
--
-- Regulamin v2: finansowanie wyłącznie na Cel Gospodarczy (B2B),
-- oświadczenie o celu gospodarczym, Prowizja Finance You 7% Kwoty
-- Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, potrącana z wypłaty;
-- ochrona przed obejściem 5 lat; naprawiona numeracja § 12; decyzje
-- odmowne podejmuje człowiek; odsetki nie wyższe niż maksymalne.
-- Polityka v2: IOD niewyznaczony, główni podmioty przetwarzające,
-- transfer poza EOG, § 17 udział człowieka, nagrywanie rozmów z AI.
--
-- Wersja 1 zostaje w tabeli (is_active = false). Zalogowani klienci
-- i inwestorzy akceptują nową wersję przy następnym wejściu do panelu
-- (consent_acceptances, osobna migracja).
-- =====================================================================
${bloki.join("")}`;
}
