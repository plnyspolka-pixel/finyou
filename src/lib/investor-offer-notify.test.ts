import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { pickStaffAuthorId } from "./investor-offer-notify.server";

const OPERATOR = "0f6334e7-41f1-4d83-bce1-1ced034e0557";
const PARTNER = "11111111-1111-1111-1111-111111111111";

describe("pickStaffAuthorId — odbiorca powiadomienia o ofercie", () => {
  it("scalony wniosek: twórca duplikatu (operator) jest traktowany jako autor", () => {
    // Wniosek docelowy z meta_lead bez operatora; duplikat dodał operator.
    const target = { created_by_partner_user_id: null, assigned_operator: null };
    expect(pickStaffAuthorId(target, [{ created_by_partner_user_id: OPERATOR }])).toBe(OPERATOR);
  });

  it("brak twórcy, ale przypisany operator → operator, nie klient", () => {
    expect(
      pickStaffAuthorId({ created_by_partner_user_id: null, assigned_operator: OPERATOR }),
    ).toBe(OPERATOR);
  });

  it("twórca wniosku ma pierwszeństwo przed duplikatem i operatorem", () => {
    expect(
      pickStaffAuthorId({ created_by_partner_user_id: PARTNER, assigned_operator: OPERATOR }, [
        { created_by_partner_user_id: OPERATOR },
      ]),
    ).toBe(PARTNER);
  });

  it("nikt z zespołu → null (powiadamiamy klienta)", () => {
    expect(pickStaffAuthorId({ created_by_partner_user_id: null, assigned_operator: null }, [])).toBe(
      null,
    );
  });
});
