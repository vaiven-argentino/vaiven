# worker/

Punto de entrada del Worker de Cloudflare `vaiven` (https://vaiven.argentino.workers.dev): sirve los assets estáticos y, más adelante, el servidor MCP en `/mcp` (SPEC, 5.4 y 7.1).

## Fase 0 (ahora)
- `public/index.html`: página «Vaivén · en construcción».
- `src/index.ts`: `/salud` devuelve `{"estado": "ok", "version": …, "fase": 0}`; el resto lo sirve `env.ASSETS`.

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
