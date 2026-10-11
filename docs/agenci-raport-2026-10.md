# Raport — agenci głosowi i tekstowi oraz agent wzrostu (2026-10-11)

Gałąź: `claude/lucid-clarke-64wzxg`. Kod przetestowany (154 pliki testów,
1899 testów, typecheck i lint bez błędów). Prompty agentów w ElevenLabs są
już zmienione na żywo. Agent wzrostu i nowe narzędzia agentów zaczną działać
po scaleniu gałęzi i wdrożeniu.

## Wynik w skrócie

- Agenci rozpoznają potrzebę klienta: odbiorcę (klient czy inwestor), cel,
  pilność, kwoty, płeć, wykluczenia (zakup nieruchomości, cel prywatny),
  próby manipulacji i rezygnację.
- Liczby (prowizja, LTV, odsetki maksymalne, abonament) idą z kodu
  (`fees.ts`, `plans.ts`), a nie z pamięci modelu. Zmiana cennika zmienia
  odpowiedzi agentów i posty bez ruszania promptów.
- Szeroki dostęp do danych przez jedno wejście z bezpiecznikami: lista
  narzędzi na agenta, limity na godzinę, zakres do własnego leada, maskowanie
  telefonu i e-maila, usuwanie PESEL i tokenów, audyt bez danych osobowych.
- Agent wzrostu tworzy, publikuje i mierzy posty na FB i IG, odpowiada na
  komentarze IG i YouTube, uczy się, co działa, i pilnuje prawdy.
- Telefoniczna Ania mówiła klientom nieprawdę w czterech sprawach. Poprawione
  na żywo.

## Co zbudowano

### Wspólny zestaw dla agentów (`src/lib/agent-toolkit/`)

| Moduł                        | Co robi                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `needs-discovery.ts`         | sygnały z rozmowy: odbiorca, cel, pilność i termin, kwoty, płeć, wykluczenia, manipulacja, rezygnacja    |
| `live-facts.ts`              | blok faktów z cennika i umów, szacunek kosztu (prowizja, kwota na rękę, LTV)                             |
| `policy.ts`                  | które narzędzie wolno któremu agentowi, limity, maskowanie danych                                        |
| `tools.server.ts`            | nowe narzędzia: fakty oferty, szacunek kosztu, wyszukiwanie wiedzy, stan sprawy, rynek, pilne, wnioski   |
| `elevenlabs-tools.server.ts` | samo zakłada i dopina nowe narzędzia do agentów A1–A3 po wdrożeniu                                       |
| `prompt-blocks.ts`           | blok zarządzany w promptach, generowany z kodu, nie do ręcznej edycji                                    |
| `capabilities*.ts`           | prośby agentów o nowe możliwości: darmowe przyznane od razu, płatne do właściciela z darmową alternatywą |
| `owner-notify.server.ts`     | SMS do właściciela z hamulcem (ta sama sprawa raz na 7 dni, najwyżej 2 SMS-y na dobę)                    |

W rozmowie tekstowej kod dokłada przy każdej wiadomości klienta blok
„SYGNAŁY ROZMOWY” z rozpoznaniem i następnym krokiem.

### Agent wzrostu (`src/lib/growth-agent/`)

Opis działania i sterowania: `docs/agent-wzrostu.md`.

## Testy

### Testy jednostkowe

Nowe testy: `agent-toolkit.test.ts` (rozpoznanie potrzeb, fakty, bezpieczniki,
prośby o narzędzia) i `growth-agent.test.ts` (strategia, strażnik prawdy na
prawdziwych postach, ocena wyników). Cały pakiet: 1899 testów zielonych.

### Symulacje rozmów w ElevenLabs (agent A1, klient)

Dziewięć scenariuszy, każdy dwa razy: koszt i „czy to bot”, licytacja za
10 dni, zakup mieszkania, konsolidacja prywatnych kredytów, dane już podane,
próba manipulacji, druga hipoteka, rezygnacja, „czy stracę dom”.

| Runda                        | Wynik   |
| ---------------------------- | ------- |
| Stan wyjściowy               | 5 / 9   |
| Po przepisaniu promptu       | 16 / 18 |
| Po zmianach reguł            | 12 / 18 |
| Po poprawkach                | 16 / 18 |
| Końcowa, na obecnym prompcie | 14 / 18 |

Merytorycznie (koszt, prowizja, odsetki, cel firmowy, brak obietnic,
odmowa przy manipulacji, rezygnacja) wszystkie przejścia końcowej rundy są
poprawne. Trzy z czterech uwag dotyczą formy „Pan” do kobiety, zanim się
przedstawi, jedna — prośby o zdjęcia „tutaj” w rozmowie telefonicznej.
Symulacja nie dostaje bloku sygnałów, który w produkcji podpowiada płeć
i kanał, więc w produkcji ten błąd powinien być rzadszy. Wynik waha się
między rundami o 2–4 punkty przy tym samym prompcie: to zmienność modelu.

Test porównawczy szybszego modelu na gałęzi testowej: 15 / 18, szybsze
odpowiedzi, bez przewagi jakościowej. Gałąź zostaje z ruchem 0%.

### Agent inwestorski (A2)

Stan wyjściowy 2 / 2, ale z wyciekiem rozumowania modelu do klienta. Po
poprawkach 4 / 4, w końcowej rundzie 3 / 4 (raz nie powtórzył ceny
abonamentu, którą podał rozmówca). Liczby, ryzyko i brak wymyślonych
projektów — poprawne.

### Telefoniczna Ania (agent przychodzący)

Sześć tur testowych po poprawkach. Poprawnie: koszt z odsetkami
maksymalnymi i prowizją 5%, bez „48 godzin”, odmowa celu prywatnego bez
sugerowania zakładania firmy, LTV 60% liczone z obecną hipoteką,
„Pani” po „złożyłam”, przyznanie, że jest asystentką AI.

### Strażnik prawdy na prawdziwych postach

19 ostatnich postów z profilu: 17 do inwestorów, 2 do przedsiębiorców.
Dwa posty na Instagramie z 29 września blokuje: „stabilny zwrot z inwestycji”
i „skutecznie i bezpiecznie lokować kapitał”. To obietnice, których nie da
się uczciwie złożyć.

### Test praktyczny posta

Agent zaplanował post dla przedsiębiorców („firma w Gdańsku, nieruchomość
pod Krakowem, inwestor w Warszawie — czy taka pożyczka dojdzie do skutku?”).
Przeszedł strażnika prawdy, ma grafikę i czeka w kolejce Studia publikacji
na 12 października, 7:40. Wpis w dzienniku agenta pozwoli mu zmierzyć wynik
po 48 godzinach.

## Co zmieniono na żywo w ElevenLabs

| Agent                       | Zmiana                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A1 klient                   | pełny prompt z blokiem zarządzanym: rozpoznanie potrzeb, fakty, reguły kanałów, płeć, pilność, manipulacja |
| A2 inwestor instytucjonalny | blok zarządzany, koniec wycieku rozumowania (budżet myślenia 0)                                            |
| A3 panel inwestora          | blok zarządzany zapisany wprost w ElevenLabs (baza nie przyjmuje tego identyfikatora)                      |
| Ania, telefon przychodzący  | prompt: koszty, LTV 60%, tylko cele firmowe, wniosek darmowy, bez terminu decyzji, bez form „Pan/Pani”     |
| Ania, baza wiedzy           | usunięte „48 godzin”, LTV 50% → 60%, koszty bez stawek miesięcznych, nowe pytania i odpowiedzi             |
| Ania, powitanie             | „Tu Ania, wirtualna asystentka…” — rozmówca od początku wie, że rozmawia z AI                              |

## Znalezione problemy

1. **Ania mówiła nieprawdę** — baza wiedzy obiecywała decyzję w 48 godzin,
   podawała LTV 50% i miesięczne przedziały kosztu, a prompt na pytanie
   o działalność gospodarczą odpowiadał „to zależy”, choć finansujemy tylko
   cele firmowe. Poprawione.
2. **Dziennik agentów nie zapisywał niczego** — kolumna `actor` jest typu
   UUID, a kod wpisywał „agent”. Poprawione w kodzie.
3. **Komentarze pod postami FB** — webhook odpowiada każdemu komentującemu
   i pisze prywatnie przez agenta dla pożyczkobiorców, także do inwestorów.
   Do zmiany w kodzie: kierować inwestorów do agenta inwestorskiego według
   rozpoznanego odbiorcy.
4. **Profil mówi prawie tylko do inwestorów** (17 z 19 postów), zasięg
   i zaangażowanie bliskie zera (FB 57 obserwujących, IG 4). Agent wzrostu
   zmienia odbiorców na przemian.
5. **Dwa posty IG z 29 września** z obietnicą stabilnego i bezpiecznego
   zysku. Do decyzji: usunąć albo poprawić opis.
6. **Prompt A3 żyje tylko w ElevenLabs** — tabela `text_agent_settings`
   nie przyjmuje identyfikatora tego agenta. Synchronizacja z kodu go nie
   nadpisze, ale edycja z panelu też nie zadziała.
7. **Ania nie zapisuje nagrań głosu**, tylko transkrypcje. Powitanie nie
   mówi więc o nagrywaniu. Jeśli nagrania mają być, trzeba je włączyć
   i dodać informację do powitania.

## Do decyzji właściciela

| Sprawa                     | Co zrobić                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Wdrożenie                  | scalić gałąź `claude/lucid-clarke-64wzxg` i wdrożyć — inaczej agent wzrostu i nowe narzędzia nie ruszą |
| Dwa posty IG z 29 września | usunąć albo poprawić opis                                                                              |
| Fakty Ani                  | potwierdzić LTV 60% i brak stawek miesięcznych w odpowiedziach telefonicznych                          |
| X (Twitter)                | publikacja wymaga płatnych kredytów API; darmowo: Threads, Bluesky, strona firmowa LinkedIn            |
| TikTok                     | audyt aplikacji wymaga nagrania przez człowieka (`docs/tiktok-audyt-nagranie.md`)                      |
| Twilio                     | saldo 18 USD; włączyć automatyczne doładowanie, bo przy zerze staną SMS-y i telefony                   |
| Komentarze FB              | zgoda na zmianę kierowania inwestorów w webhooku                                                       |

## Ograniczenia

- Agent wzrostu nie zmienia własnego kodu w produkcji. Uczy się
  parametrami, playbookiem i źródłami danych, a zmiany kodu zgłasza jako
  propozycje.
- Przy kilkudziesięciu obserwujących pomiar jest szumem przez pierwsze
  tygodnie. Bandyta zaczyna od wiedzy z dotychczasowych postów i ostrożnie
  przesuwa wagi.
- Forma „Pan/Pani” przed przedstawieniem się rozmówcy zależy od modelu
  i bywa błędna mimo reguły.
