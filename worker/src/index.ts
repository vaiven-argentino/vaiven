import { Repositorio, VERSION_SERVIDOR, fuenteAssets, manejarMcp, precalentar } from "@vaiven/mcp";
import paquete from "../package.json";
import { dispararActualizacion } from "./disparador";

// Precalentamiento del MCP al cargar el isolate: el arranque tiene su propio límite (1 s), mientras que cada pedido tiene
// 10 ms de CPU en el plan gratuito. Tiene que ser sincrónico: workerd no deja usar temporizadores ni números
// aleatorios al cargar el módulo, así que el transporte HTTP del SDK se inicializa recién con el primer pedido.
precalentar();

// El export que lee el MCP sale de los mismos static assets (/datos/). Se guarda en memoria mientras vive el isolate:
// cada actualización de datos redespliega, así que nunca queda un export viejo.
let repositorio: Repositorio | undefined;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/salud") {
      // La fase sale de un solo lugar (`vaiven.fase` en package.json): se actualiza con cada despliegue de fase. La versión
      // es la del servidor MCP (`version` en mcp/package.json), la misma que responde en `initialize`: una sola fuente.
      return Response.json(
        { estado: "ok", version: VERSION_SERVIDOR, fase: paquete.vaiven.fase },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (url.pathname === "/mcp") {
      repositorio ??= new Repositorio(fuenteAssets(env.ASSETS, url.origin));
      return manejarMcp(request, repositorio, {
        // El recurso del gráfico pide su script a este mismo dominio (SPEC 7.4): producción o una URL de versión.
        origenApp: url.origin,
        limitador: async (r) => {
          const ip = r.headers.get("cf-connecting-ip") ?? "sin-ip";
          return (await env.LIMITE_MCP.limit({ key: `mcp:${ip}` })).success;
        },
        // Un registro por pedido (método, herramienta y protocolo): en Observabilidad, cada invocación muestra su CPU
        // junto a este registro, y así se ve qué pedidos pasan de los 10 ms del plan gratuito.
        registrar: (resumen) => console.log(resumen),
      });
    }

    return env.ASSETS.fetch(request);
  },

  // Cron Trigger diario (wrangler.jsonc): dispara el workflow que actualiza los datos (SPEC 5.1, paso 1).
  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(dispararActualizacion(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
