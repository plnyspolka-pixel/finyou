// Lekki, in-memory odpowiednik klienta Supabase (PostgREST) do testów
// integracyjnych przepływu płatności. Emuluje łańcuchy zapytań używane przez
// moduły access/* i accounting/* oraz RPC `process_access_payment_paid`
// wiernie względem kontraktu SQL (idempotencja, weryfikacja kwoty,
// przedłużanie od bieżącego active_until).
import { computeGrantWindow } from "@/lib/access/core";

let idCounter = 0;
export function fakeUuid(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

type Row = Record<string, any>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  now: () => Date;
  from: (table: string) => any;
  rpc: (name: string, params?: Record<string, any>) => Promise<{ data: any; error: any }>;
  storage: {
    from: (bucket: string) => { createSignedUrl: (path: string, exp: number) => Promise<any> };
  };
  auth: { admin: { getUserById: (id: string) => Promise<any> } };
}

const UNIQUE_KEYS: Record<string, string[][]> = {
  access_payments: [["provider", "provider_transaction_id"]],
  sales_invoices: [["payment_id"]],
  individual_sales_register: [["transaction_id"]],
  access_expiry_notifications: [["user_id", "audience", "kind", "active_until"]],
  affiliate_commission_events: [["event_type", "external_ref"]],
  affiliate_commissions: [["commission_event_id", "partner_id", "network_level"]],
};

function matchesFilters(row: Row, filters: Array<(r: Row) => boolean>): boolean {
  return filters.every((f) => f(row));
}

class Query {
  private filters: Array<(r: Row) => boolean> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private upsertConflict: string[] | null = null;
  private wantRows = false;

  constructor(
    private db: FakeDbImpl,
    private table: string,
  ) {}

  select(_cols?: string) {
    if (this.mode === "insert" || this.mode === "upsert" || this.mode === "update") {
      this.wantRows = true;
      return this;
    }
    this.mode = "select";
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = payload;
    this.upsertConflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : null;
    return this;
  }
  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: any[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: any) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  not(col: string, op: string, val: any) {
    if (op === "is" && val === null)
      this.filters.push((r) => r[col] !== null && r[col] !== undefined);
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push((r) => String(r[col]) >= String(val));
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push((r) => String(r[col]) <= String(val));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private rows(): Row[] {
    let rows = (this.db.tables[this.table] ?? []).filter((r) => matchesFilters(r, this.filters));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows = [...rows].sort((a, b) =>
        String(a[col] ?? "") < String(b[col] ?? "") ? (asc ? -1 : 1) : asc ? 1 : -1,
      );
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  private uniqueViolation(row: Row, ignoreRow?: Row): string | null {
    for (const key of UNIQUE_KEYS[this.table] ?? []) {
      if (key.some((k) => row[k] === null || row[k] === undefined)) continue;
      const dup = (this.db.tables[this.table] ?? []).find(
        (r) => r !== ignoreRow && key.every((k) => r[k] === row[k]),
      );
      if (dup) return `duplicate key value violates unique constraint (${key.join(",")})`;
    }
    return null;
  }

  private exec(): { data: any; error: any } {
    const tables = this.db.tables;
    tables[this.table] = tables[this.table] ?? [];

    if (this.mode === "select") {
      return { data: this.rows(), error: null };
    }
    if (this.mode === "insert" || this.mode === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const out: Row[] = [];
      for (const item of list) {
        if (this.mode === "upsert" && this.upsertConflict) {
          const existing = tables[this.table].find((r) =>
            this.upsertConflict!.every((k) => r[k] === item[k]),
          );
          if (existing) {
            Object.assign(existing, item);
            out.push(existing);
            continue;
          }
        }
        const row: Row = { id: fakeUuid(), created_at: this.db.now().toISOString(), ...item };
        const violation = this.uniqueViolation(row);
        if (violation) return { data: null, error: { message: violation, code: "23505" } };
        const hook = this.db.insertHooks[this.table];
        if (hook) {
          const err = hook(row);
          if (err) return { data: null, error: { message: err } };
        }
        tables[this.table].push(row);
        out.push(row);
      }
      return { data: out, error: null };
    }
    if (this.mode === "update") {
      const rows = this.rows();
      for (const r of rows) Object.assign(r, this.payload);
      return { data: rows, error: null };
    }
    if (this.mode === "delete") {
      const rows = this.rows();
      tables[this.table] = tables[this.table].filter((r) => !rows.includes(r));
      return { data: rows, error: null };
    }
    return { data: null, error: { message: "unsupported" } };
  }

  async maybeSingle() {
    const { data, error } = this.exec();
    if (error) return { data: null, error };
    return { data: (data as Row[])[0] ?? null, error: null };
  }
  async single() {
    const { data, error } = this.exec();
    if (error) return { data: null, error };
    const row = (data as Row[])[0];
    return row ? { data: row, error: null } : { data: null, error: { message: "no rows" } };
  }
  then(resolve: (v: { data: any; error: any }) => void, reject?: (e: unknown) => void) {
    try {
      resolve(this.exec());
    } catch (e) {
      reject?.(e);
    }
  }
}

class FakeDbImpl implements FakeDb {
  tables: Record<string, Row[]> = {};
  insertHooks: Record<string, (row: Row) => string | null> = {};
  private nowValue = new Date("2026-08-01T12:00:00.000Z");

  now = () => this.nowValue;
  setNow(d: Date) {
    this.nowValue = d;
  }

  from(table: string) {
    return new Query(this, table);
  }

  storage = {
    from: (_bucket: string) => ({
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://signed.example/${path}` },
        error: null,
      }),
    }),
  };

  auth = {
    admin: {
      getUserById: async (id: string) => ({
        data: { user: { id, email: this.userEmails[id] ?? null } },
        error: null,
      }),
    },
  } as any;
  userEmails: Record<string, string> = {};

  async rpc(name: string, params: Record<string, any> = {}): Promise<{ data: any; error: any }> {
    if (name === "process_access_payment_paid") {
      return { data: this.processAccessPaymentPaid(params), error: null };
    }
    if (name === "has_active_paid_access") {
      const ent = (this.tables.access_entitlements ?? []).find(
        (e) => e.user_id === params._user_id && e.audience === params._audience,
      );
      return {
        data: Boolean(ent?.active_until && new Date(ent.active_until) > this.now()),
        error: null,
      };
    }
    return { data: null, error: { message: `unknown rpc ${name}` } };
  }

  // Wierne odwzorowanie kontraktu SQL public.process_access_payment_paid.
  private processAccessPaymentPaid(params: Record<string, any>): Row {
    const payment = (this.tables.access_payments ?? []).find((p) => p.id === params._payment_id);
    if (!payment) return { ok: false, reason: "payment_not_found" };

    if (payment.processed_at && payment.status === "paid") {
      return {
        ok: true,
        alreadyProcessed: true,
        grantedFrom: payment.granted_from,
        grantedUntil: payment.granted_until,
        userId: payment.user_id,
        audience: payment.audience,
      };
    }

    const product = (this.tables.access_products ?? []).find((p) => p.id === payment.product_id);
    if (!product) {
      payment.failure_reason = "product_not_found";
      payment.needs_review = true;
      return { ok: false, reason: "product_not_found" };
    }

    if (Number(params._paid_amount_grosz) !== Number(payment.expected_amount_grosz)) {
      payment.failure_reason = `amount_mismatch: expected ${payment.expected_amount_grosz}, paid ${params._paid_amount_grosz}`;
      payment.paid_amount_grosz = params._paid_amount_grosz;
      payment.needs_review = true;
      return { ok: false, reason: "amount_mismatch" };
    }

    if (
      params._provider_transaction_id &&
      payment.provider_transaction_id &&
      payment.provider_transaction_id !== params._provider_transaction_id
    ) {
      payment.failure_reason = "transaction_id_mismatch";
      payment.needs_review = true;
      return { ok: false, reason: "transaction_id_mismatch" };
    }

    this.tables.access_entitlements = this.tables.access_entitlements ?? [];
    let ent = this.tables.access_entitlements.find(
      (e) => e.user_id === payment.user_id && e.audience === payment.audience,
    );
    const now = this.now();
    const current = ent?.active_until ? new Date(ent.active_until) : null;
    const { grantedFrom, grantedUntil } = computeGrantWindow(
      now,
      current,
      Number(product.duration_days),
    );

    if (ent) {
      if (!current || current <= now) ent.active_from = now.toISOString();
      ent.active_until = grantedUntil.toISOString();
      ent.last_product_id = product.id;
      ent.last_payment_id = payment.id;
    } else {
      ent = {
        id: fakeUuid(),
        user_id: payment.user_id,
        audience: payment.audience,
        active_from: now.toISOString(),
        active_until: grantedUntil.toISOString(),
        last_product_id: product.id,
        last_payment_id: payment.id,
      };
      this.tables.access_entitlements.push(ent);
    }

    payment.status = "paid";
    payment.paid_amount_grosz = params._paid_amount_grosz;
    payment.provider_transaction_id =
      payment.provider_transaction_id ?? params._provider_transaction_id ?? null;
    payment.granted_from = grantedFrom.toISOString();
    payment.granted_until = grantedUntil.toISOString();
    payment.processed_at = now.toISOString();
    payment.failure_reason = null;

    return {
      ok: true,
      alreadyProcessed: false,
      grantedFrom: payment.granted_from,
      grantedUntil: payment.granted_until,
      userId: payment.user_id,
      audience: payment.audience,
    };
  }
}

export function createFakeDb(): FakeDbImpl {
  return new FakeDbImpl();
}

export type { FakeDbImpl };
