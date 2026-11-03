import { describe, expect, it } from "vitest";
import { assertFinanceYouProjects, canViewFinanceYouProjects, externalOfferCardsEnabled } from "./project-visibility.server";

function client(roles: string[], error: unknown = null, approved = true) {
  return { from: (table: string) => ({ select: () => ({ eq: (_column: string, id: string) => {
    if (table === "user_roles") return Promise.resolve({ data: roles.map((role) => ({ role })), error });
    return { maybeSingle: async () => ({ data: approved ? { user_id: id } : null, error }) };
  } }) }) };
}

describe("project access for the Finance You investor", () => {
  it("allows the administrator-investor account", async () => {
    await expect(canViewFinanceYouProjects(client(["administrator", "inwestor"]), "fy-user")).resolves.toBe(true);
  });
  it.each([{ roles: ["inwestor"] }, { roles: ["administrator"] }, { roles: ["operator", "inwestor"] }, { roles: [] as string[] }])(
    "denies roles $roles without both trusted roles", async ({ roles }) => {
      await expect(canViewFinanceYouProjects(client(roles), "external-user")).resolves.toBe(false);
      await expect(assertFinanceYouProjects(client(roles), "external-user")).rejects.toThrow("wyłącznie dla Finance You");
    },
  );
  it("fails closed when roles cannot be read or no user is authenticated", async () => {
    await expect(canViewFinanceYouProjects(client(["administrator", "inwestor"], new Error("db")), "u")).resolves.toBe(false);
    await expect(canViewFinanceYouProjects(client(["administrator", "inwestor"]), "")).resolves.toBe(false);
  });
  it("denies an administrator-investor without a separately approved company account", async () => {
    await expect(canViewFinanceYouProjects(client(["administrator", "inwestor"], null, false), "other-admin")).resolves.toBe(false);
  });
  it("disables unauthenticated cards even when an old link exists", () => {
    expect(externalOfferCardsEnabled()).toBe(false);
  });
});
