import { describe, expect, it } from "vitest";
import { wantsCommentReply } from "./comment-intent";

describe("wantsCommentReply", () => {
  it.each([
    "Ile to kosztuje?",
    "Poproszę info",
    "Jestem zainteresowany",
    "priv",
    "Chciałbym pożyczkę pod mieszkanie",
    "Jak zainwestować?",
    "Proszę o kontakt",
  ])("odpisuje na pytanie / zainteresowanie: %s", (t) => {
    expect(wantsCommentReply(t)).toBe(true);
  });

  it.each([
    "Kolejny szkoli konkurencję...",
    "Oszuści, nie polecam",
    "To lichwa?",
    "super",
    "Anna Kowalska",
    "👍",
    "",
  ])("nie odpisuje automatycznie: %s", (t) => {
    expect(wantsCommentReply(t)).toBe(false);
  });
});
