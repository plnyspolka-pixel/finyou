// supabase/functions/reconcile-storage/index.ts
//
// Jednorazowa naprawa plików osieroconych przez migracje bucketów
// (20260715090000 / 20260718090000), które przeniosły obiekty do
// `pliki-klienta` tylko przez `UPDATE storage.objects SET bucket_id` — bez
// fizycznego przeniesienia bajtów w S3. Efekt: signed URL zwraca 404, kafelki
// są szare. Ta funkcja odnajduje fizyczny blob w starym buckecie i kopiuje go
// z powrotem do `pliki-klienta`, tak by metadane i plik znów się zgadzały.
//
// URUCHOMIENIE: przycisk „Napraw pliki" w panelu admina (Ustawienia →
// Konserwacja plików) wywołuje tę funkcję przez supabase.functions.invoke.
// Dostęp tylko dla zalogowanego administratora (verify_jwt = true + kontrola
// roli w środku). Body: { apply?: boolean, max?: number }.
//   - apply=false (domyślnie) → dry-run, NIC nie zapisuje, tylko raport.
//   - apply=true             → kopiuje osierocone bloby do pliki-klienta.
//
// Wymagane sekrety funkcji (Supabase wstrzykuje je automatycznie):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//
// Funkcja jest idempotentna: pliki już działające pomija, a naprawione przy
// kolejnym uruchomieniu również pomija. Można ją odpalać wielokrotnie.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const TARGET_BUCKET = "pliki-klienta";
const SOURCE_BUCKETS = ["documents", "property-photos"] as const;
const PAGE_SIZE = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w sekretach funkcji." }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Bramka: tylko zalogowany administrator. verify_jwt=true gwarantuje ważny
  // token; tu dodatkowo wymuszamy rolę administrator.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Brak tokenu." }, 401);
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const uid = userData?.user?.id;
  if (userErr || !uid) return json({ error: "Nieautoryzowane." }, 401);
  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: uid,
    _role: "administrator",
  });
  if (roleErr) return json({ error: `Kontrola roli: ${roleErr.message}` }, 500);
  if (isAdmin !== true) return json({ error: "Wymagana rola administrator." }, 403);

  // Parametry z body (functions.invoke) lub z query (curl/dashboard).
  const url = new URL(req.url);
  let body: { apply?: boolean; max?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const apply = body.apply === true || url.searchParams.get("apply") === "1";
  // Bezpiecznik: maks. liczba plików do naprawy w jednym wywołaniu (0 = bez limitu).
  const maxFix = Number(body.max ?? url.searchParams.get("max") ?? 0) || 0;

  const report = {
    mode: apply ? "apply" : "dry-run",
    scanned: 0,
    alreadyOk: 0,
    recoverable: 0, // znaleziono fizyczny blob w starym buckecie
    fixed: 0, // faktycznie skopiowano (tylko apply)
    stillMissing: 0, // 404 w pliki-klienta i nie znaleziono w żadnym starym buckecie
    stillMissingSample: [] as string[],
    errors: [] as { name: string; error: string }[],
  };

  // Czy fizyczny blob istnieje pod danym bucketem/nazwą? Lekki test: podpisz URL
  // i pobierz PIERWSZY bajt (Range). 206/200 → jest, 404/416 → osierocony wpis
  // metadanych (brak bajtów w S3). Nie ściągamy całego pliku przy sprawdzaniu.
  async function exists(bucket: string, name: string): Promise<boolean> {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(name, 120);
    if (error || !data?.signedUrl) return false;
    try {
      const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-0" } });
      // 206 (partial) lub 200 → plik jest; wszystko inne (404/400/416) → brak.
      if (res.status === 200 || res.status === 206) {
        // domknij strumień
        await res.arrayBuffer().catch(() => {});
        return true;
      }
      await res.body?.cancel().catch(() => {});
      return false;
    } catch {
      return false;
    }
  }

  let offset = 0;
  let stop = false;

  while (!stop) {
    const { data: names, error: listErr } = await supabase.rpc("reconcile_object_names", {
      p_offset: offset,
      p_limit: PAGE_SIZE,
    });
    if (listErr) return json({ error: `reconcile_object_names: ${listErr.message}`, report }, 500);
    const page: string[] = (names ?? []).map((r: { name: string }) => r.name);
    if (page.length === 0) break;
    offset += page.length;

    for (const name of page) {
      report.scanned++;

      // 1) Już działa? (blob fizycznie w pliki-klienta) → pomiń.
      if (await exists(TARGET_BUCKET, name)) {
        report.alreadyOk++;
        continue;
      }

      // 2) Osierocony — szukaj fizycznego bloba w starych bucketach.
      let recovered = false;
      for (const src of SOURCE_BUCKETS) {
        // Załóż tymczasowy wiersz metadanych wskazujący na fizyczny blob.
        const { data: shadowed, error: shErr } = await supabase.rpc("reconcile_shadow_upsert", {
          p_name: name,
          p_src_bucket: src,
        });
        if (shErr) {
          report.errors.push({ name, error: `shadow_upsert(${src}): ${shErr.message}` });
          continue;
        }
        if (!shadowed) continue; // brak wiersza źródłowego w pliki-klienta

        try {
          if (!(await exists(src, name))) continue;

          // Znaleziono fizyczny blob w starym buckecie.
          report.recoverable++;
          recovered = true;

          if (apply) {
            // Teraz (i tylko teraz) ściągamy pełne bajty i wgrywamy do celu.
            const { data: blob, error: dlErr } = await supabase.storage.from(src).download(name);
            if (dlErr || !blob) {
              report.errors.push({ name, error: `download(${src}): ${dlErr?.message ?? "brak danych"}` });
            } else {
              const contentType = blob.type || "application/octet-stream";
              const bytes = new Uint8Array(await blob.arrayBuffer());
              const { error: upErr } = await supabase.storage
                .from(TARGET_BUCKET)
                .upload(name, bytes, { upsert: true, contentType });
              if (upErr) report.errors.push({ name, error: `upload: ${upErr.message}` });
              else report.fixed++;
            }
          }
        } finally {
          // Zawsze sprzątamy tymczasowy wiersz.
          await supabase.rpc("reconcile_shadow_delete", { p_name: name, p_src_bucket: src });
        }

        if (recovered) break;
      }

      if (!recovered) {
        report.stillMissing++;
        if (report.stillMissingSample.length < 25) report.stillMissingSample.push(name);
      }

      if (maxFix > 0 && report.fixed >= maxFix) {
        stop = true;
        break;
      }
    }
  }

  return json(report);
});
