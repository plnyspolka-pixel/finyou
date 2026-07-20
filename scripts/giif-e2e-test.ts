// ════════════════════════════════════════════════════════════════════
// Testy integracyjne SI*GIIF.
//
// Dokumentacja REST API jest PUBLICZNA: https://giif.mofnet.gov.pl/api/
// (uwaga: część ścieżek w dokumentacji zawiera literówkę „instutucje" —
// właściwy wariant potwierdza wyłącznie test na środowisku testowym).
//
// Tryby:
//   GIIF_MOCK=true                  → test lokalny; wynik co najwyżej
//                                     local_mock_verified. Mock NIE testuje
//                                     mTLS, zgodności endpointów, przyjęcia
//                                     podpisu ani UPO.
//   GIIF_MOCK=false GIIF_ENV=test   → prawdziwe testowe SI*GIIF
//                                     (test.giif.mofnet.gov.pl); wynik
//                                     giif_test_verified WYŁĄCZNIE po
//                                     otrzymaniu rzeczywistej odpowiedzi
//                                     i pobraniu rzeczywistego testowego UPO.
//   GIIF_ENV=production             → ZABLOKOWANE. Skrypt nie obsługuje
//                                     produkcji bez dodatkowego jawnego
//                                     zabezpieczenia
//                                     (GIIF_ALLOW_PRODUCTION=TAK_ROZUMIEM_RYZYKO
//                                     — celowo nieudokumentowane szerzej).
//
// Uruchomienie:  bun scripts/giif-e2e-test.ts
// Test live wymaga maszyny/CI z dostępem sieciowym do test.giif.mofnet.gov.pl
// oraz testowej rejestracji Finance You (developer / testowa instytucja).
// Nigdy nie używaj testowych certyfikatów i danych w produkcji.
//
// Statusy weryfikacji integracji:
//   local_mock_verified — lokalny przepływ aplikacji działa (mock),
//   giif_test_pending   — prawdziwe testy SI*GIIF nie zostały wykonane,
//   giif_test_verified  — rzeczywista odpowiedź testowego SI*GIIF + testowe UPO.
// ════════════════════════════════════════════════════════════════════
type VerificationStatus = "local_mock_verified" | "giif_test_pending" | "giif_test_verified";

async function main() {
  const mock = process.env.GIIF_MOCK !== "false"; // domyślnie mock — live tylko świadomie
  const giifEnv = process.env.GIIF_ENV ?? "test";
  if (giifEnv === "production" && process.env.GIIF_ALLOW_PRODUCTION !== "TAK_ROZUMIEM_RYZYKO") {
    console.error(
      "❌ Ten skrypt nie obsługuje środowiska produkcyjnego bez jawnego zabezpieczenia.",
    );
    process.exit(2);
  }
  if (mock) process.env.GIIF_MOCK = "true";

  const { generateCsr, verifyCmsSignature } = await import("../src/lib/aml/crypto.server");
  const connector = await import("../src/lib/aml/giif-connector.server");
  const xmlMod = await import("../src/lib/aml/giif-xml.server");

  const ENV = "test" as const;
  const ORG = "e2e-local-test"; // identyfikator organizacji na potrzeby providera mTLS
  const results: { name: string; ok: boolean; detail?: string }[] = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  console.log(
    `SI*GIIF e2e @ ${connector.GIIF_TEST_BASE} (tryb: ${mock ? "MOCK — tylko lokalny przepływ" : "LIVE test"})\n`,
  );

  // Dowody wymagane do giif_test_verified (tylko tryb live).
  let realSubmissionId: string | null = null;
  let realUpo = false;
  let encryptionCertFingerprint: string | null = null;

  // 0. (live) Certyfikat szyfrujący z publicznego GET /certyfikatSzyfrowania.
  if (!mock) {
    try {
      const { getGiifEncryptionCert } = await import("../src/lib/aml/giif-encryption-cert.server");
      const cert = await getGiifEncryptionCert(ENV);
      encryptionCertFingerprint = cert.fingerprintSha256;
      check(
        "Pobranie certyfikatu szyfrującego (/certyfikatSzyfrowania)",
        true,
        `fingerprint ${cert.fingerprintSha256.slice(0, 16)}…, ważny do ${cert.validTo}`,
      );
    } catch (e) {
      check("Pobranie certyfikatu szyfrującego (/certyfikatSzyfrowania)", false, String(e));
    }
  }

  // 1. Rejestracja testowej instytucji (podpisany dokument — syntetyczny CMS).
  const fakeSigned = new TextEncoder().encode("SYNTETYCZNY-DOKUMENT-REJESTRACYJNY");
  const reg = await connector.giifRegisterInstitution(ENV, ORG, fakeSigned);
  check("Rejestracja instytucji (test)", reg.ok, reg.error ?? reg.institutionId);
  const institutionId = reg.institutionId ?? process.env.GIIF_TEST_INSTITUTION_ID ?? "";

  // 2. CSR.
  process.env.AML_ENVELOPE_MASTER_KEY ??= "e2e-test-master-key";
  const csr = generateCsr({
    commonName: "SI*GIIF Finance You TEST",
    organization: "Finance You (developer test)",
    country: "PL",
    serialNumber: "0000000000",
  });
  check("Wygenerowanie klucza i CSR", csr.csrPem.includes("BEGIN CERTIFICATE REQUEST"));
  const csrRes = await connector.giifSubmitCsr(ENV, ORG, institutionId, csr.csrPem);
  check("Przesłanie CSR", csrRes.ok, csrRes.error ?? csrRes.requestId);

  // 3. Pobranie certyfikatu komunikacyjnego.
  const cert = await connector.giifFetchCertificate(
    ENV,
    ORG,
    institutionId,
    csrRes.requestId ?? "",
  );
  check("Pobranie certyfikatu komunikacyjnego", cert.ok || mock, cert.error);

  // 4. mTLS.
  const mtls = await connector.giifTestMtls(ENV, ORG);
  check(
    mock ? "mTLS (SYMULACJA — nie testuje realnego mTLS)" : "Połączenie mTLS (live)",
    mtls.ok,
    mtls.error,
  );

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
  check("Walidacja strukturalna TRP", xmlMod.validateGiifXml(xml).valid);
  const key1 = `e2e-trp-${xmlMod.sha256Hex(xml).slice(0, 12)}`;
  const sub1 = await connector.giifSubmit(ENV, ORG, new TextEncoder().encode(xml), key1);
  check("Wysłanie syntetycznej transakcji ponadprogowej", sub1.ok, sub1.error ?? sub1.submissionId);
  if (!mock && sub1.ok && sub1.submissionId) realSubmissionId = sub1.submissionId;

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
    ORG,
    new TextEncoder().encode(zaw),
    `e2e-zaw-${Date.now()}`,
  );
  check(
    "Wysłanie syntetycznego zawiadomienia + załącznik",
    sub2.ok,
    sub2.error ?? sub2.submissionId,
  );

  // 7. Status + UPO (obsługa 503 realizowana przez retryable w giifSubmit).
  if (sub1.submissionId) {
    const st = await connector.giifGetStatus(ENV, ORG, sub1.submissionId);
    check("Pobranie statusu", st.status !== "error", st.status);
    check(
      "Obsługa statusu X (oczekiwanie)",
      ["X", "w_trakcie", "przyjete", "accepted", "unknown"].includes(st.status),
      st.status,
    );
    const upo = await connector.giifGetUpo(ENV, ORG, sub1.submissionId);
    check(
      mock
        ? "UPO (SYMULACJA — to nie jest rzeczywiste UPO)"
        : "Pobranie rzeczywistego testowego UPO",
      upo.ok,
      upo.error,
    );
    if (!mock && upo.ok && upo.upoXml) realUpo = true;
  }

  // 8. Błędny XML — walidator musi go zatrzymać PRZED wysyłką.
  check(
    "Odrzucenie błędnego XML przed wysyłką",
    !xmlMod.validateGiifXml("<Zgloszenie><Niepoprawne></Zgloszenie>").valid,
  );

  // 9. Niepoprawny podpis CMS.
  const badSig = verifyCmsSignature(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]));
  check("Odrzucenie niepoprawnego podpisu", !badSig.valid, badSig.errors[0]);

  // 10. Duplikat / 409 / ponowienie bez podwójnej wysyłki: ta sama treść,
  //     ten sam klucz idempotency — druga wysyłka musi wrócić jako
  //     dostarczona (duplicate) albo z tym samym identyfikatorem.
  const sub1b = await connector.giifSubmit(ENV, ORG, new TextEncoder().encode(xml), key1);
  check(
    "Ponowienie bez podwójnej wysyłki (idempotency / 409)",
    sub1b.ok && (sub1b.duplicate || sub1b.submissionId === sub1.submissionId),
    `duplicate=${sub1b.duplicate}, id=${sub1b.submissionId}`,
  );

  // ── Wynik i status weryfikacji ────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  const allOk = failed.length === 0;
  let status: VerificationStatus = "giif_test_pending";
  if (!mock && allOk && realSubmissionId && realUpo) {
    status = "giif_test_verified"; // wyłącznie rzeczywista odpowiedź + rzeczywiste UPO
  } else if (mock && allOk) {
    status = "local_mock_verified";
  }

  console.log(`\nWynik: ${results.length - failed.length}/${results.length} kroków OK`);
  console.log(`Status weryfikacji integracji: ${status}`);
  if (status === "local_mock_verified" || status === "giif_test_pending") {
    console.log(
      "Lokalny potok został przetestowany z mockiem. mTLS, rzeczywiste endpointy, walidacja " +
        "SI*GIIF i UPO wymagają jeszcze testu na oficjalnym środowisku GIIF.",
    );
  }
  if (status === "giif_test_verified") {
    console.log(
      JSON.stringify(
        {
          status,
          realSubmissionId,
          realUpo,
          encryptionCertFingerprint,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  if (failed.length > 0) process.exit(1);
}

void main();
