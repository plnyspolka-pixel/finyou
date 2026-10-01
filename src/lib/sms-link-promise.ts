// Bezpiecznik dla odpowiedzi agenta na SMS: model potrafi napisać „właśnie wysłałem Ci
// link", nie wywołując narzędzia, które ten link faktycznie wstawia do wiadomości —
// klient czeka na coś, co nie przyszło. Gdy odpowiedź obiecuje link, a żadnego
// adresu w niej nie ma, dosyłamy go osobnym SMS-em.

const PROMISE_RE =
  /(?:wysy[łl]am|wys[łl]a[łl]em|wys[łl]a[łl]am|wy[śs]l[ęe]|przesy[łl]am|przes[łl]a[łl]em|przes[łl]a[łl]am|podsy[łl]am|podes[łl]a[łl]em|podes[łl]a[łl]am)[^.!?\n]{0,60}link|link[^.!?\n]{0,40}(?:wys[łl]any|jest\s+ju[żz]\s+w\s+drodze|dostaniesz|otrzymasz|dostanie\s+Pan|otrzyma\s+Pan)/i;

/** Czy odpowiedź zapowiada link, a nie zawiera żadnego adresu. */
export function promisesLinkWithoutUrl(reply: string): boolean {
  return PROMISE_RE.test(reply) && !/https?:\/\/|financeyou\.pl/i.test(reply);
}

export const SMS_APPLICATION_LINK_BODY = "Link do wniosku: https://financeyou.pl/klient";
