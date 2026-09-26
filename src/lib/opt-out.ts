// Rozpoznawanie prośby o zaprzestanie kontaktu w wiadomości przychodzącej.
// Wspólne dla e-maila i Messengera/Instagrama — klient pisze to samo, niezależnie
// od kanału. Czyste heurystyki (bez bazy) — testowane w opt-out.test.ts.
//
// Powód: kilkukrotnie zdarzyło się, że klient napisał wprost „proszę przestać
// do mnie pisać", a automaty (drip przypomnień, follow-up braków, kampanie,
// nudge'e na Messengerze) pisały dalej, bo wypis był możliwy TYLKO przez link
// w stopce maila. Ten moduł jest wejściem dla strażnika: jak klient mówi
// „dość" — to dość, w każdym kanale i niezależnie od tego, czy kliknął link,
// czy napisał zwykłe zdanie.

/** Twardość wypisu: `soft` blokuje marketing, `hard` — również maile obsługowe. */
export type OptOutStrength = "soft" | "hard";

export interface OptOutMatch {
  /** Nazwa sygnału (do logów i metadanych suppression). */
  signal: string;
  /** Dopasowany fragment treści — operator widzi, na co zareagował strażnik. */
  phrase: string;
  strength: OptOutStrength;
}

/** Prośba o zaprzestanie wysyłki — zwykła rezygnacja. */
const OPT_OUT_PATTERNS: { signal: string; re: RegExp }[] = [
  // Wprost „wypisz mnie"
  { signal: "wypis_pl", re: /wypisz(cie)?\s+(mnie|nas|m[óo]j\s+adres)/i },
  { signal: "wypis_pl", re: /(prosz[ęe]|chc[ęe])\s+(mnie\s+|nas\s+|si[ęe]\s+)?wypisa[ćc]/i },
  { signal: "wypis_pl", re: /wypisuj[ęe]\s+si[ęe]/i },
  { signal: "wypis_pl", re: /odsubskrybuj/i },
  // Rezygnacja
  { signal: "rezygnacja_pl", re: /rezygnuj[ęe]\s+(z|ze)\b/i },
  { signal: "rezygnacja_pl", re: /(prosz[ęe]|wnosz[ęe])\s+o\s+rezygnacj/i },
  // Żądanie zaprzestania
  {
    signal: "zaprzestanie_pl",
    re: /zaprzesta[ńn]cie|zaprzestania\s+(wysy[łl]|kontakt|przesy[łl])/i,
  },
  { signal: "zaprzestanie_pl", re: /prosz[ęe]\s+o\s+zaprzestanie/i },
  {
    signal: "zaprzestanie_pl",
    re: /przesta[ńn]cie\s+(do\s+mnie\s+)?(pisa[ćc]|wysy[łl]a[ćc]|dzwoni[ćc]|spamowa[ćc])/i,
  },
  {
    signal: "zaprzestanie_pl",
    re: /prosz[ęe]\s+(wi[ęe]cej\s+)?nie\s+(pisa[ćc]|wysy[łl]a[ćc]|kontaktowa[ćc])/i,
  },
  {
    signal: "zaprzestanie_pl",
    re: /nie\s+(pisz|piszcie|wysy[łl]ajcie|kontaktujcie)\s+(do\s+mnie|si[ęe]|wi[ęe]cej|mi|nam)\b/i,
  },
  { signal: "zaprzestanie_pl", re: /nie\s+kontaktujcie\s+si[ęe]/i },
  // „Nie chcę / nie życzę sobie"
  {
    signal: "nie_chce_pl",
    re: /nie\s+(chc[ęe]|[żz]ycz[ęe]\s+sobie)\s+(wi[ęe]cej\s+)?(otrzymywa[ćc]|dostawa[ćc]|[żz]adnych|maili|wiadomo[śs]ci|newslettera|kontaktu|oferty|ofert)/i,
  },
  {
    signal: "nie_chce_pl",
    re: /nie\s+jestem\s+zainteresowany.{0,40}(nie\s+pisz|prosz[ęe]\s+nie|wi[ęe]cej)/i,
  },
  // Usunięcie z bazy / listy
  { signal: "usun_z_bazy_pl", re: /usu[ńn](cie)?\s+(mnie|m[óo]j\s+(adres|e-?mail)|moje\s+dane)/i },
  {
    signal: "usun_z_bazy_pl",
    re: /(wykre[śs]lcie|zabierzcie|skre[śs]lcie)\s+(mnie|m[óo]j\s+adres)/i,
  },
  {
    signal: "usun_z_bazy_pl",
    re: /(z|ze)\s+(wasz[ej]{0,2}\s+)?(bazy|listy)\s+(mailingowej|adresowej|wysy[łl]kowej)/i,
  },
  // „Mam dość"
  // „Mam dość" tylko jako zamknięta myśl — „mam dość dobre zabezpieczenie"
  // to nie rezygnacja.
  {
    signal: "dosc_pl",
    re: /(mam|mamy)\s+(ju[żz]\s+)?do[sś][ćc](?=\s*(?:[!.,;]|$|tego\b|tych\b|waszych\b|spamu\b|maili\b|wiadomo))/im,
  },
  { signal: "dosc_pl", re: /(do[śs][ćc]|dosy[ćc])\s+(ju[żz]\s+)?(tego|tych\s+maili|spamu)/i },
  { signal: "dosc_pl", re: /^\s*(do[śs][ćc]|dosy[ćc]|stop|koniec)\s*[!.]*\s*$/im },
  // Potoczne odmowy — na Messengerze/Instagramie ludzie piszą krócej niż mailem.
  { signal: "spokoj_pl", re: /daj(cie)?\s+(mi\s+)?(ju[żz]\s+)?spok[óo]j/i },
  { signal: "spokoj_pl", re: /o\s+[śs]wi[ęe]ty\s+spok[óo]j/i },
  { signal: "spokoj_pl", re: /odczep(cie)?\s+si[ęe]/i },
  { signal: "spokoj_pl", re: /przesta[ńn]cie\s+mnie\s+nachodzi[ćc]|nie\s+nachodzcie/i },
  { signal: "spokoj_pl", re: /(odwal\s+si[ęe]|spadaj(cie)?)\b/i },
  { signal: "spokoj_pl", re: /zablokuj[ęe]\s+(was|to\s+konto|ten\s+profil)/i },

  // Angielski (klienci zagraniczni / klienty pocztowe z szablonem). Celowo bez
  // samego słowa „unsubscribe" — stopki firmowe w odpowiedziach klientów mają
  // je w treści i każdy taki mail wyglądałby na rezygnację.
  { signal: "cofniecie_zgody_marketing_pl", re: /(cofam|wycofuj[ęe]|odwo[łl]uj[ęe])\s+(swoj[ąa]\s+|moj[ąa]\s+)?zgod[ęe]/i },

  { signal: "optout_en", re: /(please\s+)?unsubscribe\s+(me|us)\b/i },
  { signal: "optout_en", re: /^\s*unsubscribe\s*[!.]*\s*$/im },
  { signal: "optout_en", re: /(want|wish)\s+to\s+unsubscribe/i },
  { signal: "optout_en", re: /\bi\s+opt[- ]?out\b/i },
  { signal: "optout_en", re: /opt\s*-?\s*out\s+(me|of)\b/i },
  { signal: "optout_en", re: /remove\s+me\s+from\s+(your\s+)?(list|mailing|database)/i },
  { signal: "optout_en", re: /take\s+me\s+off\s+(your\s+)?(list|mailing)/i },
  { signal: "optout_en", re: /stop\s+(emailing|sending|contacting)\s+me/i },
  { signal: "optout_en", re: /do\s+not\s+(contact|email)\s+me/i },
];

/**
 * Sygnały twarde — klient nie tylko prosi o spokój, ale WPROST żąda usunięcia
 * danych / cofa zgodę na podstawie RODO albo grozi skargą. Takie adresy
 * blokujemy w KAŻDEJ kategorii (również maile obsługowe), dopóki człowiek nie
 * zdejmie blokady w panelu.
 *
 * Uwaga: samo słowo „RODO"/„GDPR", „UODO", „prawo do bycia zapomnianym" czy
 * „prawo do sprzeciwu wobec przetwarzania" NIE jest sygnałem — występują
 * w każdej klauzuli informacyjnej i stopce firmowej. Wymagamy wyrażonej
 * w pierwszej osobie intencji (żądam, wnoszę, cofam, zgłoszę…).
 */
const HARD_OPT_OUT_PATTERNS: { signal: string; re: RegExp }[] = [
  {
    signal: "rodo",
    re: /[żz][ąa]dam\s+(natychmiastowego\s+|niezw[łl]ocznego\s+)?(usuni[ęe]cia|zaprzestania|wykre[śs]lenia)/i,
  },
  {
    signal: "rodo",
    re: /(prosz[ęe]|wnosz[ęe])\s+o\s+(natychmiastowe\s+|niezw[łl]oczne\s+)?usuni[ęe]cie\s+(wszystkich\s+)?(moich\s+)?danych/i,
  },
  {
    signal: "rodo",
    re: /(korzystam|skorzysta[ćc]|chc[ęe]\s+skorzysta[ćc]|powo[łl]uj[ęe]\s+si[ęe]\s+na)\s+(z\s+)?(mojego\s+|swojego\s+)?prawa?\s+do\s+(bycia\s+zapomnianym|usuni[ęe]cia\s+danych|sprzeciwu)/i,
  },
  // Cofnięcie zgody wyłącznie na marketing to zwykła rezygnacja (soft, niżej) —
  // nie może blokować maili wynikających z umowy.
  {
    signal: "rodo",
    re: /(cofam|wycofuj[ęe]|odwo[łl]uj[ęe])\s+(swoj[ąa]\s+|moj[ąa]\s+)?zgod[ęe](?!\s+na\s+(marketing|newsletter|ofert|otrzymywanie\s+(ofert|newslettera|informacji\s+handlowych|materia[łl][óo]w\s+marketingowych)|informacj[ęe]\s+handlow|komunikacj[ęe]\s+marketingow|kontakt\s+marketingowy))/i,
  },
  { signal: "rodo", re: /(wnosz[ęe]|zg[łl]aszam|sk[łl]adam)\s+sprzeciw/i },
  { signal: "rodo", re: /(please\s+)?(delete|erase|remove)\s+(all\s+)?(of\s+)?my\s+(personal\s+)?data/i },
  { signal: "rodo", re: /i\s+(hereby\s+)?(withdraw|revoke)\s+(my\s+)?consent/i },
  { signal: "rodo", re: /i\s+(hereby\s+)?object\s+to\s+(the\s+)?processing/i },
  {
    signal: "skarga",
    re: /(zg[łl]osz[ęe]|zg[łl]aszam|zawiadomi[ęe]|zawiadamiam|z[łl]o[żz][ęe]|sk[łl]adam|skieruj[ęe]|wnios[ęe]|napisz[ęe])(?![\p{L}]).{0,60}(\buodo\b|\bpuodo\b|\buokik\b|urz[ęe]d\w*\s+ochrony\s+danych|prezes\w*\s+urz[ęe]du)/iu,
  },
  { signal: "skarga", re: /(zg[łl]aszam|zg[łl]osz[ęe])\s+(to\s+)?(jako\s+)?spam/i },
  {
    signal: "skarga",
    re: /(m[óo]j\s+)?(prawnik|adwokat|radca\s+prawny)\s+(si[ęe]\s+)?(skontaktuje|zajmie|napisze)/i,
  },
  { signal: "skarga", re: /kroki\s+prawne|na\s+drog[ęe]\s+s[ąa]dow/i },
];

/**
 * Granice cytowanej historii wątku, podpisu i stopki (klauzula RODO,
 * zastrzeżenie poufności) — poniżej nich treść nie jest już
 * własną wypowiedzią nadawcy (cytat naszego maila, stopka firmowa z linkami).
 */
const QUOTE_BOUNDARIES: RegExp[] = [
  /^\s*>/m,
  /^--\s*$/m,
  /^\s*-{2,}\s*(Original Message|Wiadomo[śs][ćc] oryginalna|Forwarded message|Przekazana wiadomo[śs][ćc])/im,
  /^\s*(Od|From)\s*:\s*.+$/im,
  /^\s*W\s+dniu\s+.+\s+napisa[łl]/im,
  /^\s*(Dnia|Data)\s+.+\s+napisa[łl]/im,
  /^\s*On\s+.+\s+wrote\s*:/im,
  /^\s*Wys[łl]ane\s+z\s+(mojego\s+)?(iPhone|iPad|Yahoo|Poczty)/im,
  // Klauzule informacyjne RODO i zastrzeżenia poufności w stopkach — to nie
  // jest wypowiedź nadawcy, a zawierają słowa typu „usunięcie", „sprzeciw", „UODO".
  /^\s*(Klauzula\s+(informacyjna|RODO|poufno[śs]ci)|Informacja\s+o\s+przetwarzaniu\s+danych|Ochrona\s+danych\s+osobowych\s*:)/im,
  /^\s*(Zgodnie\s+z\s+art\.?\s*1[34]|Administratorem\s+(Pani|Pana|Pa[ńn]stwa|Twoich|Pani\/Pana|danych))/im,
  /^\s*(Ta\s+wiadomo[śs][ćc]|Niniejsza\s+wiadomo[śs][ćc]|Tre[śs][ćc]\s+tej\s+wiadomo[śs]ci)\s+(jest\s+poufna|mo[żz]e\s+zawiera[ćc]|zawiera\s+informacje\s+poufne|stanowi)/im,
  /^\s*(This\s+(e-?mail|message)|The\s+information\s+(contained\s+)?in\s+this)\s+(is\s+confidential|may\s+contain|and\s+any\s+attachments|contains)/im,
];

/**
 * Odcina cytowaną historię wątku. Bez tego każda odpowiedź na naszego maila
 * wyglądałaby na rezygnację — nasza własna stopka zawiera „Wypisz mnie".
 */
export function stripQuotedReply(text: string): string {
  let cut = text.length;
  for (const re of QUOTE_BOUNDARIES) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut).trim();
}

/**
 * Czy wiadomość od klienta to prośba o zaprzestanie korespondencji?
 * Analizujemy temat + własną treść odpowiedzi (bez cytatu), maks. 2000 znaków —
 * dalej zaczyna się zwykle podpis i historia korespondencji.
 */
export function detectOptOut(input: {
  subject?: string | null;
  text?: string | null;
}): OptOutMatch | null {
  const own = stripQuotedReply(String(input.text ?? "")).slice(0, 2000);
  const haystack = [String(input.subject ?? ""), own].filter(Boolean).join("\n");
  if (!haystack.trim()) return null;

  for (const { signal, re } of HARD_OPT_OUT_PATTERNS) {
    const m = re.exec(haystack);
    if (m) return { signal, phrase: m[0].slice(0, 120), strength: "hard" };
  }
  for (const { signal, re } of OPT_OUT_PATTERNS) {
    const m = re.exec(haystack);
    if (m) return { signal, phrase: m[0].slice(0, 120), strength: "soft" };
  }
  return null;
}

/**
 * Kategoria wysyłki. `transactional` to wiadomości wynikające z umowy, z akcji
 * klienta albo napisane ręcznie przez operatora (dostęp po płatności, dokumenty,
 * harmonogram, potwierdzenie wniosku, odpowiedź człowieka z panelu). Reszta —
 * marketing, przypomnienia, follow-upy, odpowiedzi bota — to `automated`
 * i każdy wypis je zatrzymuje.
 */
export type SendCategory = "automated" | "transactional";

/** Powody blokady, których nie przebija nawet mail wynikający z umowy. */
const ALWAYS_BLOCKING_REASONS = new Set([
  "bounce",
  "complaint",
  "loop_detected",
  "bot_detected",
  "repeated_content",
]);

export interface SendDecisionInput {
  /**
   * Wpis z suppressed_emails, jeśli adres jest na liście blokad. `unblocked`
   * oznacza wypis cofnięty ręcznie w panelu — wpis zostaje w bazie jako ślad,
   * ale już nie blokuje.
   */
  suppression?: { reason: string; hard?: boolean; unblocked?: boolean } | null;
  /** clients.do_not_email — wypis zapisany w kartotece klienta. */
  doNotEmail?: boolean;
  category: SendCategory;
}

export interface SendDecision {
  allowed: boolean;
  reason?: string;
  detail?: string;
}

/**
 * Czysta reguła strażnika: czy wolno wysłać maila. Wersja z bazą to
 * `canSendEmail` w email-unsubscribe.server.ts.
 */
export function decideSend(input: SendDecisionInput): SendDecision {
  const { suppression, doNotEmail, category } = input;

  if (suppression && !suppression.unblocked) {
    const reason = suppression.reason || "unsubscribe";
    if (suppression.hard === true || ALWAYS_BLOCKING_REASONS.has(reason)) {
      return {
        allowed: false,
        reason: `suppressed:${reason}`,
        detail: suppression.hard ? "hard" : "technical",
      };
    }
    if (category !== "transactional") return { allowed: false, reason: `suppressed:${reason}` };
  }

  if (doNotEmail && category !== "transactional") {
    return { allowed: false, reason: "do_not_email" };
  }

  return { allowed: true };
}
