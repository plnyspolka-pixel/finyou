import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", RO);
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}
vi.stubGlobal("IntersectionObserver", IO);

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

const u = URL as unknown as {
  createObjectURL?: (b: Blob) => string;
  revokeObjectURL?: (s: string) => void;
};
if (typeof u.createObjectURL === "undefined") u.createObjectURL = () => "blob:mock";
if (typeof u.revokeObjectURL === "undefined") u.revokeObjectURL = () => {};
