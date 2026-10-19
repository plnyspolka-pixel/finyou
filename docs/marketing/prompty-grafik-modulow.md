# Prompty do grafik — karty modułów na /dla-inwestora

Grafiki do sekcji „Szkolenie i narzędzia w jednym abonamencie” (karty modułów)
i do hero podstron `/dla-inwestora/<moduł>`. Każda karta to **slajder**: pierwsza
grafika (`image`) + dodatkowe slajdy (`slides`) przewijane co 4,5 s. Dane kart:
`src/components/marketing/investor-modules.ts`.

## Zasady wspólne (dopisz do każdego promptu)

- **Format:** 1536 × 1024 px (3:2), eksport do `.webp`, jakość ok. 82, do 250 KB.
- **Bez logo, ikon i emblematów w rogu.** Dotychczasowe grafiki miały w lewym
  górnym rogu ikonkę z kreską, za każdym razem inną — rezygnujemy z niej.
- **Bez tekstu w obrazie** (żadnych nagłówków, etykiet, „pigułek” z napisami).
  Generatory psują polskie znaki, a nazwa i opis modułu są już w karcie pod
  grafiką. Wyjątek: nieczytelne, rozmyte „liczby” na ekranach jako tło.
- **Mniej „AI”:** bez robotów, świecących mózgów, hologramowych twarzy i
  neonowych obwodów. Technologia ma być w tle (laptop, tablet, dokumenty),
  a na pierwszym planie ludzie, nieruchomości i realna praca.
- **Styl i paleta:** fotorealistyczne, kinowe światło, głęboki granat
  (#0a1030–#141c4a) z ciepłymi złotymi akcentami (#f0c667) i chłodnym błękitem
  (#5fa2f6). Spójna seria — ta sama kolorystyka, kąt światła i głębia ostrości.
- **Kompozycja:** główny obiekt w prawych 2/3 kadru, lewa 1/3 spokojniejsza
  (ciemniejsza, rozmyta) — na mobile karta przycina boki, więc nic ważnego
  przy samych krawędziach.
- **Ludzie:** polscy przedsiębiorcy i inwestorzy 30–60 lat, naturalni, w
  stroju smart casual, bez stockowego uśmiechu do kamery.

**Negative prompt (do każdej grafiki):**
`text, letters, words, captions, watermark, logo, icon, emblem, badge, UI labels, robot, android, glowing brain, hologram face, circuit board, neon wires, cartoon, 3d render look, plastic skin, distorted hands, extra fingers, oversaturated`

---

## 1. Szkolenie inwestora — produkt główny (NOWA)

Pliki: `public/marketing/moduly/szkolenie-1.webp`, `-2.webp`, `-3.webp`

**Slajd 1 (okładka):**

> Photorealistic cinematic scene: a focused Polish investor in his 40s sits at a dark walnut desk in a modern home office at dusk, watching a video lesson on a large laptop screen (blurred lecture slide with a house and a simple chart, no readable text). Open notebook with handwritten notes and a fountain pen, a printed property document beside it, a cup of coffee. Warm golden desk lamp light from the left, deep navy blue ambient light, city lights softly blurred through the window. Calm, serious, premium mood. Shallow depth of field, 35mm lens. Wide 3:2 composition, subject in the right two thirds.

**Slajd 2 (program — od strategii po windykację):**

> Photorealistic top-down flat lay on a dark navy desk: seven neat stacks of study materials arranged in an arc — a property floor plan, a land register extract, a loan agreement with a pen, a magnifying glass over a document, a calculator, a small model house, a legal code book with a gold bookmark. Soft warm golden light from the top left, subtle blue rim light, elegant and orderly. No readable text on any paper. Wide 3:2.

**Slajd 3 (nauka w praktyce):**

> Photorealistic scene: two people — an experienced mentor in his 50s and a younger woman investor in her 30s — reviewing a property valuation on a tablet in front of a modern single-family house at golden hour. The mentor points at the house, she takes notes. Warm sunlight, deep blue sky gradient, premium real-estate atmosphere. Natural, candid, no posing. Shallow depth of field. Wide 3:2, people in the right two thirds.

---

## 2. Analityk — ocena ryzyka i wycena

Pliki: `public/marketing/moduly/analityk-1.webp`, `-2.webp`, `-3.webp`

**Slajd 1:**

> Photorealistic close-up of an investor's hands holding a tablet showing an abstract property analysis dashboard (blurred gauges, a donut chart and a map pin, no readable text), with a modern apartment building softly out of focus in the background at dusk. Dark navy tones, warm golden reflections on the tablet edge, subtle blue screen glow. Premium, analytical, calm. Wide 3:2.

**Slajd 2 (księga wieczysta i stan prawny):**

> Photorealistic desk scene: printed land register pages with a gold paperclip, a magnifying glass resting on them, a laptop beside showing a blurred map of a city district. Navy desk surface, warm golden lamp light, shallow depth of field. Calm, meticulous mood. No readable text. Wide 3:2.

**Slajd 3 (płynność i lokalizacja):**

> Photorealistic aerial drone view of a Polish mid-size town at blue hour: residential streets, single-family houses and a few apartment blocks, warm window lights, a river and a main road. A few homes subtly highlighted with a soft golden glow as if selected for analysis. Deep navy sky, cinematic. Wide 3:2.

---

## 3. Kancelaria — umowy i wzory dokumentów

Pliki: `public/marketing/moduly/kancelaria-1.webp`, `-2.webp`, `-3.webp`

**Slajd 1:**

> Photorealistic still life on a dark walnut desk: a neatly printed multi-page agreement with a premium fountain pen, a small brass scale of justice in the background, a closed laptop and a leather document folder. Warm golden side light, deep navy shadows, elegant law-office atmosphere. No readable text. Wide 3:2.

**Slajd 2 (podpis na odległość):**

> Photorealistic scene: a businesswoman in her 40s signs a document on a tablet with a stylus at a bright café table, while on a second blurred screen a man in an office holds a phone — implying remote signing. Natural warm light, navy and gold color grading, candid. No readable text. Wide 3:2.

**Slajd 3 (komplet dokumentów na cały cykl pożyczki):**

> Photorealistic shot of an organized row of document folders in navy and gold on a modern shelf, one folder slightly pulled out with crisp printed pages visible (no readable text), soft warm light, shallow depth of field, premium and orderly. Wide 3:2.

---

## 4. Moduł AML/compliance

Pliki: `public/marketing/moduly/aml-compliance-1.webp`, `-2.webp`, `-3.webp`

**Slajd 1:**

> Photorealistic scene: a compliance officer in his 40s at a tidy desk reviewing an identity verification on a monitor (blurred ID card and portrait thumbnail, no readable text), a printed checklist with ticks beside the keyboard. Navy office at dusk, warm desk lamp, subtle blue screen light. Serious, trustworthy. Wide 3:2.

**Slajd 2 (weryfikacja tożsamości):**

> Photorealistic close-up of a person holding an ID card next to a smartphone camera for remote identity verification, face not shown, shallow depth of field, navy background, warm golden rim light. No readable text on the card. Wide 3:2.

**Slajd 3 (dokumentacja i rejestr):**

> Photorealistic desk with a closed navy binder, a stamp, a printed register sheet with neat rows (unreadable), a pen and a laptop showing a blurred table. Calm, orderly, warm golden light and navy shadows. Wide 3:2.

---

## 5. Windykator — gdy klient nie płaci

Pliki: `public/marketing/moduly/windykator-1.webp`, `-2.webp`, `-3.webp`

**Slajd 1:**

> Photorealistic scene: an investor in his 50s at his desk calmly reviewing a payment schedule on a laptop (blurred timeline, no readable text), phone in hand, printed formal letter in an envelope ready to send. Navy evening office, warm golden lamp light. Composed and in control, not stressful. Wide 3:2.

**Slajd 2 (etapy działań):**

> Photorealistic flat lay: a sequence of items laid left to right on a navy desk — a smartphone with a blurred SMS bubble, an envelope with a formal letter, a signed settlement document, a gavel. Warm golden light, shallow depth of field, clear left-to-right progression. No readable text. Wide 3:2.

**Slajd 3 (zabezpieczenie na nieruchomości):**

> Photorealistic exterior of a solid detached house at blue hour with warm window light, a closed folder with legal documents and a key resting on a stone wall in the foreground, house softly out of focus. Navy and gold palette, calm and reassuring. Wide 3:2.

---

## 6. BONUS: Ogólnopolska sieć sprzedaży

Pliki: `public/marketing/moduly/siec-sprzedazy-1.webp`, `-2.webp`, `-3.webp`

**Slajd 1:**

> Photorealistic night aerial view of Poland at a high altitude, cities glowing with warm golden light connected by thin, subtle light lines forming a network, deep navy atmosphere, gentle curvature of the earth, cinematic. No labels, no country borders drawn, no text. Wide 3:2.

**Slajd 2 (przedsiębiorcy z całej Polski):**

> Photorealistic collage-style single image split into three soft vertical panels: a farmer near a barn, a small shop owner behind a counter, a construction company owner at a building site — each at golden hour, consistent navy and gold color grading, natural and candid. No text. Wide 3:2.

**Slajd 3 (handshake / współpraca):**

> Photorealistic close-up of a firm handshake between an investor and a business owner over a desk with a house key and a folder, a modern house visible blurred through the window. Warm golden light, navy shadows, premium. Wide 3:2.

---

## Jak podpiąć gotowe pliki

1. Wrzuć pliki do `public/marketing/moduly/`.
2. W `src/components/marketing/investor-modules.ts` ustaw w danym module:
   `image: "/marketing/moduly/<slug>-1.webp"` i
   `slides: ["/marketing/moduly/<slug>-2.webp", "/marketing/moduly/<slug>-3.webp"]`.
3. Karta sama zacznie przewijać slajdy (kropki na dole, pauza po najechaniu
   myszą, bez animacji przy ograniczonym ruchu w systemie).

## Stan (19.10.2026)

Grafiki są wygenerowane i podpięte: `public/marketing/moduly/<slug>-1..3.webp`.
Zmiana względem zasad wyżej (decyzja właściciela): na grafikach jest oficjalne
logo financeyou.pl oraz treść — nagłówek, punkty i widżet z danymi (wykres,
skala A–E, oś etapów). Tła generuje AI (Studio, bez tekstu), a tekst, widżety
i logo nakłada kompozytor HTML (Playwright), więc polskie znaki są poprawne.
Liczby w widżetach z przykładowymi danymi mają plakietkę „przykład”.
