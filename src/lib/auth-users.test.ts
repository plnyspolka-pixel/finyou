import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Zakładanie konta auth dla adresu, który MOŻE już istnieć.
 *
 * Sedno: GoTrue nie ma jednego komunikatu na „ten e-mail już jest". Bywa
 * „User already registered", a bywa 500 `unexpected_failure` z naruszeniem
 * unikalnego indeksu `users_email_partial_key`. Kod nie ma prawa rozstrzygać
 * tego po treści komunikatu — ma sprawdzić listę kont.
 */

type Konto = { id: string; email: string };

let konta: Konto[] = [];
let bladTworzenia: { message: string } | null = null;
let rzucPrzyTworzeniu: Error | null = null;
const utworzone: { email: string }[] = [];

const supabaseAdmin = {
  auth: {
    admin: {
      async createUser(args: { email: string }) {
        if (rzucPrzyTworzeniu) throw rzucPrzyTworzeniu;
        if (bladTworzenia) return { data: { user: null }, error: bladTworzenia };
        const konto = { id: `user-${konta.length + 1}`, email: args.email };
        konta.push(konto);
        utworzone.push({ email: args.email });
        return { data: { user: konto }, error: null };
      },
      async listUsers({ page, perPage }: { page: number; perPage: number }) {
        const od = (page - 1) * perPage;
        return { data: { users: konta.slice(od, od + perPage) }, error: null };
      },
    },
  },
};

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

const { ensureAuthUser, findAuthUserIdByEmail } = await import("./auth-users.server");

beforeEach(() => {
  konta = [];
  bladTworzenia = null;
  rzucPrzyTworzeniu = null;
  utworzone.length = 0;
});

describe("ensureAuthUser", () => {
  it("zakłada konto, gdy adresu jeszcze nie ma", async () => {
    const r = await ensureAuthUser({ email: "nowy@example.com" });
    expect(r.userId).toBe("user-1");
    expect(r.created).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("normalizuje adres przed założeniem konta", async () => {
    await ensureAuthUser({ email: "  Jan.Kowalski@Example.COM " });
    expect(utworzone[0].email).toBe("jan.kowalski@example.com");
  });

  it("zwraca istniejące konto przy „User already registered”", async () => {
    konta = [{ id: "stary-1", email: "jan@example.com" }];
    bladTworzenia = { message: "User already registered" };

    const r = await ensureAuthUser({ email: "jan@example.com" });
    expect(r.userId).toBe("stary-1");
    expect(r.created).toBe(false);
  });

  it("zwraca istniejące konto także przy duplikacie klucza (unexpected_failure)", async () => {
    konta = [{ id: "stary-2", email: "ania@example.com" }];
    bladTworzenia = {
      message:
        'duplicate key value violates unique constraint "users_email_partial_key" (SQLSTATE 23505)',
    };

    const r = await ensureAuthUser({ email: "ania@example.com" });
    expect(r.userId).toBe("stary-2");
    expect(r.created).toBe(false);
    expect(r.error).toBeUndefined();
  });

  it("znajduje konto leżące poza pierwszą stroną listy", async () => {
    konta = Array.from({ length: 450 }, (_, i) => ({
      id: `u-${i}`,
      email: `k${i}@example.com`,
    }));
    bladTworzenia = { message: "unexpected_failure" };

    const r = await ensureAuthUser({ email: "k430@example.com" });
    expect(r.userId).toBe("u-430");
    expect(r.created).toBe(false);
  });

  it("zgłasza błąd dopiero, gdy i utworzenie padło, i konta nie ma", async () => {
    bladTworzenia = { message: "database is down" };
    const r = await ensureAuthUser({ email: "ktos@example.com" });
    expect(r.userId).toBeNull();
    expect(r.error).toBe("database is down");
  });

  it("wyjątek z createUser też kończy się sprawdzeniem listy", async () => {
    konta = [{ id: "stary-3", email: "rzut@example.com" }];
    rzucPrzyTworzeniu = new Error("fetch failed");

    const r = await ensureAuthUser({ email: "rzut@example.com" });
    expect(r.userId).toBe("stary-3");
  });

  it("pusty adres nie idzie do bazy", async () => {
    const r = await ensureAuthUser({ email: "   " });
    expect(r.userId).toBeNull();
    expect(r.error).toBe("no email");
    expect(utworzone).toHaveLength(0);
  });
});

describe("findAuthUserIdByEmail", () => {
  it("porównuje adresy bez względu na wielkość liter", async () => {
    konta = [{ id: "u-1", email: "Jan@Example.com" }];
    expect(await findAuthUserIdByEmail("jan@example.COM")).toBe("u-1");
  });

  it("zwraca null, gdy adresu nie ma", async () => {
    konta = [{ id: "u-1", email: "kto-inny@example.com" }];
    expect(await findAuthUserIdByEmail("jan@example.com")).toBeNull();
  });
});
