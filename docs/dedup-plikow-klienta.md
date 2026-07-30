# Deduplikacja zdjęć i plików klienta

Te same pliki potrafiły trafiać do systemu wielokrotnie: ponowna wysyłka maila
z tym samym załącznikiem (cytowane wątki, retry webhooka), re-send na
Messengerze, dwukrotne wgranie tego samego zdjęcia w formularzu lub panelu.
Każda kopia dostawała unikalną ścieżkę w Storage (stempel czasowy + losowy
sufiks), więc dotychczasowa deduplikacja **po ścieżce** niczego nie łapała.

Od teraz pliki klienta są deduplikowane **po treści** — hashem SHA-256.

## Jak to działa

1. **`documents.content_hash`** — każdy nowy wpis dokumentu zapisuje hash
   treści pliku. Załączniki przychodzące (mail/Messenger), których hash już
   występuje w `documents` danego wniosku, nie tworzą drugiego rekordu.
2. **Rejestr `client_file_hashes`** — mapowanie `hash → ścieżka w buckecie
   pliki-klienta`, per wniosek (`loan_application_id`) lub per lead
   (`lead_id`). Uploader sprawdza rejestr **przed** wgraniem: przy trafieniu
   zwraca istniejącą ścieżkę i nie wgrywa drugiej kopii binarki.
   Unikalność pilnują częściowe indeksy unikalne; naruszenie (wyścig dwóch
   równoległych uploadów) jest ignorowane — dedup jest best-effort i nigdy
   nie blokuje uploadu.

## Punkty wejścia objęte dedupem

- **`uploadFile` (unified-upload.ts)** — konteksty `property` / `document` /
  `generated` z `applicationId`. Zwraca `contentHash` i flagę `deduped`
  (true = zwrócono istniejącą ścieżkę). Awatary i marketing nie podlegają
  dedupowi (to nie są pliki klienta).
- **`ClientFilesManager`** (operator/pośrednik/admin) i **panel klienta**
  (`/klient`) — plik z flagą `deduped`, którego ścieżka już jest widoczna
  w wniosku, jest pomijany; toast pokazuje liczbę pominiętych duplikatów.
- **Załączniki przychodzące** (`inbound-attachments.server.ts` — Mailgun,
  Resend, Messenger/IG): `downloadAndStore` nie wgrywa binarki, jeśli hash
  jest już zarejestrowany dla leada; `attachStoredToClientDocuments` pomija
  duplikaty względem `documents` wniosku i wewnątrz partii.
- **Formularze landingowe** — `uploadLandingAttachment` zwraca `contentHash`,
  submit pomija duplikaty w obrębie zgłoszenia i rejestruje hashe dla
  utworzonego wniosku, więc późniejsze uploady w panelu też je złapią.

## Kasowanie plików

`deleteStoragePath` usuwa też wpisy rejestru wskazujące skasowaną ścieżkę —
inaczej kolejny upload tej samej binarki wskazywałby nieistniejący plik.

## Ograniczenia

- Dedup działa w obrębie **jednego wniosku / leada** — ten sam plik u dwóch
  różnych klientów to celowo dwie osobne kopie (separacja danych).
- Pliki historyczne (sprzed migracji `20260730150000_dedup_plikow_klienta`)
  nie mają hashy — deduplikują się dopiero nowe uploady.
- Minimalnie zmieniony plik (np. ponowna kompresja zdjęcia po stronie
  telefonu) ma inny hash i nie jest traktowany jako duplikat.
