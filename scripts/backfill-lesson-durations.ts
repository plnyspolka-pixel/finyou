// Uzupełnia `training_videos.duration_seconds` (czas lekcji pokazywany na
// /dla-inwestora/szkolenie i w /inwestor/sklep) na podstawie plików w Storage
// (bucket training-videos) — ffprobe czyta tylko nagłówek MP4 z podpisanego URL.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… bun scripts/backfill-lesson-durations.ts [--dry]
//
// Wymaga ffprobe w PATH. Pomija lekcje, które mają już czas, i zewnętrzne
// (YouTube/Vimeo — tam czas trzeba wpisać ręcznie w /admin/szkolenia).
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const dry = process.argv.includes("--dry");
const db = createClient(url, key, { auth: { persistSession: false } });

function probeSeconds(mediaUrl: string): number | null {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mediaUrl],
    { encoding: "utf8", timeout: 60_000 },
  );
  const n = Number.parseFloat((r.stdout || "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const { data, error } = await db
  .from("training_videos")
  .select("id,title,file_path,external_url,duration_seconds")
  .is("duration_seconds", null);
if (error) throw error;

let done = 0;
for (const v of data ?? []) {
  if (!v.file_path) {
    console.log(`– ${v.title}: zewnętrzny URL, pomijam`);
    continue;
  }
  const { data: signed, error: sErr } = await db.storage
    .from("training-videos")
    .createSignedUrl(v.file_path, 600);
  if (sErr || !signed?.signedUrl) {
    console.log(`! ${v.title}: nie udało się podpisać URL (${sErr?.message ?? "brak"})`);
    continue;
  }
  const seconds = probeSeconds(signed.signedUrl);
  if (!seconds) {
    console.log(`! ${v.title}: ffprobe nie odczytał czasu`);
    continue;
  }
  console.log(`✓ ${v.title}: ${Math.round(seconds / 60)} min${dry ? " (dry)" : ""}`);
  if (!dry) {
    const { error: uErr } = await db
      .from("training_videos")
      .update({ duration_seconds: seconds })
      .eq("id", v.id);
    if (uErr) console.log(`! ${v.title}: zapis nieudany — ${uErr.message}`);
    else done++;
  }
}
console.log(`Zaktualizowano ${done} nagrań.`);
