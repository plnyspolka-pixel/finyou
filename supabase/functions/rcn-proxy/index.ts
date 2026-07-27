// supabase/functions/rcn-proxy/index.ts
// Wklej ten plik do: supabase/functions/rcn-proxy/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Bazowy endpoint RCN — POPRAWNY
const RCN_BASE = "https://mapy.geoportal.gov.pl/wss/service/rcn";

// Kolejność prób GetCapabilities
const CAPABILITIES_ATTEMPTS = [
  `${RCN_BASE}?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=2.0.0`,
  `${RCN_BASE}?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=1.1.0`,
  `${RCN_BASE}?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=1.0.0`,
  `${RCN_BASE}?SERVICE=WMS&REQUEST=GetCapabilities`,
];

// Słowa kluczowe wskazujące poprawną odpowiedź XML
const XML_SUCCESS_KEYWORDS = [
  "WFS_Capabilities",
  "WMS_Capabilities",
  "FeatureTypeList",
  "Layer",
  "FeatureCollection",
];

function isSuccessXml(text: string): boolean {
  return XML_SUCCESS_KEYWORDS.some((kw) => text.includes(kw));
}

function extractLayers(xml: string): string[] {
  const layers: string[] = [];

  // WFS 2.0 / 1.1 — <Name> wewnątrz <FeatureType>
  const featureTypeRegex =
    /<(?:[a-zA-Z0-9]+:)?FeatureType[\s\S]*?<(?:[a-zA-Z0-9]+:)?Name>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?Name>/g;
  let match;
  while ((match = featureTypeRegex.exec(xml)) !== null) {
    const name = match[1].trim().replace(/^ms:/i, "");
    if (name && !layers.includes(name)) layers.push(name);
  }

  // WMS — <Layer><Name>
  if (layers.length === 0) {
    const layerNameRegex =
      /<(?:[a-zA-Z0-9]+:)?Layer[^>]*>[\s\S]*?<(?:[a-zA-Z0-9]+:)?Name>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?Name>/g;
    while ((match = layerNameRegex.exec(xml)) !== null) {
      const name = match[1].trim().replace(/^ms:/i, "");
      if (/^wms$/i.test(name) || /^default$/i.test(name)) continue;
      if (name && !layers.includes(name)) layers.push(name);
    }
  }

  return layers;
}

function pickRcnLayer(layers: string[]): string | null {
  // Szukamy warstwy z transakcjami RCN
  const priorities = ["rcn", "transakcje", "transaction", "nieruchomo"];
  for (const priority of priorities) {
    const found = layers.find((l) => l.toLowerCase().includes(priority));
    if (found) return found;
  }
  // Fallback — pierwsza warstwa
  return layers[0] ?? null;
}

async function testCapabilities(): Promise<{
  success: boolean;
  url: string;
  httpStatus: number | null;
  contentType: string;
  responseStartsWith: string;
  availableLayers: string[];
  selectedLayer: string | null;
  serviceType: "WFS" | "WMS" | null;
  wfsVersion: string | null;
  error: string;
  allAttempts: object[];
}> {
  const allAttempts: object[] = [];

  for (const url of CAPABILITIES_ATTEMPTS) {
    const attempt: {
      url: string;
      httpStatus: number | null;
      contentType: string;
      responseStartsWith: string;
      success: boolean;
      error: string;
    } = {
      url,
      httpStatus: null,
      contentType: "",
      responseStartsWith: "",
      success: false,
      error: "",
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/xml,text/xml,*/*",
          "User-Agent": "FinyouApp/1.0 RCN-Proxy Deno",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      attempt.httpStatus = response.status;
      attempt.contentType = response.headers.get("content-type") ?? "";

      const text = await response.text();
      attempt.responseStartsWith = text.substring(0, 200);

      if (response.ok && isSuccessXml(text)) {
        attempt.success = true;
        allAttempts.push(attempt);

        const layers = extractLayers(text);
        const selectedLayer = pickRcnLayer(layers);
        const isWms = url.includes("SERVICE=WMS");
        const versionMatch = url.match(/VERSION=([0-9.]+)/);

        return {
          success: true,
          url,
          httpStatus: response.status,
          contentType: attempt.contentType,
          responseStartsWith: attempt.responseStartsWith,
          availableLayers: layers,
          selectedLayer,
          serviceType: isWms ? "WMS" : "WFS",
          wfsVersion: versionMatch ? versionMatch[1] : null,
          error: "",
          allAttempts,
        };
      } else {
        attempt.error = response.ok
          ? "Odpowiedź HTTP OK ale brak rozpoznanych tagów XML capabilities"
          : `HTTP ${response.status}`;
      }
    } catch (e: unknown) {
      attempt.error =
        e instanceof Error ? (e.name === "AbortError" ? "Timeout po 20s" : e.message) : String(e);
    }

    allAttempts.push(attempt);
  }

  return {
    success: false,
    url: "",
    httpStatus: null,
    contentType: "",
    responseStartsWith: "",
    availableLayers: [],
    selectedLayer: null,
    serviceType: null,
    wfsVersion: null,
    error:
      "Nie udało się połączyć z usługą RCN GetCapabilities. To błąd techniczny integracji albo dostępności usługi, a nie informacja o braku transakcji RCN.",
    allAttempts,
  };
}

async function getFeature(params: {
  layerName: string;
  wfsVersion: string;
  bbox: string;
  maxFeatures?: number;
}): Promise<{
  success: boolean;
  rawCount: number;
  features: object[];
  rawXml: string;
  error: string;
  status: string;
}> {
  const { layerName, wfsVersion, bbox, maxFeatures = 100 } = params;

  const countParam = wfsVersion === "2.0.0" ? `COUNT=${maxFeatures}` : `MAXFEATURES=${maxFeatures}`;

  const url =
    `${RCN_BASE}?SERVICE=WFS&REQUEST=GetFeature` +
    `&VERSION=${wfsVersion}` +
    `&TYPENAMES=${layerName}` +
    `&BBOX=${bbox}` +
    `&${countParam}` +
    `&OUTPUTFORMAT=application/json`;

  // Próbujemy JSON
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json,application/xml,text/xml,*/*",
        "User-Agent": "FinyouApp/1.0 RCN-Proxy Deno",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      // Próbuj bez OUTPUTFORMAT (fallback do XML)
      return await getFeatureXmlFallback(layerName, wfsVersion, bbox, maxFeatures);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (contentType.includes("json") || text.trim().startsWith("{")) {
      try {
        const json = JSON.parse(text);
        const features = json.features ?? [];
        return {
          success: true,
          rawCount: features.length,
          features,
          rawXml: "",
          error: "",
          status: features.length > 0 ? "features_found" : "no_features",
        };
      } catch {
        // JSON parse fail — traktuj jak XML
      }
    }

    // Odpowiedź jest XML
    if (isSuccessXml(text) || text.includes("FeatureCollection")) {
      const count = (text.match(/<gml:featureMember/g) ?? []).length;
      return {
        success: true,
        rawCount: count,
        features: [],
        rawXml: text.substring(0, 5000),
        error: "",
        status: count > 0 ? "features_found" : "no_features",
      };
    }

    return {
      success: false,
      rawCount: 0,
      features: [],
      rawXml: text.substring(0, 500),
      error: "Nierozpoznany format odpowiedzi GetFeature",
      status: "getfeature_failed",
    };
  } catch (e: unknown) {
    return {
      success: false,
      rawCount: 0,
      features: [],
      rawXml: "",
      error: e instanceof Error ? e.message : String(e),
      status: "getfeature_failed",
    };
  }
}

async function getFeatureXmlFallback(
  layerName: string,
  wfsVersion: string,
  bbox: string,
  maxFeatures: number,
): Promise<{
  success: boolean;
  rawCount: number;
  features: object[];
  rawXml: string;
  error: string;
  status: string;
}> {
  const countParam = wfsVersion === "2.0.0" ? `COUNT=${maxFeatures}` : `MAXFEATURES=${maxFeatures}`;

  const url =
    `${RCN_BASE}?SERVICE=WFS&REQUEST=GetFeature` +
    `&VERSION=${wfsVersion}` +
    `&TYPENAMES=${layerName}` +
    `&BBOX=${bbox}` +
    `&${countParam}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/xml,text/xml,*/*",
        "User-Agent": "FinyouApp/1.0 RCN-Proxy Deno",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await response.text();
    const count = (text.match(/<gml:featureMember/g) ?? []).length;

    return {
      success: response.ok,
      rawCount: count,
      features: [],
      rawXml: text.substring(0, 5000),
      error: response.ok ? "" : `HTTP ${response.status}`,
      status: response.ok ? (count > 0 ? "features_found" : "no_features") : "getfeature_failed",
    };
  } catch (e: unknown) {
    return {
      success: false,
      rawCount: 0,
      features: [],
      rawXml: "",
      error: e instanceof Error ? e.message : String(e),
      status: "getfeature_failed",
    };
  }
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "capabilities";

    // --- Akcja: generyczny pass-through do mapy.geoportal.gov.pl/wss/service/rcn ---
    // Pozwala server functions Cloudflare Workers omijać sieciowe restrykcje, bo
    // żądanie wychodzi z Supabase Edge (Deno na Deno Deploy).
    if (action === "proxy") {
      const target = url.searchParams.get("url");
      if (!target) {
        return new Response(JSON.stringify({ error: "Brak parametru url" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      // Whitelist: tylko mapy.geoportal.gov.pl
      let targetUrl: URL;
      try {
        targetUrl = new URL(target);
      } catch {
        return new Response(JSON.stringify({ error: "Nieprawidłowy url" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      if (targetUrl.hostname !== "mapy.geoportal.gov.pl") {
        return new Response(JSON.stringify({ error: "Hostname niedozwolony" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 25_000);
      try {
        const upstream = await fetch(targetUrl.toString(), {
          method: "GET",
          headers: {
            Accept: "text/html,application/xml,text/xml,application/json,*/*",
            "User-Agent": "FinyouApp/1.0 RCN-Proxy Deno",
          },
          // Host walidowany tylko dla pierwszego URL; nie podążamy za 3xx,
          // by przekierowanie nie ominęło allowlisty (ochrona przed SSRF).
          redirect: "manual",
          signal: controller.signal,
        });
        clearTimeout(t);
        const body = await upstream.arrayBuffer();
        return new Response(body, {
          status: upstream.status,
          headers: {
            ...corsHeaders,
            "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
            "X-Proxy-Upstream-Status": String(upstream.status),
          },
        });
      } catch (e: unknown) {
        clearTimeout(t);
        return new Response(
          JSON.stringify({
            error:
              e instanceof Error
                ? e.name === "AbortError"
                  ? "Timeout po 25s"
                  : e.message
                : String(e),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 },
        );
      }
    }

    // --- Akcja: testuj capabilities ---
    if (action === "capabilities") {
      const result = await testCapabilities();

      const status = result.success
        ? result.serviceType === "WMS"
          ? "wms_capabilities_success_but_wfs_failed"
          : result.availableLayers.length > 0
            ? "capabilities_success"
            : "no_layers_detected"
        : "capabilities_failed";

      return new Response(JSON.stringify({ ...result, diagnosticStatus: status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // --- Akcja: GetFeature ---
    if (action === "getfeature") {
      const body = req.method === "POST" ? await req.json() : {};
      const { layerName, wfsVersion, bbox } = body;

      if (!layerName || !wfsVersion || !bbox) {
        return new Response(
          JSON.stringify({
            error:
              "Wymagane parametry: layerName, wfsVersion, bbox. Najpierw wywołaj /rcn-proxy?action=capabilities",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const result = await getFeature({ layerName, wfsVersion, bbox });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(
      JSON.stringify({ error: "Nieznana akcja. Użyj: capabilities | getfeature | proxy" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
