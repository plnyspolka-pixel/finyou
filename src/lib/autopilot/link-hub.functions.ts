// Publiczna server function link-huba /start (rola serwisowa, tylko
// opublikowane lead magnety i CTA z profili torów).
import { createServerFn } from "@tanstack/react-start";

export const getLinkHubFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getLinkHubData } = await import("./link-hub.server");
  return getLinkHubData();
});
