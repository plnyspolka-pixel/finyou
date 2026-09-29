/**
 * Jeden zestaw statusów wniosku (Etap 4): mapowanie starych kodów, etykiety
 * dla każdego statusu, etapy klienta, propozycje automatu (nigdy odrzucenie).
 */
import { describe, it, expect } from "vitest";
import {
  CLIENT_STATUS_DESCRIPTIONS,
  CLIENT_STATUS_LABELS,
  LEGACY_STATUS_MAP,
  LOAN_STATUS_LABELS,
  LOAN_STATUS_ORDER,
  LOAN_STATUS_SHORT_LABELS,
  REJECTING_STATUSES,
  clientLoanStatusView,
  describeLoanStatusForAgent,
  isRejectingStatus,
  normalizeLoanStatus,
  proposeAutoStatus,
} from "./loan-status";

describe("zestaw statusów", () => {
  it("25 statusów kanonicznych wg zlecenia, każdy z kompletem etykiet", () => {
    expect(LOAN_STATUS_ORDER).toHaveLength(25);
    for (const s of LOAN_STATUS_ORDER) {
      expect(LOAN_STATUS_SHORT_LABELS[s]).toBeTruthy();
      expect(LOAN_STATUS_LABELS[s]).toBeTruthy();
      expect(CLIENT_STATUS_LABELS[s]).toBeTruthy();
      expect(CLIENT_STATUS_DESCRIPTIONS[s]).toBeTruthy();
      const v = clientLoanStatusView(s);
      expect(v.stage_index).toBeGreaterThanOrEqual(0);
    }
  });

  it("mapuje stare statusy zgodnie z migracją", () => {
    expect(normalizeLoanStatus("kontakt")).toBe("do_kontaktu");
    for (const old of ["kompletowanie_danych", "brak_kw", "brak_zdjec_dokumentow", "brak_kwoty"]) {
      expect(normalizeLoanStatus(old)).toBe("braki_w_dokumentach");
    }
    expect(normalizeLoanStatus("szukamy_inwestora")).toBe("wyslany_do_inwestorow");
    expect(normalizeLoanStatus("warunki_zaakceptowane")).toBe("zaakceptowany_przez_klienta");
    expect(normalizeLoanStatus("dokumenty_przygotowanie_umowy")).toBe("do_umowy");
    expect(normalizeLoanStatus("notariusz")).toBe("oczekuje_ustanowienia_zabezpieczen");
    expect(normalizeLoanStatus("zamkniete")).toBe("zamkniety");
    expect(Object.keys(LEGACY_STATUS_MAP)).toHaveLength(10);
    // nowe kody przechodzą bez zmian; nieznane → nowy_lead
    expect(normalizeLoanStatus("oferta_od_inwestora")).toBe("oferta_od_inwestora");
    expect(normalizeLoanStatus("cokolwiek")).toBe("nowy_lead");
    expect(normalizeLoanStatus(null)).toBe("nowy_lead");
  });

  it("etapy klienta idą tylko do przodu wzdłuż ścieżki głównej", () => {
    const main = LOAN_STATUS_ORDER.filter(
      (s) => !["nie_rokuje", "wniosek_odrzucony", "brak_kontaktu"].includes(s),
    );
    let last = -1;
    for (const s of main) {
      const idx = clientLoanStatusView(s).stage_index;
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
    expect(clientLoanStatusView("zamkniety").is_closed).toBe(true);
    expect(clientLoanStatusView("wyplacony").is_closed).toBe(true);
  });

  it("teksty klienta nie obiecują kontaktu analityka ani oddzwonienia", () => {
    for (const s of LOAN_STATUS_ORDER) {
      expect(CLIENT_STATUS_DESCRIPTIONS[s]).not.toMatch(/skontaktuje|oddzwoni|odezwie|analityk/);
    }
  });

  it("voicebot: statusy odrzucające → is_rejected, wypłacony/zamknięty → is_completed", () => {
    expect(describeLoanStatusForAgent("nie_rokuje").is_rejected).toBe(true);
    expect(describeLoanStatusForAgent("wniosek_odrzucony").is_rejected).toBe(true);
    expect(describeLoanStatusForAgent("wyslany_do_inwestorow").is_rejected).toBe(false);
    expect(describeLoanStatusForAgent("wyplacony").is_completed).toBe(true);
    expect(describeLoanStatusForAgent("oferta_przekazana_klientowi").is_decision_available).toBe(
      true,
    );
  });
});

describe("propozycje automatu (decyzja nr 11)", () => {
  it("statusy odrzucające nigdy nie są nadawane automatycznie — tylko proponowane", () => {
    for (const r of REJECTING_STATUSES) {
      expect(isRejectingStatus(r)).toBe(true);
      const p = proposeAutoStatus("do_analizy", r, "LTV powyżej limitu");
      expect(p.apply).toBeNull();
      expect(p.suggest).toBe(r);
      expect(p.reason).toBe("LTV powyżej limitu");
    }
  });

  it("zwykłe statusy automat może nadać; brak zmiany → nic", () => {
    expect(proposeAutoStatus("nowy_lead", "braki_w_dokumentach")).toEqual({
      apply: "braki_w_dokumentach",
      suggest: null,
      reason: null,
    });
    expect(proposeAutoStatus("braki_w_dokumentach", "braki_w_dokumentach").apply).toBeNull();
  });

  it("statusów końcowych automat nie nadpisuje", () => {
    expect(proposeAutoStatus("zamkniety", "braki_w_dokumentach").apply).toBeNull();
    expect(proposeAutoStatus("wniosek_odrzucony", "wniosek_kompletny").apply).toBeNull();
    expect(proposeAutoStatus("nie_rokuje", "nie_rokuje").suggest).toBeNull();
  });
});
