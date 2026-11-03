// Dostęp do projektów ma wyłącznie konto inwestora zarządzane przez Finance You.
// Uprawnienie jest utrzymywane na osobnej liście, niedostępnej do edycji dla inwestorów.
type RoleClient = { from: (table: string) => any };

export async function canViewFinanceYouProjects(db: RoleClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error || !Array.isArray(data)) return false;
  const roles = new Set(data.map((row: { role: string }) => row.role));
  if (!roles.has("administrator") || !roles.has("inwestor")) return false;
  const { data: viewer, error: viewerError } = await db
    .from("finance_you_project_viewers").select("user_id").eq("user_id", userId).maybeSingle();
  return !viewerError && viewer?.user_id === userId;
}

export async function assertFinanceYouProjects(db: RoleClient, userId: string): Promise<void> {
  if (!(await canViewFinanceYouProjects(db, userId))) {
    throw new Error("Projekty inwestycyjne są dostępne wyłącznie dla Finance You.");
  }
}

// Karty dostępne bez logowania nie pozwalają sprawdzić tożsamości odbiorcy.
export function externalOfferCardsEnabled(): boolean {
  return false;
}
