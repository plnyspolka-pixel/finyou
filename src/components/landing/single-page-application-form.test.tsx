import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computeKwCheckDigit } from "@/lib/kw-number";

// --- Mocks --------------------------------------------------------------

const { trackEventMock, submitMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  submitMock: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/fb-pixel", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock("@/lib/landing-application.functions", () => ({
  submitLandingLoanApplication: submitMock,
}));

vi.mock("@tanstack/react-start", () => ({
  // useServerFn returns the function as-is; tests inspect submitMock directly.
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// FileReader polyfill: synchronously resolve to a data URL.
class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(_file: Blob) {
    this.result = "data:application/octet-stream;base64,AAA";
    queueMicrotask(() => this.onload?.());
  }
}
// @ts-expect-error – override jsdom's FileReader
globalThis.FileReader = FakeFileReader;

import { SinglePageApplicationForm } from "./single-page-application-form";

// --- Helpers ------------------------------------------------------------

// Poprawny numer KW (cyfra kontrolna liczona algorytmem EKW).
const VALID_KW = `WA1M/00123456/${computeKwCheckDigit("WA1M00123456")}`;

async function submitForm() {
  await userEvent.click(screen.getByRole("button", { name: /złóż wniosek/i }));
}

function contactInput(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing input #${id}`);
  return el;
}

async function fillContact() {
  await userEvent.type(contactInput("f-fn"), "Anna");
  await userEvent.type(contactInput("f-ln"), "Kowalska");
  await userEvent.type(contactInput("f-ph"), "600100200");
  await userEvent.type(contactInput("f-em"), "anna@example.com");
}

async function acceptConsents() {
  // Trzy zgody (polityka prywatności, regulamin, marketing).
  for (const cb of screen.getAllByRole("checkbox")) {
    if (cb.getAttribute("data-state") !== "checked") {
      await userEvent.click(cb);
    }
  }
}

async function selectPropertyType() {
  await userEvent.click(screen.getByRole("button", { name: /mieszkanie/i }));
}

function attachPropertyPhoto() {
  const file = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
  const hiddenInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  // Kolejność w DOM: [0] akt własności (sekcja KW), [1] pliki nieruchomości, [2] aparat.
  expect(hiddenInputs.length).toBeGreaterThanOrEqual(2);
  fireEvent.change(hiddenInputs[1]!, { target: { files: [file] } });
}

// --- Tests --------------------------------------------------------------

describe("SinglePageApplicationForm – Meta pixel events", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    submitMock.mockClear();
  });

  it("Lead NIE odpala się gdy dane kontaktowe są niekompletne", async () => {
    render(<SinglePageApplicationForm />);

    // Brak danych — próba wysłania nie wysyła Lead.
    await submitForm();
    expect(trackEventMock).not.toHaveBeenCalledWith("Lead", expect.anything(), expect.anything());

    // Częściowe dane — wciąż brak Lead.
    await userEvent.type(contactInput("f-fn"), "Anna");
    await submitForm();
    const leadCalls = trackEventMock.mock.calls.filter(([name]) => name === "Lead");
    expect(leadCalls).toHaveLength(0);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("Lead odpala się po podaniu danych kontaktowych i zgód", async () => {
    render(<SinglePageApplicationForm />);
    await fillContact();
    await acceptConsents();

    // Submit bez typu/KW/zdjęć — Lead już MA prawo się odpalić (kontakt OK),
    // ale CompleteRegistration jeszcze nie (formularz niekompletny).
    await submitForm();

    const leadCalls = trackEventMock.mock.calls.filter(([name]) => name === "Lead");
    expect(leadCalls).toHaveLength(1);
    const [, params, identity] = leadCalls[0]!;
    expect(params).toMatchObject({ currency: "PLN" });
    expect(identity).toMatchObject({
      email: "anna@example.com",
      firstName: "Anna",
      lastName: "Kowalska",
    });

    expect(submitMock).not.toHaveBeenCalled();
    const crCalls = trackEventMock.mock.calls.filter(([name]) => name === "CompleteRegistration");
    expect(crCalls).toHaveLength(0);
  });

  it("CompleteRegistration odpala się dopiero po finalnym submit z KW i plikami", async () => {
    render(<SinglePageApplicationForm />);
    await fillContact();
    await acceptConsents();
    await selectPropertyType();

    // Submit bez KW i bez plików – nic nie wysyłamy, CR też nie.
    await submitForm();
    expect(submitMock).not.toHaveBeenCalled();
    expect(
      trackEventMock.mock.calls.filter(([n]) => n === "CompleteRegistration"),
    ).toHaveLength(0);

    // Nieprawidłowy numer KW (zła cyfra kontrolna) też blokuje wysyłkę.
    const kw = contactInput("f-kw");
    const wrongDigit = (computeKwCheckDigit("WA1M00123456") + 1) % 10;
    await userEvent.type(kw, `WA1M/00123456/${wrongDigit}`);
    attachPropertyPhoto();
    await submitForm();
    expect(submitMock).not.toHaveBeenCalled();

    // Poprawny numer KW → wysyłka przechodzi.
    await userEvent.clear(kw);
    await userEvent.type(kw, VALID_KW.toLowerCase());
    await submitForm();

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));

    // Server fn dostał dane z KW w formacie kanonicznym i 1 plikiem.
    const payload = (submitMock.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(payload.data).toMatchObject({
      first_name: "Anna",
      last_name: "Kowalska",
      email: "anna@example.com",
      property_type: "mieszkanie",
      land_register_number: VALID_KW,
      additional_land_register_numbers: [],
    });
    expect((payload.data.photos as unknown[]).length).toBe(1);

    await waitFor(() => {
      const cr = trackEventMock.mock.calls.filter(([n]) => n === "CompleteRegistration");
      expect(cr).toHaveLength(1);
    });
    const crCall = trackEventMock.mock.calls.find(([n]) => n === "CompleteRegistration")!;
    expect(crCall[1]).toMatchObject({
      currency: "PLN",
      content_category: "mieszkanie",
      has_kw: true,
      photos_count: 1,
    });
  });
});
