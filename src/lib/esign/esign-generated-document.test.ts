import { describe, expect, it } from "vitest";
import { CreateInput } from "./esign-schemas";

const id = "d9e84de8-8ee9-49ac-bb1b-f0ab50c5f3d2";
const signer = {
  kind: "zewnetrzny" as const,
  fullName: "Jan Testowy",
  email: "example@example.org",
  capacityMode: "osoba" as const,
};

describe("e-podpis dokumentów z generatora", () => {
  it("przyjmuje ID dokumentu bez ponownego wgrywania PDF", () => {
    const input = CreateInput.parse({
      title: "Wezwanie do zapłaty", generatedDocumentId: id,
      sendNow: true, signers: [signer],
    });
    expect(input.generatedDocumentId).toBe(id);
    expect(input.fileBase64).toBeUndefined();
    expect(input.signingMode).toBe("rownolegle");
  });

  it("odrzuca niepoprawny ID oraz jednoczesny upload i ID dokumentu", () => {
    expect(CreateInput.safeParse({
      title: "Wezwanie do zapłaty", generatedDocumentId: "nie-uuid", signers: [signer],
    }).success).toBe(false);
    expect(CreateInput.safeParse({
      title: "Wezwanie do zapłaty", generatedDocumentId: id,
      fileName: "inne.pdf", fileBase64: "a".repeat(64), signers: [signer],
    }).success).toBe(false);
  });

  it("nie pozwala na pustą listę ani ponad 10 podpisujących", () => {
    expect(CreateInput.safeParse({
      title: "Wezwanie do zapłaty", generatedDocumentId: id, signers: [],
    }).success).toBe(false);
    expect(CreateInput.safeParse({
      title: "Wezwanie do zapłaty", generatedDocumentId: id,
      signers: Array(11).fill(signer),
    }).success).toBe(false);
  });
});
