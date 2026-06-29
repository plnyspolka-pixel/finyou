# Prompt do Lovable — Panel klienta: zablokowany kalkulator zamiast formularza landingowego

Skopiuj poniższą treść do czatu w Lovable.

---

## Cel

Na stronie `/klient` (plik `src/routes/klient.index.tsx`) klient, który nie ma jeszcze
wniosku, widzi pełny formularz landingowy `SinglePageApplicationForm`. Zamiast tego ma
od razu widzieć panel z **zablokowanym kalkulatorem** — dokładnie ten widok, który
pokazuje się, gdy wniosek już istnieje (typ nieruchomości, miejscowość, „Twoje pliki",
numer KW, zablokowany kalkulator odblokowywany po wpisaniu KW, przycisk „Zaakceptuj
warunki").

## Co zmienić w `src/routes/klient.index.tsx`

1. **Usuń** import formularza landingowego:
   ```ts
   import { SinglePageApplicationForm } from "@/components/landing/single-page-application-form";
   ```

2. **Dodaj** `useRef` do importu z Reacta:
   ```ts
   import { useEffect, useRef, useState } from "react";
   ```

3. W zapytaniu o wniosek klienta wyciągnij też `isFetched`:
   ```ts
   const { data: loanRow, refetch: refetchLoan, isFetched: loanFetched } = useQuery({
     queryKey: ["client-loan", clientRow?.id],
     queryFn: async () => {
       const { data } = await supabase.from("loan_applications")
         .select("id, view_count")
         .eq("client_id", clientRow!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
       return data;
     },
     enabled: Boolean(clientRow?.id),
   });
   ```

4. **Zaraz pod** tym zapytaniem dodaj automatyczne tworzenie szkicu wniosku, gdy klient
   go nie ma (RLS `loans_client_insert` na to pozwala):
   ```ts
   // Klient bez wniosku ma od razu widzieć panel z zablokowanym kalkulatorem
   // (jak w opublikowanej wersji), a nie formularz landingowy. Dlatego po
   // zalogowaniu automatycznie zakładamy szkic wniosku, na którym opiera się
   // cała sekcja (typ nieruchomości, KW, pliki, kalkulator).
   const creatingDraftRef = useRef(false);
   const [draftError, setDraftError] = useState(false);
   useEffect(() => {
     if (!clientRow?.id) return;
     if (loanRow?.id) return;
     if (!loanFetched) return;
     if (creatingDraftRef.current) return;
     creatingDraftRef.current = true;
     setDraftError(false);
     void (async () => {
       try {
         const { error } = await supabase.from("loan_applications").insert({
           client_id: clientRow.id,
           status: "nowy_lead",
         });
         if (error) throw error;
         await refetchLoan();
       } catch {
         creatingDraftRef.current = false;
         setDraftError(true);
       }
     })();
   }, [clientRow?.id, loanRow?.id, loanFetched, refetchLoan]);
   ```

5. W `return (...)` **zamień** blok renderujący formularz landingowy:
   ```tsx
   {!loanRow?.id && (
     <SinglePageApplicationForm
       prefilledContact={{
         firstName: (clientRow as any)?.first_name ?? (user?.user_metadata as any)?.first_name ?? "",
         lastName: (clientRow as any)?.last_name ?? (user?.user_metadata as any)?.last_name ?? "",
         phone: (clientRow as any)?.phone ?? "",
         email: (clientRow as any)?.email ?? user?.email ?? "",
       }}
     />
   )}
   ```
   na stan ładowania (szkic jest tworzony automatycznie) oraz obsługę błędu:
   ```tsx
   {!loanRow?.id && !draftError && (
     <div className="space-y-6">
       <Skeleton className="h-56 w-full rounded-2xl" />
       <Skeleton className="h-64 w-full rounded-xl" />
     </div>
   )}

   {!loanRow?.id && draftError && (
     <Card className="max-w-2xl">
       <CardHeader><CardTitle>Nie udało się otworzyć panelu</CardTitle></CardHeader>
       <CardContent className="space-y-4">
         <p className="text-sm text-muted-foreground">
           Wystąpił problem przy przygotowaniu Twojego wniosku. Spróbuj ponownie.
         </p>
         <Button
           onClick={() => { creatingDraftRef.current = false; setDraftError(false); void refetchLoan(); }}
         >
           Spróbuj ponownie
         </Button>
       </CardContent>
     </Card>
   )}
   ```

## Ważne

- Cała pozostała logika (`loanRow?.id && ...`: typ nieruchomości, miejscowość, „Twoje pliki",
  numer KW, `InvestorProposalCalculator` z `lockReason`, „Zaakceptuj warunki") zostaje bez
  zmian — opiera się o `loanRow`, który po utworzeniu szkicu będzie ustawiony.
- Kalkulator pozostaje **zablokowany** dopóki klient nie wpisze poprawnego numeru KW
  (logika `lockReason` już istnieje).
- Efekt: każdy zalogowany klient bez wniosku utworzy rekord `loan_applications` ze
  statusem `nowy_lead` (tak samo, jak robił to wcześniej formularz landingowy po wysłaniu).
