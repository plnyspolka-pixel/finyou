---
name: KW - założenia bazowe
description: Reguły przyjmowane zawsze przy analizie księgi wieczystej (dział II PESEL, lokalizacja).
type: feature
---
Przy analizie każdej KW przyjmujemy jako pewnik:
- W dziale II KW właścicielem jest ALBO osoba fizyczna (wtedy ZAWSZE jest co najmniej jeden PESEL), ALBO spółka/firma (wtedy zamiast PESEL jest KRS i/lub NIP). Jedno z tych ID zawsze da się wyciągnąć.
- Z KW ZAWSZE da się ustalić co najmniej miejscowość położenia nieruchomości (dział I-O).

Implikacje w kodzie:
- `analyzeOwner` (owner-analysis.server.ts) — dla osoby fizycznej fallback PESEL z działu II KW; dla właściciela instytucjonalnego użyj KRS/NIP z działu II (ścieżka firmowa, nie PESEL-owa). Rozpoznawaj typ właściciela przed wyborem ścieżki analizy.
- Parser KW (kw-parser.server.ts) musi zwracać typ właściciela (`person` | `company`) oraz odpowiednie ID (PESEL vs KRS/NIP); brak jakiegokolwiek ID = błąd parsowania.
- Analiza lokalizacji/ryzyka może zakładać dostępność miejscowości; brak miasta = błąd parsowania KW, nie brak danych.
