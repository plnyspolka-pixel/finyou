import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/shell";

export const Route=createFileRoute("/regulamin-windykator-ai")({
  head:()=>({meta:[{title:"Warunki Pakietu Startowego Windykator AI | Finance You"},
    {name:"robots",content:"noindex"}]}),
  component:Terms,
});
function Terms(){
  return <MarketingShell page="sklep">
    <main className="mx-auto max-w-4xl px-5 py-14 text-slate-900">
      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
        Wersja robocza z 2 listopada 2026 r. Dokument wymaga zatwierdzenia prawnego przed włączeniem płatności.
      </div>
      <h1 className="mt-8 text-4xl font-black">Warunki Pakietu Startowego Windykator AI</h1>
      <p className="mt-3 text-sm text-slate-500">Wersja windykator-startowy-2026-11-02-v1</p>
      <article className="mt-8 space-y-6 text-base leading-relaxed">
        <section><h2 className="text-xl font-bold">1. Podmiot i przedmiot</h2>
          <p>Usługodawcą jest Finance You sp. z o.o. Dane identyfikacyjne i kontaktowe przedsiębiorcy muszą być uzupełnione i zweryfikowane przed publikacją regulaminu. Pakiet Startowy to jednorazowe opracowanie informacji i projektów dokumentów dotyczących jednej należności na podstawie dokumentów przekazanych przez zamawiającego.</p></section>
        <section><h2 className="text-xl font-bold">2. Cena i rezultat</h2>
          <p>Cena jednego Pakietu Startowego wynosi 50 zł brutto. Usługa obejmuje analizę jednego dokumentu źródłowego, raport z kontroli danych i braków dokumentacyjnych, projekt wezwania do zapłaty oraz wstępny szkic EPU, jeżeli roszczenie kwalifikuje się do tej procedury. Jeżeli nie, raport wskazuje przeszkody; system nie tworzy fikcyjnego pozwu.</p>
          <p>Usługa jest w pełni wykonana po udostępnieniu zamawiającemu zamówionego rezultatu. Samo przyjęcie zlecenia, rozpoczęcie OCR lub wygenerowanie błędnego rezultatu nie stanowi pełnego wykonania.</p></section>
        <section><h2 className="text-xl font-bold">3. Weryfikacja i obowiązki zamawiającego</h2>
          <p>Zamawiający potwierdza, że jest wierzycielem albo posiada ważne umocowanie, przedstawia prawdziwe informacje o należności, jej wymagalności, zapłatach i sporach. Samo przekazanie dokumentu nie potwierdza istnienia długu. W razie istotnych rozbieżności system oznacza potrzebę wyjaśnienia i nie kieruje żądania zapłaty do dłużnika.</p></section>
        <section><h2 className="text-xl font-bold">4. Prawo odstąpienia konsumenta</h2>
          <p>Konsument, który zawarł umowę na odległość, co do zasady może odstąpić od niej w ciągu 14 dni. Na jego wyraźne żądanie przedsiębiorca może rozpocząć realizację przed upływem tego terminu. Jeżeli odpłatna usługa została wykonana w pełni za uprzednią wyraźną zgodą konsumenta, który przyjął do wiadomości utratę prawa odstąpienia po pełnym wykonaniu, zastosowanie może znaleźć wyjątek z art. 38 ust. 1 pkt 1 ustawy o prawach konsumenta.</p>
          <p>Do pełnego wykonania konsument zachowuje prawa wynikające z ustawy. Przy odstąpieniu po żądaniu wcześniejszego rozpoczęcia może być należna proporcjonalna zapłata za rzeczywiście wykonane świadczenia na zasadach art. 35. Żadne oświadczenie składane podczas zamówienia nie stanowi bezwarunkowego zrzeczenia się ustawowego prawa odstąpienia.</p></section>
        <section><h2 className="text-xl font-bold">5. Odrębna obsługa polubowna</h2>
          <p>Potencjalna bezpłatna obsługa polubowna przez maksymalnie 90 dni jest odrębną usługą, wymagającą odrębnych warunków, weryfikacji należności i aktywacji. Nie rozpoczyna się automatycznie wskutek zakupu Pakietu Startowego; sama analiza dokumentów nie upoważnia do wykonywania połączeń, wysyłania SMS-ów ani pism do dłużnika.</p></section>
        <section><h2 className="text-xl font-bold">6. EPU</h2>
          <p>Wstępny szkic EPU jest dokumentem roboczym, nie jest wniesionym pozwem ani opinią prawną. Wniesienie pozwu, podpis i opłata sądowa wymagają odrębnego działania osoby uprawnionej. W razie szczególnych okoliczności prawnych projekt może wymagać uzupełnienia i oceny specjalisty.</p></section>
        <section><h2 className="text-xl font-bold">7. Dane i bezpieczeństwo</h2>
          <p>Dane stron i dokumenty są poufne, wykorzystywane do wykonania zamówienia, w tym do analizy AI, z zachowaniem wymogów ochrony danych osobowych. Dokumentów nie ujawnia się publicznie. Szczegółowe podstawy przetwarzania, odbiorców danych, okresy przechowywania oraz prawa osób należy określić w aktualnej polityce prywatności przed produkcyjnym uruchomieniem.</p></section>
      </article>
      <a href="/windykator-ai" className="mt-10 inline-block rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white">Wróć do Windykatora AI</a>
    </main>
  </MarketingShell>;
}