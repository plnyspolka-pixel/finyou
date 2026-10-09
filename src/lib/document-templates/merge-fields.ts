// Wzory, w których powtórzony klucz zawsze oznacza tę samą wartość — formularz
// pokazuje takie pole raz (np. „[Nazwa spółki]" w procedurze AML).
const MERGE_REPEATED_FIELDS = new Set(["procedura-aml-cft-b2b"]);

export function mergesRepeatedFields(slug: string | null | undefined): boolean {
  return !!slug && MERGE_REPEATED_FIELDS.has(slug);
}
