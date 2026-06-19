// Zapamiętywanie etapu wniosku w przeglądarce, żeby klient mógł wrócić
// dokładnie tam, gdzie utknął — po wejściu z innego linku lub po dniach przerwy.

const KEY = "wniosek:resume";
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 dni

// Ścieżki, które uznajemy za "etap wniosku" do zapamiętania.
const TRACKED_PREFIXES = [
  "/wniosek-start",
  "/wniosek-zabezpieczenie",
  "/wniosek-warunki",
  "/wniosek-formularz",
  "/wniosek-opis",
  "/wniosek-1",
  "/wniosek/", // /wniosek/$token
];

// Ścieżki, z których WOLNO automatycznie przekierować na zapisany etap.
// UWAGA: NIE dodawaj "/" — strona główna musi być zawsze dostępna bez
// przekierowania, nawet jeśli ktoś ma w localStorage zapisany etap wniosku.
const RESUME_FROM = new Set<string>([
  "/wniosek-start",
]);

interface Saved {
  path: string;
  ts: number;
}

export function isTrackedWniosekPath(pathname: string): boolean {
  return TRACKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function saveWniosekResume(pathname: string, search?: string): void {
  if (typeof window === "undefined") return;
  if (!isTrackedWniosekPath(pathname)) return;
  try {
    const path = pathname + (search ?? "");
    const payload: Saved = { path, ts: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore — quota/private mode
  }
}

export function loadWniosekResume(): Saved | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (!parsed?.path || !parsed?.ts) return null;
    if (Date.now() - parsed.ts > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearWniosekResume(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function canResumeFrom(pathname: string): boolean {
  return RESUME_FROM.has(pathname);
}
