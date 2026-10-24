# worker/

Punto de entrada del Worker de Cloudflare `vaiven` (https://vaiven.argentino.workers.dev): sirve los assets estáticos y el servidor MCP en `/mcp` (SPEC, 5.4 y 7.1).

## Qué hace
- `assets.directory` apunta al build de Astro (`../web/dist`): el sitio, el export en `/datos/` y los esquemas en `/esquemas/`. Antes de `wrangler dev` o `wrangler deploy` hay que armar la web (`npm run build -w @vaiven/web`).
- `src/index.ts`: solo dos rutas pasan por el código (`run_worker_first`); el resto lo sirve `env.ASSETS` sin costo de CPU.
  - `/salud` devuelve `{"estado": "ok", "version": …, "fase": 3}`.
  - `/mcp` es el servidor MCP (fase 3): llama a `manejarMcp` de `@vaiven/mcp`, que lee el export de los mismos assets (`/datos/`) y lo guarda en memoria mientras vive el isolate. Ver [`mcp/README.md`](../mcp/README.md).
- `ratelimits` (`LIMITE_MCP`): límite por IP en `/mcp`, 120 pedidos cada 60 s. Es aproximado (se cuenta por ubicación de Cloudflare) y no tiene costo aparte.
- `observability`: registros del Worker (gratis), para ver la CPU por pedido de `/mcp` en el panel de Cloudflare.
- `not_found_handling: "404-page"`: las rutas que no existen devuelven `web/dist/404.html` con estado 404.
- `_headers` y `_redirects` vienen de `web/public/` (CORS y caché en `/datos/*`; 301 de la variante por defecto; 302 a la descarga completa vigente).
- `src/disparador.ts`: el Cron Trigger diario (`triggers.crons` en `wrangler.jsonc`, 21:23 UTC) dispara el workflow `actualizar.yml` por `workflow_dispatch` (SPEC 5.1, paso 1).

## Secreto del disparador
El token de GitHub (de grano fino, dueño `vaiven-argentino`, solo el repo `vaiven`, permiso Actions: write) no va en el repositorio:

```bash
npx wrangler secret put GITHUB_TOKEN_DISPARO
```

Para probar el disparo en local, copiá `.dev.vars.example` como `.dev.vars` y corré `npx wrangler dev --test-scheduled`; después pedí `http://localhost:8787/cdn-cgi/handler/scheduled` (en wrangler 4, `/__scheduled` ya no llega al Worker: la toman los assets). Con un token falso, GitHub responde 401; sin `.dev.vars`, el Worker avisa que falta el secreto. En los dos casos, el error queda en la consola.

## Comandos
```bash
npm install          # desde la raíz del repositorio (workspaces de npm)
npm run build -w @vaiven/web   # arma web/dist, que es lo que sirve el Worker
npm run dev          # servidor local en http://localhost:8787
npm run verificar    # genera los tipos y chequea TypeScript
npm run deploy       # despliega (pide confirmación en el flujo de trabajo)
```

## Probar `/mcp` en local
```bash
npm run build -w @vaiven/web
cd worker && npx wrangler dev --test-scheduled      # en otra terminal:
node mcp/scripts/probar-endpoint.mjs                  # desde la raíz
```
