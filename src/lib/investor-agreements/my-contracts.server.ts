// „Moje umowy" inwestora — odczyt (service role, zawsze zawężony do userId).
// Oddzielny moduł serwerowy: handlery .functions.ts ładują go dynamicznie.
import {
  contractStage,
  isLiveEnvelope,
  isMeSigner,
  LOAN_CONTRACT_SLUG,
  type ContractStage,
} from "./my-contracts-core";

const loose = (c: unknown) => c as any;

export interface MyContractSigner {
  name: string;
  roleLabel: string | null;
  status: string;
  signedAt: string | null;
  isMe: boolean;
}

export interface MyContract {
  applicationId: string;
  stage: ContractStage;
  clientName: string | null;
  loanAmount: number | null;
  city: string | null;
  /** Ostatnia wygenerowana umowa (komplet). */
  generatedAt: string | null;
  generatedDocumentId: string | null;
  /** Ostatnia nieanulowana koperta e-podpisu do tego wniosku. */
  envelope: {
    id: string;
    publicId: string;
    title: string;
    status: string;
    sentAt: string | null;
    completedAt: string | null;
    expiresAt: string | null;
    signers: MyContractSigner[];
  } | null;
  updatedAt: string;
}

/**
 * Wnioski, do których inwestor wygenerował umowę albo wysłał ją do podpisu
 * (koperta nieanulowana). Takie Projekty znikają z „Moich zleceń" i są
 * w „Moich umowach".
 */
export async function myContractApplicationIds(db: any, userId: string): Promise<Set<string>> {
  const [{ data: docs }, { data: envs }] = await Promise.all([
    loose(db)
      .from("generated_documents")
      .select("loan_application_id")
      .eq("created_by", userId)
      .eq("template_slug", LOAN_CONTRACT_SLUG)
      .not("loan_application_id", "is", null)
      .limit(1000),
    loose(db)
      .from("esign_envelopes")
      .select("loan_application_id, status")
      .eq("created_by", userId)
      .not("loan_application_id", "is", null)
      .limit(1000),
  ]);
  const ids = new Set<string>();
  for (const d of docs ?? []) ids.add(d.loan_application_id);
  for (const e of envs ?? []) if (isLiveEnvelope(e.status)) ids.add(e.loan_application_id);
  return ids;
}

export async function loadMyContracts(
  db: any,
  userId: string,
  myEmail: string | null,
): Promise<MyContract[]> {
  const [{ data: docs }, { data: envs }] = await Promise.all([
    loose(db)
      .from("generated_documents")
      .select("id, loan_application_id, created_at")
      .eq("created_by", userId)
      .eq("template_slug", LOAN_CONTRACT_SLUG)
      .not("loan_application_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
    loose(db)
      .from("esign_envelopes")
      .select(
        "id, public_id, title, status, loan_application_id, sent_at, completed_at, expires_at, created_at",
      )
      .eq("created_by", userId)
      .not("loan_application_id", "is", null)
      .neq("status", "anulowana")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  // Najnowszy dokument i najnowsza koperta na wniosek (listy są od najnowszych).
  const docByApp = new Map<string, any>();
  for (const d of docs ?? [])
    if (!docByApp.has(d.loan_application_id)) docByApp.set(d.loan_application_id, d);
  const envByApp = new Map<string, any>();
  for (const e of envs ?? [])
    if (!envByApp.has(e.loan_application_id)) envByApp.set(e.loan_application_id, e);
  const appIds = [...new Set([...docByApp.keys(), ...envByApp.keys()])];
  if (appIds.length === 0) return [];

  const envIds = [...envByApp.values()].map((e) => e.id);
  const [{ data: signers }, { data: apps }] = await Promise.all([
    envIds.length
      ? loose(db)
          .from("esign_signers")
          .select("envelope_id, user_id, email, full_name, role_label, status, signed_at, order_no")
          .in("envelope_id", envIds)
          .order("order_no")
      : Promise.resolve({ data: [] }),
    loose(db)
      .from("loan_applications")
      .select("id, loan_amount, client_id, properties(city)")
      .in("id", appIds),
  ]);
  const clientIds = [...new Set((apps ?? []).map((a: any) => a.client_id).filter(Boolean))];
  const { data: clients } = clientIds.length
    ? await loose(db).from("clients").select("id, first_name, last_name").in("id", clientIds)
    : { data: [] };

  const out: MyContract[] = [];
  for (const appId of appIds) {
    const app = (apps ?? []).find((a: any) => a.id === appId);
    const client = (clients ?? []).find((c: any) => c.id === app?.client_id);
    const doc = docByApp.get(appId) ?? null;
    const env = envByApp.get(appId) ?? null;
    const envSigners = env ? (signers ?? []).filter((s: any) => s.envelope_id === env.id) : [];
    const stage = contractStage(
      env ? { status: env.status, signers: envSigners } : null,
      userId,
      myEmail,
    );
    const props = Array.isArray(app?.properties)
      ? app.properties
      : app?.properties
        ? [app.properties]
        : [];
    out.push({
      applicationId: appId,
      stage,
      clientName: [client?.first_name, client?.last_name].filter(Boolean).join(" ") || null,
      loanAmount: app?.loan_amount != null ? Number(app.loan_amount) : null,
      city: props[0]?.city ?? null,
      generatedAt: doc?.created_at ?? null,
      generatedDocumentId: doc?.id ?? null,
      envelope: env
        ? {
            id: env.id,
            publicId: env.public_id,
            title: env.title,
            status: env.status,
            sentAt: env.sent_at ?? null,
            completedAt: env.completed_at ?? null,
            expiresAt: env.expires_at ?? null,
            signers: envSigners.map((s: any) => ({
              name: s.full_name,
              roleLabel: s.role_label ?? null,
              status: s.status,
              signedAt: s.signed_at ?? null,
              isMe: isMeSigner(s, userId, myEmail),
            })),
          }
        : null,
      updatedAt:
        env?.completed_at ??
        env?.sent_at ??
        env?.created_at ??
        doc?.created_at ??
        new Date(0).toISOString(),
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
