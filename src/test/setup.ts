import "@testing-library/jest-dom/vitest";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
if (typeof window !== "undefined") {
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}

// jsdom doesn't implement these; SinglePageApplicationForm uses them for previews.
const u = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (s: string) => void };
if (typeof u.createObjectURL === "undefined") u.createObjectURL = () => "blob:mock";
if (typeof u.revokeObjectURL === "undefined") u.revokeObjectURL = () => {};
