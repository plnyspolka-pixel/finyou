// Podpis dokumentowy — server functions NADAWCY (administrator / operator /
// inwestor). Cienkie opakowania: walidacja wejścia tutaj (zod, bezpieczne dla
// klienta), implementacja w esign-owner.server.ts ładowana dynamicznie —
// żeby kod serwerowy (Didit, Resend, Storage) nie trafił do paczki klienta.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  searchSignerCandidatesInput,
  createEnvelopeInput,
  sendEnvelopeInput,
  resendSignerLinkInput,
  openMySigningLinkInput,
  listMyEnvelopesInput,
  getEnvelopeDetailsInput,
  getEnvelopeFileUrlInput,
  cancelEnvelopeInput,
  resolveIdentityMismatchInput,
} from "./esign-schemas";

export const getEsignOwnerContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    (await import("./esign-owner.server")).getEsignOwnerContextImpl(context),
  );

export const searchSignerCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => searchSignerCandidatesInput.parse(d))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).searchSignerCandidatesImpl(data, context),
  );

export const createEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createEnvelopeInput.parse(d))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).createEnvelopeImpl(data, context),
  );

export const sendEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendEnvelopeInput.parse(d))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).sendEnvelopeImpl(data, context),
  );

export const resendSignerLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => resendSignerLinkInput.parse(d))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).resendSignerLinkImpl(data, context),
  );

export const openMySigningLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => openMySigningLinkInput.parse(d))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).openMySigningLinkImpl(data, context),
  );

export const listMyEnvelopes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listMyEnvelopesInput.parse(d ?? {}))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).listMyEnvelopesImpl(data, context),
  );

export const getEnvelopeDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => getEnvelopeDetailsInput.parse(d))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).getEnvelopeDetailsImpl(data, context),
  );

export const getEnvelopeFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => getEnvelopeFileUrlInput.parse(d))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).getEnvelopeFileUrlImpl(data, context),
  );

export const cancelEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => cancelEnvelopeInput.parse(d))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).cancelEnvelopeImpl(data, context),
  );

export const resolveIdentityMismatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => resolveIdentityMismatchInput.parse(d))
  .handler(async ({ data, context }) =>
    (await import("./esign-owner.server")).resolveIdentityMismatchImpl(data, context),
  );

export type { CreateEnvelopeInput } from "./esign-schemas";
export type { EnvelopeRow, SignerRow } from "./esign.server";
