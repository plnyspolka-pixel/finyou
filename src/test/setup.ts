import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement these; SinglePageApplicationForm uses them for previews.
if (typeof URL.createObjectURL === "undefined") {
  // @ts-expect-error – polyfill for jsdom
  URL.createObjectURL = () => "blob:mock";
}
if (typeof URL.revokeObjectURL === "undefined") {
  // @ts-expect-error – polyfill for jsdom
  URL.revokeObjectURL = () => {};
}
