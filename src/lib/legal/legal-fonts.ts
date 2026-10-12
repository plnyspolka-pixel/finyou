// Fonty do PDF-ów pakietu prawnego (trwały nośnik). Liberation Sans ma komplet
// polskich znaków; licencja SIL OFL — plik LICENSE_LIBERATION obok fontów.
// `?inline` → Vite wkleja plik jako data-URI, więc działa też w Workerze
// (bez dostępu do dysku) i w testach.
import regular from "./fonts/LiberationSans-Regular.ttf?inline";
import bold from "./fonts/LiberationSans-Bold.ttf?inline";
// Liberation Serif — metrycznie zgodny z Times New Roman, którym składany jest
// .docx kompletu umowy; PDF do e-podpisu wygląda więc jak plik Word. Okrojony
// do tego samego zestawu znaków co Liberation Sans (łacina z polskimi znakami).
import serifRegular from "./fonts/LiberationSerif-Regular.ttf?inline";
import serifBold from "./fonts/LiberationSerif-Bold.ttf?inline";
import serifItalic from "./fonts/LiberationSerif-Italic.ttf?inline";

export const LIBERATION_SANS = { regular, bold } as const;
export const LIBERATION_SERIF = {
  regular: serifRegular,
  bold: serifBold,
  italic: serifItalic,
} as const;
