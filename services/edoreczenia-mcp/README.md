# Finance You — e-Doręczenia + MCP (UA API v3.0.8)

> **Status: kod integracyjny / przygotowanie INT. Brak produkcyjnego połączenia do jakiejkolwiek skrzynki.**
> Nie wpisuj kluczy prywatnych, tokenów ani numerów ADE do repozytorium.

## Obsługiwane podmioty

- `financeyou` — Finance You sp. z o.o.
- `fundacja` — Fundacja
- `personal` — prywatne ADE, domyślnie odcięte od AI i personelu Finance You.

Listowanie metadanych i pobieranie wskazanych wiadomości realizuje UA API v3. Odczyt pojedynczego pisma może mieć skutki prawne — AI nie może zlecać go samodzielnie podczas cyklicznego monitorowania.

## Wymagania do uruchomienia

1. Każda firmowa skrzynka musi mieć zarejestrowany system zewnętrzny i związany z nim certyfikat X.509. Sam aktywny ADE tego **nie** zapewnia.
2. Uzupełnij `EDO_BOXES_JSON` (ADE, identyfikator systemu, nazwy zmiennych z kluczami), `EDO_FINANCEYOU_PRIVATE_KEY` oraz `EDO_FUNDACJA_PRIVATE_KEY` w **secret managerze** hosta MCP.
3. Zgłoś dostęp do środowiska INT i przejdź autoryzację (mogą obowiązywać wymogi rejestracji/IP). Domyślnie `EDO_ENV=int`.
4. Skrzynka osobista: dostęp poprzez niezależne, uprawnione logowanie delegowane. W tym kodzie możliwe jest użycie krótkotrwałego tokenu z bezpiecznej autoryzacji operatora (`mode=delegated_token`); **automatyczny OAuth login i refresh nie są tu jeszcze zaimplementowane**. Nie używaj firmowego klucza do prywatnej skrzynki.
5. Zachowaj izolację procesów: osobny host/profil MCP dla prywatnej skrzynki, `EDO_ALLOW_PERSONAL=YES` tylko w prywatnym profilu i `EDO_ALLOWED_MAILBOXES=personal`.

## Start

```sh
cd services/edoreczenia-mcp
npm install
node --test test/*.test.mjs
node src/index.mjs
```

Konfiguracja klienta AI (np. Claude Desktop) — proces stdio, **bez HTTP publicznego**:

```json
{
  "mcpServers": {
    "financeyou-edoreczenia": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/finyou/services/edoreczenia-mcp/src/index.mjs"]
    }
  }
}
```

Przekaż środowisko poprzez menedżer sekretów usługi/maszyny. `.env.example` jest tylko wzorem.

## Narzędzia MCP

| Nazwa | Czynność |
|---|---|
| `edoreczenia_list_mailboxes` | widoczne skrzynki i status ich konfiguracji |
| `edoreczenia_list_messages` | lista / metadane (bez otwierania pism) |
| `edoreczenia_read_message` | odczyt wskazanej wiadomości — możliwy skutek prawny |
| `edoreczenia_evidences` | lista dowodów nadania/doręczenia |
| `edoreczenia_create_draft` | zapis projektu bez wysyłki |
| `edoreczenia_list_drafts` | projekty dostępne danemu procesowi |
| `edoreczenia_get_draft` | treść i SHA-256 projektu |
| `edoreczenia_send_approved` | wysyłka **wyłącznie** po osobnej akceptacji człowieka |

## Bezpieczeństwo wysyłki

- Domyślnie `EDO_ENABLE_LIVE_SEND=NO`.
- Do faktycznej wysyłki trzeba przygotować `uaPayload` **zgodny z oficjalnym schematem POST /{eDeliveryAddress}/messages UA API 3.0.8**. Funkcja nie próbuje zgadywać formatu dokumentów czy odbiorców; niezweryfikowany JSON zostanie odrzucony przez operatora.
- Uruchom lokalnie `node src/approve.mjs <draftUUID>` w interaktywnym terminalu. CLI wyświetla całą treść, odbiorców i kompletny payload, a następnie wymaga dosłownego `ZATWIERDZAM <pierwsze-12-znaków-SHA>`.
- Serwer **nie** publikuje narzędzia zatwierdzającego projekt. Model nie może zatwierdzić własnego pisma wyłącznie poprzez MCP.
- Dopiero `EDO_ENABLE_LIVE_SEND=YES` i `edoreczenia_send_approved` uruchomią pojedyncze POST.
- Wysyłka UA API 3 jest asynchroniczna. Odpowiedź na żądanie nie oznacza jeszcze doręczenia. Brak automatycznego retry: przy niepewnym wyniku zapis `unknown` i obowiązkowa weryfikacja w portalu / statusie zadania.

## Do podłączenia w kolejnej fazie

- Produkcyjne certyfikaty i grant do wszystkich ADE.
- Pełny login i odświeżanie delegowanych uprawnień prywatnej skrzynki.
- Konwersja formularza pisma do zweryfikowanego OpenAPI v3.0.8 (`uaPayload`) z poprawną obsługą MIME i załączników.
- Weryfikacja statusów `messages/tasks` i utrwalanie dowodów jako niezmienialnych dokumentów.
- Bezpieczny adapter HTTP dla panelu Finance You z per-user RBAC; nie wolno przekazywać tokenów API/PEM do przeglądarki.

## Dokumentacja

- Oficjalne API: https://www.gov.pl/web/e-doreczenia/interfejsy-api
- Instrukcje: https://www.gov.pl/web/e-doreczenia/integracja-uslugi-e-doreczen-z-systemami-klasy-ezd
- Projekt Techniczny: https://edoreczenia.poczta-polska.pl/wp-content/uploads/2025/09/COI-Projekt-Techniczny-UA-API_5.27-1.pdf

## Uwagi operacyjne

Tryb `EDO_ENV=prod` i aktywacja wysyłki to oddzielne decyzje. Korespondencja do prywatnych podmiotów może wymagać płatnej usługi operatora. Nie pobieraj pełnych wiadomości w harmonogramie monitorującym.
