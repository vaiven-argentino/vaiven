import paquete from "../package.json";
import { dispararActualizacion } from "./disparador";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/salud") {
      return Response.json(
        { estado: "ok", version: paquete.version, fase: 1 },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return env.ASSETS.fetch(request);
  },

  // Cron Trigger diario (wrangler.jsonc): dispara el workflow que actualiza los datos (SPEC 5.1, paso 1).
  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(dispararActualizacion(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
