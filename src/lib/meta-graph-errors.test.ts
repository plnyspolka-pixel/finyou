import { describe, it, expect } from "vitest";
import {
  classifyGraphError,
  parseUsageRetryMinutes,
  retryDelayMinutes,
  BASE_RETRY_MIN,
  MAX_RETRY_MIN,
  RATE_LIMIT_MIN_DELAY_MIN,
} from "./meta-graph-errors";

describe("classifyGraphError", () => {
  it("kod #4 (limit aplikacji) to błąd chwilowy i limit zapytań", () => {
    const info = classifyGraphError({
      httpStatus: 400,
      code: 4,
      message: "(#4) Application request limit reached",
    });
    expect(info.transient).toBe(true);
    expect(info.rateLimited).toBe(true);
    expect(info.authProblem).toBe(false);
    expect(info.friendly).toContain("Limit zapytań aplikacji");
    expect(info.friendly).toContain("Application request limit reached");
  });

  it("wygasły token to błąd trwały (ponawianie nic nie da)", () => {
    const info = classifyGraphError({
      httpStatus: 400,
      code: 190,
      message: "Error validating access token",
    });
    expect(info.transient).toBe(false);
    expect(info.rateLimited).toBe(false);
    expect(info.authProblem).toBe(true);
    expect(info.friendly).toContain("META_PAGE_ACCESS_TOKEN");
  });

  it("zły format wideo (subcode IG) to błąd trwały z konkretną podpowiedzią", () => {
    const info = classifyGraphError({
      httpStatus: 400,
      code: 100,
      subcode: 2207026,
      message: "Unsupported video format",
    });
    expect(info.transient).toBe(false);
    expect(info.friendly).toContain("Nieobsługiwany format wideo");
  });

  it("chwilowy błąd transkodowania IG jest ponawialny", () => {
    const info = classifyGraphError({ httpStatus: 400, code: 100, subcode: 2207052 });
    expect(info.transient).toBe(true);
  });

  it("HTTP 429, 5xx i brak połączenia są chwilowe", () => {
    expect(classifyGraphError({ httpStatus: 429 }).transient).toBe(true);
    expect(classifyGraphError({ httpStatus: 429 }).rateLimited).toBe(true);
    expect(classifyGraphError({ httpStatus: 503 }).transient).toBe(true);
    expect(classifyGraphError({ httpStatus: 0, message: "fetch failed" }).transient).toBe(true);
  });

  it("nieznany błąd 4xx traktujemy jako trwały", () => {
    const info = classifyGraphError({ httpStatus: 400, code: 100, message: "Invalid parameter" });
    expect(info.transient).toBe(false);
  });
});

describe("parseUsageRetryMinutes", () => {
  it("czyta estimated_time_to_regain_access z x-business-use-case-usage", () => {
    const headers = new Headers({
      "x-business-use-case-usage": JSON.stringify({
        "1234": [{ type: "instagram", call_count: 100, estimated_time_to_regain_access: 42 }],
      }),
    });
    expect(parseUsageRetryMinutes(headers)).toBe(42);
  });

  it("przy zużyciu ≥95% w x-app-usage proponuje godzinę przerwy", () => {
    const headers = new Headers({
      "x-app-usage": JSON.stringify({ call_count: 99, total_cputime: 12, total_time: 20 }),
    });
    expect(parseUsageRetryMinutes(headers)).toBe(RATE_LIMIT_MIN_DELAY_MIN);
  });

  it("respektuje retry-after w sekundach", () => {
    expect(parseUsageRetryMinutes(new Headers({ "retry-after": "600" }))).toBe(10);
  });

  it("brak nagłówków i śmieciowy JSON nie wywracają parsera", () => {
    expect(parseUsageRetryMinutes(new Headers())).toBeNull();
    expect(parseUsageRetryMinutes({ "x-app-usage": "nie-json" })).toBeNull();
  });
});

describe("retryDelayMinutes", () => {
  it("rośnie wykładniczo z liczbą prób i ma sufit", () => {
    expect(retryDelayMinutes(0)).toBe(BASE_RETRY_MIN);
    expect(retryDelayMinutes(1)).toBe(BASE_RETRY_MIN * 2);
    expect(retryDelayMinutes(2)).toBe(BASE_RETRY_MIN * 4);
    expect(retryDelayMinutes(99)).toBe(MAX_RETRY_MIN);
  });

  it("limit zapytań czeka co najmniej godzinę", () => {
    expect(retryDelayMinutes(0, { rateLimited: true, retryAfterMin: null })).toBe(
      RATE_LIMIT_MIN_DELAY_MIN,
    );
  });

  it("sugestia Meta wygrywa, gdy jest dłuższa", () => {
    expect(retryDelayMinutes(0, { rateLimited: true, retryAfterMin: 240 })).toBe(241);
  });
});
