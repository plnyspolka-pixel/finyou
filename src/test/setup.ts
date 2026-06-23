import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement these; SinglePageApplicationForm uses them for previews.
const u = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (s: string) => void };
if (typeof u.createObjectURL === "undefined") u.createObjectURL = () => "blob:mock";
if (typeof u.revokeObjectURL === "undefined") u.revokeObjectURL = () => {};
