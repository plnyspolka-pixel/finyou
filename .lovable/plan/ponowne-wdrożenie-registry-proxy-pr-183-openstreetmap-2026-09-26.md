# Ponowne wdrożenie registry-proxy (PR #183, OpenStreetMap)

Nie ruszam kodu i niczego nie publikuję. Przepięcia na Mapbox nie wdrażam.

## Stan
Projekt nie ma jeszcze PR #183. Najnowszy commit to merge PR #181 (0aa46c9d). W `registry-proxy` nie ma jeszcze adresów nominatim.openstreetmap.org ani overpass-api.de.

## Kroki
1. Poczekać, aż Lovable pobierze main z PR #183, i sprawdzić, że w `supabase/functions/registry-proxy/index.ts` są oba adresy OSM.
2. Wdrożyć funkcję `registry-proxy` w wersji z main.
3. Test wdrożenia (tylko odczyt):
   - Nominatim: `https://nominatim.openstreetmap.org/search?q=Komandosów 12, Kraków&format=json&limit=1`. Oczekiwane: HTTP 200 i współrzędne.
   - Overpass: jedno małe zapytanie o sklepy w promieniu 500 m. Oczekiwane: HTTP 200.
   - Kontrola, że CEIDG i wykaz VAT dalej działają.
4. Podać wyniki. Bez publikacji.

Jeśli PR #183 nie pojawi się w projekcie, zatrzymam się i napiszę o tym, zamiast wdrażać starą wersję.
