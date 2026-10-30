// Czy komentarz pod postem zasługuje na automatyczną odpowiedź (publiczną +
// prywatną wiadomość od Ani). Odpisujemy tylko na pytania i sygnały
// zainteresowania. Docinki, krytyka, oznaczenia znajomych czy „super” idą
// wyłącznie do skrzynki zespołu — automat odpowiadający ofertą na
// „Kolejny szkoli konkurencję...” tylko robi z marki bota.
const INTEREST_RE =
  /\?|\b(info|informac|szczeg[oó]ł|interes|zainteresowan|ch[eę]tn|chc[eę]|chcia(ł|l)(a|e)?bym|potrzebuj|ile\b|jak\b|gdzie|kiedy|kontakt|priv|prv|pw\b|dm\b|prosz[eę]|poprosz[eę]|ofert|warunk|po(ż|z)ycz|kredyt|finansowan|inwest|oprocentowan|zadzwo|telefon|e-?mail|odezw|napisz|wi[eę]cej)/i;

const HOSTILE_RE =
  /(oszu|scam|lichw|z(ł|l)odzie|naci[aą]g|mafi|nie polecam|spam|bzdur|konkurencj|uwa(ż|z)ajcie|parabank|kpin|(ż|z)enada)/i;

export function wantsCommentReply(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (HOSTILE_RE.test(t)) return false;
  return INTEREST_RE.test(t);
}
