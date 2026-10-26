/** Formatting only: the calculator retains its own numeric validation. */
export function formatToolInput(value: string): string {
  const compact = value.replace(/\s/g, "");
  if (!/^-?\d*(?:[.,]\d*)?$/.test(compact)) return value;
  const [integer, decimal] = compact.split(/[.,]/);
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return decimal === undefined ? grouped : `${grouped},${decimal}`;
}