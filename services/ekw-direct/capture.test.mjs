import test from "node:test";
import assert from "node:assert/strict";
import { parseKw, isBlockedPage, EKW_SECTIONS, EkwError } from "./capture.mjs";

test("normalizes a known supplied KW without changing the check digit", () => {
  const value = parseKw("KR1P/00610770/2");
  assert.equal(value.compact, "KR1P006107702");
  assert.equal(value.formatted, "KR1P/00610770/2");
});
test("rejects arbitrary KW numbers, injection and partial numbers", () => {
  for (const v of ["", "../passwd", "KR1P/1/2", "KR1P000", "KR1P/00000000/1;DROP"]) {
    assert.throws(() => parseKw(v), EkwError);
  }
});
test("detects portal security blocks without treating them as absent data", () => {
  assert.equal(isBlockedPage("The requested URL was rejected. Support ID: 123"), true);
  assert.equal(isBlockedPage("Wymagana reCAPTCHA"), true);
  assert.equal(isBlockedPage("Dział IV. Hipoteka umowna"), false);
});
test("covers all five sections required by the KW cache", () => {
  assert.deepEqual(Object.keys(EKW_SECTIONS), [
    "dzial_1o", "dzial_1s", "dzial_2", "dzial_3", "dzial_4",
  ]);
});
