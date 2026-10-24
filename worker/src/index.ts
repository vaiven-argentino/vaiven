import { Repositorio, fuenteAssets, manejarMcp } from "@vaiven/mcp";
import paquete from "../package.json";
import { dispararActualizacion } from "./disparador";

// El export que lee el MCP sale de los mismos static assets (/datos/). Se guarda en memoria mientras vive el isolate:
// cada actualización de datos redespliega, así que nunca queda un export viejo.
let repositorio: Repositorio | undefined;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/salud") {
      return Response.json(
        { estado: "ok", version: paquete.version, fase: 3 },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (url.pathname === "/mcp") {
      repositorio ??= new Repositorio(fuenteAssets(env.ASSETS, url.origin));
      return manejarMcp(request, repositorio, {
        limitador: async (r) => {
          const ip = r.headers.get("cf-connecting-ip") ?? "sin-ip";
          return (await env.LIMITE_MCP.limit({ key: `mcp:${ip}` })).success;
        },
      });
    }

    return env.ASSETS.fetch(request);
  },

  // Cron Trigger diario (wrangler.jsonc): dispara el workflow que actualiza los datos (SPEC 5.1, paso 1).
  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(dispararActualizacion(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
