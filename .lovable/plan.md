# Diagnoza geokodowania (tylko odczyt, bez zmian w kodzie)

## Odpowiedzi
1. Konektor: **Mapbox** (połączenie „Finance's Mapbox”, podpięte do projektu). **Google Maps nie jest już podłączony** — nie ma go na liście połączeń, a sekretu `GOOGLE_MAPS_API_KEY` brakuje.
2. Sekrety: `MAPBOX_API_KEY` (po stronie serwera) oraz `VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN` (publiczny token pk., tylko dla przeglądarki).
3. Bramka: `https://connector-gateway.lovable.dev/mapbox/geocoding/v5/mapbox.places/{adres}.json?limit=1&country=pl`
   Nagłówki: `Authorization: Bearer ${LOVABLE_API_KEY}` oraz `X-Connection-Api-Key: ${MAPBOX_API_KEY}`.
4. Test „Komandosów 12, Kraków”:
   - Mapbox: **HTTP 400 `secret_token_required`** — połączenie ma tylko publiczny token (pk.). Geokodowanie po stronie serwera wymaga tokenu tajnego (sk.). Współrzędnych nie udało się pobrać.
   - google_maps: **HTTP 401 „Credential not found”**.

## Przyczyna
Kod dalej woła google_maps, a tego połączenia już nie ma (stąd „brak współrzędnych”). Samo przepięcie na Mapbox też nie wystarczy, dopóki do połączenia Mapbox nie zostanie dodany token sk.

## Kroki do naprawy (po zgodzie)
1. Właściciel dodaje token sk. do połączenia Mapbox w ustawieniach Connectors (albo ponownie podłącza Google Maps).
2. Ponawiam test geokodowania.
3. Dopiero potem, jeśli zostajemy przy Mapbox, przepinam geokodowanie w dwóch plikach. Wyszukiwanie punktów w okolicy (szkoły, sklepy) też trzeba będzie przenieść na Mapbox lub OSM.
