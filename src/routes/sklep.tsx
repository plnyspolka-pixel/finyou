import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, FileText, GraduationCap, LockKeyhole, PenLine, ShieldCheck, ShoppingBag, Trash2, Users } from "lucide-react";
import { MarketingShell } from "@/components/marketing/shell";
import { Section, SectionHead } from "@/components/marketing/sections";
import { Eyebrow, MktBadge, MktButton } from "@/components/marketing/primitives";
import { Icon3D } from "@/components/marketing/icon-3d";
import { getPublicStoreCatalog } from "@/lib/storefront/catalog.functions";
import { createStoreCheckout, getStoreLegalTexts } from "@/lib/storefront/checkout.functions";
import { validateKwNumber } from "@/lib/kw";
import { FREE_LESSON_SLUG } from "@/lib/free-lesson";
import {
  ACADEMY_COURSE_PRICE_PLN,
  ACADEMY_MODULES,
  ACADEMY_MODULE_PRICE_PLN,
  MANAGEMENT_CART_ID,
  MANAGEMENT_MODULE_DAYS,
  MANAGEMENT_MODULE_PRICE_PLN,
  academyModuleForLesson,
} from "@/lib/storefront/products";
import { ShopOrderPipeline } from "@/components/storefront/ShopOrderPipeline";
import { ManagementDemo } from "@/components/storefront/ManagementDemo";

/**
 * Finance You investor storefront: public metadata, no private source files.
 * Payments and per-item entitlements MUST exist server-side before granting
 * any access. Cart currently creates a purchase enquiry, not a transaction.
 */
export const Route = createFileRoute("/sklep")({
  validateSearch: (search: Record<string, unknown>): { tpay?: string; payment?: string } => ({
    tpay: typeof search.tpay === "string" ? search.tpay : undefined,
    payment: typeof search.payment === "string" ? search.payment : undefined,
  }),
  head: () => ({ meta: [
    { title: "Sklep inwestora — Akademia, zlecenie okazji i Centrum Zarządzania | Finance You" },
    { name: "description", content: "Moduły Akademii Inwestora, zlecenie poszukiwania okazji z całej Polski, Centrum Zarządzania (dokumenty, CRM, e-podpis, compliance) i analiza księgi wieczystej." },
  ], links: [{ rel: "canonical", href: "https://financeyou.pl/sklep" }] }),
  component: Storefront,
});

type Catalog = Awaited<ReturnType<typeof getPublicStoreCatalog>>;
type Lesson = Catalog["lessons"][number];
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
  const { tpay, payment } = Route.useSearch();
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
        x && typeof x.id === "string" && ["lesson","course","kw"].includes(x.type) &&
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
  const managementInCart = itemIds.has("course:" + MANAGEMENT_CART_ID);
  // Pełny pakiet zastępuje moduły — nie sprzedajemy obu wariantów naraz.
  const addCourse = () => setCart((items) => [
    ...items.filter((i) => !(i.type === "course" && i.id.startsWith("course:module-")) && i.type !== "lesson"),
    ...(items.some((i) => i.id === "course:academy") ? [] : [{ id: "course:academy", type: "course" as const,
      title: "Pełna Akademia Inwestora — 7 modułów", price: ACADEMY_COURSE_PRICE_PLN }]),
  ]);
  const lessonsByModule = useMemo(() => {
    const map = new Map<number, Lesson[]>();
    for (const l of catalog?.lessons ?? []) {
      const m = academyModuleForLesson(l.number);
      if (!m) continue;
      map.set(m.number, [...(map.get(m.number) ?? []), l]);
    }
    return map;
  }, [catalog]);

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
          if (i.type === "course") return { kind: "course" as const, id: i.id.slice(i.id.indexOf(":") + 1) };
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
          <h1>Wiedza, okazje i narzędzia.<span> Wszystko dla inwestora.</span></h1>
          <p>Ucz się modułami Akademii, zleć nam poszukiwanie okazji z całej Polski i prowadź portfel w Centrum Zarządzania. Całe zlecenie — od KYC po umowy — przejdziesz na tej stronie.</p>
          <div className="fy-store-actions">
            <MktButton variant="gold" href="#siecsprzedazy" size="lg">Złóż zlecenie</MktButton>
            <MktButton variant="outline" href="#akademia" size="lg">Moduły Akademii</MktButton>
          </div>
          <div className="fy-store-trust"><span><Check size={16} /> 7 modułów po {ACADEMY_MODULE_PRICE_PLN} zł</span><span><Check size={16} /> Projekty z całej Polski</span><span><Check size={16} /> Centrum Zarządzania — demo bez logowania</span></div>
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
      <a href="#akademia">Akademia</a><a href="#siecsprzedazy">Okazje · zlecenie</a>
      <a href="#centrum">Centrum Zarządzania</a><a href="#demo">Demo</a>
      <a href="#analityk">Analityk KW</a><a href="#windykator-ai">Windykator AI</a>
      <button type="button" onClick={() => { setCartOpen((v) => !v); document.getElementById("koszyk")?.scrollIntoView({ behavior: "smooth" }); }}><ShoppingBag size={16} /> Koszyk ({cart.length})</button>
    </div>

    <Section>
      <CatalogHeader id="akademia" eyebrow="01 / AKADEMIA INWESTORA" title="Wybierz moduł, którego potrzebujesz" copy={`Akademia podzielona na ${ACADEMY_MODULES.length} wątków — od strategii, przez prawo i analizę, po windykację. Każdy moduł kosztuje ${ACADEMY_MODULE_PRICE_PLN} zł. Pierwsza lekcja jest bezpłatna.`} />
      <div className="fy-store-course-banner" style={panelStyle}>
        <img src="/marketing/moduly/szkolenie-1.webp" alt="" loading="lazy" />
        <div><MktBadge variant="gold">KOMPLETNY PROGRAM</MktBadge><h3>Cała Akademia Inwestora</h3><p>Wszystkie {ACADEMY_MODULES.length} modułów ({catalog?.lessons.length ?? 28} lekcji) w jednym pakiecie zamiast {PLN(ACADEMY_MODULES.length * ACADEMY_MODULE_PRICE_PLN)} za moduły osobno. {catalog?.lessons.length && catalog.lessons.every(l => l.durationSeconds != null) ? `Łącznie ${lessonDuration(catalog.lessons.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0))}.` : ""}</p></div>
        <div className="fy-store-course-price"><strong>{PLN(ACADEMY_COURSE_PRICE_PLN)}</strong>
          <button className="fy-store-add" type="button" onClick={addCourse} disabled={courseInCart}>{courseInCart ? "✓ W koszyku" : "+ Dodaj pakiet"}</button>
        </div>
      </div>
      {loadError && <p role="alert">Nie udało się pobrać katalogu. Spróbuj odświeżyć stronę.</p>}
      <div className="fy-store-module-grid">
        {ACADEMY_MODULES.map((m) => {
          const id = "course:" + m.id;
          const inCart = itemIds.has(id) || courseInCart;
          const lessons = lessonsByModule.get(m.number) ?? [];
          return <article className="fy-store-module" key={m.id}>
            <img src={m.image} alt={`Akademia Inwestora — Moduł ${m.number}: ${m.title}`} loading="lazy" />
            <div className="fy-store-item-body">
              <div style={badge}>MODUŁ {m.number} · {lessons.length || (m.to ? m.to - m.from + 1 : "")} {lessons.length === 1 ? "lekcja" : "lekcji"}</div>
              <h3>{m.title}</h3>
              <ul className="fy-store-module-topics">{(lessons.length ? lessons.map((l) => l.title.replace(/^\d+\.\s*/, "")) : m.topics).map((t) => <li key={t}>{t}</li>)}</ul>
              <div className="fy-store-item-footer">
                <strong>{PLN(ACADEMY_MODULE_PRICE_PLN)}</strong>
                <button type="button" className="fy-store-add" aria-label={"Dodaj do koszyka: moduł " + m.number}
                  onClick={() => add({ id, type: "course", title: `Akademia — Moduł ${m.number}: ${m.title}`, price: ACADEMY_MODULE_PRICE_PLN })} disabled={inCart}>
                  {courseInCart ? "✓ W pakiecie" : inCart ? "✓ W koszyku" : "+ Dodaj moduł"}
                </button>
              </div>
              {m.number === 1 && <MktButton variant="outline" size="sm" href={"/pobierz/" + FREE_LESSON_SLUG}>Lekcja 1 za darmo</MktButton>}
            </div>
          </article>;
        })}
      </div>
    </Section>

    <Section tint>
      <div id="siecsprzedazy" className="fy-store-main-product" style={panelStyle}>
        <div className="fy-store-split fy-store-plain-feature">
          <div><Icon3D name="investors" size={64}/><Eyebrow tone="gold">02 / OGÓLNOPOLSKA SIEĆ SPRZEDAŻY · GŁÓWNY PRODUKT</Eyebrow>
            <h2>Zleć nam poszukiwanie okazji.</h2>
            <p>Nasi specjaliści wybiorą dla Ciebie okazje inwestycyjne dopasowane do wskazanego przedziału finansowego. Otrzymasz do pięciu propozycji finansowania wraz z kompletnymi raportami, które pomogą Ci ocenić zabezpieczenia i ryzyko.</p>
            <div className="fy-store-pipeline"><ShieldCheck size={20}/><span>Cały proces przejdziesz poniżej, na tej stronie: abonament, dane, KYC, screening PEP/sankcji, źródło środków, Umowa ramowa, NDA i RODO, a na końcu formularz Zlecenia.</span></div>
            <small>Dostęp do danych klientów odblokowują kontrole po stronie serwera. Liczba propozycji zależy od dostępnych spraw spełniających kryteria.</small>
          </div>
          <img src="/marketing/moduly/siec-sprzedazy-1.webp" alt="Ogólnopolska Sieć Sprzedaży Finance You — projekty z całej Polski" loading="lazy"/>
        </div>
        <ShopOrderPipeline tpay={tpay} payment={payment} />
      </div>
    </Section>

    <Section>
      <div id="centrum" className="fy-store-split fy-store-plain-feature" style={panelStyle}>
        <div><Icon3D name="crm" size={64}/><Eyebrow tone="gold">03 / CENTRUM ZARZĄDZANIA</Eyebrow>
          <h2>Dokumenty, CRM, e-podpis i compliance — jeden moduł.</h2>
          <p>Generator pism do DOCX, kartoteka klientów i umów, podpis elektroniczny z weryfikacją tożsamości oraz rejestr AML z oceną ryzyka i kalkulatorem compliance. Bez abonamentu rocznego.</p>
          <ul className="fy-store-centrum-list">
            <li><FileText size={18}/> Dokumenty — biblioteka wzorów i generator DOCX</li>
            <li><Users size={18}/> CRM — klienci, umowy i etapy sprawy</li>
            <li><PenLine size={18}/> E-podpis — Didit, kod jednorazowy, Karta podpisów</li>
            <li><ShieldCheck size={18}/> Compliance — AML, PEP/sankcje, zgłoszenia GIIF</li>
          </ul>
          <div className="fy-store-feature-price">{PLN(MANAGEMENT_MODULE_PRICE_PLN)} <small>/ {MANAGEMENT_MODULE_DAYS} dni · bez automatycznego odnawiania</small></div>
          <div className="fy-store-actions">
            <button type="button" className="fy-store-add" disabled={managementInCart}
              onClick={() => add({ id: "course:" + MANAGEMENT_CART_ID, type: "course", title: `Centrum Zarządzania — ${MANAGEMENT_MODULE_DAYS} dni`, price: MANAGEMENT_MODULE_PRICE_PLN })}>
              {managementInCart ? "✓ W koszyku" : "+ Dodaj do koszyka"}</button>
            <MktButton variant="outline" href="#demo">Wypróbuj demo</MktButton>
          </div>
          <small>Moduł działa w panelu inwestora — do zakupu potrzebne jest konto inwestora. Abonament inwestora obejmuje Centrum Zarządzania bez dopłat.</small>
        </div>
        <img src="/marketing/moduly/aml-compliance-1.webp" alt="Centrum Zarządzania Finance You" loading="lazy"/>
      </div>
      <div id="demo" className="fy-store-demo-wrap">
        <CatalogHeader id="demo-head" eyebrow="WERSJA DEMONSTRACYJNA" title="Sprawdź Centrum Zarządzania bez logowania" copy="Wygeneruj pismo, przesuń klienta w CRM, zasymuluj podpis i oceń ryzyko AML. Demo działa w Twojej przeglądarce na fikcyjnych danych." />
        <ManagementDemo />
      </div>
    </Section>

    <Section>
      <div id="analityk" className="fy-store-split" style={panelStyle}>
        <div className="fy-store-feature-intro">
          <Icon3D name="ai" size={64}/>
          <Eyebrow tone="gold">04 / ANALITYK AI</Eyebrow>
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
          <Eyebrow tone="gold">05 / WINDYKATOR AI</Eyebrow>
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
      <div className="fy-store-bundle" style={panelStyle}>
        <div><MktBadge variant="gold">WSZYSTKO W JEDNYM</MktBadge><h2>Finance You Kompletny</h2><p>Aktualny abonament inwestora: program szkoleniowy, narzędzia panelu i konsultacje. Dostęp do spraw zgodnie z obowiązującymi warunkami i po spełnieniu wymagań KYC/AML.</p></div>
        <div><strong>7 000 zł <small>/ rok</small></strong><MktButton variant="gold" size="lg" href="/abonament-inwestora">Kup abonament</MktButton></div>
      </div>
    </Section>

    <Section>
      <div id="koszyk" className="fy-store-cart" style={panelStyle}>
        <p><MktButton variant="outline" size="sm" href="/sklep/moje-zakupy">Moje zakupy i pobrane raporty</MktButton></p>
        <div className="fy-store-cart-title"><ShoppingBag size={28}/><div><Eyebrow tone="gold">TWOJE WYBRANE PRODUKTY</Eyebrow><h2>Koszyk <span>({cart.length})</span></h2></div></div>
        {cart.length === 0 ? <p style={desc}>Wybierz moduły Akademii, Centrum Zarządzania lub raport KW, klikając „Dodaj”.</p> :
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
      .fy-store-module-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr));gap:1rem;}
      .fy-store-module{display:flex;flex-direction:column;overflow:hidden;border-radius:1rem;background:linear-gradient(155deg,#182650,#0c1734);border:1px solid rgba(164,190,248,.16);min-width:0;}
      .fy-store-module>img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;}
      .fy-store-module .fy-store-item-body{gap:.4rem;}
      .fy-store-module .fy-store-item-body h3{margin:.2rem 0 .3rem;font-size:1.12rem;}
      .fy-store-module-topics{margin:0 0 .6rem;padding-left:1.1rem;color:#c5d0e7;font-size:.8rem;line-height:1.55;}
      .fy-store-main-product{padding:0;overflow:hidden;scroll-margin-top:4rem;border-color:rgba(240,198,103,.45);}
      .fy-store-main-product>.fy-store-split{background:none;border:0;box-shadow:none;}
      .fy-shop-pipeline-box{margin:0 clamp(.8rem,3vw,2.5rem) clamp(.8rem,3vw,2.5rem);padding:clamp(.9rem,2.5vw,1.6rem);border-radius:1rem;border:1px solid rgba(240,198,103,.25);background:rgba(5,11,32,.55);color:var(--foreground);}
      .fy-shop-pipeline-live{background:var(--background);}
      .fy-shop-steps{list-style:none;margin:0 0 1.2rem;padding:0;display:flex;flex-wrap:wrap;gap:.45rem;}
      .fy-shop-steps li{display:flex;align-items:center;gap:.4rem;font-size:.74rem;padding:.4rem .65rem;border-radius:999px;border:1px solid rgba(255,255,255,.14);color:#c9d4ec;}
      .fy-shop-steps li span{display:grid;place-items:center;width:1.3rem;height:1.3rem;border-radius:50%;background:rgba(255,255,255,.1);font-weight:800;font-size:.68rem;}
      .fy-shop-steps li.current{border-color:${GOLD};color:#fff;}
      .fy-shop-steps li.current span{background:${GOLD};color:#141b2e;}
      .fy-shop-steps li.done span{background:#2f9e6d;color:#fff;}
      .fy-shop-pipeline-paths{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
      .fy-shop-pipeline-paths>div{padding:1rem;border-radius:.8rem;border:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;gap:.7rem;align-items:flex-start;}
      .fy-shop-pipeline-paths h3{display:flex;align-items:center;gap:.5rem;font-weight:850;font-size:1.05rem;color:#fff;}
      .fy-shop-pipeline-paths p{color:#c5d0e7;font-size:.86rem;line-height:1.6;margin:0;}
      .fy-shop-link-btn,.fy-shop-link-btn:visited{text-decoration:none;display:inline-flex;align-items:center;color:#141b2e !important;}
      .fy-shop-checkout{margin-top:1.2rem;padding:1rem;border-radius:.8rem;background:var(--card);border:1px solid var(--border);}
      .fy-shop-pipeline-note{display:flex;gap:.6rem;align-items:flex-start;font-size:.85rem;line-height:1.55;color:#f0dfb1;border:1px solid rgba(240,198,103,.25);border-radius:.7rem;padding:.85rem;margin:.8rem 0;}
      .fy-store-centrum-list{list-style:none;padding:0;margin:1rem 0;display:grid;gap:.55rem;color:#e3e9f7;font-size:.9rem;}
      .fy-store-centrum-list li{display:flex;gap:.55rem;align-items:center;}
      .fy-store-centrum-list svg{color:${GOLD};flex-shrink:0;}
      .fy-store-demo-wrap{margin-top:2rem;scroll-margin-top:4rem;}
      .fy-demo{border-radius:1.1rem;border:1px solid rgba(240,198,103,.3);background:linear-gradient(145deg,rgba(18,30,70,.94),rgba(9,16,42,.96));color:#fff;overflow:hidden;}
      .fy-demo-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.8rem;padding:.9rem 1rem;border-bottom:1px solid rgba(255,255,255,.1);}
      .fy-demo-badge{font-size:.68rem;font-weight:850;letter-spacing:.08em;color:#141b2e;background:${GOLD};border-radius:.4rem;padding:.35rem .55rem;}
      .fy-demo-tabs{display:flex;flex-wrap:wrap;gap:.4rem;}
      .fy-demo-tabs button{display:flex;align-items:center;gap:.35rem;border-radius:999px;padding:.5rem .85rem;font-size:.8rem;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04);color:#e8eefc;cursor:pointer;}
      .fy-demo-tabs button.active{background:#dcb665;color:#111a32;border-color:#dcb665;font-weight:800;}
      .fy-demo-body{padding:clamp(.9rem,2.5vw,1.5rem);}
      .fy-demo-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:1.2rem;}
      .fy-demo-form{display:grid;gap:.7rem;align-content:start;}
      .fy-demo-form label{display:grid;gap:.3rem;font-size:.78rem;color:#c5d0e7;}
      .fy-demo-form input:not([type=checkbox]),.fy-demo-form select{width:100%;padding:.6rem .7rem;border-radius:.5rem;background:#09142f;color:#fff;border:1px solid rgba(182,202,251,.3);font-size:.88rem;}
      .fy-demo-check{display:flex !important;grid-template-columns:none;align-items:flex-start;gap:.55rem !important;font-size:.85rem !important;color:#e2e8f6 !important;}
      .fy-demo-check input{margin-top:.2rem;accent-color:${GOLD};}
      .fy-demo-paper{white-space:pre-wrap;overflow-wrap:anywhere;font-family:Georgia,serif;font-size:.86rem;line-height:1.7;background:#fbfaf6;color:#1b2033;border-radius:.6rem;padding:1.2rem;margin:0;min-height:16rem;box-shadow:0 10px 30px rgba(0,0,0,.25);}
      .fy-demo-ok{display:flex;gap:.45rem;align-items:flex-start;color:#b8f4d6;font-size:.82rem;line-height:1.5;margin-top:.6rem;}
      .fy-demo-lead{color:#c5d0e7;font-size:.86rem;line-height:1.6;margin:0 0 .9rem;}
      .fy-demo-kanban{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.7rem;}
      .fy-demo-col{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:.8rem;padding:.6rem;display:grid;gap:.5rem;align-content:start;min-height:8rem;}
      .fy-demo-col h4{font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;color:${GOLD};font-weight:850;}
      .fy-demo-col article{background:#0c1838;border:1px solid rgba(164,190,248,.2);border-radius:.6rem;padding:.6rem;display:grid;gap:.3rem;font-size:.8rem;}
      .fy-demo-col article span{color:#aebbd8;font-size:.72rem;}
      .fy-demo-col article div{display:flex;gap:.3rem;}
      .fy-demo-col article button{flex:1;border-radius:.4rem;border:1px solid rgba(255,255,255,.18);background:transparent;color:#fff;cursor:pointer;padding:.2rem;}
      .fy-demo-col article button:disabled{opacity:.3;cursor:default;}
      .fy-demo-signers{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
      .fy-demo-signer{border:1px solid rgba(255,255,255,.12);border-radius:.8rem;padding:1rem;display:grid;gap:.7rem;}
      .fy-demo-signer ul{list-style:none;margin:0;padding:0;display:grid;gap:.35rem;font-size:.82rem;color:#aebbd8;}
      .fy-demo-signer li{display:flex;align-items:center;gap:.4rem;}
      .fy-demo-signer li.done{color:#b8f4d6;}
      .fy-demo-reset{margin-top:.8rem;background:none;border:0;color:#d1daeb;text-decoration:underline;cursor:pointer;font-size:.8rem;}
      .fy-demo-risk{border-radius:.8rem;padding:1.1rem;display:grid;gap:.5rem;align-content:start;border:1px solid;}
      .fy-demo-risk span{font-size:.8rem;color:#c5d0e7;}
      .fy-demo-risk strong{font-size:1.5rem;font-weight:900;}
      .fy-demo-risk ul{margin:0;padding-left:1.1rem;font-size:.85rem;line-height:1.6;}
      .fy-demo-risk small{color:#aebbd8;font-size:.72rem;line-height:1.5;}
      .fy-demo-risk-low{border-color:rgba(86,235,160,.35);background:rgba(29,152,106,.12);}
      .fy-demo-risk-low strong{color:#8ff0bf;}
      .fy-demo-risk-mid{border-color:rgba(240,198,103,.45);background:rgba(240,198,103,.1);}
      .fy-demo-risk-mid strong{color:${GOLD};}
      .fy-demo-risk-high{border-color:rgba(255,140,130,.45);background:rgba(200,60,50,.14);}
      .fy-demo-risk-high strong{color:#ffb3ab;}
      .fy-demo-foot{padding:.8rem 1rem;border-top:1px solid rgba(255,255,255,.1);font-size:.75rem;color:#aebbd8;line-height:1.55;margin:0;}
      @media(max-width:1000px){.fy-demo-kanban{grid-template-columns:repeat(2,minmax(0,1fr));}.fy-store-catalog-grid,.fy-store-document-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.fy-store-course-banner{grid-template-columns:7rem 1fr;}.fy-store-course-banner>img{width:7rem;}.fy-store-course-price{grid-column:2;align-items:flex-start;}}
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
        .fy-shop-pipeline-paths,.fy-demo-grid,.fy-demo-signers{grid-template-columns:minmax(0,1fr);}
        .fy-shop-pipeline-box{margin:0 .6rem .6rem;padding:.8rem;}
        .fy-demo-kanban{grid-template-columns:minmax(0,1fr);}
        .fy-store-module>img{aspect-ratio:4/3;object-position:top;}
      }
    `}</style>
  </MarketingShell>;
}
