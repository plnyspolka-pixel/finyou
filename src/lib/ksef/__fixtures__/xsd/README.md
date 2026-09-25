Oficjalne schematy FA(3) z https://github.com/CIRFMF/ksef-docs (`faktury/schemy/FA`),
licencja MIT. Jedyna zmiana: import `StrukturyDanych_v10-0E.xsd` wskazuje plik lokalny
(`bazowe/`) zamiast adresu crd.gov.pl — dzięki temu testy walidują XML bez sieci.
Używane wyłącznie przez `src/lib/ksef/fa3-xml.test.ts`.
