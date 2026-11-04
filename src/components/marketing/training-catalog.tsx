// Program szkolenia na /dla-inwestora/szkolenie (decyzja właściciela 04.11.2026):
// wszystkie opublikowane lekcje pogrupowane w 7 modułów Akademii, czas trwania
// (gdy nagranie ma `duration_seconds`), zakup pojedynczej lekcji (149 zł) albo
// całego modułu (500 zł) do koszyka sklepu (sessionStorage — ten sam koszyk,
// co /sklep) oraz odtwarzacz: prezentacja Finance You gra od razu, lekcja 1
// otwiera się za darmo po zapisie e-mail (/pobierz/darmowa-lekcja), płatne
// lekcje pokazują plakat z kłódką i przyciskami zakupu. Katalog: public
// metadata z getPublicStoreCatalog (bez ścieżek plików).
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, PlayCircle, ShoppingBag } from "lucide-react";
import { getPublicStoreCatalog } from "@/lib/storefront/catalog.functions";
import {
  ACADEMY_MODULES,
  ACADEMY_MODULE_PRICE_PLN,
  ACADEMY_LESSON_PRICE_PLN,
  academyModuleForCatalogLesson,
  type AcademyModule,
} from "@/lib/storefront/products";
import {
  addToStoreCart,
  readStoreCart,
  STORE_CART_PATH,
  type StoreCartItem,
} from "@/lib/storefront/cart-storage";
import { FREE_LESSON_COPY, FREE_LESSON_SLUG } from "@/lib/free-lesson";
import { plnLabel } from "@/lib/investor-plan/plans";
import { CheckIcon } from "./check-icon";
import { FounderPhoto } from "./founder-photo";
import { Icon3D, type Icon3DName } from "./icon-3d";
import { MktButton } from "./primitives";

const LESSON_PATH = "/pobierz/" + FREE_LESSON_SLUG;
const PRESENTATION_URL =
  "https://jqvepxhulxdnbwbogkhe.supabase.co/storage/v1/object/public/studio-media/marketing-materials/Finance You - Kompleksowa Prezentacja (Merged)_1080p_caption (2).mp4";
const PRESENTATION_POSTER = "/marketing/prezentacja-poster.webp";

const OUTCOMES = [
  "Po szkoleniu potrafisz ocenić księgę wieczystą i hipotekę.",
  "Porównać kwotę finansowania z wartością zabezpieczenia.",
  "Rozpoznać ryzyka klienta i źródło spłaty.",
  "Ustalić warunki, umowę i harmonogram.",
  "Poprowadzić działania, gdy rata nie przychodzi.",
];

const MODULE_ICON: Record<number, Icon3DName> = {
  1: "academy",
  2: "compliance",
  3: "procedures",
  4: "house",
  5: "investors",
  6: "dossier",
  7: "shieldcheck",
};

type Catalog = Awaited<ReturnType<typeof getPublicStoreCatalog>>;
type Lesson = Catalog["lessons"][number];

/** „ok. 35 min” / „1 h 10 min”; null, gdy nagranie nie ma czasu w bazie. */
export function formatLessonDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `ok. ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

const cleanTitle = (t: string) => t.replace(/^\s*\d{1,2}\s*[.)]\s*/, "");

export function TrainingCatalog() {
  const fetchCatalog = useServerFn(getPublicStoreCatalog);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());
  const [cartCount, setCartCount] = useState(0);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [openModule, setOpenModule] = useState<number>(1);

  useEffect(() => {
    let alive = true;
    fetchCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => alive && setError(true));
    const cart = readStoreCart();
    setCartIds(new Set(cart.map((i) => i.id)));
    setCartCount(cart.length);
    return () => {
      alive = false;
    };
  }, [fetchCatalog]);

  const byModule = useMemo(() => {
    const map = new Map<number, Lesson[]>();
    for (const l of catalog?.lessons ?? []) {
      const m = academyModuleForCatalogLesson(l);
      if (!m) continue;
      map.set(m.number, [...(map.get(m.number) ?? []), l]);
    }
    return map;
  }, [catalog]);

  const add = (item: StoreCartItem) => {
    const next = addToStoreCart(item);
    setCartIds(new Set(next.map((i) => i.id)));
    setCartCount(next.length);
  };
  const lessonItem = (l: Lesson): StoreCartItem => ({
    id: "lesson:" + l.id,
    type: "lesson",
    title: `Lekcja: ${cleanTitle(l.title)}`,
    price: ACADEMY_LESSON_PRICE_PLN,
  });
  const moduleItem = (m: AcademyModule): StoreCartItem => ({
    id: "course:" + m.id,
    type: "course",
    title: `Akademia — Moduł ${m.number}: ${m.title}`,
    price: ACADEMY_MODULE_PRICE_PLN,
  });
  const academyInCart = cartIds.has("course:academy");
  const moduleInCart = (m: AcademyModule) => academyInCart || cartIds.has("course:" + m.id);
  const lessonCovered = (l: Lesson, m: AcademyModule) =>
    moduleInCart(m) || cartIds.has("lesson:" + l.id);

  const totalKnown =
    catalog && catalog.lessons.length > 0 && catalog.lessons.every((l) => l.durationSeconds)
      ? catalog.lessons.reduce((s, l) => s + (l.durationSeconds ?? 0), 0)
      : null;

  return (
    <>
      <ul className="fy-sales-checks">
        {OUTCOMES.map((t) => (
          <li key={t}>
            <CheckIcon size={22} />
            {t}
          </li>
        ))}
      </ul>

      <div className="fy-tc">
        <div>
          {error && (
            <p role="alert" style={{ color: "var(--muted-foreground)" }}>
              Nie udało się pobrać listy lekcji. Odśwież stronę albo zobacz{" "}
              <a href="/sklep#akademia">Akademię w sklepie</a>.
            </p>
          )}
          <div className="fy-tc-modules">
            {ACADEMY_MODULES.map((m) => {
              const lessons = byModule.get(m.number) ?? [];
              const sum =
                lessons.length && lessons.every((l) => l.durationSeconds)
                  ? lessons.reduce((s, l) => s + (l.durationSeconds ?? 0), 0)
                  : null;
              const inCart = moduleInCart(m);
              return (
                <details
                  key={m.id}
                  className="fy-tc-module"
                  open={openModule === m.number}
                  onToggle={(e) => {
                    if ((e.currentTarget as HTMLDetailsElement).open) setOpenModule(m.number);
                  }}
                >
                  <summary>
                    <img src={m.image} alt="" loading="lazy" />
                    <div className="fy-tc-module-title">
                      <small>Moduł {m.number}</small>
                      <strong>{m.title}</strong>
                      <span>
                        {lessons.length
                          ? `${lessons.length} ${lessons.length === 1 ? "lekcja" : lessons.length < 5 ? "lekcje" : "lekcji"}`
                          : catalog || error
                            ? `${m.topics.length} tematy`
                            : "wczytywanie…"}
                        {sum ? ` · ${formatLessonDuration(sum)}` : ""}
                        {m.number === 1 ? " · lekcja 1 za darmo" : ""}
                      </span>
                    </div>
                    <div className="fy-tc-module-buy">
                      <strong>{plnLabel(ACADEMY_MODULE_PRICE_PLN)}</strong>
                      <button
                        type="button"
                        className="fy-tc-btn fy-tc-btn--gold"
                        disabled={inCart}
                        onClick={(e) => {
                          e.preventDefault();
                          add(moduleItem(m));
                        }}
                        aria-label={`Dodaj do koszyka cały moduł ${m.number}: ${m.title}`}
                      >
                        {academyInCart ? "✓ W pakiecie" : inCart ? "✓ W koszyku" : "+ Cały moduł"}
                      </button>
                    </div>
                  </summary>
                  <ol className="fy-tc-lessons">
                    {lessons.length === 0 && (
                      <li className="fy-tc-lesson" style={{ gridTemplateColumns: "1fr" }}>
                        <small>
                          {catalog || error ? m.topics.join(" · ") : "Wczytywanie lekcji…"}
                        </small>
                      </li>
                    )}
                    {lessons.map((l) => {
                      const free = l.free || l.number === 1;
                      const dur = formatLessonDuration(l.durationSeconds);
                      const active = selected?.id === l.id;
                      return (
                        <li key={l.id} className={active ? "fy-tc-lesson active" : "fy-tc-lesson"}>
                          <span>{String(l.number).padStart(2, "0")}</span>
                          <button
                            type="button"
                            className="fy-tc-pick"
                            onClick={() => {
                              setSelected(l);
                              document
                                .getElementById("fy-tc-player")
                                ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                            }}
                            aria-pressed={active}
                          >
                            <span>{cleanTitle(l.title)}</span>
                            <small>
                              {free ? "Za darmo" : plnLabel(ACADEMY_LESSON_PRICE_PLN)}
                              {dur ? ` · ${dur}` : ""}
                            </small>
                          </button>
                          <div className="fy-tc-lesson-cta">
                            {free ? (
                              <a className="fy-tc-btn fy-tc-btn--gold" href={LESSON_PATH}>
                                <PlayCircle size={14} style={{ verticalAlign: -2 }} /> Obejrzyj
                              </a>
                            ) : (
                              <button
                                type="button"
                                className="fy-tc-btn"
                                disabled={lessonCovered(l, m)}
                                onClick={() => add(lessonItem(l))}
                                aria-label={`Dodaj do koszyka lekcję: ${cleanTitle(l.title)}`}
                              >
                                {moduleInCart(m)
                                  ? "✓ W module"
                                  : cartIds.has("lesson:" + l.id)
                                    ? "✓ W koszyku"
                                    : "+ Do koszyka"}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </details>
              );
            })}
          </div>

          <div className="fy-tc-cartbar" role="status">
            <span>
              <ShoppingBag size={16} style={{ verticalAlign: -3, marginRight: 6 }} />W koszyku:{" "}
              <strong>{cartCount}</strong>
              {totalKnown ? ` · całe szkolenie: ${formatLessonDuration(totalKnown)}` : ""}
            </span>
            <MktButton variant={cartCount ? "gold" : "outline"} size="sm" href={STORE_CART_PATH}>
              {cartCount ? "Przejdź do koszyka →" : "Zobacz sklep →"}
            </MktButton>
          </div>
        </div>

        <aside id="fy-tc-player" className="fy-tc-player" aria-label="Odtwarzacz">
          {selected ? (
            <LessonPoster
              lesson={selected}
              module={academyModuleForCatalogLesson(selected)}
              covered={(() => {
                const m = academyModuleForCatalogLesson(selected);
                return m ? lessonCovered(selected, m) : cartIds.has("lesson:" + selected.id);
              })()}
              onAddLesson={() => add(lessonItem(selected))}
              onAddModule={() => {
                const m = academyModuleForCatalogLesson(selected);
                if (m) add(moduleItem(m));
              }}
              onBack={() => setSelected(null)}
            />
          ) : (
            <>
              <video
                controls
                playsInline
                preload="metadata"
                poster={PRESENTATION_POSTER}
                src={encodeURI(PRESENTATION_URL)}
                aria-label="Finance You — kompleksowa prezentacja"
              />
              <div className="fy-tc-player-body">
                <h3>Zobacz, jak wygląda szkolenie i narzędzia</h3>
                <p>
                  Prezentacja Finance You (ok. 3 min). Lekcja 1 — „{FREE_LESSON_COPY.title}” (ok. 35
                  min) — jest za darmo: obejrzysz ją od razu po zapisie e-mail.
                </p>
                <div className="fy-tc-player-actions">
                  <MktButton variant="gold" size="sm" href={LESSON_PATH}>
                    Obejrzyj darmową lekcję
                  </MktButton>
                  <MktButton variant="outline" size="sm" href="/#cennik">
                    Całość w abonamencie
                  </MktButton>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

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

function LessonPoster({
  lesson,
  module,
  covered,
  onAddLesson,
  onAddModule,
  onBack,
}: {
  lesson: Lesson;
  module: AcademyModule | null;
  covered: boolean;
  onAddLesson: () => void;
  onAddModule: () => void;
  onBack: () => void;
}) {
  const free = lesson.free || lesson.number === 1;
  const dur = formatLessonDuration(lesson.durationSeconds);
  const poster = lesson.thumbnail ?? module?.image ?? PRESENTATION_POSTER;
  return (
    <>
      <div className="fy-tc-poster">
        <img src={poster} alt="" loading="lazy" />
        <div className="fy-tc-poster-overlay">
          {free ? <PlayCircle size={44} color="#f0c667" /> : <Lock size={36} color="#f0c667" />}
          <strong>{cleanTitle(lesson.title)}</strong>
          <span style={{ fontSize: ".8rem", opacity: 0.85 }}>
            {module ? `Moduł ${module.number}: ${module.title}` : ""}
            {dur ? ` · ${dur}` : ""}
          </span>
        </div>
      </div>
      <div className="fy-tc-player-body">
        {free ? (
          <>
            <h3>Lekcja 1 jest za darmo</h3>
            <p>Zapisz się e-mailem, a odtwarzacz otworzy się od razu. Link działa 30 dni.</p>
            <div className="fy-tc-player-actions">
              <MktButton variant="gold" size="sm" href={LESSON_PATH}>
                Obejrzyj darmową lekcję
              </MktButton>
              <button type="button" className="fy-tc-btn" onClick={onBack}>
                ← Prezentacja
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>
              Lekcja {lesson.number} — {plnLabel(ACADEMY_LESSON_PRICE_PLN)}
            </h3>
            <p>
              {lesson.description?.trim() ||
                "Pojedyncza lekcja wideo do obejrzenia w „Moich zakupach” po płatności Tpay. Cały moduł jest tańszy w przeliczeniu na lekcję, a w abonamencie partnera masz całe szkolenie."}
            </p>
            <div className="fy-tc-player-actions">
              <button
                type="button"
                className="fy-tc-btn fy-tc-btn--gold"
                disabled={covered}
                onClick={onAddLesson}
              >
                {covered ? "✓ W koszyku" : `+ Lekcja za ${plnLabel(ACADEMY_LESSON_PRICE_PLN)}`}
              </button>
              {module && (
                <button type="button" className="fy-tc-btn" onClick={onAddModule}>
                  Cały moduł {module.number} za {plnLabel(ACADEMY_MODULE_PRICE_PLN)}
                </button>
              )}
              <button type="button" className="fy-tc-btn" onClick={onBack}>
                ← Prezentacja
              </button>
            </div>
            {module && (
              <p>
                <Icon3D name={MODULE_ICON[module.number] ?? "academy"} size={18} />{" "}
                {module.topics.join(" · ")}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
