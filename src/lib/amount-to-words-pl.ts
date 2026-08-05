/** Bardzo prosty konwerter liczb PLN na słownie (PL). Dla pełnej zgodności użyj zewnętrznej biblioteki. */
const ONES = [
  "zero",
  "jeden",
  "dwa",
  "trzy",
  "cztery",
  "pięć",
  "sześć",
  "siedem",
  "osiem",
  "dziewięć",
];
const TEENS = [
  "dziesięć",
  "jedenaście",
  "dwanaście",
  "trzynaście",
  "czternaście",
  "piętnaście",
  "szesnaście",
  "siedemnaście",
  "osiemnaście",
  "dziewiętnaście",
];
const TENS = [
  "",
  "",
  "dwadzieścia",
  "trzydzieści",
  "czterdzieści",
  "pięćdziesiąt",
  "sześćdziesiąt",
  "siedemdziesiąt",
  "osiemdziesiąt",
  "dziewięćdziesiąt",
];
const HUNDREDS = [
  "",
  "sto",
  "dwieście",
  "trzysta",
  "czterysta",
  "pięćset",
  "sześćset",
  "siedemset",
  "osiemset",
  "dziewięćset",
];

function under1000(n: number): string {
  if (n === 0) return "";
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest < 10) {
    if (rest) parts.push(ONES[rest]);
  } else if (rest < 20) parts.push(TEENS[rest - 10]);
  else {
    parts.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) parts.push(ONES[rest % 10]);
  }
  return parts.join(" ");
}

function pluralPLN(n: number, forms: [string, string, string]): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (n === 1) return forms[0];
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1];
  return forms[2];
}

export function amountToWordsPLN(amount: number): string {
  if (!isFinite(amount) || amount < 0) return "";
  // Zaokrąglij raz do groszy — inaczej ułamek ≥ 0,995 dawał "100/100" groszy.
  const cents = Math.round(amount * 100);
  const zl = Math.floor(cents / 100);
  const gr = cents % 100;

  const groups: number[] = [];
  let x = zl;
  while (x > 0) {
    groups.push(x % 1000);
    x = Math.floor(x / 1000);
  }
  if (groups.length === 0) groups.push(0);

  const labels: [string, string, string][] = [
    ["", "", ""],
    ["tysiąc", "tysiące", "tysięcy"],
    ["milion", "miliony", "milionów"],
    ["miliard", "miliardy", "miliardów"],
  ];

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    parts.push(under1000(g));
    if (i > 0) parts.push(pluralPLN(g, labels[i]));
  }

  const zlText = parts.length ? parts.join(" ") : "zero";
  const grText = `${gr.toString().padStart(2, "0")}/100`;
  return `${zlText} ${pluralPLN(zl, ["złoty", "złote", "złotych"])} ${grText}`;
}
