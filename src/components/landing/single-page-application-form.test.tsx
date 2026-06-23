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

async function clickNext() {
  await userEvent.click(screen.getByRole("button", { name: /dalej/i }));
}

async function fillContactStep() {
  await userEvent.type(screen.getByLabelText(/imię/i), "Anna");
  await userEvent.type(screen.getByLabelText(/nazwisko/i), "Kowalska");
  await userEvent.type(screen.getByLabelText(/telefon/i), "600100200");
  await userEvent.type(screen.getByLabelText(/e-mail/i), "anna@example.com");
}

async function goToContactStep() {
  // Step 1 -> Step 2 (typ zabezpieczenia ma domyślną wartość 'mieszkanie')
  await clickNext();
  // Step 2 -> Step 3 (parametry mają wartości domyślne)
  await clickNext();
}

// --- Tests --------------------------------------------------------------

describe("SinglePageApplicationForm – Meta pixel events", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    submitMock.mockClear();
  });

  it("Lead NIE odpala się gdy dane kontaktowe są niekompletne", async () => {
    render(<SinglePageApplicationForm />);
    await goToContactStep();

    // Brak danych — próba przejścia dalej nie wysyła Lead.
    await clickNext();
    expect(trackEventMock).not.toHaveBeenCalledWith("Lead", expect.anything(), expect.anything());

    // Częściowe dane — wciąż brak Lead.
    await userEvent.type(screen.getByLabelText(/imię/i), "Anna");
    await clickNext();
    const leadCalls = trackEventMock.mock.calls.filter(([name]) => name === "Lead");
    expect(leadCalls).toHaveLength(0);
  });

  it("Lead odpala się po poprawnym przejściu kroku Kontakt", async () => {
    render(<SinglePageApplicationForm />);
    await goToContactStep();
    await fillContactStep();
    await clickNext();

    const leadCalls = trackEventMock.mock.calls.filter(([name]) => name === "Lead");
    expect(leadCalls).toHaveLength(1);
    const [, params, identity] = leadCalls[0]!;
    expect(params).toMatchObject({
      currency: "PLN",
      content_category: "mieszkanie",
    });
    expect(identity).toMatchObject({
      email: "anna@example.com",
      firstName: "Anna",
      lastName: "Kowalska",
    });

    // CompleteRegistration NIE może jeszcze odpalić.
    const crCalls = trackEventMock.mock.calls.filter(([name]) => name === "CompleteRegistration");
    expect(crCalls).toHaveLength(0);
  });

  it("CompleteRegistration odpala się dopiero po finalnym submit z KW lub plikami", async () => {
    render(<SinglePageApplicationForm />);
    await goToContactStep();
    await fillContactStep();
    await clickNext(); // -> krok 4

    // Submit bez KW i bez plików – nic nie wysyłamy, CR też nie.
    await userEvent.click(screen.getByRole("button", { name: /wyślij wniosek/i }));
    expect(submitMock).not.toHaveBeenCalled();
    expect(
      trackEventMock.mock.calls.filter(([n]) => n === "CompleteRegistration"),
    ).toHaveLength(0);

    // Podaj KW i dołącz plik, potem submit.
    const kw = screen.getByLabelText(/numer księgi wieczystej/i);
    await userEvent.type(kw, "wa1m/00123456/7");

    const file = new File([new Uint8Array([1, 2, 3])], "akt.pdf", { type: "application/pdf" });
    const hiddenInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(hiddenInputs.length).toBeGreaterThan(0);
    // pierwszy ukryty input pliku (pierwszy bucket) — wystarczy do przejścia walidacji
    fireEvent.change(hiddenInputs[0]!, { target: { files: [file] } });

    await userEvent.click(screen.getByRole("button", { name: /wyślij wniosek/i }));

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
