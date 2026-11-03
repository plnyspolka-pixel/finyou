import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MarketingShell } from "@/components/marketing/shell";
import { MktButton, Eyebrow } from "@/components/marketing/primitives";
import { getPublicStoreCatalog } from "@/lib/storefront/catalog.functions";
import { acceptStoreDpa, getMyStorePurchases, getPurchasedLessonUrl, getPurchasedDocumentTemplate, getStoreLegalTexts } from "@/lib/storefront/checkout.functions";
import { getPurchasedKwReport } from "@/lib/storefront/kw-report.functions";
import { generateDocxFromTemplate, getGeneratedDocSignedUrl } from "@/lib/document-generator.functions";

export const Route = createFileRoute("/sklep/moje-zakupy")({
  component: StoreLibrary,
  head: () => ({ meta: [{ title: "Moje zakupy — sklep Finance You" }, { name:"robots", content:"noindex,nofollow" }] }),
});

type Purchases = Awaited<ReturnType<typeof getMyStorePurchases>>;
type Catalog = Awaited<ReturnType<typeof getPublicStoreCatalog>>;

function StoreLibrary() {
  const getPurchases = useServerFn(getMyStorePurchases);
  const getCatalog = useServerFn(getPublicStoreCatalog);
  const getLegal = useServerFn(getStoreLegalTexts);
  const getLesson = useServerFn(getPurchasedLessonUrl);
  const getDoc = useServerFn(getPurchasedDocumentTemplate);
  const getKw = useServerFn(getPurchasedKwReport);
  const generate = useServerFn(generateDocxFromTemplate);
  const getDownload = useServerFn(getGeneratedDocSignedUrl);
  const acceptDpa = useServerFn(acceptStoreDpa);
  const [purchases, setPurchases] = useState<Purchases | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [dpaText, setDpaText] = useState("");
  const [dpaCheck, setDpaCheck] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [video, setVideo] = useState<{ title:string; url:string; external:boolean } | null>(null);
  const [download, setDownload] = useState<{ url:string; label:string } | null>(null);
  const [doc, setDoc] = useState<{id:string; name:string; placeholders:string[]}|null>(null);
  const [values, setValues] = useState<Record<string,string>>({});
  useEffect(() => {
    let active = true;
    void Promise.all([getPurchases(),getCatalog(),getLegal()]).then(([p,c,l]) => {
      if (!active) return;
      setPurchases(p);setCatalog(c);setDpaText(l.dpa.text);
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Nie udało się wczytać zakupów."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getPurchases,getCatalog,getLegal]);
  type Entitlement = { item_kind: string; item_id: string };
  type Order = { id: string; status: string; created_at: string; amount_grosz: number };
  const entitlements: Entitlement[] = (purchases?.entitlements ?? []) as Entitlement[];
  const orders: Order[] = (purchases?.orders ?? []) as Order[];
  const hasCourse = entitlements.some((i) => i.item_kind === "course" && i.item_id === "academy");
  const lessons = useMemo(() => (catalog?.lessons ?? []).filter((l) =>
    l.number !== 1 && (hasCourse || entitlements.some((e) => e.item_kind === "lesson" && e.item_id === l.id))
  ), [catalog,entitlements,hasCourse]);
  const documents = (catalog?.documents ?? []).filter((d) =>
    entitlements.some((e) => e.item_kind === "document" && e.item_id === d.id));
  const kwItems = entitlements.filter((e) => e.item_kind === "kw");
  const act = async (key: string, callback: () => Promise<void>) => {
    setBusy(key);setError("");setMessage("");
    try { await callback(); } catch (e) { setError(e instanceof Error ? e.message : "Operacja nieudana."); }
    finally { setBusy(""); }
  };
  const openLesson = (id:string) => void act("lesson:"+id,async()=>{
    const item = await getLesson({data:{id}});
    setVideo(item);
    setMessage("Dostęp do filmu jest aktywny. Link do odtwarzania wygasa po 10 minutach.");
  });
  const openDoc = (id:string) => void act("document:"+id,async()=>{
    const item = await getDoc({data:{id}});
    setDoc(item);setValues({});
    document.getElementById("fy-purchased-generator")?.scrollIntoView({behavior:"smooth"});
  });
  const makeDoc = () => {
    if (!doc) return;
    void act("generate:"+doc.id,async()=>{
      const result = await generate({ data:{ templateId:doc.id,values } });
      const link = await getDownload({ data:{ path:result.docxPath,expiresInSec:300 } });
      setDownload({ url: link.url, label: "Pobierz wygenerowany dokument DOCX" });
      setMessage("Dokument wygenerowano. Kliknij poniższy link do pobrania (ważny 5 minut).");
    });
  };
  const openKw = (id:string) => void act("kw:"+id,async()=>{
    const result = await getKw({data:{kw:id}});
    if (!result.ready) {
      setMessage(result.message || "Raport jest przygotowywany — spróbuj ponownie za chwilę.");
      return;
    }
    setDownload({ url: result.url, label: "Pobierz raport KW " + result.kw + " — PDF" });
    setMessage("Raport KW " + result.kw + " jest gotowy. Pobierz PDF z poniższego linku.");
  });
  const signDpa = () => void act("dpa",async()=>{
    await acceptDpa({data:{accepted:true}});
    setPurchases(await getPurchases());
    setDpaCheck(false);
    setMessage("Umowa powierzenia została zaakceptowana i zapisana na Twoim koncie.");
  });

  return <MarketingShell page="sklep">
    <main className="fy-store-library">
      <Eyebrow tone="gold">FINANCE YOU · MOJE ZAKUPY</Eyebrow>
      <h1>Twoje produkty i raporty</h1>
      <p>Po potwierdzeniu płatności Tpay dostęp do zakupionych materiałów pojawia się automatycznie na tym koncie.</p>
      <p><MktButton href="/sklep" variant="outline">Wróć do sklepu</MktButton></p>
      {loading && <p>Sprawdzanie płatności i uprawnień…</p>}
      {error && <div className="fy-store-library-error" role="alert">{error} <a href="/logowanie">Zaloguj się do swojego konta</a></div>}
      {message && <p role="status" className="fy-store-library-status">{message}</p>}
      {download && <p className="fy-store-library-status"><a href={download.url} target="_blank" rel="noopener noreferrer">{download.label}</a></p>}
      {purchases && <>
        {orders.some((o)=>o.status === "pending" || o.status === "created") &&
          <div className="fy-store-library-panel">Masz płatność oczekującą na potwierdzenie. Po jej rozliczeniu odśwież tę stronę. Nie udostępniamy treści na podstawie samego powrotu z Tpay.</div>}
        <section>
          <h2>Zakupione lekcje {hasCourse ? "— cała Akademia" : ""}</h2>
          {lessons.length === 0 && <p>Nie masz jeszcze kupionych lekcji.</p>}
          <div className="fy-store-library-grid">
            {lessons.map((l) => <article key={l.id}>
              <span>AKADEMIA · {String(l.number).padStart(2,"0")}</span>
              <h3>{l.title}</h3><button type="button" onClick={() => openLesson(l.id)}
                disabled={Boolean(busy)}>{busy==="lesson:"+l.id ? "Otwieranie…" : "Oglądaj lekcję"}</button>
            </article>)}
          </div>
          {video && <div className="fy-store-library-panel">
            <h3>{video.title}</h3>
            {video.external ? <p><a href={video.url} target="_blank" rel="noopener noreferrer">Otwórz nagranie w nowej karcie</a></p>
              : <video src={video.url} controls playsInline style={{width:"100%",maxWidth:"52rem",aspectRatio:"16/9",background:"#020714"}}/>}
          </div>}
        </section>
        <section>
          <h2>Zakupione dokumenty</h2>
          {documents.length === 0 && <p>Nie masz jeszcze kupionych wzorów.</p>}
          <div className="fy-store-library-grid">
            {documents.map((d) => <article key={d.id}><span>KANCELARIA AI</span><h3>{d.title}</h3>
              <button type="button" disabled={Boolean(busy)} onClick={() => openDoc(d.id)}>
                {busy==="document:"+d.id ? "Otwieranie…" : "Wygeneruj dokument"}
              </button>
            </article>)}
          </div>
          {!purchases.dpaAccepted && <div className="fy-store-library-panel">
            <h3>Umowa powierzenia danych</h3>
            <p>Aby przetwarzać dane stron umowy w generatorze, zaakceptuj poniższy dokument.</p>
            <details><summary>Pełna treść umowy</summary><pre>{dpaText}</pre></details>
            <label><input type="checkbox" checked={dpaCheck} onChange={(e)=>setDpaCheck(e.target.checked)}/>
              Przeczytałem i akceptuję umowę powierzenia danych osobowych.</label>
            <button type="button" disabled={!dpaCheck||Boolean(busy)} onClick={signDpa}>Zapisz akceptację</button>
          </div>}
          {doc && <div id="fy-purchased-generator" className="fy-store-library-panel">
            <h3>Generator: {doc.name}</h3>
            <p>Wpisz dane do dokumentu. Wszystkie pola i pliki są przypisane do Twojego konta.</p>
            {(Array.isArray(doc.placeholders)?doc.placeholders:[]).map((p,i)=>(
              <label key={i}>{String(p)}
                <input value={values[String(i)]??""} onChange={e=>setValues(v=>({...v,[String(i)]:e.target.value}))}/>
              </label>))}
            <button type="button" disabled={Boolean(busy)||!purchases.dpaAccepted}
              onClick={makeDoc}>{busy==="generate:"+doc.id?"Generowanie…":"Generuj DOCX"}</button>
          </div>}
        </section>
        <section>
          <h2>Raporty ksiąg wieczystych</h2>
          {kwItems.length === 0 && <p>Nie masz jeszcze kupionych analiz.</p>}
          <div className="fy-store-library-grid">
            {kwItems.map((i) => <article key={i.item_id}>
              <span>ANALITYK AI</span><h3>KW {i.item_id}</h3>
              <button type="button" disabled={Boolean(busy)} onClick={() => openKw(i.item_id)}>
                {busy==="kw:"+i.item_id?"Pobieranie i analiza…":"Wygeneruj / pobierz PDF"}
              </button></article>)}
          </div>
        </section>
        <section>
          <h2>Historia zamówień</h2>
          <div className="fy-store-library-panel">
            {orders.length===0?"Brak zamówień.":orders.map((o)=>
              <p key={o.id}>{new Date(o.created_at).toLocaleDateString("pl-PL")} · {o.status==="paid"?"Opłacone":o.status==="pending"?"Oczekuje":o.status} · {(o.amount_grosz/100).toLocaleString("pl-PL")} zł</p>)}
          </div>
        </section>
      </>}
    </main>
    <style>{`
      .fy-store-library{max-width:76rem;margin:auto;padding:3rem 1rem 5rem;color:var(--foreground);}
      .fy-store-library h1{font-size:clamp(2rem,4vw,3rem);font-weight:900;margin:1rem 0;}
      .fy-store-library>p{color:var(--muted-foreground);line-height:1.6;}
      .fy-store-library section{margin:2.5rem 0;}
      .fy-store-library section h2{font-size:1.65rem;font-weight:850;margin-bottom:1rem;}
      .fy-store-library-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr));gap:1rem;}
      .fy-store-library-grid article,.fy-store-library-panel{border:1px solid var(--border);padding:1.2rem;border-radius:1rem;background:var(--card);margin-bottom:.8rem;}
      .fy-store-library-grid article span{font-size:.7rem;letter-spacing:.1em;font-weight:800;color:#d6aa4b;}
      .fy-store-library-grid article h3{font-size:1rem;line-height:1.4;font-weight:800;margin:.7rem 0 1.2rem;}
      .fy-store-library button{padding:.75rem 1rem;border-radius:.6rem;border:0;background:#ddba6a;color:#161b32;font-weight:800;cursor:pointer;}
      .fy-store-library button:disabled{opacity:.55;cursor:default;}
      .fy-store-library-panel{display:grid;gap:.8rem;}
      .fy-store-library-panel label{display:grid;gap:.35rem;font-size:.83rem;}
      .fy-store-library-panel input:not([type=checkbox]){padding:.8rem;border:1px solid var(--border);border-radius:.5rem;background:var(--background);color:var(--foreground);}
      .fy-store-library-panel pre{white-space:pre-wrap;max-height:25rem;overflow:auto;overflow-wrap:anywhere;font-family:inherit;font-size:.77rem;}
      .fy-store-library-error{padding:1rem;color:#ffb5b5;border:1px solid #d65b5b;border-radius:.5rem;}
      .fy-store-library-error a{margin-left:1rem;text-decoration:underline;}
      .fy-store-library-status{color:#77d6a8;border:1px solid #34785a;padding:.8rem;border-radius:.6rem;}
      @media(max-width:640px){.fy-store-library{padding:1.5rem .85rem 4rem;}}
    `}</style>
  </MarketingShell>;
}
