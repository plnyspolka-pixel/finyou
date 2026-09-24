/**
 * Tabela opłat windykacyjnych (Załącznik nr 3 do Umowy pożyczki).
 *
 * JEDNO miejsce konfiguracji stawek. Domyślne wartości 1:1 z wzorca
 * („Umowa_pozyczki_KANKOWSCY”). Generator kompletu przyjmuje opcjonalnie
 * własną listę (`KompletOpcje.oplaty`) — np. gdy zmieni się cennik.
 *
 * Opłaty stanowią zwrot rzeczywistych, udokumentowanych kosztów czynności
 * windykacyjnych (klauzula WIN_05), a nie karę umowną.
 */

export interface OplataWindykacyjna {
  czynnosc: string;
  /** Kwota w złotych albo opis stawki (np. odesłanie do rozporządzenia). */
  oplata: number | string;
}

export const OPLATY_WINDYKACYJNE_DOMYSLNE: readonly OplataWindykacyjna[] = [
  { czynnosc: "Aneks do umowy pożyczki", oplata: 3000 },
  { czynnosc: "Opłata za dokument wystawiony na życzenie Pożyczkobiorcy", oplata: 150 },
  { czynnosc: "Monit pisemny / wezwanie do zapłaty", oplata: 300 },
  { czynnosc: "Monit telefoniczny", oplata: 50 },
  { czynnosc: "Monit SMS", oplata: 25 },
  { czynnosc: "Wznowienie pożyczki po wypowiedzeniu", oplata: 2000 },
  { czynnosc: "Zmiana harmonogramu spłaty", oplata: 500 },
  { czynnosc: "Przystąpienie do długu", oplata: 1000 },
  { czynnosc: "Wydruk historii operacji na rachunku pożyczki", oplata: 100 },
  { czynnosc: "Wydanie promesy", oplata: 500 },
  { czynnosc: "Wizyta terenowa do 50 km od siedziby", oplata: 200 },
  { czynnosc: "Wizyta terenowa 50–100 km od siedziby", oplata: 400 },
  { czynnosc: "Wizyta terenowa 100–150 km od siedziby", oplata: 600 },
  { czynnosc: "Każde kolejne 50 km ponad 150 km", oplata: 200 },
  {
    czynnosc: "Koszty obsługi prawnej przy dochodzeniu roszczeń",
    oplata: "wg rozporządzenia Min. Sprawiedliwości z 22.10.2015 r.",
  },
];
