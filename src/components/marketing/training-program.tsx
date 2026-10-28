// Program szkolenia: czego się nauczysz, 7 modułów (lekcja 1 za darmo) i
// prowadzący. Rozwinięcie modułu „Szkolenie i indywidualny mentoring”
// (/dla-inwestora/szkolenie) — przeniesione ze strony głównej 28.10.2026.
import { BrandIcon } from "./brand-icon";
import { FounderPhoto } from "./founder-photo";
import { Icon3D } from "./icon-3d";

const LESSON = "/pobierz/darmowa-lekcja";

const OUTCOMES = [
  "Po szkoleniu potrafisz ocenić księgę wieczystą i hipotekę.",
  "Porównać kwotę finansowania z wartością zabezpieczenia.",
  "Rozpoznać ryzyka klienta i źródło spłaty.",
  "Ustalić warunki, umowę i harmonogram.",
  "Poprowadzić działania, gdy rata nie przychodzi.",
];

const LESSONS = [
  ["Wprowadzenie i strategia", "academy"],
  ["Prawo", "compliance"],
  ["Operacje", "procedures"],
  ["Analiza nieruchomości", "house"],
  ["Analiza klienta", "investors"],
  ["Case study", "dossier"],
  ["Windykacja", "shieldcheck"],
] as const;

export function TrainingProgram() {
  return (
    <>
      <ul className="fy-sales-checks">
        {OUTCOMES.map((t) => (
          <li key={t}>
            <BrandIcon name="check" />
            {t}
          </li>
        ))}
      </ul>
      <ol className="fy-sales-modules">
        {LESSONS.map(([t, icon], i) => (
          <li key={t}>
            <span>0{i + 1}</span>
            <Icon3D name={icon} size={40} />
            <strong>{t}</strong>
            {i === 0 ? <a href={LESSON}>Lekcja 1 za darmo →</a> : <BrandIcon name="lock" />}
          </li>
        ))}
      </ol>
      <div className="fy-sales-founder-line">
        <FounderPhoto small />
        <span>
          Prowadzi: <strong>Filip Bielak</strong> — inwestor z ponad 15-letnim doświadczeniem na
          rynku nieruchomości i pożyczek prywatnych. Absolwent Wydziału Prawa i Administracji UMCS,
          przez lata kierował lubelskim oddziałem PÓŁNOC Nieruchomości. Jego komentarze rynkowe
          publikowała m.in. „Rzeczpospolita”. <a href="/o-nas">Więcej o nas →</a>
        </span>
      </div>
    </>
  );
}
