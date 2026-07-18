import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  toast: { success: vi.fn(), error: vi.fn() },
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
//
// Formularz jest jednostronicowy (bez kroków „Dalej"): wszystko dzieje się
// przy kliknięciu „Złóż wniosek" (onSubmit). `Lead` odpala się w onSubmit po
// poprawnych danych kontaktowych i zgodach, jeszcze przed walidacją
// typu/KW/zdjęć; `CompleteRegistration` dopiero po udanym wysłaniu.

function leadCalls() {
  return trackEventMock.mock.calls.filter(([name]) => name === "Lead");
}
function crCalls() {
  return trackEventMock.mock.calls.filter(([name]) => name === "CompleteRegistration");
}

async function fillContact() {
  // Kotwiczymy na początku etykiety — teksty zgód też zawierają „telefon"/„e-mail".
  await userEvent.type(screen.getByLabelText(/^imię/i), "Anna");
  await userEvent.type(screen.getByLabelText(/^nazwisko/i), "Kowalska");
  await userEvent.type(screen.getByLabelText(/^telefon/i), "600100200");
  await userEvent.type(screen.getByLabelText(/^e-mail/i), "anna@example.com");
}

function acceptConsents() {
  fireEvent.click(screen.getByRole("checkbox", { name: /politykę prywatności/i }));
  fireEvent.click(screen.getByRole("checkbox", { name: /regulamin serwisu/i }));
  fireEvent.click(screen.getByRole("checkbox", { name: /kontakt marketingowy/i }));
}

function submitForm() {
  return userEvent.click(screen.getByRole("button", { name: /złóż wniosek/i }));
}

function addPropertyPhoto() {
  const label = screen.getByText("Zdjęcia i dokumenty nieruchomości");
  const input = label.closest("div")?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Nie znaleziono inputu zdjęć nieruchomości");
  const file = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
}

// --- Tests --------------------------------------------------------------

describe("SinglePageApplicationForm – Meta pixel events", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    submitMock.mockClear();
  });

  it("Lead NIE odpala się gdy dane kontaktowe są niekompletne", async () => {
    render(<SinglePageApplicationForm />);

    // Pusty formularz — submit nie wysyła Lead.
    await submitForm();
    expect(leadCalls()).toHaveLength(0);

    // Częściowe dane — wciąż brak Lead.
    await userEvent.type(screen.getByLabelText(/imię/i), "Anna");
    await submitForm();
    expect(leadCalls()).toHaveLength(0);
  });

  it("Lead odpala się po poprawnych danych kontaktowych i zgodach", async () => {
    render(<SinglePageApplicationForm />);
    await fillContact();
    acceptConsents();
    // Submit bez wybranego typu/KW/zdjęć: Lead odpala się (walidacja kontaktu),
    // ale wysyłka i CompleteRegistration jeszcze nie.
    await submitForm();

    expect(leadCalls()).toHaveLength(1);
    const [, params, identity] = leadCalls()[0]!;
    expect(params).toMatchObject({
      currency: "PLN",
      content_category: "mieszkanie",
    });
    expect(identity).toMatchObject({
      email: "anna@example.com",
      firstName: "Anna",
      lastName: "Kowalska",
    });

    expect(submitMock).not.toHaveBeenCalled();
    expect(crCalls()).toHaveLength(0);
  });

  it("CompleteRegistration odpala się dopiero po finalnym submit z KW i zdjęciem", async () => {
    render(<SinglePageApplicationForm />);
    await fillContact();
    acceptConsents();

    // Submit bez typu/KW/zdjęć — nic nie wysyłamy, CR też nie (Lead już tak).
    await submitForm();
    expect(submitMock).not.toHaveBeenCalled();
    expect(crCalls()).toHaveLength(0);

    // Wybierz typ nieruchomości, podaj KW i dołącz zdjęcie nieruchomości.
    await userEvent.click(screen.getByRole("button", { name: /^mieszkanie$/i }));
    await userEvent.type(screen.getByLabelText(/numer księgi wieczystej/i), "wa1m/00123456/7");
    addPropertyPhoto();

    await submitForm();

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));

    // Server fn dostał dane z KW (uppercase) i 1 plikiem.
    const payload = (submitMock.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(payload.data).toMatchObject({
      first_name: "Anna",
      last_name: "Kowalska",
      email: "anna@example.com",
      property_type: "mieszkanie",
      land_register_number: "WA1M/00123456/7",
    });
    expect((payload.data.photos as unknown[]).length).toBe(1);

    await waitFor(() => expect(crCalls()).toHaveLength(1));
    const crCall = crCalls()[0]!;
    expect(crCall[1]).toMatchObject({
      currency: "PLN",
      content_category: "mieszkanie",
      has_kw: true,
      photos_count: 1,
    });
  });
});
