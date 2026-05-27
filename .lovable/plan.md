## Cel

Gdy klient akceptuje ofertę inwestora, system automatycznie tworzy „pakiet umowy" i prowadzi **obie strony** (klienta i inwestora) do uzupełnienia brakujących danych potrzebnych do podpisania umowy. **Bez kroku admina** — admin może podglądać, ale nie blokuje przepływu.

## Co się zmienia

```text
Inwestor składa ofertę
        ↓
Klient akceptuje ofertę   ← /klient/oferta (przycisk „Akceptuję")
        ↓
[AUTOMAT] backend tworzy client_profile z danych wniosku + oferty + profilu inwestora
        ↓
Klient → /klient/umowa/$offerId   (uzupełnia dane pożyczkobiorcy + nieruchomości + dokument tożsamości)
Inwestor → /inwestor/umowa/$offerId (uzupełnia dane do przelewu + reprezentacja + adres)
        ↓
Każda strona widzi postęp drugiej strony („Inwestor uzupełnił 4/5 pól")
Gdy oba komplety = 100% → status „Gotowe do podpisu"
```

## Implementacja

### 1. Backend — nowa funkcja `prepareContractForParties`
- Plik: `src/lib/contract-prep.functions.ts`
- `createServerFn` + `requireSupabaseAuth`
- Wewnątrz używa `supabaseAdmin` (service role), ale najpierw waliduje, że wywołujący to: klient z `offer.loan.client.user_id` LUB inwestor z `offer.investor.user_id`
- Tworzy/aktualizuje `client_profiles` (analogicznie do istniejącego `createProfileFromOffer`, ale dostępne dla obu stron)
- Zwraca `{ profileId }`

### 2. Backend — `saveContractPartyData`
- Ta sama funkcja przyjmuje `{ offerId, side: "client" | "investor", patch }`
- Aktualizuje odpowiednie sekcje w `client_profiles.data` (klient → `borrowerData` + `propertyData` + `idDocument`; inwestor → `investorData` + `bankAccount` + `representativeName`)
- Waliduje że caller ma prawo edytować swoją sekcję
- Zwraca aktualne `completion` po stronie klienta i inwestora

### 3. Backend — `getContractPrepStatus`
- Zwraca: dane profilu, jakie pola brakujące dla każdej strony, % uzupełnienia obu stron

### 4. Auto-trigger w `klient.oferta.tsx`
- W `decide(...zaakceptowana_przez_klienta)`: zaraz po sukcesie zaktualizowania statusu wywołać `prepareContractForParties({ offerId })` i nawigować do `/klient/umowa/$offerId`
- Banner „Oferta zaakceptowana" zastąpić linkiem „Przejdź do uzupełnienia danych umowy"

### 5. Nowa trasa `/klient/umowa/$offerId`
- Pokazuje:
  - Sekcję „Twoje dane do umowy" — formularz tylko pól klienta (imię, nazwisko, PESEL, dowód, adres, dane nieruchomości, KW)
  - Listę brakujących pól z licznikiem
  - Pasek postępu inwestora (read-only) i Twój
  - Status: „Czekamy na inwestora" / „Gotowe do podpisu"

### 6. Nowa trasa `/inwestor/umowa/$offerId`
- Analogicznie, formularz dla inwestora:
  - Pełna nazwa / firma + NIP
  - Adres
  - Numer rachunku bankowego
  - Reprezentant (dla spółek)
- Widzi też postęp klienta

### 7. Banner w `inwestor.oferty.tsx`
- Dla ofert ze statusem `zaakceptowana_przez_klienta` zamiast tekstu „operator przygotuje" — przycisk **„Uzupełnij dane do umowy"** linkujący do `/inwestor/umowa/$offerId`

### 8. Co zostaje po stronie admina
- Strona `/admin/oferty` nadal pokazuje przycisk „Kreator umów" — admin może w każdej chwili wejść i sprawdzić/dograć dane (np. zabezpieczenia, NBP, harmonogram)
- Profil jest jeden i ten sam dla wszystkich stron; admin widzi pełną wersję w `/admin/kreator-pozyczki`

## Pliki
**Nowe**
- `src/lib/contract-prep.functions.ts`
- `src/routes/klient.umowa.$offerId.tsx`
- `src/routes/inwestor.umowa.$offerId.tsx`

**Edytowane**
- `src/routes/klient.oferta.tsx` — auto-trigger + link
- `src/routes/inwestor.oferty.tsx` — przycisk „Uzupełnij dane do umowy"
- `src/routes/klient.tsx` / `src/routes/inwestor.tsx` — opcjonalnie pozycja w menu „Umowy w toku"

## Poza zakresem (na później)
- Wymuszanie KYC / weryfikacji dokumentów
- Generowanie PDF umowy po 100% (już istnieje w `document-templates.functions.ts` — wystarczy spiąć w osobnym kroku)
- Notyfikacje email do drugiej strony przy uzupełnieniu danych
