// Podpis dokumentowy — server functions PODPISUJĄCEGO (bez logowania; token
// z linku). Cienkie opakowania z walidacją zod; implementacja w
// esign-public.server.ts ładowana dynamicznie (kod serwerowy poza klientem).
import { createServerFn } from "@tanstack/react-start";
import {
  getSigningSessionInput,
  getSigningDocumentInput,
  startSignerIdentityInput,
  refreshSignerIdentityInput,
  chooseSigningCapacityInput,
  requestSigningOtpInput,
  confirmSignatureInput,
  rejectSigningInput,
  getVerificationInput,
} from "./esign-schemas";

export const getSigningSession = createServerFn({ method: "POST" })
  .inputValidator((d) => getSigningSessionInput.parse(d))
  .handler(async ({ data }) => (await import("./esign-public.server")).getSigningSessionImpl(data));

export const getSigningDocument = createServerFn({ method: "POST" })
  .inputValidator((d) => getSigningDocumentInput.parse(d))
  .handler(async ({ data }) =>
    (await import("./esign-public.server")).getSigningDocumentImpl(data),
  );

export const startSignerIdentity = createServerFn({ method: "POST" })
  .inputValidator((d) => startSignerIdentityInput.parse(d))
  .handler(async ({ data }) =>
    (await import("./esign-public.server")).startSignerIdentityImpl(data),
  );

export const refreshSignerIdentity = createServerFn({ method: "POST" })
  .inputValidator((d) => refreshSignerIdentityInput.parse(d))
  .handler(async ({ data }) =>
    (await import("./esign-public.server")).refreshSignerIdentityImpl(data),
  );

export const chooseSigningCapacity = createServerFn({ method: "POST" })
  .inputValidator((d) => chooseSigningCapacityInput.parse(d))
  .handler(async ({ data }) =>
    (await import("./esign-public.server")).chooseSigningCapacityImpl(data),
  );

export const requestSigningOtp = createServerFn({ method: "POST" })
  .inputValidator((d) => requestSigningOtpInput.parse(d))
  .handler(async ({ data }) => (await import("./esign-public.server")).requestSigningOtpImpl(data));

export const confirmSignature = createServerFn({ method: "POST" })
  .inputValidator((d) => confirmSignatureInput.parse(d))
  .handler(async ({ data }) => (await import("./esign-public.server")).confirmSignatureImpl(data));

export const rejectSigning = createServerFn({ method: "POST" })
  .inputValidator((d) => rejectSigningInput.parse(d))
  .handler(async ({ data }) => (await import("./esign-public.server")).rejectSigningImpl(data));

export const getVerification = createServerFn({ method: "POST" })
  .inputValidator((d) => getVerificationInput.parse(d))
  .handler(async ({ data }) => (await import("./esign-public.server")).getVerificationImpl(data));

export type SigningSession = Awaited<ReturnType<typeof getSigningSession>>;
export type VerificationView = Awaited<ReturnType<typeof getVerification>>;
