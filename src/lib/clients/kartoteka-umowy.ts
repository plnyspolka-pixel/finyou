// Dane z kartoteki klienta → szkic umowy (pkt 3 i 9 zlecenia „przypadki
// graniczne"). PESEL, numer dokumentu tożsamości i rachunek do wypłaty mają
// dedykowane pola klienta (dokument i rachunek szyfrowane); draft_contract
// z `profile_id` pobiera je automatycznie zamiast z notatek. Nazwisko —
// z CEIDG (aktualne dane przedsiębiorcy). Moduł czysty.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CeidgActivity } from "@/lib/risk-assessment/types";
import type { KorektaGroszowa } from "@/lib/contract-engine/schedule";
import { normNazwy, wielkaLiteraNazwy } from "./identity-core";

export interface KartotekaKlienta {
  first_name: string | null;
  last_name: string | null;
  pesel: string | null;
  nip: string | null;
  /** Odszyfrowany numer dokumentu tożsamości, np. „dowód osobisty nr ABC123456”. */
  id_document: string | null;
  /** Odszyfrowany rachunek do wypłaty. */
  payout_account: string | null;
  ceidg: CeidgActivity | null;
}

function pusty(v: unknown): boolean {
  return v == null || String(v).trim() === "";
}

/** „ABC123456” → „dowód osobisty nr ABC123456”; pełny opis zostaje bez zmian. */
export function opisDokumentu(v: string): string {
  const t = v.trim();
  return /^[A-Z]{3}\s?\d{6}$/i.test(t)
    ? `dowód osobisty nr ${t.replace(/\s/g, "").toUpperCase()}`
    : t;
}

/** Uzupełnia szkic umowy danymi z kartoteki (mutuje `szkic`). */
export function scalKartotekeDoUmowy(szkic: any, k: KartotekaKlienta): KorektaGroszowa[] {
  const out: KorektaGroszowa[] = [];
  const pb = szkic?.pozyczkobiorca;
  // Tylko jeden pożyczkobiorca-osoba fizyczna jest jednoznacznie klientem z kartoteki.
  const s = pb && !Array.isArray(pb) && pb.typ === "osoba_fizyczna" ? pb : null;
  if (s) {
    if (pusty(s.pesel) && /^\d{11}$/.test(String(k.pesel ?? ""))) {
      s.pesel = k.pesel;
      out.push({ sciezka: "pozyczkobiorca.pesel", komunikat: "PESEL z kartoteki klienta." });
    }
    if (pusty(s.dokument_tozsamosci) && !pusty(k.id_document)) {
      s.dokument_tozsamosci = opisDokumentu(k.id_document!);
      out.push({
        sciezka: "pozyczkobiorca.dokument_tozsamosci",
        komunikat: "Dokument tożsamości z kartoteki klienta (pole szyfrowane).",
      });
    }
    if (pusty(s.nip) && /^\d{10}$/.test(String(k.nip ?? ""))) s.nip = k.nip;

    // Nazwisko z CEIDG (pewny wpis po NIP, imię zgodne) — aktualne dane przedsiębiorcy.
    const c = k.ceidg?.company;
    const pewny = k.ceidg?.matchConfidence === "high" && k.ceidg?.status === "aktywny";
    if (pewny && c?.ownerLastName && c?.ownerFirstName && !pusty(s.imie_nazwisko)) {
      const czesci = String(s.imie_nazwisko).trim().split(/\s+/);
      const imie = czesci[0];
      if (normNazwy(imie) === normNazwy(c.ownerFirstName).split(" ")[0]) {
        const nazwisko = wielkaLiteraNazwy(c.ownerLastName);
        const obecne = czesci.slice(1).join(" ");
        if (normNazwy(obecne) !== normNazwy(nazwisko)) {
          const nowe = `${czesci.slice(0, czesci.length > 2 ? 2 : 1).join(" ")} ${nazwisko}`;
          out.push({
            sciezka: "pozyczkobiorca.imie_nazwisko",
            komunikat: `Imię i nazwisko z CEIDG (NIP ${c.nip ?? k.nip}): „${s.imie_nazwisko}” → „${nowe}”.`,
          });
          s.imie_nazwisko = nowe;
        }
      }
    }
    if (pusty(s.data_rozpoczecia_dzialalnosci) && c?.startDate && pewny) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(c.startDate);
      if (m) s.data_rozpoczecia_dzialalnosci = `${m[3]}.${m[2]}.${m[1]}`;
    }
  }
  const w = szkic?.warunki;
  if (w && !pusty(k.payout_account)) {
    w.rachunki ??= {};
    if (pusty(w.rachunki.wyplata)) {
      w.rachunki.wyplata = String(k.payout_account).trim();
      out.push({
        sciezka: "warunki.rachunki.wyplata",
        komunikat: "Rachunek do wypłaty z kartoteki klienta (pole szyfrowane).",
      });
    }
  }
  return out;
}
