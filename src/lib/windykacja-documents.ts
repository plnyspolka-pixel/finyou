// ════════════════════════════════════════════════════════════════════
// SZABLONY DOKUMENTÓW WINDYKACYJNYCH (placeholder backendu — sekcja 7).
// Statyczne szablony z podstawianymi danymi sprawy; profesjonalna
// polszczyzna prawnicza. Wierzycielem, nadawcą i podpisującym jest
// inwestor — właściciel sprawy — z danymi z jego profilu (investor-party.ts);
// Finance You tylko w sprawach personelu bez profilu inwestora.
//
// Treść jest statyczna (szablony w kodzie); generator LLM / PDF nie jest
// częścią tego modułu.
// ════════════════════════════════════════════════════════════════════

import { formatPLN } from "./labels";
import type { WindDocumentType } from "./windykacja-procedure";
import { DOCUMENT_LABELS } from "./windykacja-procedure";
import { creditorDescription, type CreditorParty, type CreditorPurpose } from "./investor-party";

export interface DocContext {
  /** Wierzyciel (nadawca i podpisujący) — profil właściciela sprawy. */
  wierzyciel: CreditorParty;
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

/**
 * Jakich danych wierzyciela wymaga pismo: wnioski do sądu i komornika oraz
 * zawiadomienia o przestępstwie — pełna identyfikacja (PESEL / NIP, KRS);
 * pozostałe pisma — nazwa i adres; notatka — nic (null).
 */
export function windCreditorPurpose(typ: WindDocumentType): CreditorPurpose | null {
  switch (typ) {
    case "notatka":
      return null;
    case "wniosek_klauzula":
    case "wniosek_komornik":
    case "zawiadomienie_286":
    case "zawiadomienie_297":
      return "wniosek";
    default:
      return "pismo";
  }
}

function d(iso?: string | null): string {
  if (!iso) return "…………";
  const [y, m, dd] = iso.split("T")[0].split("-");
  return `${dd}.${m}.${y}`;
}

function header(ctx: DocContext): string {
  const w = ctx.wierzyciel;
  const [first, ...rest] = w.headerLines;
  const wierzyciel = [`Wierzyciel: ${first ?? w.legalName}`, ...rest].join("\n");
  return `${w.city || ctx.miejscowosc || "Warszawa"}, dnia ${d(ctx.data ?? new Date().toISOString())}\n\n${wierzyciel}\n\nDłużnik: ${ctx.dluznik}\n${ctx.adres}${ctx.pesel ? `\nPESEL: ${ctx.pesel}` : ""}${ctx.nip ? `\nNIP: ${ctx.nip}` : ""}`;
}

/** Spółka działa przez reprezentanta; osoba fizyczna i JDG — we własnym imieniu. */
function dzialajac(w: CreditorParty): string {
  return w.kind === "spolka"
    ? `Działając w imieniu ${w.legalName}`
    : "Działając jako pożyczkodawca";
}

/** Buduje treść dokumentu danego typu. */
export function buildWindDocument(
  typ: WindDocumentType,
  ctx: DocContext,
): { tytul: string; tresc: string } {
  const tytul = DOCUMENT_LABELS[typ];
  const w = ctx.wierzyciel;
  const umowa = `umowy pożyczki nr ${ctx.numer_umowy ?? "…"} z dnia ${d(ctx.data_umowy)}`;
  const kwota = formatPLN(ctx.kwota_zalegla);
  const rachunek = ctx.rachunek ? `\n\nWpłaty prosimy kierować na rachunek: ${ctx.rachunek}.` : "";

  let body: string;
  switch (typ) {
    case "wezwanie":
      body = `WEZWANIE DO ZAPŁATY\n\n${dzialajac(w)}, w związku z ${umowa}, wzywam do zapłaty wymagalnej zaległości w kwocie ${kwota} w nieprzekraczalnym terminie 7 dni od daty doręczenia niniejszego wezwania.\n\nBrak zapłaty we wskazanym terminie spowoduje skierowanie sprawy na drogę postępowania egzekucyjnego na podstawie aktu notarialnego o poddaniu się egzekucji (art. 777 § 1 pkt 5 k.p.c.)${ctx.akt_777 ? ` — ${ctx.akt_777}` : ""}, co naruszy dodatkowymi kosztami.${rachunek}`;
      break;
    case "wypowiedzenie":
      body = `WYPOWIEDZENIE UMOWY POŻYCZKI\n\n${dzialajac(w)}, z uwagi na rażące naruszenie warunków ${umowa} (brak spłaty), niniejszym wypowiadam umowę. Z chwilą upływu okresu wypowiedzenia cała pozostała należność w kwocie ${formatPLN(ctx.saldo_pozostale)} staje się natychmiast wymagalna wraz z odsetkami maksymalnymi za opóźnienie.${rachunek}`;
      break;
    case "wniosek_klauzula":
      body = `WNIOSEK O NADANIE KLAUZULI WYKONALNOŚCI\n\nWnioskodawca (wierzyciel): ${creditorDescription(w, "wniosek")}.\n\nWnoszę o nadanie klauzuli wykonalności aktowi notarialnemu${ctx.akt_777 ? ` ${ctx.akt_777}` : ""}, w którym dłużnik ${ctx.dluznik} poddał się egzekucji w trybie art. 777 § 1 pkt 5 k.p.c., co do obowiązku zapłaty kwoty ${kwota} wynikającej z ${umowa}.\n\nWarunek nadania klauzuli (bezskuteczny upływ terminu zapłaty z wezwania) został spełniony, co wykazują załączone dowody doręczenia.`;
      break;
    case "wniosek_komornik":
      body = `WNIOSEK O WSZCZĘCIE EGZEKUCJI\n\nWierzyciel: ${creditorDescription(w, "wniosek")}.\n\nNa podstawie załączonego tytułu wykonawczego wnoszę o wszczęcie egzekucji przeciwko dłużnikowi ${ctx.dluznik} w celu wyegzekwowania należności w kwocie ${formatPLN(ctx.saldo_pozostale)}.\n\nWnoszę o prowadzenie egzekucji z nieruchomości objętej księgą wieczystą ${ctx.numer_kw ?? "…"} (hipoteka umowna na rzecz wierzyciela), a także z rachunków bankowych, wynagrodzenia i ruchomości dłużnika.`;
      break;
    case "porozumienie":
      body = `POROZUMIENIE W SPRAWIE SPŁATY ZADŁUŻENIA\n\n${w.legalName} oraz ${ctx.dluznik} ustalają harmonogram spłaty zaległości w kwocie ${kwota} wynikającej z ${umowa}. Porozumienie nie stanowi odnowienia (art. 506 k.c.) i nie uchyla zabezpieczeń. W razie uchybienia którejkolwiek racie całość staje się natychmiast wymagalna.${rachunek}`;
      break;
    case "ugoda":
      body = `UGODA PRZEDSĄDOWA\n\nStrony: ${w.legalName} (wierzyciel) oraz ${ctx.dluznik} (dłużnik), zawierają ugodę co do spłaty zadłużenia w kwocie ${formatPLN(ctx.saldo_pozostale)} z ${umowa}, z zaostrzonym zabezpieczeniem. Ugoda nie wyłącza dotychczasowych zabezpieczeń rzeczowych.`;
      break;
    case "aneks":
      body = `ANEKS DO UMOWY POŻYCZKI\n\nStrony: ${w.legalName} (pożyczkodawca) oraz ${ctx.dluznik} (pożyczkobiorca) zmieniają warunki ${umowa} w zakresie harmonogramu spłaty. Pozostałe postanowienia umowy, w tym zabezpieczenia (hipoteka, akt 777), pozostają bez zmian.`;
      break;
    case "zawiadomienie_286":
      body = `ZAWIADOMIENIE O PODEJRZENIU POPEŁNIENIA PRZESTĘPSTWA\n\nPokrzywdzony: ${creditorDescription(w, "wniosek")}\n\nZawiadamiam o podejrzeniu popełnienia przez ${ctx.dluznik} przestępstwa oszustwa (art. 286 § 1 k.k.) na szkodę pokrzywdzonego. Sprawca, zawierając ${umowa}, działał z zamiarem niewywiązania się z zobowiązania (brak jakiejkolwiek wpłaty, zerwanie kontaktu), doprowadzając pokrzywdzonego do niekorzystnego rozporządzenia mieniem w kwocie ${formatPLN(ctx.saldo_pozostale)}.`;
      break;
    case "zawiadomienie_297":
      body = `ZAWIADOMIENIE O PODEJRZENIU POPEŁNIENIA PRZESTĘPSTWA\n\nPokrzywdzony: ${creditorDescription(w, "wniosek")}\n\nZawiadamiam o podejrzeniu popełnienia przez ${ctx.dluznik} przestępstwa z art. 297 § 1 k.k. (oszustwo kredytowe). W toku ubiegania się o ${umowa} sprawca przedłożył nierzetelne, pisemne oświadczenia i dokumenty mające istotne znaczenie dla jej zawarcia.`;
      break;
    case "notatka":
      body = "NOTATKA\n\n";
      break;
  }

  const needsSignature = typ !== "notatka";
  const tresc = `${header(ctx)}\n\n${body}${needsSignature ? `\n\nZ poważaniem,\n\n${w.signature}` : ""}`;
  return { tytul, tresc };
}
