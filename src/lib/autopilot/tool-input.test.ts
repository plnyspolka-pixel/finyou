import { it, expect } from "vitest";
import { formatToolInput } from "./tool-input";
it("formats thousands while retaining decimal and invalid input for validation", () => {
  expect(formatToolInput("1000000")).toBe("1 000 000");
  expect(formatToolInput("12345,50")).toBe("12 345,50");
  expect(formatToolInput("abc")).toBe("abc");
});