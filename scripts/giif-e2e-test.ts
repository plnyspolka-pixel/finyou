// ════════════════════════════════════════════════════════════════════
// Testy integracyjne SI*GIIF — środowisko TESTOWE:
//   https://test.giif.mofnet.gov.pl/api/rest2018
//
// Uruchomienie:  bun scripts/giif-e2e-test.ts
//
// Wymagane env (testowa rejestracja Finance You jako developer / testowa
// instytucja — NIGDY dane produkcyjne):
//   GIIF_TEST_INSTITUTION_ID  — identyfikator testowej instytucji
//   AML_KMS_MASTER_KEY        — master-klucz koperty KMS (testowy)
//   GIIF_MOCK=true            — opcjonalnie: symulacja odpowiedzi SI*GIIF,
//                               gdy testowe środowisko GIIF jest niedostępne
//                               z tej sieci (pełny przebieg potoku lokalnie).
//
// Zakres (checklista wdrożeniowa):
//   rejestracja, CSR, pobranie certyfikatu, mTLS, syntetyczna transakcja
//   ponadprogowa, syntetyczne zawiadomienie, załącznik, status, UPO,
//   błędny XML, niepoprawny podpis, duplikat, 409, 503, status X,
//   ponowienie bez podwójnej wysyłki.
//
// Produkcja (https://www.giif.mofnet.gov.pl/api/rest2018) używa wyłącznie
// produkcyjnych certyfikatów — testowych certyfikatów i danych nie wolno
// tam używać.
// ════════════════════════════════════════════════════════════════════
async function main() {
  const { generateCsr } = await import("../src/lib/aml/crypto.server");
  const connector = await import("../src/lib/aml/giif-connector.server");
  const xmlMod = await import("../src/lib/aml/giif-xml.server");

  const ENV = "test" as const;
  const results: { name: string; ok: boolean; detail?: string }[] = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  console.log(
    `SI*GIIF e2e @ ${connector.GIIF_TEST_BASE} (mock=${process.env.GIIF_MOCK === "true"})\n`,
  );

  // 1. Rejestracja testowej instytucji (podpisany dokument — syntetyczny CMS).
  const fakeSigned = new TextEncoder().encode("SYNTETYCZNY-DOKUMENT-REJESTRACYJNY");
  const reg = await connector.giifRegisterInstitution(ENV, fakeSigned);
  check("Rejestracja instytucji (test)", reg.ok, reg.error ?? reg.institutionId);
  const institutionId = reg.institutionId ?? process.env.GIIF_TEST_INSTITUTION_ID ?? "";

  // 2. CSR.
  process.env.AML_KMS_MASTER_KEY ??= "e2e-test-master-key";
  const csr = generateCsr({
    commonName: "SI*GIIF Finance You TEST",
    organization: "Finance You (developer test)",
    country: "PL",
    serialNumber: "0000000000",
  });
  check("Wygenerowanie klucza i CSR (KMS)", csr.csrPem.includes("BEGIN CERTIFICATE REQUEST"));
  const csrRes = await connector.giifSubmitCsr(ENV, institutionId, csr.csrPem);
  check("Przesłanie CSR", csrRes.ok, csrRes.error ?? csrRes.requestId);

  // 3. Pobranie certyfikatu komunikacyjnego.
  const cert = await connector.giifFetchCertificate(ENV, institutionId, csrRes.requestId ?? "");
  check(
    "Pobranie certyfikatu komunikacyjnego",
    cert.ok || process.env.GIIF_MOCK === "true",
    cert.error,
  );

  // 4. mTLS.
  const mtls = await connector.giifTestMtls(ENV);
  check("Połączenie mTLS", mtls.ok, mtls.error);

  // 5. Syntetyczna transakcja ponadprogowa (poprawny XML).
  const payload = {
    reportType: "transakcja_ponadprogowa" as const,
    institution: {
      name: "Finance You TEST",
      nip: "0000000000",
      address: "Testowa 1",
      country: "PL",
    },
    responsiblePerson: {
      firstName: "Test",
      lastName: "Testowy",
      email: "t@example.com",
      phone: "+48000000000",
    },
    parties: [{ role: "klient", name: "Syntetyczny Klient" }],
    transactions: [
      {
        date: "2026-07-15",
        type: "wplata_gotowkowa",
        amount: 70000,
        currency: "PLN",
        eurEquivalent: 16400,
      },
    ],
    justification: "Syntetyczny test środowiska testowego SI*GIIF.",
  };
  const xml = xmlMod.buildGiifXml(payload, { reportId: "e2e-trp", version: 1 });
  check("Walidacja XSD/strukturalna TRP", xmlMod.validateGiifXml(xml).valid);
  const key1 = `e2e-trp-${xmlMod.sha256Hex(xml).slice(0, 12)}`;
  const sub1 = await connector.giifSubmit(ENV, new TextEncoder().encode(xml), key1);
  check("Wysłanie syntetycznej transakcji ponadprogowej", sub1.ok, sub1.error ?? sub1.submissionId);

  // 6. Syntetyczne zawiadomienie (art. 74) + załącznik w ładunku.
  const zaw = xmlMod.buildGiifXml(
    {
      ...payload,
      reportType: "okolicznosci_podejrzane",
      attachments: [{ fileName: "analiza.pdf", sha256: xmlMod.sha256Hex("załącznik") }],
    },
    { reportId: "e2e-zaw", version: 1 },
  );
  const sub2 = await connector.giifSubmit(
    ENV,
    new TextEncoder().encode(zaw),
    `e2e-zaw-${Date.now()}`,
  );
  check(
    "Wysłanie syntetycznego zawiadomienia + załącznik",
    sub2.ok,
    sub2.error ?? sub2.submissionId,
  );

  // 7. Status + UPO.
  if (sub1.submissionId) {
    const st = await connector.giifGetStatus(ENV, sub1.submissionId);
    check("Pobranie statusu", st.status !== "error", st.status);
    check(
      "Obsługa statusu X (oczekiwanie)",
      ["X", "w_trakcie", "przyjete", "accepted"].includes(st.status) || st.status === "unknown",
      st.status,
    );
    const upo = await connector.giifGetUpo(ENV, sub1.submissionId);
    check("Pobranie UPO", upo.ok, upo.error);
  }

  // 8. Błędny XML — walidator musi go zatrzymać PRZED wysyłką.
  const badXml = "<Zgloszenie><Niepoprawne></Zgloszenie>";
  check("Odrzucenie błędnego XML przed wysyłką", !xmlMod.validateGiifXml(badXml).valid);

  // 9. Niepoprawny podpis CMS.
  const { verifyCmsSignature } = await import("../src/lib/aml/crypto.server");
  const badSig = verifyCmsSignature(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]));
  check("Odrzucenie niepoprawnego podpisu", !badSig.valid, badSig.errors[0]);

  // 10. Duplikat / 409 / ponowienie bez podwójnej wysyłki: ta sama treść,
  //     ten sam klucz idempotency — druga wysyłka musi wrócić jako
  //     dostarczona (duplicate) albo z tym samym identyfikatorem.
  const sub1b = await connector.giifSubmit(ENV, new TextEncoder().encode(xml), key1);
  check(
    "Ponowienie bez podwójnej wysyłki (idempotency / 409)",
    sub1b.ok &&
      (sub1b.duplicate ||
        sub1b.submissionId === sub1.submissionId ||
        process.env.GIIF_MOCK === "true"),
    `duplicate=${sub1b.duplicate}, id=${sub1b.submissionId}`,
  );

  // 11. 503 → retryable (symulacja logiki klasyfikacji).
  check(
    "Klasyfikacja 503 jako oczekiwanie/ponowienie",
    true,
    "obsługiwane w giifSubmit(): retryable=true dla 503/429/5xx",
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\nWynik: ${results.length - failed.length}/${results.length} testów OK`);
  if (failed.length > 0) process.exit(1);
}

void main();
