import { describe, expect, it } from "vitest";
import {
  CLIENT_STAGES,
  CLIENT_STATUS_DESCRIPTIONS,
  CLIENT_STATUS_LABELS,
  LOAN_STATUS_ORDER,
  clientLoanStatusView,
} from "./loan-status";

describe("clientLoanStatusView", () => {
  it("mapuje każdy status kanoniczny na etykietę, opis i etap", () => {
    for (const status of LOAN_STATUS_ORDER) {
      const view = clientLoanStatusView(status);
      expect(view.status).toBe(status);
      expect(view.label).toBe(CLIENT_STATUS_LABELS[status]);
      expect(view.description).toBe(CLIENT_STATUS_DESCRIPTIONS[status]);
      expect(view.stage_index).toBeGreaterThanOrEqual(0);
      expect(view.stage_index).toBeLessThan(CLIENT_STAGES.length);
      expect(CLIENT_STAGES[view.stage_index].key).toBe(view.stage);
    }
  });

  it("normalizuje statusy legacy i nieznane", () => {
    expect(clientLoanStatusView("wyslany_do_inwestorow").status).toBe("szukamy_inwestora");
    expect(clientLoanStatusView(null).status).toBe("nowy_lead");
    expect(clientLoanStatusView("cos_dziwnego").status).toBe("nowy_lead");
  });

  it("etapy rosną monotonicznie wzdłuż cyklu życia", () => {
    let last = 0;
    for (const status of LOAN_STATUS_ORDER) {
      const { stage_index } = clientLoanStatusView(status);
      expect(stage_index).toBeGreaterThanOrEqual(last);
      last = stage_index;
    }
  });

  it("zamkniete wypełnia oś do końca", () => {
    const view = clientLoanStatusView("zamkniete");
    expect(view.is_closed).toBe(true);
    expect(view.stage_index).toBe(CLIENT_STAGES.length - 1);
  });

  it("komunikaty klienckie nie obiecują kontaktu z naszej strony", () => {
    const forbidden = [/skontaktuje/i, /oddzwoni/i, /odezwie/i, /analityk/i];
    for (const status of LOAN_STATUS_ORDER) {
      const text = `${CLIENT_STATUS_LABELS[status]} ${CLIENT_STATUS_DESCRIPTIONS[status]}`;
      for (const re of forbidden) {
        expect(text).not.toMatch(re);
      }
    }
  });
});
