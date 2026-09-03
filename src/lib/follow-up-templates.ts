// ŹRÓDŁO PRAWDY dla treści follow-up: 120 szablonów maili (temat + preview + treść)
// oraz 40 klikbaitowych SMS. Moduł CZYSTY (bez zależności serwerowych) — używany
// przez wszystkie silniki kontaktu (loan-reminder-emails, saturday-sms, follow-up-tick)
// oraz do wygenerowania seeda migracji (scripts/gen-followup-seed.ts).
//
// Zmienne mustache podstawiane przy wysyłce:
//   {{greeting}}      — „Cześć Marku" / „Cześć"
//   {{first_name}}    — imię (lub „Witaj")
//   {{link}}          — link do wniosku / kalkulatora
//   {{loan_amount}}   — kwota (np. „150 000 zł")
//   {{missing}}       — czego brakuje we wniosku
//
// Przekaz marketingowy (rotowany): szybko • niska rata • bez papierów (BIK/ZUS/PIT) •
// okres do 70 mies. • 300+ inwestorów • decyzja 24h • wypłata 7–14 dni •
// „sprawdź ofertę w kalkulatorze" → akcja: „uzupełnij wniosek teraz".
//
// UWAGA: pole `paras` / lista SMS to treści redakcyjne — edytuj je tutaj, a następnie
// przegeneruj seed bazy: `bun run scripts/gen-followup-seed.ts`.

export interface FollowUpEmail {
  /** Temat maila (może zawierać {{...}}). */
  subject: string;
  /** Tekst podglądu w skrzynce. */
  preview: string;
  /** Treść jako gotowy HTML (akapity + przycisk CTA), z tokenami {{...}}. */
  body: string;
}

export interface FollowUpVars {
  greeting?: string;
  first_name?: string;
  link?: string;
  loan_amount?: string;
  missing?: string;
  [k: string]: string | undefined;
}

/** Podstawia tokeny {{key}} wartościami; nieznane tokeny → pusty string. */
export function renderFollowUp(tpl: string, vars: FollowUpVars): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

/** Buduje komplet zmiennych (m.in. gotowe `greeting`) z imienia + linku. */
export function buildFollowUpVars(input: {
  firstName?: string | null;
  link?: string | null;
  loanAmount?: string | null;
  missing?: string | null;
}): FollowUpVars {
  const name = (input.firstName ?? "").trim();
  return {
    first_name: name || "Witaj",
    greeting: name ? `Cześć ${name}` : "Cześć",
    link: input.link ?? "https://financeyou.pl",
    loan_amount: input.loanAmount ?? "Twojej kwoty",
    missing: input.missing ?? "kilka informacji",
  };
}

// === HELPERY BUDUJĄCE TREŚĆ HTML MAILA ===
const P = (t: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#0f172a">${t}</p>`;
const CTA = (label: string) =>
  `<p style="text-align:center;margin:24px 0 6px"><a href="{{link}}" style="display:inline-block;background:#0a7f4f;color:#ffffff;font-weight:700;font-size:16px;line-height:1;padding:15px 30px;border-radius:9999px;text-decoration:none">${label} →</a></p>`;

/** Skład maila z akapitów + przycisku CTA. */
function buildEmail(subject: string, preview: string, paras: string[], cta: string): FollowUpEmail {
  return { subject, preview, body: paras.map(P).join("") + CTA(cta) };
}
export { buildEmail as buildFollowUpEmail };
export const emailParagraph = P;

// === DANE REDAKCYJNE (120 maili) ===
interface RawEmail {
  subject: string;
  preview: string;
  paras: string[];
  cta: string;
}
const RAW_EMAILS: RawEmail[] = [
  {
    subject: "Twoja nieruchomość może dać Ci gotówkę",
    preview: "Sprawdź, ile możesz dostać pod zastaw mieszkania lub domu.",
    paras: [
      "{{greeting}}, Twoja nieruchomość to nie tylko cztery ściany — to realna gotówka w Twoim zasięgu.",
      "Wystarczy mieszkanie, dom, działka albo lokal, żeby uruchomić pożyczkę bez zbędnych formalności.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Bez BIK, bez ZUS, bez zaświadczeń",
    preview: "Zabezpieczeniem jest nieruchomość, więc papiery odpadają.",
    paras: [
      "{{greeting}}, u nas nie pytamy o BIK, ZUS ani zaświadczenia o zarobkach.",
      "Zabezpieczeniem jest Twoja nieruchomość, dlatego cała reszta papierologii po prostu odpada.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Decyzja wstępna już w 24 godziny",
    preview: "Nie musisz czekać tygodniami — wstępną decyzję masz w dobę.",
    paras: [
      "{{greeting}}, wiemy, że czas ma znaczenie, dlatego decyzję wstępną dostajesz w 24 godziny.",
      "Zacznij dziś, a jutro możesz wiedzieć, na czym stoisz.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Ponad 300 inwestorów czeka na Twój wniosek",
    preview: "To oni konkurują o Ciebie — Ty wybierasz najlepszą ofertę.",
    paras: [
      "{{greeting}}, u nas to inwestorzy walczą o Twój wniosek, a nie odwrotnie.",
      "Ponad 300 aktywnych inwestorów rywalizuje o możliwość sfinansowania Twojej pożyczki — a najkorzystniejszą ofertę wybierasz Ty.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Niska rata nawet na 70 miesięcy",
    preview: "Rozłóż spłatę wygodnie i oddychaj spokojnie każdego miesiąca.",
    paras: [
      "{{greeting}}, spłatę możesz rozłożyć nawet na 70 miesięcy.",
      "Dłuższy okres to niższa, realna rata, która nie rujnuje domowego budżetu.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Twoje mieszkanie zostaje Twoje",
    preview: "Dostajesz gotówkę, a nieruchomość cały czas jest Twoją własnością.",
    paras: [
      "{{greeting}}, przy naszej pożyczce nieruchomość przez cały czas pozostaje Twoją własnością.",
      "Otrzymujesz gotówkę, a dalej mieszkasz i korzystasz ze swojego mieszkania jak dotychczas.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Wypłata średnio w 10 dni",
    preview: "Od wniosku do pieniędzy na koncie zwykle mija 7–14 dni.",
    paras: [
      "{{greeting}}, od złożenia wniosku do wypłaty mija zwykle 7–14 dni, średnio około dziesięciu.",
      "Do notariusza jedziesz tylko raz, resztę załatwiamy online.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Policz swoją ratę w 2 minuty",
    preview: "Kalkulator pokaże Ci konkretną kwotę bez żadnych zobowiązań.",
    paras: [
      "{{greeting}}, zanim cokolwiek zdecydujesz, sprawdź konkretne liczby.",
      "Nasz kalkulator w dwie minuty pokaże Ci wysokość raty — bez zobowiązań i bez zbędnych pytań.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Też z obciążeniami? Też się liczy",
    preview: "Nieruchomość z hipoteką albo obciążeniami wciąż może być zabezpieczeniem.",
    paras: [
      "{{greeting}}, nawet nieruchomość z obciążeniami czy hipoteką może być zabezpieczeniem pożyczki.",
      "Nie skreślaj się z góry — sprawdźmy razem, co da się zrobić w Twojej sytuacji.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Od 30 tys. do kilku milionów zł",
    preview: "Niezależnie od skali potrzeby — mamy dla Ciebie rozwiązanie.",
    paras: [
      "{{greeting}}, finansujemy kwoty od około 30 tysięcy aż do kilku milionów złotych.",
      "Niezależnie od tego, ile potrzebujesz, znajdziemy odpowiednie rozwiązanie.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Wycenę robimy my — nie Ty",
    preview: "Żadnego operatu szacunkowego z Twojej strony.",
    paras: [
      "{{greeting}}, nie musisz zamawiać ani opłacać operatu szacunkowego.",
      "Wycenę nieruchomości bierzemy na siebie — Ty tylko składasz wniosek.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twój wniosek jest niedokończony",
    preview: "Zostało dosłownie kilka pól — szkoda, żeby oferta przepadła.",
    paras: [
      "{{greeting}}, Twój wniosek jest już prawie gotowy, brakuje dosłownie kilku informacji.",
      "Dokończ go teraz, a inwestorzy będą mogli przygotować dla Ciebie oferty.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Wszystko online, do notariusza raz",
    preview: "Cała procedura zdalnie — u notariusza pojawiasz się jeden raz.",
    paras: [
      "{{greeting}}, całą procedurę przechodzisz online, z domu.",
      "Do notariusza jedziesz tylko raz, żeby podpisać — nic więcej Cię nie czeka.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Poznaj Anię, swojego opiekuna",
    preview: "Jedna osoba prowadzi Cię przez cały proces od A do Z.",
    paras: [
      "{{greeting}}, przez cały proces prowadzi Cię jedna osoba — Twoja opiekunka Ania.",
      "Zawsze wiesz, do kogo napisać i na jakim etapie jesteś.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Zero drobnego druku",
    preview: "Musisz rozumieć każdy zapis umowy — pilnujemy tego.",
    paras: [
      "{{greeting}}, u nas nie ma drobnego druku ani ukrytych zapisów.",
      "Zależy nam, żebyś rozumiał każdy punkt umowy, zanim cokolwiek podpiszesz.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Sprawdź ofertę, zanim zdecydujesz",
    preview: "Zobaczenie liczb do niczego Cię nie zobowiązuje.",
    paras: [
      "{{greeting}}, sprawdzenie oferty nie oznacza żadnego zobowiązania.",
      "Zobacz konkretne liczby i dopiero potem spokojnie zdecyduj, co dalej.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Gotówka na to, co ważne teraz",
    preview: "Remont, konsolidacja, firma czy plany rodzinne — Ty decydujesz.",
    paras: [
      "{{greeting}}, środki z pożyczki możesz przeznaczyć na cokolwiek potrzebujesz.",
      "Remont, spłata długów, rozwój firmy czy plany rodzinne — cel wybierasz sam.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Prościej, niż myślisz",
    preview: "Bez stert dokumentów i bez chodzenia po urzędach.",
    paras: [
      "{{greeting}}, cały proces jest prostszy, niż zwykle się wydaje.",
      "Bez stert dokumentów, bez biegania po urzędach — wystarczy nieruchomość i chwila czasu.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Twoja oferta wciąż czeka",
    preview: "Zaczęty wniosek nie przepadł — możesz wrócić w każdej chwili.",
    paras: [
      "{{greeting}}, Twój rozpoczęty wniosek wciąż na Ciebie czeka.",
      "Możesz wrócić do niego w każdej chwili i dokończyć w kilka minut.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Ile realnie możesz pożyczyć?",
    preview: "Wpisz wartość nieruchomości i zobacz konkretną kwotę.",
    paras: [
      "{{greeting}}, chcesz wiedzieć, ile realnie możesz pożyczyć pod zastaw swojej nieruchomości?",
      "Wpisz jej wartość w kalkulatorze i zobacz konkretną kwotę oraz ratę.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Pani Anna z Krakowa dostała 240 tys.",
    preview: "Bez zaświadczeń, pod zastaw mieszkania, w 11 dni.",
    paras: [
      "{{greeting}}, pani Anna z Krakowa potrzebowała gotówki na spłatę zobowiązań.",
      "Pod zastaw mieszkania dostała 240 tysięcy złotych w jedenaście dni — bez BIK i bez zaświadczeń.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Pan Marek z Wrocławia: rata o połowę niższa",
    preview: "Konsolidacja kilku długów w jedną wygodną ratę.",
    paras: [
      "{{greeting}}, pan Marek z Wrocławia miał kilka rat w różnych miejscach.",
      "Skonsolidował je w jedną pożyczkę na 70 miesięcy i jego miesięczna rata spadła niemal o połowę.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Jak Kasia z Gdańska uratowała firmę",
    preview: "Gotówka pod zastaw lokalu w niecałe dwa tygodnie.",
    paras: [
      "{{greeting}}, Kasia z Gdańska potrzebowała szybkiego zastrzyku gotówki dla firmy.",
      "Pod zastaw lokalu dostała środki w niecałe dwa tygodnie i utrzymała płynność.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "300 inwestorów, jedna Twoja wygrana",
    preview: "Konkurencja o wniosek działa na Twoją korzyść.",
    paras: [
      "{{greeting}}, kiedy ponad 300 inwestorów konkuruje o jeden wniosek, wygrywa klient.",
      "To Ty wybierasz najkorzystniejszą ofertę spośród tych, które dla Ciebie przygotują.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Realna rata, nie obietnica z reklamy",
    preview: "Kalkulator liczy konkretne liczby dla Twojej kwoty.",
    paras: [
      "{{greeting}}, u nas rata to nie hasło z reklamy, tylko konkretna liczba.",
      "Sprawdź w kalkulatorze, ile dokładnie zapłacisz przy rozłożeniu na 70 miesięcy.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Pan Tomasz z Poznania: 500 tys. na rozwój",
    preview: "Pod zastaw magazynu, bez PIT-ów i operatu.",
    paras: [
      "{{greeting}}, pan Tomasz z Poznania chciał rozwinąć działalność.",
      "Pod zastaw magazynu pozyskał 500 tysięcy złotych — bez PIT-ów i bez operatu szacunkowego.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Dlaczego banki mówią nie, a my tak",
    preview: "Nie patrzymy na BIK — patrzymy na nieruchomość.",
    paras: [
      "{{greeting}}, tam gdzie bank widzi tylko historię kredytową, my widzimy Twoją nieruchomość.",
      "Dlatego pomagamy również osobom, którym bank odmówił.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Konsolidacja: jedna rata zamiast pięciu",
    preview: "Zbierz zobowiązania w jedno i odetchnij.",
    paras: [
      "{{greeting}}, zamiast pilnować pięciu różnych terminów, możesz mieć jedną wygodną ratę.",
      "Konsolidacja pod zastaw nieruchomości porządkuje finanse i obniża miesięczne obciążenie.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Działka też się liczy",
    preview: "Nie tylko mieszkanie — działka również jest zabezpieczeniem.",
    paras: [
      "{{greeting}}, zabezpieczeniem nie musi być mieszkanie czy dom.",
      "Działka, lokal albo magazyn również mogą uruchomić Twoją pożyczkę.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Od wniosku do gotówki: 10 dni",
    preview: "Konkretny kalendarz, nie mgliste obietnice.",
    paras: [
      "{{greeting}}, decyzja wstępna w 24 godziny, wypłata średnio w 10 dni.",
      "To konkretny kalendarz, na którym możesz zaplanować swoje sprawy.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twoja nieruchomość pracuje dla Ciebie",
    preview: "Uwolnij kapitał, nie tracąc dachu nad głową.",
    paras: [
      "{{greeting}}, Twoja nieruchomość może uwolnić kapitał, którego potrzebujesz.",
      "Przez cały czas mieszkasz u siebie — własność zostaje po Twojej stronie.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Pani Ewa z Łodzi: spokój w 9 dni",
    preview: "Szybka gotówka pod zastaw domu, bez stresu formalności.",
    paras: [
      "{{greeting}}, pani Ewa z Łodzi w dziewięć dni zamieniła stres w spokój.",
      "Pod zastaw domu dostała potrzebną gotówkę bez zaświadczeń i bez kolejek.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Nie musisz mieć idealnej historii",
    preview: "Zła historia w BIK nie przekreśla Twojego wniosku.",
    paras: [
      "{{greeting}}, przeszłość w BIK nie musi Cię blokować.",
      "Liczy się nieruchomość — dlatego pomagamy tam, gdzie inni odmawiają.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Kilka milionów? Też ogarniemy",
    preview: "Duże kwoty pod zastaw wartościowej nieruchomości.",
    paras: [
      "{{greeting}}, potrzebujesz naprawdę dużej kwoty?",
      "Pod zastaw wartościowej nieruchomości finansujemy pożyczki sięgające kilku milionów złotych.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Transparentność od pierwszego zdania",
    preview: "Wiesz, ile, kiedy i na jakich zasadach — od startu.",
    paras: [
      "{{greeting}}, u nas od pierwszego kontaktu wiesz, na czym stoisz.",
      "Ile, kiedy i na jakich warunkach — wszystko jasno, bez niespodzianek w umowie.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Ania odpowie na Twoje pytania",
    preview: "Masz pytania? Ania chętnie wszystko wyjaśni.",
    paras: [
      "{{greeting}}, jeśli masz pytania, Ania chętnie wszystko wyjaśni — napisz lub porozmawiaj z nią w panelu.",
      "Uzupełnij wniosek do końca — kompletny wniosek trafia do inwestorów, a jeśli spotka się z zainteresowaniem, otrzymasz konkretną ofertę finansową.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Pan Piotr z Katowic: 150 tys. na remont",
    preview: "Pod zastaw mieszkania, rata rozłożona wygodnie.",
    paras: [
      "{{greeting}}, pan Piotr z Katowic sfinansował remont, o którym marzył od lat.",
      "150 tysięcy pod zastaw mieszkania, rata rozłożona wygodnie na kilka lat.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Sprawdź, ile zaoszczędzisz na racie",
    preview: "70 miesięcy potrafi znacząco obniżyć miesięczny koszt.",
    paras: [
      "{{greeting}}, rozłożenie spłaty na 70 miesięcy potrafi mocno obniżyć ratę.",
      "Policz w kalkulatorze, ile miesięcznie zostanie w Twoim portfelu.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Twoja gotówka jest bliżej, niż sądzisz",
    preview: "Wniosek zajmuje chwilę, decyzja przychodzi w dobę.",
    paras: [
      "{{greeting}}, gotówka, której potrzebujesz, jest naprawdę w zasięgu ręki.",
      "Wniosek to chwila, decyzja wstępna w 24 godziny, a wypłata w około 10 dni.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Bez wychodzenia z domu",
    preview: "Wniosek, dokumenty, kontakt — wszystko zdalnie.",
    paras: [
      "{{greeting}}, cały wniosek złożysz bez wychodzenia z domu.",
      "Kontakt, dokumenty i decyzja — wszystko online, wygodnie i w Twoim tempie.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Ta rata mieści się w budżecie",
    preview: "Dłuższy okres, niższe miesięczne obciążenie.",
    paras: [
      "{{greeting}}, dobra pożyczka to taka, której rata nie boli.",
      "Dzięki okresowi do 70 miesięcy dobierzemy ratę, która realnie mieści się w Twoim budżecie.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Inwestorzy już czekają na Twój wniosek",
    preview: "Wystarczy, że go dokończysz — resztę robimy my.",
    paras: [
      "{{greeting}}, ponad 300 inwestorów jest gotowych, by przygotować dla Ciebie oferty.",
      "Brakuje tylko jednego — Twojego dokończonego wniosku.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Ile jest warta Twoja nieruchomość?",
    preview: "Sprawdź, jaką kwotę możesz na niej oprzeć.",
    paras: [
      "{{greeting}}, wartość Twojej nieruchomości może zaskoczyć Cię pozytywnie.",
      "Sprawdź w kalkulatorze, jaką kwotę możesz na niej oprzeć.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Papierologia? U nas jej nie ma",
    preview: "Bez PIT-ów, bez zaświadczeń, bez operatu.",
    paras: [
      "{{greeting}}, zapomnij o stertach dokumentów i zaświadczeniach.",
      "Bez PIT-ów, bez ZUS, bez operatu — zabezpieczeniem jest nieruchomość i to wystarczy.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twój dom, Twoje zasady",
    preview: "Zostajesz właścicielem przez cały okres spłaty.",
    paras: [
      "{{greeting}}, bierzesz gotówkę, ale dom dalej należy do Ciebie.",
      "Przez cały okres spłaty pozostajesz jego właścicielem i mieszkasz jak dotąd.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Jutro możesz znać decyzję",
    preview: "Złóż wniosek dziś, wstępną odpowiedź masz w 24h.",
    paras: [
      "{{greeting}}, jeśli złożysz wniosek dziś, jutro możesz już znać wstępną decyzję.",
      "24 godziny — tyle wystarczy, żebyś wiedział, na czym stoisz.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Konkretna kwota na {{loan_amount}}",
    preview: "Zobacz warunki dopasowane do Twojej potrzeby.",
    paras: [
      "{{greeting}}, potrzebujesz konkretnej sumy, na przykład {{loan_amount}}?",
      "Sprawdź, na jakich warunkach możesz ją pozyskać pod zastaw nieruchomości.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Odetchnij od nawału zobowiązań",
    preview: "Jedna pożyczka zamiast kilku napiętych rat.",
    paras: [
      "{{greeting}}, jeśli kilka rat spina Twój budżet do granic, jest wyjście.",
      "Połącz zobowiązania w jedno i oddychaj spokojniej każdego miesiąca.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Twój wniosek nie przepadł",
    preview: "Wróć do niego, zanim oferta zdąży ostygnąć.",
    paras: [
      "{{greeting}}, Twój rozpoczęty wniosek wciąż jest zapisany.",
      "Wróć do niego w kilka minut, żeby inwestorzy mogli przygotować oferty.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Lokal, magazyn, dom — wszystko gra",
    preview: "Szeroki wachlarz nieruchomości jako zabezpieczenie.",
    paras: [
      "{{greeting}}, zabezpieczeniem może być mieszkanie, dom, działka, lokal, a nawet magazyn.",
      "Masz nieruchomość? Prawdopodobnie mamy dla Ciebie rozwiązanie.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Zobacz swoją ofertę bez zobowiązań",
    preview: "Sprawdzenie liczb niczego Cię nie kosztuje.",
    paras: [
      "{{greeting}}, możesz zobaczyć swoją ofertę, nie biorąc na siebie żadnego zobowiązania.",
      "Poznaj liczby i dopiero potem spokojnie zdecyduj.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Rata, którą naprawdę udźwigniesz",
    preview: "Dopasujemy okres do Twoich możliwości.",
    paras: [
      "{{greeting}}, nie chodzi o to, żeby pożyczyć — chodzi o to, żeby spłacać spokojnie.",
      "Dopasujemy okres nawet do 70 miesięcy, żeby rata była realna.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Twoje pieniądze, Twój cel",
    preview: "Nie pytamy, na co — decydujesz sam.",
    paras: [
      "{{greeting}}, nie musisz tłumaczyć, na co potrzebujesz środków.",
      "Remont, firma, konsolidacja czy plany osobiste — cel należy do Ciebie.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Szybciej niż w banku, prościej niż myślisz",
    preview: "Bez kolejek, bez zaświadczeń, bez tygodni oczekiwania.",
    paras: [
      "{{greeting}}, u nas nie ma kolejek ani tygodni oczekiwania.",
      "Decyzja wstępna w 24 godziny, a cały proces zdalnie i po ludzku.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "300+ ofert konkuruje o Ciebie",
    preview: "Ty wybierasz najlepszą — nie odwrotnie.",
    paras: [
      "{{greeting}}, u nas to o Ciebie się konkuruje.",
      "Ponad 300 inwestorów przygotuje propozycje, a Ty wybierzesz najkorzystniejszą.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Sprawdź ratę na {{loan_amount}}",
    preview: "Wpisz kwotę i zobacz miesięczny koszt.",
    paras: [
      "{{greeting}}, ciekawi Cię, ile wyniesie rata przy kwocie {{loan_amount}}?",
      "Wpisz ją w kalkulatorze i zobacz konkretny miesięczny koszt na 70 miesięcy.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Bez operatu — wycenę bierzemy na siebie",
    preview: "Nie płacisz rzeczoznawcy, oszczędzasz czas i pieniądze.",
    paras: [
      "{{greeting}}, żadnego rzeczoznawcy na własny koszt — wycenę robimy my.",
      "Oszczędzasz czas i pieniądze, a nieruchomość wyceniamy sami w ramach procesu.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twoja gotówka czeka za jednym kliknięciem",
    preview: "Dokończ wniosek i uruchom oferty inwestorów.",
    paras: [
      "{{greeting}}, dosłownie kilka pól dzieli Cię od uruchomienia ofert.",
      "Dokończ wniosek, a inwestorzy zaczną rywalizować o jego sfinansowanie.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Pani Marta z Rzeszowa: bez BIK, bez stresu",
    preview: "Gotówka pod zastaw działki w 12 dni.",
    paras: [
      "{{greeting}}, pani Marta z Rzeszowa myślała, że BIK zamyka jej drogę.",
      "Pod zastaw działki dostała gotówkę w 12 dni — bez sprawdzania historii kredytowej.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Nie odkładaj tego na później",
    preview: "Kilka minut dziś oszczędza tygodnie zwłoki.",
    paras: [
      "{{greeting}}, im wcześniej zaczniesz, tym szybciej pieniądze trafią na Twoje konto.",
      "Kilka minut na wniosek dziś to tygodnie oszczędzone jutro.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Wciąż tu jesteśmy, gdy będziesz gotowy",
    preview: "Twój wniosek poczeka — decydujesz w swoim tempie.",
    paras: [
      "{{greeting}}, nie spieszymy Cię — wracaj, kiedy będzie Ci wygodnie.",
      "Twój wniosek jest zapisany, a oferta wciąż aktualna.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Pytania? Ania chętnie pomoże",
    preview: "Zadzwoń albo napisz — bez zobowiązań, bez presji.",
    paras: [
      "{{greeting}}, jeśli coś jest niejasne, po prostu zapytaj.",
      "Ania spokojnie wyjaśni każdy szczegół, zanim cokolwiek zdecydujesz.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twoja oferta wciąż jest aktualna",
    preview: "Nic nie przepadło — możesz wrócić w każdej chwili.",
    paras: [
      "{{greeting}}, dobra wiadomość: Twoja oferta wciąż na Ciebie czeka.",
      "Wróć do wniosku, kiedy tylko zechcesz, i sprawdź warunki.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Ile możesz zyskać na 70 miesiącach",
    preview: "Dłuższy okres to spokojniejszy budżet co miesiąc.",
    paras: [
      "{{greeting}}, rozłożenie spłaty na 70 miesięcy realnie odciąża budżet.",
      "Sprawdź w kalkulatorze, o ile spokojniejszy może być Twój każdy miesiąc.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Pan Adam z Bydgoszczy: firma znów oddycha",
    preview: "Płynność odzyskana pod zastaw lokalu w 10 dni.",
    paras: [
      "{{greeting}}, pan Adam z Bydgoszczy potrzebował szybko podreperować płynność firmy.",
      "Pod zastaw lokalu odzyskał środki w 10 dni i firma znów działa pełną parą.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Bez presji, z pełną jasnością",
    preview: "Rozumiesz każdy zapis — dopiero potem podpisujesz.",
    paras: [
      "{{greeting}}, u nas nie podpiszesz niczego, czego nie rozumiesz.",
      "Tłumaczymy każdy zapis umowy, żebyś decydował świadomie i bez presji.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twoja nieruchomość, Twój spokój",
    preview: "Gotówka teraz, własność cały czas przy Tobie.",
    paras: [
      "{{greeting}}, otrzymujesz potrzebne środki, a nieruchomość zostaje Twoja.",
      "Mieszkasz u siebie tak jak wcześniej — nic się w tym nie zmienia.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Zajrzyj do kalkulatora bez zobowiązań",
    preview: "Liczby najlepiej rozwiewają wątpliwości.",
    paras: [
      "{{greeting}}, czasem wystarczy zobaczyć konkretne liczby, żeby podjąć decyzję.",
      "Zajrzyj do kalkulatora — to nic nie kosztuje i do niczego nie zobowiązuje.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Pani Joanna z Lublina odzyskała spokój",
    preview: "Konsolidacja długów w jedną ratę pod zastaw domu.",
    paras: [
      "{{greeting}}, pani Joanna z Lublina połączyła kilka zobowiązań w jedno.",
      "Jedna rata pod zastaw domu przywróciła jej spokój i porządek w finansach.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Krok, który dzieli Cię od gotówki",
    preview: "Dokończenie wniosku zajmuje kilka minut.",
    paras: [
      "{{greeting}}, do uruchomienia ofert brakuje już tylko jednego kroku.",
      "Dokończ wniosek w kilka minut, a resztą zajmiemy się my.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Twój czas jest cenny — szanujemy go",
    preview: "Minimum formalności, maksimum konkretów.",
    paras: [
      "{{greeting}}, nie zabieramy Ci czasu na zbędne formalności.",
      "Minimum papierów, szybka decyzja i konkretna oferta — tak działamy.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Sprawdź, co przygotowali inwestorzy",
    preview: "Ponad 300 z nich rywalizuje o Twój wniosek.",
    paras: [
      "{{greeting}}, ciekawi Cię, co przygotowali dla Ciebie inwestorzy?",
      "Ponad 300 z nich rywalizuje o Twój wniosek — zobacz najlepszą ofertę.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Gotówka bez utraty dachu nad głową",
    preview: "Uwolnij kapitał i dalej mieszkaj u siebie.",
    paras: [
      "{{greeting}}, pożyczka pod zastaw nie oznacza utraty domu.",
      "Uwalniasz kapitał, a przez cały czas mieszkasz u siebie jak dotąd.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Rata na miarę Twojego budżetu",
    preview: "Policz i przekonaj się, że da się wygodnie.",
    paras: [
      "{{greeting}}, dobierzemy ratę tak, żeby pasowała do Twoich możliwości.",
      "Policz ją w kalkulatorze i przekonaj się, że spłata może być wygodna.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Pan Grzegorz z Szczecina: 320 tys. w 9 dni",
    preview: "Pod zastaw domu, bez zaświadczeń o dochodach.",
    paras: [
      "{{greeting}}, pan Grzegorz ze Szczecina potrzebował większej kwoty na już.",
      "Pod zastaw domu dostał 320 tysięcy w dziewięć dni — bez zaświadczeń o dochodach.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Wróć, gdy tylko zechcesz",
    preview: "Twój wniosek czeka, a oferta wciąż otwarta.",
    paras: [
      "{{greeting}}, drzwi wciąż są otwarte, a Twój wniosek zapisany.",
      "Wróć w dowolnym momencie i dokończ go bez pośpiechu.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Nie musisz mieć zdolności w banku",
    preview: "Liczy się nieruchomość, nie scoring.",
    paras: [
      "{{greeting}}, brak zdolności kredytowej w banku nie zamyka Ci drogi.",
      "U nas liczy się nieruchomość, nie bankowy scoring.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twoja oferta na {{loan_amount}} czeka",
    preview: "Sprawdź warunki dopasowane do Twojej kwoty.",
    paras: [
      "{{greeting}}, przygotujemy dla Ciebie warunki na kwotę {{loan_amount}}.",
      "Sprawdź, jak wygląda oferta i jaka wyjdzie rata.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Prosto, jasno, po ludzku",
    preview: "Bez żargonu i bez ukrytych haczyków.",
    paras: [
      "{{greeting}}, tłumaczymy wszystko prosto i po ludzku.",
      "Bez żargonu, bez haczyków — po to, żebyś czuł się pewnie na każdym etapie.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Decyzja w dobę, spokój na dłużej",
    preview: "Szybka odpowiedź i wygodna spłata na lata.",
    paras: [
      "{{greeting}}, wstępną decyzję dostajesz w 24 godziny.",
      "A dzięki okresowi do 70 miesięcy zyskujesz spokój na dłużej.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twoje cztery ściany, Twój kapitał",
    preview: "Zamień wartość nieruchomości w realną gotówkę.",
    paras: [
      "{{greeting}}, w Twoich czterech ścianach drzemie realny kapitał.",
      "Zamień go w gotówkę, nie tracąc prawa do własnego mieszkania.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Konsolidacja, która realnie odciąża",
    preview: "Jedna rata zamiast wielu — policz różnicę.",
    paras: [
      "{{greeting}}, wiele rat potrafi dusić budżet co miesiąca.",
      "Połącz je w jedną pożyczkę na 70 miesięcy i policz, ile zyskasz.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Bez BIK, bez ZUS, bez PIT-ów",
    preview: "Trzy rzeczy, których u nas nie musisz mieć.",
    paras: [
      "{{greeting}}, u nas nie pytamy o BIK, ZUS ani PIT-y.",
      "Zabezpieczeniem jest nieruchomość — i to wystarczy, żeby ruszyć.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "10 dni do gotówki na koncie",
    preview: "Konkretny czas, na którym można polegać.",
    paras: [
      "{{greeting}}, od wniosku do wypłaty mija średnio dziesięć dni.",
      "To konkretny termin, na którym spokojnie zaplanujesz swoje sprawy.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Pani Beata z Kielc: remont domu spełniony",
    preview: "180 tys. pod zastaw mieszkania, wygodna rata.",
    paras: [
      "{{greeting}}, pani Beata z Kielc od lat odkładała remont.",
      "180 tysięcy pod zastaw mieszkania i wygodna rata sprawiły, że w końcu ruszyła.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Twój wniosek = start konkurencji ofert",
    preview: "Dokończ go i pozwól inwestorom zawalczyć.",
    paras: [
      "{{greeting}}, w momencie, gdy dokończysz wniosek, rusza konkurencja ofert.",
      "Ponad 300 inwestorów zawalczy o to, żeby to ich propozycję wybrałeś.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Sprawdź ofertę teraz w kalkulatorze",
    preview: "Dwie minuty i znasz konkretne liczby.",
    paras: [
      "{{greeting}}, nie zgaduj — sprawdź konkretne liczby teraz.",
      "Kalkulator w dwie minuty pokaże Ci kwotę i ratę.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Nieruchomość z hipoteką? Porozmawiajmy",
    preview: "Obciążenia nie przekreślają Twojego wniosku.",
    paras: [
      "{{greeting}}, nawet nieruchomość z hipoteką może być zabezpieczeniem.",
      "Nie zakładaj z góry, że się nie da — sprawdźmy razem możliwości.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Rata niższa, oddech głębszy",
    preview: "70 miesięcy potrafi zmienić Twój miesiąc.",
    paras: [
      "{{greeting}}, niższa rata to po prostu więcej spokoju na co dzień.",
      "Rozłóż spłatę nawet na 70 miesięcy i odetchnij głębiej.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Twoja gotówka na wyciągnięcie ręki",
    preview: "Kilka minut wniosku, doba na decyzję.",
    paras: [
      "{{greeting}}, potrzebna gotówka jest bliżej, niż myślisz.",
      "Kilka minut na wniosek, doba na wstępną decyzję — tak to działa u nas.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Pan Rafał z Gdyni: {{loan_amount}} bez papierologii",
    preview: "Pod zastaw lokalu, bez zaświadczeń i operatu.",
    paras: [
      "{{greeting}}, pan Rafał z Gdyni potrzebował {{loan_amount}} na inwestycję.",
      "Dostał je pod zastaw lokalu bez zaświadczeń, PIT-ów i operatu szacunkowego.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Wszystko jasne, zanim podpiszesz",
    preview: "Transparentna umowa bez drobnego druku.",
    paras: [
      "{{greeting}}, każdy zapis umowy wyjaśniamy, zanim złożysz podpis.",
      "Bez drobnego druku i bez niespodzianek — wiesz dokładnie, na co się zgadzasz.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Zobacz, ile możesz pożyczyć",
    preview: "Wartość nieruchomości zamień na konkretną kwotę.",
    paras: [
      "{{greeting}}, sprawdź, jaką kwotę możesz oprzeć na swojej nieruchomości.",
      "Kalkulator pokaże Ci to od ręki, bez żadnych zobowiązań.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Nie zwlekaj z tym, co ważne",
    preview: "Twoje plany nie muszą czekać na bank.",
    paras: [
      "{{greeting}}, jeśli masz plan, nie musi on czekać na decyzję banku.",
      "Zacznij wniosek dziś, a decyzję wstępną poznasz już w 24 godziny.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twój opiekun poprowadzi Cię za rękę",
    preview: "Ania jest z Tobą na każdym etapie.",
    paras: [
      "{{greeting}}, nie zostajesz sam z formalnościami.",
      "Ania, Twoja opiekunka, prowadzi Cię krok po kroku aż do wypłaty.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Kalkulator nie kłamie",
    preview: "Konkretna rata, żadnych obietnic bez pokrycia.",
    paras: [
      "{{greeting}}, zamiast ładnych haseł damy Ci konkretne liczby.",
      "Kalkulator pokaże realną ratę — sprawdź ją i sam oceń.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "300+ inwestorów, 1 najlepsza oferta",
    preview: "Konkurencja pracuje na Twoją korzyść.",
    paras: [
      "{{greeting}}, im więcej inwestorów, tym lepsza oferta dla Ciebie.",
      "Ponad 300 z nich rywalizuje, a Ty wybierasz tę najkorzystniejszą.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Twoja oferta wciąż czeka na dokończenie",
    preview: "Kilka pól dzieli Cię od propozycji inwestorów.",
    paras: [
      "{{greeting}}, brakuje naprawdę niewiele, żeby ruszyć z ofertami.",
      "Dokończ wniosek i pozwól inwestorom przygotować dla Ciebie propozycje.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Spokojna spłata, jasne warunki",
    preview: "Wygodna rata i pełna transparentność w jednym.",
    paras: [
      "{{greeting}}, łączymy wygodną, niską ratę z pełną jasnością warunków.",
      "Wiesz, ile spłacasz i na jakich zasadach — od pierwszego do ostatniego miesiąca.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Zamień zastój w działanie",
    preview: "Gotówka pod zastaw ruszy Twoje plany z miejsca.",
    paras: [
      "{{greeting}}, jeśli brak środków blokuje Twoje plany, jest rozwiązanie.",
      "Gotówka pod zastaw nieruchomości ruszy je z miejsca w kilkanaście dni.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Drzwi wciąż otwarte",
    preview: "Nie zamykamy Twojego wniosku — wracaj śmiało.",
    paras: [
      "{{greeting}}, kiedy tylko będziesz gotowy, wracaj do swojego wniosku.",
      "Jest zapisany i czeka — bez pośpiechu i bez presji.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Pani Dorota z Torunia poleca spokój",
    preview: "Gotówka pod zastaw mieszkania i żadnych kolejek.",
    paras: [
      "{{greeting}}, pani Dorota z Torunia bała się formalności, a okazało się prościej.",
      "Gotówkę pod zastaw mieszkania dostała bez kolejek i bez zaświadczeń.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Policz ratę raz jeszcze",
    preview: "Może dziś liczby ułożą się lepiej, niż sądzisz.",
    paras: [
      "{{greeting}}, jeśli wcześniej wahałeś się przez ratę, policz ją jeszcze raz.",
      "Przy okresie do 70 miesięcy może wyjść wygodniej, niż zakładałeś.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Twoja gotówka wciąż w zasięgu",
    preview: "Wniosek gotowy do dokończenia w kilka minut.",
    paras: [
      "{{greeting}}, potrzebna gotówka wciąż jest w Twoim zasięgu.",
      "Wystarczy dokończyć wniosek — reszta dzieje się po naszej stronie.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Bez papierów, bez nerwów",
    preview: "Zabezpieczeniem jest nieruchomość — reszta odpada.",
    paras: [
      "{{greeting}}, mniej papierów to mniej nerwów.",
      "Zabezpieczeniem jest nieruchomość, więc zaświadczenia i operat po prostu odpadają.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Sprawdź ofertę, zanim zdecydujesz cokolwiek",
    preview: "Poznanie liczb do niczego Cię nie zobowiązuje.",
    paras: [
      "{{greeting}}, warto poznać konkretną ofertę, zanim cokolwiek postanowisz.",
      "Sprawdzenie liczb jest darmowe i niezobowiązujące.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "Twój dom pracuje, Ty odpoczywasz",
    preview: "Kapitał uwolniony, własność cały czas Twoja.",
    paras: [
      "{{greeting}}, pozwól, żeby Twoja nieruchomość pracowała dla Ciebie.",
      "Uwalniasz kapitał, zostajesz właścicielem i nadal mieszkasz u siebie.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Konsolidacja z jasnymi zasadami",
    preview: "Jedna rata, zero drobnego druku.",
    paras: [
      "{{greeting}}, połącz zobowiązania w jedną wygodną ratę.",
      "Wszystko jasno, bez drobnego druku i bez ukrytych kosztów.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Ostatni moment, by ruszyć bez zwłoki",
    preview: "Im szybciej zaczniesz, tym szybciej masz gotówkę.",
    paras: [
      "{{greeting}}, jeśli odkładasz decyzję, tracisz tylko czas.",
      "Zacznij dziś — wstępna decyzja w 24 godziny, wypłata w około 10 dni.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Pan Krzysztof z Opola: firma uratowana",
    preview: "Szybka gotówka pod zastaw magazynu w 13 dni.",
    paras: [
      "{{greeting}}, pan Krzysztof z Opola potrzebował gotówki na już.",
      "Pod zastaw magazynu dostał środki w 13 dni i utrzymał firmę na powierzchni.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twoje pytania mają odpowiedzi",
    preview: "Ania rozwieje każdą wątpliwość bez presji.",
    paras: [
      "{{greeting}}, każda Twoja wątpliwość ma u nas odpowiedź.",
      "Napisz do Ani — spokojnie i po ludzku wyjaśni to, co niejasne.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Zobacz swoją ratę na {{loan_amount}}",
    preview: "Konkretna liczba dla Twojej kwoty w 2 minuty.",
    paras: [
      "{{greeting}}, chcesz wiedzieć, jaka rata wyjdzie przy {{loan_amount}}?",
      "Wpisz kwotę w kalkulatorze i zobacz konkretny wynik w dwie minuty.",
    ],
    cta: "Policz swoją ratę",
  },
  {
    subject: "Nieruchomość zostaje Twoja — obiecujemy",
    preview: "Gotówka teraz, własność cały czas przy Tobie.",
    paras: [
      "{{greeting}}, przy naszej pożyczce nie tracisz nieruchomości.",
      "Dostajesz gotówkę, a dom czy mieszkanie przez cały czas należą do Ciebie.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Jeszcze tu jesteśmy dla Ciebie",
    preview: "Twój wniosek czeka, a my gotowi pomóc.",
    paras: [
      "{{greeting}}, wciąż jesteśmy tu, żeby Ci pomóc.",
      "Twój wniosek jest zapisany — wróć do niego, kiedy będziesz gotowy.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Mniej stresu, więcej możliwości",
    preview: "Prosty proces i wygodna spłata na lata.",
    paras: [
      "{{greeting}}, gotówka pod zastaw to mniej stresu i więcej możliwości.",
      "Prosty proces, szybka decyzja i wygodna rata rozłożona nawet na 70 miesięcy.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Sprawdź, ile realnie zapłacisz",
    preview: "Bez domysłów — kalkulator pokaże konkret.",
    paras: [
      "{{greeting}}, zamiast się domyślać, sprawdź konkretny koszt.",
      "Kalkulator pokaże Ci realną ratę dopasowaną do Twojej kwoty i okresu.",
    ],
    cta: "Sprawdź ofertę w kalkulatorze",
  },
  {
    subject: "Twoja decyzja, Twoje tempo",
    preview: "Bez presji — my tylko pokazujemy możliwości.",
    paras: [
      "{{greeting}}, decyzję podejmujesz w swoim tempie i na swoich zasadach.",
      "My jedynie pokazujemy możliwości i konkretne liczby — reszta należy do Ciebie.",
    ],
    cta: "Zobacz swoją ofertę",
  },
  {
    subject: "300+ inwestorów wciąż czeka",
    preview: "Twój dokończony wniosek uruchamia ich oferty.",
    paras: [
      "{{greeting}}, ponad 300 inwestorów wciąż jest gotowych zawalczyć o Twój wniosek.",
      "Wystarczy, że go dokończysz, a ruszy konkurencja o najlepszą ofertę.",
    ],
    cta: "Dokończ wniosek",
  },
  {
    subject: "Zacznij dziś, odetchnij jutro",
    preview: "Decyzja w dobę, spokój na wiele miesięcy.",
    paras: [
      "{{greeting}}, jeden krok dziś potrafi zmienić Twoje jutro.",
      "Decyzja wstępna w 24 godziny, a potem wygodna spłata na Twoich warunkach.",
    ],
    cta: "Uzupełnij wniosek teraz",
  },
  {
    subject: "Twoja oferta jest o krok od Ciebie",
    preview: "Dokończ wniosek i zobacz, co przygotowali inwestorzy.",
    paras: [
      "{{greeting}}, jesteś dosłownie o krok od zobaczenia swojej oferty.",
      "Dokończ wniosek, a ponad 300 inwestorów przygotuje dla Ciebie propozycje.",
    ],
    cta: "Zobacz swoją ofertę",
  },
];

export const EMAIL_FOLLOW_UPS: FollowUpEmail[] = RAW_EMAILS.map((r) =>
  buildEmail(r.subject, r.preview, r.paras, r.cta),
);

// === DANE REDAKCYJNE (40 SMS) ===
export const SMS_FOLLOW_UPS: string[] = [
  "Finance You: {{greeting}}, pozyczka pod zastaw nieruchomosci bez BIK i ZUS. Decyzja w 24h. Policz rate: {{link}}",
  "Finance You: Niska rata nawet na 70 miesiecy. Sprawdz swoja oferte w kalkulatorze: {{link}}",
  "Finance You: {{greeting}}, ponad 300 inwestorow konkuruje o Twoj wniosek. Wybierz najlepsza oferte: {{link}} Stop=STOP",
  "Finance You: Bez zaswiadczen i operatu. Gotowka od 30 tys. do kilku mln zl. Dokoncz wniosek: {{link}}",
  "Finance You: Decyzja wstepna w 24h, wyplata srednio w 10 dni. Zacznij teraz: {{link}}",
  "Finance You: {{greeting}}, Twoja nieruchomosc zostaje Twoja. Gotowka pod zastaw juz teraz: {{link}}",
  "Finance You: Policz swoja rate w 2 minuty, bez zobowiazan. Sprawdz kalkulator: {{link}} Stop=STOP",
  "Finance You: Bez BIK, bez PIT-ow, bez ZUS. Zabezpieczeniem jest nieruchomosc. Uzupelnij wniosek: {{link}}",
  "Finance You: {{greeting}}, Twoj wniosek czeka na dokonczenie. Kilka minut i ruszaja oferty: {{link}}",
  "Finance You: Konsolidacja kilku dlugow w jedna wygodna rate. Policz: {{link}}",
  "Finance You: Mieszkanie, dom, dzialka, lokal, magazyn - takze z obciazeniami. Sprawdz: {{link}} Stop=STOP",
  "Finance You: {{greeting}}, sprawdz oferte teraz w kalkulatorze - to nic nie kosztuje: {{link}}",
  "Finance You: Ponad 300 inwestorow, jedna najlepsza oferta dla Ciebie. Zobacz: {{link}}",
  "Finance You: Niska rata na dlugo, gotowka szybko. Dokoncz wniosek online: {{link}}",
  "Finance You: {{greeting}}, decyzje wstepna masz w 24h. Zacznij wniosek teraz: {{link}} Stop=STOP",
  "Finance You: Wszystko online, do notariusza jedziesz raz. Sprawdz warunki: {{link}}",
  "Finance You: Bank odmowil? U nas liczy sie nieruchomosc, nie BIK. Sprawdz oferte: {{link}}",
  "Finance You: {{greeting}}, wyceny nie robisz Ty - robimy my. Bez operatu. Wniosek: {{link}}",
  "Finance You: Twoja rata moze byc nizsza, niz myslisz. Policz na 70 miesiecy: {{link}} Stop=STOP",
  "Finance You: Gotowka od 30 tys. do kilku mln zl pod zastaw nieruchomosci. Sprawdz: {{link}}",
  "Finance You: {{greeting}}, opiekun Ania poprowadzi Cie za reke. Zacznij wniosek: {{link}}",
  "Finance You: Zero drobnego druku, pelna transparentnosc. Zobacz swoja oferte: {{link}}",
  "Finance You: Dokoncz wniosek i pozwol 300+ inwestorom zawalczyc o Ciebie: {{link}} Stop=STOP",
  "Finance You: {{greeting}}, gotowka na koncie srednio w 10 dni. Uzupelnij wniosek: {{link}}",
  "Finance You: Sprawdz, ile mozesz pozyczyc pod zastaw swojej nieruchomosci: {{link}}",
  "Finance You: Nieruchomosc caly czas Twoja, gotowka juz teraz. Policz rate: {{link}}",
  "Finance You: {{greeting}}, Twoja oferta wciaz czeka. Wroc do wniosku w kilka minut: {{link}} Stop=STOP",
  "Finance You: Jedna rata zamiast kilku. Konsolidacja pod zastaw nieruchomosci: {{link}}",
  "Finance You: Bez zaswiadczen o zarobkach. Decyzja w 24h. Sprawdz kalkulator: {{link}}",
  "Finance You: {{greeting}}, nawet nieruchomosc z hipoteka moze byc zabezpieczeniem: {{link}}",
  "Finance You: Szybciej niz w banku, prosciej niz myslisz. Dokoncz wniosek: {{link}} Stop=STOP",
  "Finance You: Policz swoja rate na 70 miesiecy i zobacz, ile zaoszczedzisz: {{link}}",
  "Finance You: {{greeting}}, kilka pol dzieli Cie od oferty inwestorow. Dokoncz: {{link}}",
  "Finance You: Gotowka pod zastaw, a Ty dalej mieszkasz u siebie. Sprawdz: {{link}}",
  "Finance You: 300+ inwestorow rywalizuje o Twoj wniosek. Zobacz najlepsza oferte: {{link}} Stop=STOP",
  "Finance You: {{greeting}}, sprawdz oferte teraz - liczby rozwieja watpliwosci: {{link}}",
  "Finance You: Bez BIK i bez ZUS. Twoja nieruchomosc to Twoja gotowka. Wniosek: {{link}}",
  "Finance You: Decyzja w dobe, wyplata w 7-14 dni. Nie zwlekaj, zacznij teraz: {{link}}",
  "Finance You: {{greeting}}, Twoj wniosek jest prawie gotowy. Dokoncz go dzis: {{link}} Stop=STOP",
  "Finance You: Wygodna rata, jasne warunki, szybka gotowka. Policz teraz: {{link}}",
];

// === CYKLOWANE POBIERANIE (1-indexed, zawijanie modulo — nigdy się nie „kończy") ===
export function emailForStep(step: number): FollowUpEmail {
  const n = EMAIL_FOLLOW_UPS.length;
  if (n === 0) throw new Error("EMAIL_FOLLOW_UPS jest puste");
  const i = (((step - 1) % n) + n) % n;
  return EMAIL_FOLLOW_UPS[i];
}
export function smsForStep(step: number): string {
  const n = SMS_FOLLOW_UPS.length;
  if (n === 0) throw new Error("SMS_FOLLOW_UPS jest puste");
  const i = (((step - 1) % n) + n) % n;
  return SMS_FOLLOW_UPS[i];
}
