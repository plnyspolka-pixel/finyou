/** Wspólny typ problemu walidacji (rozdzielony, by uniknąć cyklu import schema↔validator). */
export type Poziom = "BLAD" | "OSTRZEZENIE";

export class Problem {
  constructor(
    public poziom: Poziom,
    public sciezka: string,
    public komunikat: string,
  ) {}
  toString(): string {
    const znak = this.poziom === "BLAD" ? "✗" : "⚠";
    return `${znak} [${this.sciezka}] ${this.komunikat}`;
  }
}
