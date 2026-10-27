import { describe, it, expect } from "vitest";
import { buildBrokerFeedbackEmail, collectBrokerSignals } from "./broker-feedback";

const since = "2026-10-27T00:00:00.000Z";
const apps = [
  {
    id: "a1",
    status: "wyplacony",
    created_by_partner_user_id: "b1",
    updated_at: "2026-10-27T10:00:00Z",
  },
  {
    id: "a2",
    status: "wyslany_do_inwestorow",
    created_by_partner_user_id: "b2",
    updated_at: "2026-10-27T10:00:00Z",
  },
];

describe("feedback dla pośrednika", () => {
  it("zbiera zainteresowanie, propozycje i wypłatę — bez neutralnych i starych zdarzeń", () => {
    const s = collectBrokerSignals({
      apps,
      distributions: [
        {
          id: "d1",
          loan_application_id: "a2",
          distribution_status: "prosba_o_dodatkowe_informacje",
          updated_at: "2026-10-27T09:00:00Z",
        },
        {
          id: "d2",
          loan_application_id: "a2",
          distribution_status: "wyslane",
          updated_at: "2026-10-27T09:00:00Z",
        },
        {
          id: "d3",
          loan_application_id: "a2",
          distribution_status: "oferta_otrzymana",
          updated_at: "2026-10-20T09:00:00Z",
        },
      ],
      matches: [
        {
          id: "m1",
          application_id: "a2",
          status: "rezerwacja",
          updated_at: "2026-10-27T11:00:00Z",
        },
      ],
      offers: [
        {
          id: "o1",
          loan_application_id: "a2",
          offer_status: "zlozona",
          updated_at: "2026-10-27T12:00:00Z",
        },
      ],
      since,
    });
    expect(s.map((x) => x.key).sort()).toEqual(
      [
        "dist:d1:prosba_o_dodatkowe_informacje",
        "match:m1:rezerwacja",
        "offer:o1:zlozona",
        "wyplata:a1",
      ].sort(),
    );
    expect(s.find((x) => x.key === "wyplata:a1")?.brokerUserId).toBe("b1");
  });

  it("e-mail o wypłacie podaje prowizję 3,5% kwoty pożyczki", () => {
    const mail = buildBrokerFeedbackEmail({
      baseUrl: "https://app.financeyou.pl",
      items: [
        {
          signal: {
            key: "wyplata:a1",
            brokerUserId: "b1",
            applicationId: "a1",
            kind: "wyplata",
            label: "Pożyczka uruchomiona",
            at: since,
          },
          clientName: "Jan Nowak",
          loanAmount: 300000,
          commission: 10500,
        },
      ],
    });
    expect(mail.subject).toMatch(/uruchomiona/);
    expect(mail.text).toContain("3,5%");
    expect(mail.text.replace(/\s/g, " ")).toContain("10 500");
    expect(mail.text).toContain("/posrednik/reakcje");
  });
});
