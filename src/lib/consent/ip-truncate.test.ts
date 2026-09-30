import { describe, expect, it } from "vitest";
import { truncateIp } from "./ip-truncate";

describe("truncateIp", () => {
  it("zeroes the last IPv4 octet", () => {
    expect(truncateIp("83.12.200.17")).toBe("83.12.200.0");
    expect(truncateIp("::ffff:10.1.2.3")).toBe("10.1.2.0");
  });

  it("keeps only the first 48 bits of IPv6", () => {
    expect(truncateIp("2001:DB8:1234:5678::1")).toBe("2001:db8:1234::");
    expect(truncateIp("2a02:a311:8143:5f00:1c2d:3e4f:5a6b:7c8d")).toBe("2a02:a311:8143::");
  });

  it("returns null for empty or unknown input", () => {
    expect(truncateIp(null)).toBeNull();
    expect(truncateIp("")).toBeNull();
    expect(truncateIp("nie-ip")).toBeNull();
    expect(truncateIp("::1")).toBeNull();
  });
});
