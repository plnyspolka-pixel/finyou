// Ortofotomapa (Geoportal GUGiK, WMS HighResolution) do mapy w raporcie PDF.
// Usługa nie wysyła nagłówka CORS — obraz pobiera serwer i zwraca base64
// w zakresie mapy (EPSG:3857, ten sam co kafelki OSM w raporcie).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wmsGetMapUrl } from "@/lib/pdf/static-map";

const ORTO_WMS = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution";
const MAX_BYTES = 4_000_000;

export const getOrthophotoImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        lat: z.number().min(48).max(56),
        lng: z.number().min(13).max(25),
        zoom: z.number().int().min(10).max(19),
        width: z.number().int().min(100).max(800),
        height: z.number().int().min(100).max(600),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ base64: string; mime: string } | null> => {
    const url = wmsGetMapUrl(ORTO_WMS, "Raster", data, {
      format: "image/jpeg",
      transparent: false,
    });
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "FinanceYou-Report/1.0 (+https://financeyou.pl)" },
        signal: AbortSignal.timeout(25_000),
      });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_BYTES) return null;
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      return { base64: btoa(bin), mime: type.split(";")[0] };
    } catch {
      return null;
    }
  });
