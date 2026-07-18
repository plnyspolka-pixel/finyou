---
name: KW - założenia bazowe
description: Reguły przyjmowane zawsze przy analizie księgi wieczystej (dział II PESEL, lokalizacja).
type: feature
---
Przy analizie każdej KW przyjmujemy jako pewnik:
- W dziale II KW ZAWSZE jest co najmniej jeden PESEL właściciela — można go użyć jako źródła PESEL do analizy właściciela (fallback, gdy brak PESEL w rekordzie klienta).
- Z KW ZAWSZE da się ustalić co najmniej miejscowość położenia nieruchomości (dział I-O).

Implikacje w kodzie:
- `analyzeOwner` (owner-analysis.server.ts) — jeśli nie ma PESEL w `clients`, sięga po PESEL z działu II KW; nie traktuj tego jako edge case.
- Analiza lokalizacji/ryzyka może zakładać dostępność miejscowości; brak miasta = błąd parsowania KW, nie brak danych.
