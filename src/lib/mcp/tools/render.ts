// Render — usługi, wdrożenia i ogólne wywołanie REST API Render
// (api.render.com/v1) kluczem RENDER_API_KEY, który zostaje na serwerze.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { SENDS, clampLimit, handle, ok, requireRolesAdmin, requireTeam } from "../_helpers";

const ADMIN_ONLY = ["administrator"] as const;
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

export const renderStatus = defineTool({
  name: "render_status",
  title: "Render status",
  description:
    "Stan integracji Render: czy klucz RENDER_API_KEY jest skonfigurowany i lista usług (nazwa, typ, region, adres, status wstrzymania). Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const r = await import("@/lib/render-api.server");
      if (!r.hasRenderKey()) return ok({ configured: false });
      const rows = await r.listServices(20);
      return ok({
        configured: true,
        services: rows.map((x: any) => summarizeService(x.service ?? x)),
      });
    }),
});

export const listRenderServices = defineTool({
  name: "list_render_services",
  title: "List Render services",
  description: "Usługi na koncie Render (web, worker, cron, static, baza). Tylko administrator/operator.",
  inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const r = await import("@/lib/render-api.server");
      const rows = await r.listServices(clampLimit(a.limit, 20, 100));
      return ok({ services: rows.map((x: any) => summarizeService(x.service ?? x)) });
    }),
});

export const getRenderService = defineTool({
  name: "get_render_service",
  title: "Get Render service",
  description: "Pełne dane jednej usługi Render po id (srv-…). Tylko administrator/operator.",
  inputSchema: { service_id: z.string().min(5) },
  annotations: READ,
  handler: ({ service_id }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const r = await import("@/lib/render-api.server");
      return ok(await r.getService(service_id));
    }),
});

export const listRenderDeploys = defineTool({
  name: "list_render_deploys",
  title: "List Render deploys",
  description:
    "Ostatnie wdrożenia usługi Render: id, status, commit, daty. Tylko administrator/operator.",
  inputSchema: {
    service_id: z.string().min(5),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const r = await import("@/lib/render-api.server");
      const rows = await r.listDeploys(a.service_id, clampLimit(a.limit, 10, 50));
      return ok({
        deploys: rows.map((x: any) => {
          const d = x.deploy ?? x;
          return {
            id: d.id,
            status: d.status,
            trigger: d.trigger,
            commit: d.commit ? { id: d.commit.id, message: d.commit.message } : null,
            created_at: d.createdAt,
            finished_at: d.finishedAt,
          };
        }),
      });
    }),
});

export const triggerRenderDeploy = defineTool({
  name: "trigger_render_deploy",
  title: "Trigger Render deploy",
  description:
    "Uruchamia nowe wdrożenie usługi Render (opcjonalnie z wyczyszczeniem cache). To realne wdrożenie produkcyjne — użyj TYLKO na wyraźne polecenie użytkownika. Tylko administrator.",
  inputSchema: {
    service_id: z.string().min(5),
    clear_cache: z.boolean().default(false),
  },
  annotations: SENDS,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const r = await import("@/lib/render-api.server");
      const d = await r.triggerDeploy(a.service_id, a.clear_cache);
      return ok({ ok: true, deploy_id: d?.id, status: d?.status });
    }),
});

export const renderApiRequest = defineTool({
  name: "render_api_request",
  title: "Render API request (generic)",
  description:
    "Dowolne wywołanie REST Render względem https://api.render.com/v1/ (np. `services`, `services/srv-…/env-vars`, `services/srv-…/suspend`, `postgres`, `logs`), GET/POST/PUT/PATCH/DELETE z zapytaniem lub treścią JSON. Klucz zostaje na serwerze. Tylko administrator.",
  inputSchema: {
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    path: z.string().min(3).max(300).describe("Ścieżka względem /v1/, np. services."),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    body: z.any().optional().describe("Treść JSON dla POST/PUT/PATCH."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const r = await import("@/lib/render-api.server");
      const res = await r.renderRequest(a.path, {
        method: a.method,
        query: a.query,
        body: a.body,
      });
      const text = res.json !== undefined ? JSON.stringify(res.json) : (res.text ?? "");
      return ok({
        status: res.status,
        content_type: res.contentType,
        body: text.length > 20000 ? `${text.slice(0, 20000)}… (ucięte)` : (res.json ?? res.text),
      });
    }),
});

function summarizeService(s: any) {
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    region: s.serviceDetails?.region ?? null,
    url: s.serviceDetails?.url ?? null,
    branch: s.branch ?? null,
    repo: s.repo ?? null,
    suspended: s.suspended,
    auto_deploy: s.autoDeploy,
    updated_at: s.updatedAt,
  };
}

export const renderTools = [
  renderStatus,
  listRenderServices,
  getRenderService,
  listRenderDeploys,
  triggerRenderDeploy,
  renderApiRequest,
];
