import { createServerFn } from "@tanstack/react-start";

export const getMetaAppId = createServerFn({ method: "GET" }).handler(async () => {
  return { appId: process.env.META_APP_ID ?? null };
});
