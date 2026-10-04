// Fonty do PDF-ów pakietu prawnego (trwały nośnik). Liberation Sans ma komplet
// polskich znaków; licencja SIL OFL — plik LICENSE_LIBERATION obok fontów.
// `?inline` → Vite wkleja plik jako data-URI, więc działa też w Workerze
// (bez dostępu do dysku) i w testach.
import regular from "./fonts/LiberationSans-Regular.ttf?inline";
import bold from "./fonts/LiberationSans-Bold.ttf?inline";

export const LIBERATION_SANS = { regular, bold } as const;
