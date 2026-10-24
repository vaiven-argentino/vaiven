# worker/

Punto de entrada del Worker de Cloudflare `vaiven` (https://vaiven.argentino.workers.dev): sirve los assets estáticos y, más adelante, el servidor MCP en `/mcp` (SPEC, 5.4 y 7.1).

## Fase 1 (ahora)
- `public/index.html`: página «Vaivén · en construcción».
- `src/index.ts`: `/salud` devuelve `{"estado": "ok", "version": …, "fase": 1}`; el resto lo sirve `env.ASSETS`.
- `src/disparador.ts`: el Cron Trigger diario (`triggers.crons` en `wrangler.jsonc`, 21:23 UTC) dispara el workflow `actualizar.yml` por `workflow_dispatch` (SPEC 5.1, paso 1).

## Secreto del disparador
El token de GitHub (de grano fino, dueño `vaiven-argentino`, solo el repo `vaiven`, permiso Actions: write) no va en el repositorio:

```bash
npx wrangler secret put GITHUB_TOKEN_DISPARO
```

Para probar el disparo en local, copiá `.dev.vars.example` como `.dev.vars` y corré `npx wrangler dev --test-scheduled`; después pedí `http://localhost:8787/__scheduled`. Con un token falso, GitHub responde 401 y el error queda en la consola.

## Comandos
```bash
npm install          # instala wrangler y typescript
npm run dev          # servidor local en http://localhost:8787
npm run verificar    # genera los tipos y chequea TypeScript
npm run deploy       # despliega (pide confirmación en el flujo de trabajo)
```

## Próximas fases
- **Fase 2:** `assets.directory` pasa a apuntar al build de Astro (`../web/dist`).
- **Fase 3:** se agrega `/mcp` a `run_worker_first` y el manejador del paquete `mcp/`.
