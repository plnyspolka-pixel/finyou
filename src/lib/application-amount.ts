export function applicationAmountFromSearch(value: unknown): number | undefined {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 10000 && amount <= 1000000 ? Math.round(amount) : undefined;
}