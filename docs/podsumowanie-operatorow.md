# Podsumowanie aktywności operatorów

Tabela na `/admin/zespol-aktywnosc`, nad feedem zdarzeń: jeden wiersz na osobę,
liczby za wybrany okres (7 / 30 / 90 dni). Feed odpowiada na pytanie „co się
działo", podsumowanie — „ile tego było i u kogo".

Widoczna wyłącznie dla administratora: liczy ją funkcja
`get_operator_activity_summary(p_days)` (SECURITY DEFINER), która sama sprawdza
rolę. Widok `v_team_activity` czyta tabele z pominięciem RLS, więc dostęp do
niego jest odebrany wszystkim rolom — dane wychodzą tylko przez RPC.

## Co wchodzi w liczby

| Kolumna    | Źródło                                                                         | `activity_kind`                                      |
| ---------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Telefony   | `lead_communications`, kanał `call`                                            | `telefon`                                            |
| SMS        | `lead_communications`, kanał `sms`                                             | `sms`                                                |
| E-maile    | `lead_communications`, kanał `email`                                           | `email`                                              |
| Wiadomości | Messenger/IG i czat na stronie (`messenger`, `chat`, `chat_inwestor`)          | `messenger`, `czat`                                  |
| Notatki    | `manual_note` przy leadzie                                                     | `notatka`                                            |
| Dokumenty  | `documents.uploaded_by`                                                        | `dokument`                                           |
| Statusy    | `audit_logs`, `status_change` (wniosek albo lead)                              | `status`                                             |
| Decyzje    | `loan_applications.decision_by`                                                | `decyzja`                                            |
| Inne       | podglądy danych leada, przypisania, oznaczenia „nietrafiony", reszta dziennika | `podglad`, `przypisanie`, `lead_nietrafiony`, `inne` |

Kolumny sumują się dokładnie do „Razem" — pilnuje tego test
`src/lib/operator-activity.test.ts`.

Kolumny **Leady** (ile różnych leadów dotknął) i **Dni** (w ilu dniach w ogóle
pracował, licząc dobę warszawską) nie są sumowane w stopce: ten sam lead i ten
sam dzień powtarzają się u kilku osób, więc suma byłaby zawyżona. Stopka
pokazuje w nich kreskę.

## Kto jest autorem zdarzenia

Działanie trafia do podsumowania, jeśli da się wskazać człowieka, który je
wykonał:

- `lead_communications.created_by` — notatka, klik w telefon, odsłonięcie danych,
- `lead_communications.metadata->>'sent_by'` — ręczna odpowiedź ze skrzynki
  (e-mail, Messenger/IG, czat) oraz SMS wystukany w panelu.

Wysyłki automatów nie mają ani jednego, ani drugiego — i do aktywności zespołu
nie wchodzą. Ten sam ślad odróżnia człowieka od bota w skrzynkach panelu, więc
nie ma drugiego źródła prawdy.

Konta bez ani jednego zdarzenia zostają w tabeli z zerami — cisza operatora jest
tu informacją, nie brakiem wiersza.

## Ograniczenia

Zmiany statusów i przypisań są zapisywane w `audit_logs` dopiero od migracji
`20260729110000_team_activity_feed.sql` — wcześniejszych nikt nie logował, więc
dla starszych okresów te kolumny będą puste. Podobnie SMS-y z panelu: przed
migracją `20260916120000` wysyłka nie zapisywała, kto ją kliknął.
