// Czy wiadomość klienta to prośba o telefon („Proszę zadzwonić 501 845 505”,
// „zadzwońcie do mnie”, „wolę rozmowę telefoniczną”). Taki klient czeka na
// człowieka — automatyczne przypomnienia na czacie tylko go irytują.
const CALL_REQUEST_RE =
  /(prosz[eę]\s+(o\s+)?(zadzwoni|telefon|kontakt\s+telefoniczny|rozmow[eę]\s+telefoniczn)|zadzwo[nń](cie|i)?\s+(do\s+mnie|prosz[eę]|na\s+(numer|nr|ten))|prosz[eę]\s+o\s+(pilny\s+)?(telefon|kontakt\s+tel)|wol[eę]\s+(rozmow[eę]\s+)?telefon|oddzwo[nń]|zdzwo[nń]|porozmawia\S*\s+(telefonicznie|przez\s+telefon)|rozmow\S*\s+telefoniczn|prosz[eę]\s+o\s+kontakt|(o\s+kt[oó]rej|kiedy)\b.{0,30}porozmawia)/i;

export function isCallRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  return CALL_REQUEST_RE.test(text.replace(/\s+/g, " "));
}
