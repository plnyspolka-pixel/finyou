import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Check, ChevronDown, FileSignature, FileText, GraduationCap, Landmark, LockKeyhole, Search, ShieldCheck, ShoppingBag, Trash2, WandSparkles } from "lucide-react";
import { MarketingShell } from "@/components/marketing/shell";
import { Section, SectionHead } from "@/components/marketing/sections";
import { Eyebrow, MktBadge, MktButton } from "@/components/marketing/primitives";
import { Icon3D } from "@/components/marketing/icon-3d";
import { getPublicStoreCatalog } from "@/lib/storefront/catalog.functions";
import { createStoreCheckout, getStoreLegalTexts } from "@/lib/storefront/checkout.functions";
import { validateKwNumber } from "@/lib/kw";
import { FREE_LESSON_SLUG } from "@/lib/free-lesson";

/**
 * Finance You investor storefront: public metadata, no private source files.
 * Payments and per-item entitlements MUST exist server-side before granting
 * any access. Cart currently creates a purchase enquiry, not a transaction.
 */
export const Route = createFileRoute("/sklep")({
  head: () => ({ meta: [
    { title: "Sklep inwestora — Akademia, dokumenty i analizy | Finance You" },
    { name: "description", content: "Lekcje Akademii Inwestora, Kancelaria AI, analiza księgi wieczystej i zlecenia poszukiwania okazji w Finance You." },
  ], links: [{ rel: "canonical", href: "https://financeyou.pl/sklep" }] }),
  component: Storefront,
});

type Catalog = Awaited<ReturnType<typeof getPublicStoreCatalog>>;
type Lesson = Catalog["lessons"][number];
type Document = Catalog["documents"][number];
type CartItem = { id: string; type: "lesson" | "document" | "course" | "kw"; title: string; price: number };
const GOLD = "#f0c667";
const PLN = (n: number) => n.toLocaleString("pl-PL") + " zł";
const lessonDuration = (seconds: number | null) => seconds && seconds > 0 ? `ok. ${Math.max(1, Math.round(seconds / 60))} min` : "Czas nieustalony";
const gradients = [
  "linear-gradient(135deg,#0f2865,#316a9c)",
  "linear-gradient(135deg,#33215f,#855a9e)",
  "linear-gradient(135deg,#194c57,#287b81)",
  "linear-gradient(135deg,#4a293c,#9b565e)",
  "linear-gradient(135deg,#3a3b1d,#9a8239)",
  "linear-gradient(135deg,#113862,#5371aa)",
  "linear-gradient(135deg,#2e386b,#6562ab)",
  "linear-gradient(135deg,#293c49,#638b93)",
];
const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(138,163,228,.25)",
  borderRadius: "1.25rem",
  background: "linear-gradient(145deg,rgba(18,30,70,.94),rgba(9,16,42,.96))",
  boxShadow: "0 14px 35px rgba(0,0,0,.14)",
};
const desc: React.CSSProperties = { color: "rgba(222,231,250,.73)", lineHeight: 1.65 };
const badge: React.CSSProperties = { color: GOLD, letterSpacing: ".1em", fontSize: ".68rem", fontWeight: 850, textTransform: "uppercase" };
function CatalogHeader({ eyebrow, title, copy, id }: { eyebrow: string; title: string; copy: string; id: string }) {
  return <div id={id} className="fy-store-section-head">
    <Eyebrow tone="gold">{eyebrow}</Eyebrow>
    <h2>{title}</h2>
    <p>{copy}</p>
  </div>;
}

function Storefront() {
  const fetchCatalog = useServerFn(getPublicStoreCatalog);
  const fetchLegal = useServerFn(getStoreLegalTexts);
  const startCheckout = useServerFn(createStoreCheckout);
  const [legalTexts, setLegalTexts] = useState<Awaited<ReturnType<typeof getStoreLegalTexts>> | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [immediateAccepted, setImmediateAccepted] = useState(false);
  const [withdrawalAcknowledged, setWithdrawalAcknowledged] = useState(false);
  const [dpaAccepted, setDpaAccepted] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [kw, setKw] = useState("");
  const [kwError, setKwError] = useState("");
  const [kwReady, setKwReady] = useState(false);
  const [kwLegitimatePurpose, setKwLegitimatePurpose] = useState(false);
  const [tab, setTab] = useState<"all" | "law" | "cases">("all");
  const [cartOpen, setCartOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchCatalog().then((data) => { if (alive) setCatalog(data); }).catch(() => { if (alive) setLoadError(true); });
    fetchLegal().then((data) => { if (alive) setLegalTexts(data); }).catch(() => { if (alive) setPayError("Nie udało się załadować regulaminu."); });
    return () => { alive = false; };
  }, [fetchCatalog, fetchLegal]);
  // Keep the basket only for this browser tab so returning from investor login
  // doesn't silently discard the checkout. KW numbers are not persisted long-term.
  useEffect(() => {
    try {
      const previous = JSON.parse(sessionStorage.getItem("fy-store-cart-v1") || "[]");
      if (Array.isArray(previous)) setCart(previous.filter((x) =>
        x && typeof x.id === "string" && ["lesson","document","course","kw"].includes(x.type) &&
        typeof x.title === "string" && Number.isFinite(x.price)).slice(0,50));
    } catch { /* no saved cart */ }
    setCartHydrated(true);
  }, []);
  useEffect(() => {
    if (!cartHydrated) return;
    try { sessionStorage.setItem("fy-store-cart-v1", JSON.stringify(cart)); }
    catch { /* storage disabled */ }
  }, [cart,cartHydrated]);
  const itemIds = useMemo(() => new Set(cart.map((i) => i.id)), [cart]);
  const total = cart.reduce((sum, i) => sum + i.price, 0);
  const add = (item: CartItem) => {
    setCart((items) => items.some((i) => i.id === item.id) ? items : [...items, item]);
  };
  const remove = (id: string) => setCart((items) => items.filter((item) => item.id !== id));
  const courseInCart = itemIds.has("course:academy");
  const chosenLessons = useMemo(() => catalog?.lessons.filter((l) => {
    if (tab === "law") return /prawo|prawn|kredyt|lichwa|kodeks/i.test(l.title + " " + l.category);
    if (tab === "cases") return /case|stud|windykacj|egzekucj/i.test(l.title + " " + l.category);
    return true;
  }) ?? [], [catalog, tab]);

  const needsDpa = cart.some((i) => i.type === "document");
  const checkoutAllowed = Boolean(
    cart.length && legalTexts && buyerName.trim().length >= 3 &&
    termsAccepted && immediateAccepted && withdrawalAcknowledged &&
    (!needsDpa || dpaAccepted) &&
    (!cart.some((i) => i.type === "kw") || kwLegitimatePurpose)
  );
  async function payForCart() {
    if (!checkoutAllowed || paying) return;
    setPaying(true);
    setPayError("");
    try {
      const result = await startCheckout({ data: {
        buyerName: buyerName.trim(),
        cart: cart.map((i) => {
          if (i.type === "course") return { kind: "course" as const, id: "academy" };
          const pos = i.id.indexOf(":");
          return { kind: i.type as "lesson" | "document" | "kw", id: i.id.slice(pos + 1) };
        }),
        terms: true, immediate: true, withdrawalAcknowledgement: true,
        dpa: needsDpa && dpaAccepted, kwPurpose: kwLegitimatePurpose,
      } });
      window.location.assign(result.paymentUrl);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Nie udało się rozpocząć płatności.");
      setPaying(false);
    }
  }

  function checkKw(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setKwReady(false);
    const check = validateKwNumber(kw);
    if (!check.ok) { setKwError(check.message); return; }
    if (!kwLegitimatePurpose) { setKwError("Potwierdź, że masz uprawniony cel analizy danych księgi."); return; }
    setKw(check.value);
    setKwError("");
    setKwReady(true);
    add({ id: "kw:" + check.compact, type: "kw" as CartItem["type"],
      title: "Raport księgi wieczystej " + check.value, price: 99 });
  }

  return <MarketingShell page="sklep">
    <section className="fy-hero fy-store-hero">
      <div aria-hidden className="fy-hero-fx" />
      <div className="fy-store-hero-grid">
        <div className="fy-store-hero-copy">
          <Eyebrow tone="gold">FINANCE YOU · SKLEP INWESTORA</Eyebrow>
          <h1>Wiedza, dokumenty i analizy.<span> Wszystko dla inwestora.</span></h1>
          <p>Od pierwszej pożyczki po zarządzanie całym portfelem. Wybieraj konkretne narzędzia, które pomagają podejmować świadome decyzje.</p>
          <div className="fy-store-actions">
            <MktButton variant="gold" href="#akademia" size="lg">Przejrzyj lekcje</MktButton>
            <MktButton variant="outline" href="#kancelaria" size="lg">Generator dokumentów</MktButton>
          </div>
          <div className="fy-store-trust"><span><Check size={16} /> 28 lekcji</span><span><Check size={16} /> Kancelaria AI</span><span><Check size={16} /> Analizy KW</span></div>
        </div>
        <div className="fy-store-hero-film">
          <video controls playsInline preload="metadata" poster="/marketing/prezentacja-poster.webp"
            src={encodeURI("https://jqvepxhulxdnbwbogkhe.supabase.co/storage/v1/object/public/studio-media/marketing-materials/Finance You - Kompleksowa Prezentacja (Merged)_1080p_caption (2).mp4")}
            aria-label="Prezentacja Finance You — narzędzia dla inwestora" />
          <div className="fy-store-film-caption">Zobacz, jak Finance You wspiera inwestorów <span>▶</span></div>
        </div>
      </div>
    </section>

    <div className="fy-store-jump-nav" aria-label="Produkty sklepu">
      <a href="#akademia">Akademia</a><a href="#kancelaria">Generator dokumentów</a>
      <a href="#analityk">Analityk KW</a><a href="#windykator-ai">Windykator AI</a><a href="#centrum">Zarządzanie</a><a href="#siecsprzedazy">Okazje</a>
      <button type="button" onClick={() => { setCartOpen((v) => !v); document.getElementById("koszyk")?.scrollIntoView({ behavior: "smooth" }); }}><ShoppingBag size={16} /> Koszyk ({cart.length})</button>
    </div>

    <Section>
      <CatalogHeader id="akademia" eyebrow="01 / AKADEMIA INWESTORA" title="Wybierz lekcje, których potrzebujesz" copy="Pełny program Akademii — wszystkie opublikowane lekcje. Tylko lekcja pierwsza jest bezpłatna. Pozostałe możesz zamawiać pojedynczo lub jako cały pakiet." />
      <div className="fy-store-course-banner" style={panelStyle}>
        <img src="/marketing/moduly/szkolenie-1.webp" alt="" loading="lazy" />
        <div><MktBadge variant="gold">KOMPLETNY PROGRAM</MktBadge><h3>Cała Akademia Inwestora</h3><p>{catalog?.lessons.length ?? 28} lekcji. Od strategii inwestowania, przez analizę nieruchomości i prawo, po windykację i case studies. {catalog?.lessons.length && catalog.lessons.every(l => l.durationSeconds != null) ? `Łącznie ${lessonDuration(catalog.lessons.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0))}.` : ""}</p></div>
        <div className="fy-store-course-price"><strong>1 990 zł</strong>
          <button className="fy-store-add" type="button" onClick={() => add({ id:"course:academy",type:"course", title:"Pełna Akademia Inwestora — 28 lekcji",price:1990 })}>{courseInCart ? "✓ W koszyku" : "+ Dodaj pakiet"}</button>
        </div>
      </div>
      <div className="fy-store-filter" role="group" aria-label="Filtr lekcji">
        <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>Wszystkie lekcje</button>
        <button className={tab === "law" ? "active" : ""} onClick={() => setTab("law")}>Prawo i regulacje</button>
        <button className={tab === "cases" ? "active" : ""} onClick={() => setTab("cases")}>Praktyka i case studies</button>
      </div>
      {loadError && <p role="alert">Nie udało się pobrać katalogu. Spróbuj odświeżyć stronę.</p>}
      {!catalog && !loadError && <p aria-live="polite" style={desc}>Ładowanie aktualnego katalogu lekcji i dokumentów…</p>}
      <div className="fy-store-catalog-grid">
        {chosenLessons.map((lesson: Lesson, index: number) => {
          const free = lesson.number === 1;
          const id = "lesson:" + lesson.id;
          const inCart = itemIds.has(id) || courseInCart;
          return <article className="fy-store-item" key={id}>
            <div className="fy-store-lesson-art" style={{ background: gradients[(lesson.number - 1) % gradients.length] }}>
              {lesson.thumbnail && <img src={lesson.thumbnail} alt="" loading="lazy" />}
              <div className="fy-store-image-dim" />
              <span className="fy-store-lesson-no">{String(lesson.number).padStart(2,"0")}</span>
              <GraduationCap className="fy-store-art-icon" size={32} aria-hidden />
              <span className="fy-store-art-series">AKADEMIA FINANCE YOU</span>
            </div>
            <div className="fy-store-item-body">
              <div style={badge}>{lesson.category}</div>
              <h3>{lesson.title.replace(/^\d+\.\s*/, "")}</h3>
              <p className="text-xs text-muted-foreground" aria-label="Czas trwania lekcji">{lessonDuration(lesson.durationSeconds)}</p>
              <div className="fy-store-item-footer">
                {free ? <><span className="fy-store-free">DARMOWA</span><MktButton variant="gold" size="sm" href={"/pobierz/" + FREE_LESSON_SLUG}>Obejrzyj za darmo</MktButton></> :
                <><strong>{PLN(149)}</strong><button type="button" className="fy-store-add" aria-label={"Dodaj do koszyka: " + lesson.title}
                  onClick={() => add({ id,type:"lesson",title:lesson.title,price:149 })} disabled={inCart}>
                  {inCart ? "✓ W koszyku" : "+ Dodaj do koszyka"}
                </button></>}
              </div>
            </div>
          </article>;
        })}
      </div>
    </Section>

    <Section tint>
      <CatalogHeader id="kancelaria" eyebrow="02 / KANCELARIA AI" title="Generator dokumentów" copy="Jedno miejsce do przygotowywania pism. Wybierz dokument z biblioteki, uzupełnij dane i wygeneruj gotowy plik DOCX." />
      <div className="fy-store-free-contract" style={panelStyle}>
        <div className="fy-store-free-icon"><FileSignature size={44}/></div>
        <div>
          <span className="fy-store-free">JEDEN GENERATOR · WIELE WZORÓW</span>
          <h3>Generator dokumentów Finance You</h3>
          <p>Wybierz rodzaj pisma spośród dostępnych szablonów, zobacz podgląd, uzupełnij dane i kliknij „Generuj dokument”. Otworzysz rzeczywisty kreator Finance You, z kontrolą uprawnień dla Twojego konta.</p>
          <small>Dokumenty nie są sprzedawane pojedynczo. Dostęp do kreatora zależy od posiadanych uprawnień.</small>
        </div>
        <MktButton variant="gold" href="/inwestor/dokumenty">Wybierz pismo i generuj</MktButton>
      </div>
    </Section>

    <Section>
      <div id="analityk" className="fy-store-split" style={panelStyle}>
        <div className="fy-store-feature-intro">
          <Icon3D name="ai" size={64}/>
          <Eyebrow tone="gold">03 / ANALITYK AI</Eyebrow>
          <h2>Co mówi księga wieczysta?</h2>
          <p>Wpisz numer księgi, aby przygotować zamówienie profesjonalnego raportu analitycznego. Sprawdzimy formalną poprawność numeru, łącznie z cyfrą kontrolną.</p>
          <div className="fy-store-feature-price">99 zł <small>/ analiza jednej KW</small></div>
          <img src="/marketing/moduly/analityk-ai-1.webp" alt="Analiza księgi wieczystej Finance You" loading="lazy"/>
        </div>
        <form className="fy-store-kw-form" onSubmit={checkKw}>
          <label htmlFor="fy-store-kw">Numer księgi wieczystej</label>
          <input id="fy-store-kw" autoComplete="off" spellCheck={false} value={kw}
            onChange={(e) => { setKw(e.target.value.toUpperCase()); setKwError(""); setKwReady(false); }}
            onBlur={() => { const v = validateKwNumber(kw); if (v.ok) setKw(v.value); }}
            placeholder="LU1I/00012345/6" aria-invalid={!!kwError} aria-describedby="fy-kw-help fy-kw-error" />
          <small id="fy-kw-help">Format XXXX/12345678/9. Numer i cyfra kontrolna są sprawdzane według reguł EKW.</small>
          <label className="fy-store-check"><input type="checkbox" checked={kwLegitimatePurpose} onChange={(e) => setKwLegitimatePurpose(e.target.checked)}/>
            <span>Potwierdzam, że mam uprawniony cel analizy danych zawartych w tej księdze wieczystej. <a href="/polityka-prywatnosci">Informacja o przetwarzaniu danych</a>.</span>
          </label>
          {kwError && <p id="fy-kw-error" className="fy-store-error" role="alert">{kwError}</p>}
          <button type="submit" className="fy-store-add fy-store-kw-submit">Dodaj raport do koszyka — 99 zł</button>
          {kwReady && <div className="fy-store-kw-ready" role="status"><ShieldCheck size={20}/><div>
            Numer <strong>{kw}</strong> jest poprawny formalnie. Raport został dodany do koszyka. Pobranie i analiza rozpoczną się dopiero po płatności.
            <p>Po potwierdzeniu płatności pobierz raport na stronie „Moje zakupy”.</p>
          </div></div>}
          <p className="fy-store-fineprint"><LockKeyhole size={15}/> Bez potwierdzonej płatności nie pobieramy księgi ani nie generujemy płatnego raportu.</p>
        </form>
      </div>
    </Section>


    <Section>
      <div id="windykator-ai" className="fy-store-split fy-store-plain-feature" style={panelStyle}>
        <div>
          <Eyebrow tone="gold">04 / WINDYKATOR AI</Eyebrow>
          <h2>Nieopłacona faktura? Zacznij od dokumentów.</h2>
          <p>Pakiet Startowy za 50 zł brutto: automatyczny odczyt faktury lub umowy, raport roszczenia, projekt wezwania do zapłaty i wstępny pakiet dla właściwej ścieżki sądowej (EPU, pozew zwykły, 777 lub egzekucja).</p>
          <div className="fy-store-feature-price">50 zł <small>/ jedna sprawa · jednorazowo</small></div>
          <div className="fy-store-pipeline"><ShieldCheck size={20}/><span>Weryfikacja tożsamości i uprawnienia wierzyciela, prywatne przechowywanie dokumentu oraz płatność przez Tpay po uruchomieniu usługi.</span></div>
          <div className="fy-store-actions"><MktButton variant="gold" size="lg" href="/windykator-ai">Przejdź do Pakietu Startowego</MktButton></div>
          <small>Osobna, bezpłatna 90-dniowa windykacja polubowna wymaga dodatkowej kwalifikacji. Na etapie Pakietu Startowego system nie kontaktuje się automatycznie z dłużnikiem.</small>
        </div>
        <img src="/marketing/windykacja/etap-1.png" alt="Windykator AI — analiza i dokumentacja sprawy" loading="lazy"/>
      </div>
    </Section>

    <Section tint>
      <div id="centrum" className="fy-store-split fy-store-plain-feature" style={panelStyle}>
        <div><Icon3D name="crm" size={64}/><Eyebrow tone="gold">04 / CENTRUM ZARZĄDZANIA</Eyebrow>
          <h2>Twój portfel pod kontrolą.</h2><p>Harmonogramy, dokumenty, analityka, AML/compliance i Windykator AI w jednym miejscu. Bez przełączania się między osobnymi systemami.</p>
          <MktButton variant="gold" href="/dla-inwestora/aml-compliance">Poznaj Centrum Zarządzania</MktButton>
        </div>
        <img src="/marketing/moduly/aml-compliance-1.webp" alt="Centrum Zarządzania Finance You" loading="lazy"/>
      </div>
    </Section>

    <Section>
      <div id="siecsprzedazy" className="fy-store-split fy-store-plain-feature" style={panelStyle}>
        <div><Icon3D name="investors" size={64}/><Eyebrow tone="gold">05 / OGÓLNOPOLSKA SIEĆ SPRZEDAŻY</Eyebrow>
          <h2>Zleć nam poszukiwanie okazji.</h2>
          <p>Nasi specjaliści wybiorą dla Ciebie okazje inwestycyjne dopasowane do wskazanego przedziału finansowego. Otrzymasz do pięciu propozycji finansowania wraz z kompletnymi raportami, które pomogą Ci ocenić zabezpieczenia i ryzyko.</p>
          <div className="fy-store-pipeline"><ShieldCheck size={20}/><span>Przed złożeniem zlecenia przejdziesz istniejącą weryfikację KYC, screening PEP/sankcji, oświadczenie o źródle środków oraz akceptację umowy ramowej, NDA i RODO.</span></div>
          <div className="fy-store-actions"><MktButton variant="gold" href="/inwestor/umowy">Złóż zlecenie</MktButton>
            <MktButton variant="outline" href="/rejestracja?role=inwestor">Nie masz konta? Zarejestruj się</MktButton></div>
          <small>Formularz i dostęp do danych klientów są odblokowywane przez istniejące kontrole po stronie serwera. Liczba propozycji zależy od dostępnych spraw spełniających kryteria.</small>
        </div>
        <img src="/marketing/moduly/siec-sprzedazy-1.webp" alt="Ogólnopolska Sieć Sprzedaży Finance You" loading="lazy"/>
      </div>
    </Section>

    <Section tint>
      <div className="fy-store-bundle" style={panelStyle}>
        <div><MktBadge variant="gold">WSZYSTKO W JEDNYM</MktBadge><h2>Finance You Kompletny</h2><p>Aktualny abonament inwestora: program szkoleniowy, narzędzia panelu i konsultacje. Dostęp do spraw zgodnie z obowiązującymi warunkami i po spełnieniu wymagań KYC/AML.</p></div>
        <div><strong>7 000 zł <small>/ rok</small></strong><MktButton variant="gold" size="lg" href="/abonament-inwestora">Kup abonament</MktButton></div>
      </div>
    </Section>

    <Section>
      <div id="koszyk" className="fy-store-cart" style={panelStyle}>
        <p><MktButton variant="outline" size="sm" href="/sklep/moje-zakupy">Moje zakupy i pobrane raporty</MktButton></p>
        <div className="fy-store-cart-title"><ShoppingBag size={28}/><div><Eyebrow tone="gold">TWOJE WYBRANE PRODUKTY</Eyebrow><h2>Koszyk <span>({cart.length})</span></h2></div></div>
        {cart.length === 0 ? <p style={desc}>Wybierz lekcje lub dokumenty, klikając „Dodaj do koszyka”.</p> :
          <><ul>{cart.map((i) => <li key={i.id}><span>{i.title}</span><strong>{PLN(i.price)}</strong>
            <button aria-label={"Usuń " + i.title} onClick={() => remove(i.id)}><Trash2 size={18}/></button></li>)}</ul>
            <div className="fy-store-cart-total"><span>Łącznie</span><strong>{PLN(total)}</strong></div>
            <div className="fy-store-checkout-form">
              <label htmlFor="fy-store-buyer">Imię i nazwisko / nazwa nabywcy</label>
              <input id="fy-store-buyer" value={buyerName} onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Wpisz dane nabywcy" autoComplete="name" />
              <p className="fy-store-fineprint">Do płatności wymagane jest zalogowane konto z potwierdzonym adresem e-mail. Potwierdzenie trafi na adres przypisany do konta. <a href="/logowanie" style={{ color: "#f0c667", textDecoration: "underline" }}>Zaloguj się</a> lub <a href="/rejestracja?role=inwestor" style={{ color: "#f0c667", textDecoration: "underline" }}>załóż konto inwestora</a>. Koszyk pozostanie w tej karcie po powrocie.</p>
              <details><summary>Regulamin sklepu — przeczytaj pełną treść</summary>
                <pre>{legalTexts?.terms.text ?? "Wczytywanie..."}</pre>
              </details>
              <label className="fy-store-consent"><input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)}/>
                <span>Zapoznałem się z regulaminem sklepu i akceptuję jego treść (wersja {legalTexts?.terms.version}).</span>
              </label>
              <label className="fy-store-consent"><input type="checkbox" checked={immediateAccepted} onChange={(e) => setImmediateAccepted(e.target.checked)}/>
                <span>Wyraźnie żądam rozpoczęcia dostarczania zakupionych treści cyfrowych przed upływem terminu odstąpienia.</span>
              </label>
              <label className="fy-store-consent"><input type="checkbox" checked={withdrawalAcknowledged} onChange={(e) => setWithdrawalAcknowledged(e.target.checked)}/>
                <span>Przyjmuję do wiadomości, że po rozpoczęciu dostarczania treści cyfrowych mogę utracić ustawowe prawo odstąpienia, gdy spełnione zostaną wymagania prawa.</span>
              </label>
              {needsDpa && <><details><summary>Umowa powierzenia danych (art. 28 RODO) — przeczytaj</summary>
                  <pre>{legalTexts?.dpa.text ?? "Wczytywanie..."}</pre></details>
                <label className="fy-store-consent"><input type="checkbox" checked={dpaAccepted} onChange={(e) => setDpaAccepted(e.target.checked)}/>
                  <span>Akceptuję odrębną umowę powierzenia danych w zakresie korzystania z generatora dokumentów (wersja {legalTexts?.dpa.version}).</span>
                </label></>}
              {payError && <p role="alert" className="fy-store-error">{payError}</p>}
            </div>
            <div className="fy-store-cart-actions">
              <button type="button" className="fy-store-add fy-store-pay" disabled={!checkoutAllowed || paying}
                onClick={() => void payForCart()}>{paying ? "Łączenie z Tpay..." : "Przejdź do płatności Tpay — " + PLN(total)}</button>
              <button className="fy-store-clear" onClick={() => setCart([])}>Wyczyść koszyk</button>
            </div>
            <p className="fy-store-fineprint">Ceny są obliczane ponownie na serwerze. Sam powrót z bramki Tpay nie daje dostępu do materiałów — zakup uruchamia się po potwierdzeniu płatności z serwera Tpay.</p>
          </>}
      </div>
      <p className="fy-store-privacy">Dane wprowadzane do generatora dokumentów, analityka KW i podpisów mogą być danymi osobowymi. <a href="/polityka-prywatnosci">Polityka prywatności</a> · <a href="/regulamin">Regulamin</a>. Zapis na marketing nie jest wymagany do złożenia zapytania zakupowego.</p>
    </Section>
    <style>{`
      .fy-store-hero {color:#fff;}
      .fy-store-hero-grid {position:relative;max-width:80rem;margin:auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.02fr);gap:2.5rem;align-items:center;padding:4rem 1.5rem;}
      .fy-store-hero-copy h1{font-size:clamp(2.25rem,3.6vw,3.65rem);font-weight:900;line-height:1.1;margin:1.2rem 0 1.4rem;}
      .fy-store-hero-copy h1 span{color:${GOLD};}
      .fy-store-hero-copy>p{font-size:1.04rem;line-height:1.7;color:rgba(255,255,255,.8);}
      .fy-store-actions{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:1.5rem;}
      .fy-store-trust{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:1.4rem;color:rgba(238,244,255,.68);font-size:.8rem;}
      .fy-store-trust span{display:flex;align-items:center;gap:.25rem;}
      .fy-store-hero-film{background:#08132b;border:1px solid rgba(240,198,103,.25);border-radius:1.1rem;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.28);}
      .fy-store-hero-film video{width:100%;display:block;aspect-ratio:16/9;object-fit:contain;background:#050a16;}
      .fy-store-film-caption{padding:.85rem 1rem;display:flex;justify-content:space-between;color:#e5e9f4;font-size:.84rem;font-weight:700;}
      .fy-store-film-caption span{color:${GOLD};}
      .fy-store-jump-nav{position:relative;display:flex;flex-wrap:wrap;justify-content:center;gap:.4rem;padding:.8rem 1rem;background:#0b1432;border-bottom:1px solid rgba(255,255,255,.1);}
      .fy-store-jump-nav a,.fy-store-jump-nav button{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.12);color:#edf1fc;padding:.55rem .9rem;font-size:.77rem;border-radius:999px;text-decoration:none;display:flex;align-items:center;gap:.3rem;cursor:pointer;}
      .fy-store-jump-nav button{color:${GOLD};}
      .fy-store-section-head{scroll-margin-top:5rem;margin:0 0 1.65rem;max-width:55rem;}
      .fy-store-section-head h2,.fy-store-plain-feature h2,.fy-store-feature-intro h2{font-size:clamp(1.75rem,3vw,2.5rem);line-height:1.17;font-weight:880;margin:.65rem 0;}
      .fy-store-section-head p,.fy-store-plain-feature p,.fy-store-feature-intro p{line-height:1.7;color:var(--muted-foreground);}
      .fy-store-course-banner{display:grid;grid-template-columns:9rem minmax(0,1fr) auto;align-items:center;gap:1.3rem;padding:1rem;margin:0 0 1.6rem;color:white;}
      .fy-store-course-banner>img{width:9rem;aspect-ratio:1/1;object-fit:cover;border-radius:.7rem;}
      .fy-store-course-banner h3{font-size:1.35rem;font-weight:850;margin:.35rem 0;}
      .fy-store-course-banner p{color:#c4d1ea;font-size:.86rem;line-height:1.6;}
      .fy-store-course-price{display:flex;flex-direction:column;align-items:center;gap:.7rem;}
      .fy-store-course-price strong{color:${GOLD};font-size:1.8rem;}
      .fy-store-filter{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.5rem;}
      .fy-store-filter button{border-radius:999px;padding:.62rem .9rem;border:1px solid var(--border);color:var(--foreground);background:var(--card);font-size:.8rem;cursor:pointer;}
      .fy-store-filter button.active{background:#dcb665;color:#111a32;border-color:#dcb665;font-weight:750;}
      .fy-store-catalog-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;}
      .fy-store-item{display:flex;flex-direction:column;overflow:hidden;border-radius:1rem;background:linear-gradient(155deg,#182650,#0c1734);border:1px solid rgba(164,190,248,.16);min-width:0;box-shadow:0 8px 22px rgba(0,0,0,.09);}
      .fy-store-lesson-art{height:9.6rem;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;}
      .fy-store-lesson-art img{width:100%;height:100%;position:absolute;inset:0;object-fit:cover;opacity:.32;filter:saturate(.8);}
      .fy-store-image-dim{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,12,35,.35),transparent);}
      .fy-store-lesson-no{position:absolute;left:1rem;top:.6rem;color:rgba(255,255,255,.8);font-size:2.25rem;letter-spacing:-.05em;font-weight:900;}
      .fy-store-art-icon{position:relative;color:#ffe2a2;filter:drop-shadow(0 4px 12px rgba(0,0,0,.35));}
      .fy-store-art-series{position:absolute;bottom:.7rem;left:1rem;color:rgba(255,255,255,.83);font-size:.57rem;letter-spacing:.18em;font-weight:800;}
      .fy-store-item-body{flex:1;display:flex;flex-direction:column;padding:1rem;color:#f3f6ff;}
      .fy-store-item-body h3{font-size:1rem;font-weight:800;line-height:1.4;margin:.45rem 0 1rem;overflow-wrap:anywhere;}
      .fy-store-item-footer{margin-top:auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;padding-top:.75rem;border-top:1px solid rgba(204,219,250,.14);}
      .fy-store-item-footer strong{font-size:1.15rem;color:${GOLD};}
      .fy-store-free{color:#b8f4d6;background:rgba(29,152,106,.2);border:1px solid rgba(86,235,160,.24);font-size:.69rem;font-weight:900;letter-spacing:.06em;border-radius:.4rem;padding:.4rem .55rem;}
      .fy-store-add{background:linear-gradient(105deg,#d8a343,#fff0bd,#d4a046);color:#141b2e;border:0;border-radius:.65rem;font-weight:850;cursor:pointer;padding:.7rem .85rem;min-height:40px;font-size:.78rem;}
      .fy-store-add:disabled{opacity:.68;cursor:default;}
      .fy-store-free-contract{padding:1.25rem;display:grid;grid-template-columns:5rem minmax(0,1fr) auto;align-items:center;gap:1.25rem;color:#fff;margin-bottom:1.8rem;}
      .fy-store-free-contract h3{font-size:1.38rem;font-weight:850;margin:1rem 0 .5rem;}
      .fy-store-free-contract p,.fy-store-free-contract small{color:#c5d0e7;line-height:1.6;display:block;}
      .fy-store-free-icon{height:5rem;width:5rem;border-radius:1rem;display:grid;place-items:center;background:rgba(240,198,103,.15);color:${GOLD};}
      .fy-store-workflow{display:flex;flex-wrap:wrap;gap:.6rem;margin:1rem 0 1.25rem;font-size:.81rem;color:var(--foreground);}
      .fy-store-workflow span{padding:.5rem .8rem;border:1px solid var(--border);border-radius:999px;}
      .fy-store-document-grid{grid-template-columns:repeat(3,minmax(0,1fr));}
      .fy-store-document{flex-direction:row;min-height:9rem;}
      .fy-store-doc-art{width:4.5rem;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8rem;color:#f7e1a2;}
      .fy-store-doc-art span{font-size:.75rem;font-weight:900;color:rgba(255,255,255,.75);}
      .fy-store-document .fy-store-item-body{padding:.85rem;}
      .fy-store-document .fy-store-item-body h3{font-size:.87rem;}
      .fy-store-document .fy-store-item-footer strong{font-size:.98rem;}
      .fy-store-split{display:grid;grid-template-columns:1fr 1fr;gap:2.2rem;padding:clamp(1.2rem,4vw,3rem);scroll-margin-top:4rem;color:white;}
      .fy-store-feature-intro>img{border-radius:1rem;max-height:15rem;margin-top:1.5rem;max-width:100%;object-fit:cover;}
      .fy-store-feature-price{font-size:2.3rem;font-weight:900;color:${GOLD};margin-top:1rem;}
      .fy-store-feature-price small{font-size:.88rem;color:#bac8e8;font-weight:550;}
      .fy-store-kw-form{align-self:center;display:grid;gap:.8rem;background:rgba(255,255,255,.045);border:1px solid rgba(240,198,103,.21);border-radius:1rem;padding:1.4rem;}
      .fy-store-kw-form>label:first-child{font-weight:800;}
      .fy-store-kw-form input:not([type=checkbox]){width:100%;font-size:1.05rem;letter-spacing:.07em;font-weight:700;outline:0;border:1px solid rgba(182,202,251,.36);background:#09142f;color:white;border-radius:.6rem;padding:.9rem;}
      .fy-store-kw-form input:focus{border-color:${GOLD};}
      .fy-store-kw-form small{font-size:.75rem;color:#b8c7e5;line-height:1.5;}
      .fy-store-check{display:flex;align-items:flex-start;gap:.55rem;font-size:.75rem;line-height:1.5;color:#d0dcf3;font-weight:450;}
      .fy-store-check input{margin-top:.22rem;accent-color:#e9ba58;}
      .fy-store-check a,.fy-store-privacy a{color:${GOLD};text-decoration:underline;}
      .fy-store-error{color:#ffb8b5;font-size:.85rem;}
      .fy-store-kw-submit{font-size:.94rem;min-height:3.1rem;}
      .fy-store-kw-ready,.fy-store-pipeline{display:flex;align-items:flex-start;gap:.6rem;border:1px solid rgba(113,226,165,.3);padding:.85rem;border-radius:.7rem;color:#d3f8e0;font-size:.8rem;line-height:1.5;}
      .fy-store-kw-ready p{margin-top:.6rem;color:#c5d0e7;}
      .fy-store-fineprint{display:flex;align-items:flex-start;gap:.45rem;color:#afbddb;font-size:.74rem;line-height:1.6;margin-top:.7rem;}
      .fy-store-plain-feature{align-items:center;}
      .fy-store-plain-feature>img{width:100%;border-radius:.9rem;max-height:21rem;object-fit:cover;}
      .fy-store-plain-feature p{color:#cbd5ec;margin:1rem 0;}
      .fy-store-plain-feature small{display:block;color:#b9c4de;margin-top:1rem;line-height:1.55;}
      .fy-store-pipeline{margin:1rem 0;border-color:rgba(240,198,103,.25);color:#f0dfb1;}
      .fy-store-bundle{display:grid;grid-template-columns:1fr auto;gap:1.2rem;align-items:center;padding:2rem;color:#fff;}
      .fy-store-bundle h2{font-size:2rem;font-weight:850;margin:1rem 0 .5rem;}
      .fy-store-bundle p{color:#c5d0e7;line-height:1.65;}
      .fy-store-bundle>div:last-child{display:grid;gap:1rem;justify-items:center;}
      .fy-store-bundle strong{font-size:2rem;color:${GOLD};white-space:nowrap;}
      .fy-store-bundle strong small{font-size:.8rem;}
      .fy-store-cart{padding:clamp(1.1rem,3vw,2rem);color:#fff;scroll-margin-top:4rem;}
      .fy-store-cart-title{display:flex;align-items:center;gap:1rem;color:${GOLD};margin-bottom:1rem;}
      .fy-store-cart h2{font-weight:850;font-size:1.7rem;color:#fff;}
      .fy-store-cart h2 span{color:${GOLD};}
      .fy-store-cart ul{margin:0;padding:0;list-style:none;}
      .fy-store-cart li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:1rem;padding:.8rem 0;border-bottom:1px solid rgba(255,255,255,.13);font-size:.84rem;}
      .fy-store-cart li strong{color:${GOLD};white-space:nowrap;}
      .fy-store-cart li button{color:#ffcecd;background:transparent;border:0;cursor:pointer;}
      .fy-store-cart-total{display:flex;justify-content:space-between;font-size:1.2rem;font-weight:800;margin:1.3rem 0;}
      .fy-store-cart-total strong{color:${GOLD};}
      .fy-store-cart-actions{display:flex;gap:1rem;align-items:center;flex-wrap:wrap;}
      .fy-store-clear{border:0;background:none;color:#d1daeb;text-decoration:underline;cursor:pointer;}
      .fy-store-checkout-form{display:grid;gap:1rem;margin:1.3rem 0;padding:1rem;border:1px solid rgba(255,255,255,.15);border-radius:.8rem;}
      .fy-store-checkout-form>label:first-child{font-weight:700;font-size:.88rem;}
      .fy-store-checkout-form>input{width:100%;padding:.8rem;border-radius:.5rem;background:#101b3e;color:#fff;border:1px solid #62749a;}
      .fy-store-checkout-form details{border:1px solid rgba(255,255,255,.18);padding:.85rem;border-radius:.65rem;font-size:.85rem;}
      .fy-store-checkout-form summary{cursor:pointer;color:#f0c667;font-weight:700;}
      .fy-store-checkout-form pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:24rem;overflow:auto;font-family:inherit;line-height:1.6;color:#d0d9e9;margin-top:.85rem;}
      .fy-store-consent{display:flex;align-items:flex-start;gap:.65rem;font-size:.8rem;line-height:1.5;color:#e2e8f6;}
      .fy-store-consent input{flex-shrink:0;margin-top:.2rem;accent-color:#f0c667;}
      .fy-store-pay{padding:1rem 1.25rem;font-size:.94rem;}
      .fy-store-privacy{color:var(--muted-foreground);font-size:.78rem;line-height:1.6;margin:1rem 0;}
      @media(max-width:1000px){.fy-store-catalog-grid,.fy-store-document-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.fy-store-course-banner{grid-template-columns:7rem 1fr;}.fy-store-course-banner>img{width:7rem;}.fy-store-course-price{grid-column:2;align-items:flex-start;}}
      @media(max-width:760px){
        .fy-store-hero-grid{grid-template-columns:minmax(0,1fr);padding:1rem 1rem 2.6rem;gap:1.25rem;}
        .fy-store-hero-film{grid-row:1;margin-top:.1rem;}
        .fy-store-hero-copy{grid-row:2;}
        .fy-store-hero-copy h1{font-size:clamp(2rem,8vw,2.8rem);margin:.7rem 0 1rem;}
        .fy-store-hero-copy>p{font-size:.91rem;}
        .fy-store-actions>*{flex:1;min-width:9rem;}
        .fy-store-jump-nav{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none;}
        .fy-store-jump-nav a,.fy-store-jump-nav button{flex-shrink:0;}
        .fy-store-catalog-grid,.fy-store-document-grid{grid-template-columns:minmax(0,1fr);gap:.8rem;}
        .fy-store-item{flex-direction:row;min-height:9rem;}
        .fy-store-lesson-art{height:auto;min-height:9rem;width:6.8rem;flex-shrink:0;}
        .fy-store-lesson-no{font-size:1.5rem;top:.6rem;left:.5rem;}
        .fy-store-art-series{writing-mode:vertical-rl;left:.4rem;bottom:.45rem;font-size:.42rem;}
        .fy-store-item-body{padding:.8rem;}
        .fy-store-item-body h3{font-size:.88rem;}
        .fy-store-item-footer{gap:.4rem;}
        .fy-store-item-footer strong{font-size:.95rem;}
        .fy-store-add{padding:.62rem .65rem;font-size:.73rem;}
        .fy-store-course-banner{display:grid;grid-template-columns:5.2rem 1fr;padding:.75rem;gap:.8rem;}
        .fy-store-course-banner>img{width:5.2rem;}
        .fy-store-course-banner h3{font-size:1.06rem;}
        .fy-store-course-price{grid-column:1/-1;justify-self:stretch;align-items:stretch;display:grid;grid-template-columns:1fr 1fr;align-items:center;}
        .fy-store-course-price strong{font-size:1.45rem;}
        .fy-store-free-contract{grid-template-columns:3.1rem 1fr;padding:1rem;gap:.8rem;}
        .fy-store-free-icon{width:3.1rem;height:3.1rem;}
        .fy-store-free-contract>a{grid-column:1/-1;}
        .fy-store-free-contract h3{font-size:1.1rem;}
        .fy-store-split,.fy-store-bundle{grid-template-columns:minmax(0,1fr);padding:1rem;gap:1.2rem;}
        .fy-store-kw-form{padding:1rem;}
        .fy-store-plain-feature>img{order:-1;}
        .fy-store-bundle>div:last-child{justify-items:stretch;}
        .fy-store-cart li{gap:.55rem;}
      }
    `}</style>
  </MarketingShell>;
}
