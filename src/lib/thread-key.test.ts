import { describe, expect, it } from "vitest";
import { leadIdFromThreadKey } from "./thread-key";

const ID = "1c56b72d-cf00-47f9-b97e-f69c4f38af16";

describe("leadIdFromThreadKey", () => {
  it("czyta lead z tury tekstowej i testu", () => {
    expect(leadIdFromThreadKey(`messenger:${ID}`)).toBe(ID);
    expect(leadIdFromThreadKey(`e2e:${ID}`)).toBe(ID);
  });
  it("nie zgaduje leada z sesji widgetu ani śmieci", () => {
    expect(leadIdFromThreadKey(`web:${ID}`)).toBeNull();
    expect(leadIdFromThreadKey("text:abc")).toBeNull();
    expect(leadIdFromThreadKey(undefined)).toBeNull();
  });
});
