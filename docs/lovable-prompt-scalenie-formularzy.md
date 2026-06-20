# Prompt do Lovable — scalenie dwóch formularzy wniosku w jedno źródło prawdy

> Wklej poniższy tekst do czatu Lovable. To zadanie wymaga **uruchomienia
> aplikacji i przeklikania obu ścieżek** (anonim + zalogowany), dlatego robi je
> Lovable z podglądem, a nie agent bez dostępu do runtime.

---

## Kontekst

W aplikacji są **dwie równoległe implementacje formularza wniosku** o pożyczkę.
To nie są kopie — to dwie różne powierzchnie, które po cichu się zdublowały:

| | `LinearLoanApplication` (`src/components/loan-application-variants.tsx`) | `wniosek-formularz` (`src/routes/wniosek-formularz.tsx`) |
|---|---|---|
| Rola | anonimowy kreator-lead | uwierzytelniony formularz |
| Stan | `localStorage` (`finance_you_wniosek_compare_v1`) | baza danych |
| Kroki | 10 | 3 |
| Pliki | obiekty `URL.createObjectURL` w pamięci | upload do Supabase Storage |
| Zapis | callback `onSubmit` lub toast | autosave + `current_form_step` |
| Gdzie żyje | strona główna (`index.tsx`), panel klienta (`klient.wniosek.tsx`), `/wniosek-1` | trasa `/wniosek-formularz` |
| KW OCR | `extractKwFromUpload` | `detectKwNumbers` |

## Cel

**Jeden formularz wniosku jako jedno źródło prawdy**, działający w obu kontekstach
(anonim na landingu + zalogowany w panelu i na `/wniosek-formularz`), bez utraty
żadnej funkcji.

## Co już jest przygotowane (NIE duplikuj — użyj)

- `src/lib/computeLoanFigures` w `@/lib/loan-math` — jedyne wyliczenia raty/balonu/kosztu. Oba formularze już go używają.
- `src/lib/wniosek-funnel.ts` — jedno źródło stanu przekazywanego między krokami (kwota, zabezpieczenie, prefill). Używaj `readFunnelState` / `mergeFunnelState` / `clearFunnelState`.
- `src/lib/loan-application-persistence.ts` — `upsertClient` / `upsertLoanApplication` / `upsertProperty` (insert-or-update, zwracają `{ id, error }`, bez efektów ubocznych). To ma być JEDYNA droga zapisu wniosku do bazy.

## Rekomendowane podejście

1. **Kanon = UI `LinearLoanApplication`** (lepsze UX, prop-driven: `embedded` / `prefill` / `onSubmit` / `locked`), ale **z persystencją do bazy** zamiast localStorage jako jedynego stanu.
2. Wyciągnij **wspólny hook** `useLoanApplicationDraft` (lub rozszerz istniejący `useLoanDraft`), który:
   - ładuje istniejący wniosek z bazy dla zalogowanego (jak robi to dziś `wniosek-formularz`),
   - dla anonima trzyma draft w `localStorage` + `wniosek-funnel`,
   - zapisuje wyłącznie przez `loan-application-persistence.ts`.
3. **Ujednolić KW OCR** — wybierz jedną funkcję (`detectKwNumbers` działa na już wgranych dokumentach, `extractKwFromUpload` na świeżym pliku); zostaw jedną ścieżkę, drugą usuń.
4. **Pogodzić kroki** (10 ↔ 3): wspólna definicja kroków z widocznością zależną od kontekstu (anonim vs zalogowany), tak jak dziś robi to `isHiddenStep` w `LinearLoanApplication`.
5. Podłącz jeden komponent w 3 miejscach (`index.tsx`, `klient.wniosek.tsx`, `/wniosek-formularz`), a `/wniosek-1` ustaw jako alias/redirect.
6. **Dopiero po przeklikaniu** usuń martwy kod drugiej implementacji.

## Krytyczne testy przed usunięciem czegokolwiek

- [ ] Anonim na stronie głównej: wypełnia kreator → rejestracja → dane nie giną.
- [ ] Wejście z linku `/wniosek/$token` (lead z Meta): prefill imienia/maila/telefonu działa.
- [ ] Zalogowany w panelu: prefill z bazy, edycja, **autosave**, wznowienie na właściwym kroku.
- [ ] Upload dokumentu + odczyt numeru KW (OCR).
- [ ] Wysłanie wniosku → status `nowy_lead` / `do_analizy`, blokada edycji po wysyłce (`locked`).
- [ ] Kwota/okres/zabezpieczenie z kalkulatora na landingu docierają do formularza (ścieżka `wniosek-funnel`).

## Definicja ukończenia

- Jeden komponent formularza, jeden hook stanu, jedna ścieżka zapisu, jedna funkcja KW OCR.
- Zero regresji w 6 testach powyżej.
- Druga implementacja usunięta dopiero po zielonych testach.
