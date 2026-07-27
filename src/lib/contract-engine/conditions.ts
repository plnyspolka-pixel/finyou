/**
 * Ewaluator warunków klauzul — bezpieczny podzbiór wyrażeń.
 *
 * Port `ewaluuj_warunek` z `renderer.py`. W przeciwieństwie do oryginału NIE
 * korzysta z `eval` ani `Function()` — składnia jest parsowana małym parserem
 * zejść rekurencyjnych. Zestaw operatorów jest celowo mały:
 *
 *   True / False / None / null, nazwy faktów, ścieżki `a.b.c`,
 *   literały tekstowe, liczby, `==` `!=` `<` `>` `<=` `>=`, `and` `or` `not`,
 *   nawiasy.
 *
 * Semantyka (prawdziwość, `and`/`or` zwracające wartość operandu) jest
 * odwzorowaniem zachowania Pythona, żeby port był wierny 1:1 — patrz test A10
 * (podmiana tokenów wewnątrz literału) i A11 (odrzucenie niebezpiecznego
 * wyrażenia).
 */

export class BladWarunku extends Error {}

export type Ctx = Record<string, unknown>;

// ── prawdziwość w stylu Pythona ────────────────────────────────
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
}

// ── pobranie ścieżki `a.b.c` z kontekstu (dict-only, jak w Pythonie) ──
export function pobierzSciezke(ctx: unknown, sciezka: string): unknown {
  let cur: unknown = ctx;
  for (const part of sciezka.split(".")) {
    if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
      const obj = cur as Record<string, unknown>;
      if (!(part in obj)) return null;
      cur = obj[part];
    } else {
      return null;
    }
  }
  return cur;
}

// ── lekser ─────────────────────────────────────────────────────
type Tok =
  | { t: "str"; v: string }
  | { t: "num"; v: number }
  | { t: "ident"; v: string }
  | { t: "op"; v: string }
  | { t: "lparen" }
  | { t: "rparen" };

// znaki dozwolone w warunku (odpowiednik _DOZWOLONE z Pythona)
const DOZWOLONE = /^[\w\s.[\]'\"()=!<>+\-*/,À-￿]*$/;
const IDENT_START = /[A-Za-z_À-￿]/;
const IDENT_CHAR = /[\w.À-￿]/;

function leksuj(expr: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < expr.length && expr[j] !== c) j++;
      if (j >= expr.length) throw new BladWarunku(`Niedomknięty literał: ${expr}`);
      out.push({ t: "str", v: expr.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (c === "(") {
      out.push({ t: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ t: "rparen" });
      i++;
      continue;
    }
    if (c === "=" || c === "!" || c === "<" || c === ">") {
      if (expr[i + 1] === "=") {
        out.push({ t: "op", v: c + "=" });
        i += 2;
      } else if (c === "<" || c === ">") {
        out.push({ t: "op", v: c });
        i++;
      } else {
        throw new BladWarunku(`Nieoczekiwany znak '${c}' w: ${expr}`);
      }
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9]/.test(expr[j])) j++;
      out.push({ t: "num", v: parseInt(expr.slice(i, j), 10) });
      i = j;
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i;
      while (j < expr.length && IDENT_CHAR.test(expr[j])) j++;
      out.push({ t: "ident", v: expr.slice(i, j) });
      i = j;
      continue;
    }
    throw new BladWarunku(`Niedozwolony znak '${c}' w: ${expr}`);
  }
  return out;
}

// ── parser + ewaluacja (zejścia rekurencyjne) ──────────────────
class Parser {
  private p = 0;
  constructor(
    private readonly toks: Tok[],
    private readonly ctx: Ctx,
  ) {}

  private peek(): Tok | undefined {
    return this.toks[this.p];
  }
  private next(): Tok {
    return this.toks[this.p++];
  }

  parse(): unknown {
    const v = this.orExpr();
    if (this.p !== this.toks.length) {
      throw new BladWarunku("Nadmiarowe tokeny w warunku");
    }
    return v;
  }

  private isKeyword(kw: string): boolean {
    const t = this.peek();
    return !!t && t.t === "ident" && t.v === kw;
  }

  private orExpr(): unknown {
    let left = this.andExpr();
    while (this.isKeyword("or")) {
      this.next();
      const right = this.andExpr();
      left = truthy(left) ? left : right;
    }
    return left;
  }

  private andExpr(): unknown {
    let left = this.notExpr();
    while (this.isKeyword("and")) {
      this.next();
      const right = this.notExpr();
      left = truthy(left) ? right : left;
    }
    return left;
  }

  private notExpr(): unknown {
    if (this.isKeyword("not")) {
      this.next();
      return !truthy(this.notExpr());
    }
    return this.compare();
  }

  private compare(): unknown {
    const left = this.atom();
    const t = this.peek();
    if (t && t.t === "op") {
      this.next();
      const right = this.atom();
      switch (t.v) {
        case "==":
          return pyEquals(left, right);
        case "!=":
          return !pyEquals(left, right);
        case "<":
          return (left as number) < (right as number);
        case ">":
          return (left as number) > (right as number);
        case "<=":
          return (left as number) <= (right as number);
        case ">=":
          return (left as number) >= (right as number);
      }
    }
    return left;
  }

  private atom(): unknown {
    const t = this.next();
    if (!t) throw new BladWarunku("Nieoczekiwany koniec warunku");
    if (t.t === "lparen") {
      const v = this.orExpr();
      const close = this.next();
      if (!close || close.t !== "rparen") throw new BladWarunku("Brak ')'");
      return v;
    }
    if (t.t === "str") return t.v;
    if (t.t === "num") return t.v;
    if (t.t === "ident") {
      switch (t.v) {
        case "True":
          return true;
        case "False":
          return false;
        case "None":
        case "null":
          return null;
        default:
          return pobierzSciezke(this.ctx, t.v);
      }
    }
    throw new BladWarunku("Nieoczekiwany token w warunku");
  }
}

function pyEquals(a: unknown, b: unknown): boolean {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an || bn) return an && bn;
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

/**
 * Ewaluuje warunek klauzuli/sekcji. Wartości inne niż string (`true`, `null`,
 * brak) są traktowane jak w Pythonie: `True`/`None` → true, `False` → false.
 */
export function ewaluujWarunek(warunek: unknown, ctx: Ctx): boolean {
  if (warunek === true || warunek === null || warunek === undefined) return true;
  if (warunek === false) return false;
  if (typeof warunek !== "string") {
    throw new BladWarunku(`Nieobsługiwany typ warunku: ${typeof warunek}`);
  }
  const expr = warunek.trim();
  if (!DOZWOLONE.test(expr)) {
    throw new BladWarunku(`Niedozwolone znaki w warunku: ${expr}`);
  }
  try {
    return truthy(new Parser(leksuj(expr), ctx).parse());
  } catch (e) {
    if (e instanceof BladWarunku) throw e;
    throw new BladWarunku(`Błąd ewaluacji ${warunek}: ${String(e)}`);
  }
}
