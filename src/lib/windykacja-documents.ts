// ════════════════════════════════════════════════════════════════════
// SZABLONY DOKUMENTÓW WINDYKACYJNYCH (placeholder backendu — sekcja 7).
// Statyczne szablony z podstawianymi danymi sprawy; profesjonalna
// polszczyzna prawnicza, podpis zarządu Finance You sp. z o.o.
//
// TODO: podłączyć generator treści (LLM / szablony serwerowe / PDF).
// ════════════════════════════════════════════════════════════════════

import { formatPLN } from "./labels";
import type { WindDocumentType } from "./windykacja-procedure";
import { DOCUMENT_LABELS } from "./windykacja-procedure";

const SIGNATURE = "Filip Bielak\nPrezes Zarządu\nFinance You sp. z o.o.";

export interface DocContext {
  dluznik: string;
  adres: string;
  pesel?: string | null;
  nip?: string | null;
  numer_umowy?: string | null;
  data_umowy?: string | null;
  kwota_zalegla: number;
  saldo_pozostale: number;
  numer_kw?: string | null;
  akt_777?: string | null;
  rachunek?: string | null;
  miejscowosc?: string;
  data?: string; // data wystawienia
}

function d(iso?: string | null): string {
  if (!iso) return "…………";
  const [y, m, dd] = iso.split("T")[0].split("-");
  return `${dd}.${m}.${y}`;
}

function header(ctx: DocContext): string {
  return `${ctx.miejscowosc ?? "Warszawa"}, dnia ${d(ctx.data ?? new Date().toISOString())}\n\nFinance You sp. z o.o.\n\nDłużnik: ${ctx.dluznik}\n${ctx.adres}${ctx.pesel ? `\nPESEL: ${ctx.pesel}` : ""}${ctx.nip ? `\nNIP: ${ctx.nip}` : ""}`;
}

/** Buduje treść dokumentu danego typu. */
export function buildWindDocument(
  typ: WindDocumentType,
  ctx: DocContext,
): { tytul: string; tresc: string } {
  const tytul = DOCUMENT_LABELS[typ];
  const umowa = `umowy pożyczki nr ${ctx.numer_umowy ?? "…"} z dnia ${d(ctx.data_umowy)}`;
  const kwota = formatPLN(ctx.kwota_zalegla);
  const rachunek = ctx.rachunek ? `\n\nWpłaty prosimy kierować na rachunek: ${ctx.rachunek}.` : "";

  let body: string;
  switch (typ) {
    case "wezwanie":
      body = `WEZWANIE DO ZAPŁATY\n\nW imieniu Finance You sp. z o.o., w związku z ${umowa}, wzywam do zapłaty wymagalnej zaległości w kwocie ${kwota} w nieprzekraczalnym terminie 7 dni od daty doręczenia niniejszego wezwania.\n\nBrak zapłaty we wskazanym terminie spowoduje skierowanie sprawy na drogę postępowania egzekucyjnego na podstawie aktu notarialnego o poddaniu się egzekucji (art. 777 § 1 pkt 5 k.p.c.)${ctx.akt_777 ? ` — ${ctx.akt_777}` : ""}, co naruszy dodatkowymi kosztami.${rachunek}`;
      break;
    case "wypowiedzenie":
      body = `WYPOWIEDZENIE UMOWY POŻYCZKI\n\nDziałając w imieniu Finance You sp. z o.o., z uwagi na rażące naruszenie warunków ${umowa} (brak spłaty), niniejszym wypowiadam umowę. Z chwilą upływu okresu wypowiedzenia cała pozostała należność w kwocie ${formatPLN(ctx.saldo_pozostale)} staje się natychmiast wymagalna wraz z odsetkami maksymalnymi za opóźnienie.${rachunek}`;
      break;
    case "wniosek_klauzula":
      body = `WNIOSEK O NADANIE KLAUZULI WYKONALNOŚCI\n\nWnoszę o nadanie klauzuli wykonalności aktowi notarialnemu${ctx.akt_777 ? ` ${ctx.akt_777}` : ""}, w którym dłużnik ${ctx.dluznik} poddał się egzekucji w trybie art. 777 § 1 pkt 5 k.p.c., co do obowiązku zapłaty kwoty ${kwota} wynikającej z ${umowa}.\n\nWarunek nadania klauzuli (bezskuteczny upływ terminu zapłaty z wezwania) został spełniony, co wykazują załączone dowody doręczenia.`;
      break;
    case "wniosek_komornik":
      body = `WNIOSEK O WSZCZĘCIE EGZEKUCJI\n\nNa podstawie załączonego tytułu wykonawczego wnoszę o wszczęcie egzekucji przeciwko dłużnikowi ${ctx.dluznik} w celu wyegzekwowania należności w kwocie ${formatPLN(ctx.saldo_pozostale)}.\n\nWnoszę o prowadzenie egzekucji z nieruchomości objętej księgą wieczystą ${ctx.numer_kw ?? "…"} (hipoteka umowna na rzecz wierzyciela), a także z rachunków bankowych, wynagrodzenia i ruchomości dłużnika.`;
      break;
    case "porozumienie":
      body = `POROZUMIENIE W SPRAWIE SPŁATY ZADŁUŻENIA\n\nFinance You sp. z o.o. oraz ${ctx.dluznik} ustalają harmonogram spłaty zaległości w kwocie ${kwota} wynikającej z ${umowa}. Porozumienie nie stanowi odnowienia (art. 506 k.c.) i nie uchyla zabezpieczeń. W razie uchybienia którejkolwiek racie całość staje się natychmiast wymagalna.${rachunek}`;
      break;
    case "ugoda":
      body = `UGODA PRZEDSĄDOWA\n\nStrony: Finance You sp. z o.o. (wierzyciel) oraz ${ctx.dluznik} (dłużnik), zawierają ugodę co do spłaty zadłużenia w kwocie ${formatPLN(ctx.saldo_pozostale)} z ${umowa}, z zaostrzonym zabezpieczeniem. Ugoda nie wyłącza dotychczasowych zabezpieczeń rzeczowych.`;
      break;
    case "aneks":
      body = `ANEKS DO UMOWY POŻYCZKI\n\nStrony zmieniają warunki ${umowa} w zakresie harmonogramu spłaty. Pozostałe postanowienia umowy, w tym zabezpieczenia (hipoteka, akt 777), pozostają bez zmian.`;
      break;
    case "zawiadomienie_286":
      body = `ZAWIADOMIENIE O PODEJRZENIU POPEŁNIENIA PRZESTĘPSTWA\n\nPokrzywdzony: Finance You sp. z o.o.\n\nZawiadamiam o podejrzeniu popełnienia przez ${ctx.dluznik} przestępstwa oszustwa (art. 286 § 1 k.k.) na szkodę Finance You sp. z o.o. Sprawca, zawierając ${umowa}, działał z zamiarem niewywiązania się z zobowiązania (brak jakiejkolwiek wpłaty, zerwanie kontaktu), doprowadzając pokrzywdzonego do niekorzystnego rozporządzenia mieniem w kwocie ${formatPLN(ctx.saldo_pozostale)}.`;
      break;
    case "zawiadomienie_297":
      body = `ZAWIADOMIENIE O PODEJRZENIU POPEŁNIENIA PRZESTĘPSTWA\n\nPokrzywdzony: Finance You sp. z o.o.\n\nZawiadamiam o podejrzeniu popełnienia przez ${ctx.dluznik} przestępstwa z art. 297 § 1 k.k. (oszustwo kredytowe). W toku ubiegania się o ${umowa} sprawca przedłożył nierzetelne, pisemne oświadczenia i dokumenty mające istotne znaczenie dla jej zawarcia.`;
      break;
    case "notatka":
      body = "NOTATKA\n\n";
      break;
  }

  const needsSignature = typ !== "notatka";
  const tresc = `${header(ctx)}\n\n${body}${needsSignature ? `\n\nZ poważaniem,\n\n${SIGNATURE}` : ""}`;
  return { tytul, tresc };
}
