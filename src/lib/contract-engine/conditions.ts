/**
 * Ewaluator warunków klauzul — bezpieczny podzbiór wyrażeń.
 *
 * Port z `renderer.ewaluuj_warunek` (Python), ale BEZ `eval`/`Function`.
 * Zestaw operatorów jest mały, więc zamiast podstawiania tokenów i eval
 * używamy tokenizera + parsera zejścia rekurencyjnego. Dzięki temu literały
 * tekstowe (`'nie_potracana_raty'`) są rozpoznawane jako jeden token i nigdy
 * nie da się podmienić czegoś w ich wnętrzu — to jest pułapka, którą pilnuje
 * test A10 (klauzula prowizji cicho znikała, gdy podmieniano token w literale).
 *
 * Dozwolona składnia:
 *   true | false | null
 *   nazwa faktu / ścieżka a.b.c
 *   'literał' | "literał" | liczba całkowita
 *   ==  !=  and  or  not  ( )
 */

export class ConditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConditionError";
  }
}

export type Ctx = Record<string, unknown>;

// ── tokenizer ────────────────────────────────────────────────

type TokKind = "str" | "num" | "word" | "op" | "eof";
interface Tok {
  kind: TokKind;
  value: string;
}

// znak wiodący identyfikatora/ścieżki (ASCII + polskie litery)
const WORD_RE = /^[A-Za-z_À-ɏ][\w.À-ɏ]*/;
const KEYWORDS = new Set(["and", "or", "not", "true", "false", "null"]);

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    // literały tekstowe — pochłaniane w całości, zanim cokolwiek innego
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c) j++;
      if (j >= n) throw new ConditionError(`Niezamknięty literał tekstowy w: ${src}`);
      toks.push({ kind: "str", value: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (c === "(" || c === ")") {
      toks.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if (c === "=" || c === "!") {
      if (src[i + 1] === "=") {
        toks.push({ kind: "op", value: c + "=" });
        i += 2;
        continue;
      }
      throw new ConditionError(`Nieoczekiwany znak '${c}' w: ${src}`);
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && src[j] >= "0" && src[j] <= "9") j++;
      toks.push({ kind: "num", value: src.slice(i, j) });
      i = j;
      continue;
    }
    const m = WORD_RE.exec(src.slice(i));
    if (m) {
      toks.push({ kind: "word", value: m[0] });
      i += m[0].length;
      continue;
    }
    throw new ConditionError(`Niedozwolony znak '${c}' w warunku: ${src}`);
  }
  toks.push({ kind: "eof", value: "" });
  return toks;
}

// ── wartości i pomocnicze ────────────────────────────────────

export function resolvePath(ctx: Ctx, path: string): unknown {
  let cur: unknown = ctx;
  for (const part of path.split(".")) {
    if (cur !== null && typeof cur === "object" && !Array.isArray(cur) && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return cur;
}

/** Prawdziwość zgodna z Pythonowym bool(): puste kontenery/0/""/null są fałszywe. */
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Set) return v.size > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
}

function looseEquals(a: unknown, b: unknown): boolean {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an || bn) return an && bn;
  return a === b;
}

// ── parser zejścia rekurencyjnego ────────────────────────────

class Parser {
  private pos = 0;
  constructor(private toks: Tok[], private ctx: Ctx, private src: string) {}

  private peek(): Tok {
    return this.toks[this.pos];
  }
  private next(): Tok {
    return this.toks[this.pos++];
  }

  parse(): boolean {
    const v = this.parseOr();
    if (this.peek().kind !== "eof") {
      throw new ConditionError(`Nadmiarowy token '${this.peek().value}' w: ${this.src}`);
    }
    return truthy(v);
  }

  private parseOr(): unknown {
    let left = this.parseAnd();
    while (this.peek().kind === "word" && this.peek().value === "or") {
      this.next();
      const right = this.parseAnd();
      left = truthy(left) || truthy(right);
    }
    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseNot();
    while (this.peek().kind === "word" && this.peek().value === "and") {
      this.next();
      const right = this.parseNot();
      left = truthy(left) && truthy(right);
    }
    return left;
  }

  private parseNot(): unknown {
    if (this.peek().kind === "word" && this.peek().value === "not") {
      this.next();
      return !truthy(this.parseNot());
    }
    return this.parseComparison();
  }

  private parseComparison(): unknown {
    const left = this.parsePrimary();
    const t = this.peek();
    if (t.kind === "op" && (t.value === "==" || t.value === "!=")) {
      this.next();
      const right = this.parsePrimary();
      const eq = looseEquals(left, right);
      return t.value === "==" ? eq : !eq;
    }
    return left;
  }

  private parsePrimary(): unknown {
    const t = this.next();
    if (t.kind === "op" && t.value === "(") {
      const v = this.parseOr();
      const close = this.next();
      if (!(close.kind === "op" && close.value === ")")) {
        throw new ConditionError(`Brak ')' w: ${this.src}`);
      }
      return v;
    }
    if (t.kind === "str") return t.value;
    if (t.kind === "num") return parseInt(t.value, 10);
    if (t.kind === "word") {
      if (t.value === "true") return true;
      if (t.value === "false") return false;
      if (t.value === "null") return null;
      // fakt / ścieżka
      return resolvePath(this.ctx, t.value);
    }
    throw new ConditionError(`Nieoczekiwany token '${t.value}' (${t.kind}) w: ${this.src}`);
  }
}

/**
 * Ewaluuje warunek klauzuli. `warunek` może być:
 *  - boolean (true/false w bibliotece klauzul),
 *  - null/undefined (traktowane jak true — brak warunku),
 *  - string z wyrażeniem.
 */
export function evalCondition(warunek: unknown, ctx: Ctx): boolean {
  if (warunek === true || warunek === null || warunek === undefined) return true;
  if (warunek === false) return false;
  if (typeof warunek !== "string") {
    throw new ConditionError(`Nieobsługiwany typ warunku: ${typeof warunek}`);
  }
  const expr = warunek.trim();
  if (expr === "") return true;
  const parser = new Parser(tokenize(expr), ctx, expr);
  return parser.parse();
}
