# mcp/

Servidor MCP de Vaivén (SPEC, sección 7), en TypeScript con el SDK oficial v2 (`@modelcontextprotocol/server`). El mismo código corre **remoto**, en el Worker (`https://vaiven.argentino.workers.dev/mcp`), y **local**, por stdio.

- **Protocolo:** Streamable HTTP, sin estado y sin autenticación. Atiende la revisión 2026-07-28 y, sin sesión, a los clientes de la era 2025 (de 2024-10-07 a 2025-11-25), que entran con `initialize`.
- **Datos:** lee el export ya publicado (no calcula empalmes) y transforma con `@vaiven/transformaciones`. La cita sale de `@vaiven/cita`, igual que en la ficha de la web.
- **Instrucciones para conectarlo:** <https://vaiven.argentino.workers.dev/agentes/>.

## Herramientas (fase 3)
| Herramienta | Parámetros | Devuelve |
|---|---|---|
| `buscar_series` | `texto?`, `bloque?`, `prioridad?`, `desde?`, `hasta?` | Series con id, código, nombre, bloque, frecuencia, cobertura y variantes (con su estado y nota). |
| `describir_serie` | `id` | Definición, variantes (método, tramos, transformaciones, excluidos, cita), quiebres, fuentes, bibliografía y licencia. |
| `obtener_serie` | `id`, `variante?`, `desde?`, `hasta?`, `frecuencia?`, `transformacion?`, `base?` | `datos` como `[fecha, valor]`, unidad resultante, tramos de frecuencia, advertencias por quiebres del rango, excluidos, notas, fuentes, versión de datos y cita. |
| `citar` | `id`, `variante?`, `formato?`, `transformacion?`, `frecuencia?` | Cita en texto, APA y BibTeX (o el formato pedido), con la versión de datos y la URL de la variante. |

- `id` acepta el id de la serie (`ipc`), su código (`PRE-01`) o el de una variante (`ipc.provincias`).
- Las respuestas van como JSON en un bloque de texto (sin `structuredContent`, para no duplicarlas). Los errores (variante pendiente, transformación que no corresponde, más de 10.000 observaciones) salen con `isError` y un mensaje en español que dice cómo seguir.
- Las descripciones que lee el modelo están en `src/textos.ts`.

## Estructura
```
src/datos.ts            FuenteDatos (assets del Worker o URL), Repositorio con caché y resolución de ids
src/fuente-carpeta.ts   el export desde una carpeta (stdio y pruebas; usa node:fs)
src/textos.ts           instrucciones del servidor y descripciones de herramientas y parámetros
src/herramientas/       buscar.ts, describir.ts, obtener.ts, citar.ts (funciones puras) y comun.ts
src/servidor.ts         crearServidor(repo): McpServer con las 4 herramientas
src/http.ts             manejarMcp(request, repo): CORS, OPTIONS, 405, Host, límite y createMcpHandler
src/stdio.ts            variante local
scripts/probar-endpoint.mjs   prueba HTTP del Worker (local o producción)
test/                   Vitest contra el export real
PRUEBA_MANUAL.md        guion de la prueba con Claude (web y escritorio)
```

## HTTP de `/mcp`
- `POST`: el protocolo. `OPTIONS`: 204 con CORS abierto. `GET` y `DELETE`: 405 (sin estado no hay flujo SSE aparte ni sesiones).
- Se acepta cualquier origen (los datos son públicos y no hay credenciales). Contra el DNS rebinding se valida el `Host`: solo `vaiven.argentino.workers.dev`, `localhost` y `127.0.0.1`.
- Límite por IP: el Worker usa el binding de Rate Limiting (120 pedidos cada 60 s, aproximado). Si se pasa, responde 429 con `Retry-After`.

## Variante local (stdio)
```bash
npm ci                                  # desde la raíz del repositorio
npm run empaquetar -w @vaiven/mcp       # arma mcp/dist/vaiven-mcp.mjs (no se versiona)
node mcp/dist/vaiven-mcp.mjs            # lee el export publicado
node mcp/dist/vaiven-mcp.mjs --export export   # o una copia local
npm run local -w @vaiven/mcp            # empaqueta y corre con ../export
```
En Claude Desktop (`claude_desktop_config.json`):
```json
{ "mcpServers": { "vaiven": { "command": "node", "args": ["/ruta/a/vaiven/mcp/dist/vaiven-mcp.mjs"] } } }
```
La distribución por `npx` (un paquete en una release) queda para la fase 5.

## Pruebas
```bash
npm test -w @vaiven/mcp        # herramientas, protocolo (dos eras), HTTP, stdio y tiempos
npm run verificar -w @vaiven/mcp
# Con el sitio armado y `npx wrangler dev --test-scheduled` corriendo en worker/:
node mcp/scripts/probar-endpoint.mjs                                   # http://localhost:8787
node mcp/scripts/probar-endpoint.mjs https://vaiven.argentino.workers.dev
```
La prueba con Claude se hace a mano: ver [`PRUEBA_MANUAL.md`](PRUEBA_MANUAL.md).

**Se llenó en:** fase 3 (`buscar_series`, `describir_serie`, `obtener_serie`, `citar`). **Fase 4:** `comparar_series`, `listar_periodos`, `periodo_en_fecha`, `especificacion_grafico` y `riesgo_pais`.
