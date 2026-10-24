# Vaivén · Notas de la fase 3 (MCP remoto)

*24/10/2026 · Decisiones tomadas durante la fase 3, diferencias con la SPEC y pendientes. Lo que acá figura como «a consultar» no se resolvió por cuenta propia (CLAUDE.md).*

## Decisiones tomadas con Camilo

| Tema | Decisión |
|---|---|
| Ruta y transporte | `/mcp` en el mismo Worker, agregado a `run_worker_first`. Streamable HTTP, sin estado y sin autenticación. `/salud`, los static assets y el Cron no cambian. |
| Orígenes | Se acepta cualquier origen (CORS `*`, como en `/datos/`): los datos son públicos y no hay credenciales. Contra el DNS rebinding se valida el `Host` (solo `vaiven.argentino.workers.dev`, `localhost` y `127.0.0.1`; cualquier otro da 403). |
| Lectura de los datos | Con `env.ASSETS.fetch` desde `/datos/` y caché en memoria del isolate; el export no se empaqueta en el bundle. |
| Bibliografía | Se suma al export: `catalogo.json` trae, por serie, las fichas del inventario (id, referencia, página, tipo, título original y período cubierto). La ficha web todavía no la muestra. |
| Variante local | Entra en la fase, sin distribución: se empaqueta con esbuild y se corre desde una copia del repositorio. La distribución por `npx` queda para la fase 5. |
| Página «Para agentes de IA» | Entra, en versión mínima (`/agentes/`). |
| Cita compartida | Pasa a un paquete (`paquetes/cita`, `@vaiven/cita`), que usan la ficha y la herramienta `citar`: las dos devuelven exactamente lo mismo. |
| Descripciones | Las de las herramientas y las instrucciones del servidor se aprobaron en el plan y están en `mcp/src/textos.ts`. |

## Versiones y límites (consultados el 24/10/2026)

- **SDK:** `@modelcontextprotocol/server` 2.4.0, la línea v2, que implementa la revisión 2026-07-28 y reemplaza a `@modelcontextprotocol/sdk` (v1, que sigue en la 1.32.2). Usa `zod` 4.6.7. Para las pruebas, `@modelcontextprotocol/client` 2.4.0. La 2.4.0 salió el 23/10/2026: es muy nueva.
- **Protocolo:** `createMcpHandler` atiende la revisión 2026-07-28 (sin `initialize` ni sesión) y, con `legacy: 'stateless'` (valor por defecto), a los clientes de 2024-10-07 a 2025-11-25, que entran con `initialize` y se atienden sin sesión. Probado con el cliente oficial en las dos eras y con JSON-RPC crudo de 2025-03-26 y 2025-06-18. Claude todavía está incorporando la revisión 2026-07-28, así que probablemente se conecte por la vía de 2025.
- **wrangler** 4.152.0 (la vigente, sin cambios) y **esbuild** 0.28.2.
- **Plan gratuito de Workers:**
  - 10 ms de CPU por pedido.
  - Bundle de hasta 64 MiB sin comprimir (ya no hay límite comprimido). El nuestro pesa 1,26 MB (223 KB comprimido).
  - 50 subpedidos, 100.000 pedidos por día y 1 s de arranque.
  - Los pedidos a los assets son gratis e ilimitados, pero los de `run_worker_first` (`/salud` y `/mcp`) cuentan como pedidos al Worker.
- **Límite por IP:** el binding de Rate Limiting es GA y no tiene costo aparte. La documentación no dice explícitamente que esté en el plan gratuito; en `wrangler dev` funciona. Las reglas de WAF no sirven, porque son por zona y `workers.dev` no es una zona propia.

## Decisiones de diseño (revisables)

- **Estructura de `mcp/`:**
  - `src/datos.ts`: la interfaz `FuenteDatos` (assets del Worker o URL), el `Repositorio` con caché y la resolución de ids (slug, código o `serie.variante`, sin distinguir mayúsculas).
  - `src/fuente-carpeta.ts`: la lectura desde una carpeta (va aparte porque usa `node:fs`).
  - `src/herramientas/`: funciones puras que prueban Vitest sin pasar por el protocolo.
  - `src/servidor.ts`: registra las herramientas, con anotaciones de solo lectura e idempotentes.
  - `src/http.ts`: CORS, OPTIONS, 405, Host y límite.
  - `src/stdio.ts`: la variante local.
- **Una instancia del servidor por pedido**, como pide el SDK sin estado. Los esquemas de zod se arman al cargar el módulo.
- **Respuestas:** JSON en un bloque de texto y el mismo objeto en `structuredContent` (sin `outputSchema`). Los errores esperables (serie o variante inexistente, variante pendiente, transformación no admitida, base mal escrita, período invertido, más de 10.000 observaciones) salen con `isError` y un mensaje en español que dice cómo seguir.
- **`obtener_serie`:**
  - **Valores:** los transformados se redondean a 6 cifras significativas (el nivel va tal cual se publica).
  - **Quiebres:** `advertencias` trae los que cruza el rango del resultado (`cruzadas()` de la librería).
  - **Frecuencia:** `frecuencias` resume los tramos de cada frecuencia (en la desocupación, semestral hasta 2003-05 y trimestral desde 2003-07).
  - **Excluidos:** van como `null` en `datos`, con su motivo en `excluidos`.
  - **Notas:** `notas` suma las de la librería (por ejemplo, que 2003 queda sin promedio anual) y avisos propios.
  - **Base:** `base` acepta `AAAA-MM` (esa observación), `AAAA` (el promedio del año) o `AAAA-MM/AAAA-MM`.
- **`buscar_series`:**
  - **Búsqueda:** sin tildes ni mayúsculas, con una tabla chica de sinónimos (desempleo, dólar, inflación, divisas, etc.).
  - **Orden:** pesan más las coincidencias en el id, el código, el nombre y el bloque.
  - **Sin coincidencias:** lista todas las series y lo avisa.
  - **Período:** `desde` y `hasta` dejan las series con alguna variante publicada en el período.
- **`describir_serie`:** devuelve todas las variantes (las pendientes, con su nota), las transformaciones y frecuencias que admite cada una publicada (las mismas que ofrece la ficha) y su cita en los tres formatos.
- **Bibliografía en el export:** una ficha que no está en el inventario frena el export. El campo `pagina` se copia tal cual del inventario. En algunas fichas es la página del PDF de la cátedra («pdf 9 (27)»), que fuera de la cátedra no dice mucho.
- **HTTP de `/mcp`:**
  - GET y DELETE responden 405 con `Allow: POST, OPTIONS` y un texto que remite a `/agentes/`.
  - OPTIONS responde 204.
  - Todas las respuestas llevan CORS abierto y `Cache-Control: no-store`.
  - El límite responde 429 con `Retry-After: 60` y un error JSON-RPC.
- **Límite por IP:** 120 pedidos cada 60 s, con `CF-Connecting-IP` como clave. Es generoso a propósito: los pedidos de Claude web salen de servidores de Anthropic, que comparten IP.
- **Registros del Worker** (`observability`), para ver la CPU por pedido después del despliegue.
- **Gráficos (pendiente de la fase 2):** el eje Y deja arriba el lugar de los números y de la línea de los quiebres, más 12 px, para que la serie no los toque. En escala logarítmica, la cuenta se hace en logaritmos.
- **Workflows:** `publicar.yml` también despliega cuando cambia `mcp/`; `pruebas.yml` corre las pruebas de los paquetes nuevos con el mismo `npm test`.

## Diferencias con la SPEC

- **7.1, límite por IP:** es aproximado (se cuenta por ubicación de Cloudflare y con consistencia eventual). Si el plan gratuito no admitiera el binding, en `/mcp` quedaría solo el tope diario de la cuenta.
- **7.1, variante local:** no se publica para `npx`; se corre desde una copia del repositorio (fase 5).
- **7.1, SDK:** es `@modelcontextprotocol/server` (v2), no `@modelcontextprotocol/sdk`.
- **7.2, `obtener_serie`:** no tiene `deflactor` ni `paises` (fase 4: necesitan las transformaciones con series auxiliares y la dimensión `pais`).
- **7.2, `citar`:** suma `transformacion` y `frecuencia` opcionales, para que la cita coincida con la de la ficha cuando hubo transformación.
- **7.3:** el límite de 4 series por pedido no aplica todavía, porque cada llamada pide una sola serie. Queda la constante para `comparar_series` (fase 4).
- **9:** la cita todavía no lleva DOI (fase 5, con Zenodo).
- **2.5:** `catalogo.json` suma `bibliografia`.
- **5.4:** la estructura suma `paquetes/cita/`.

## Verificación hecha en la fase

- **pytest:** 56 pruebas, 5 salteadas (los casos de la bibliografía siguen sin valores de referencia).
- **Vitest:**
  - 40 pruebas en `@vaiven/transformaciones` y 5 en `@vaiven/cita`.
  - 37 en `@vaiven/mcp`: herramientas contra el export real, protocolo en las dos eras con el cliente oficial, HTTP, límite, stdio empaquetado y tiempos.
  - 14 en la web.
- **Tipos:** `tsc` de los paquetes, `astro check` y los tipos del Worker, sin errores.
- **Tiempos en Node, con la caché caliente:** de 1 a 3 ms por llamada (mediana), y hasta 5 ms en el p90 (la más cara es el IPC completo en variación interanual). La CPU real en workerd se mide en producción.
- **`wrangler dev` y `mcp/scripts/probar-endpoint.mjs`:**
  - `/mcp` en las dos eras, con las 4 herramientas.
  - GET 405 y OPTIONS 204.
  - Host ajeno 403 y, después de unos 120 pedidos seguidos, 429.
  - `/salud` con fase 3, `/datos/` con CORS, fichas, 301, 404 en español y el Cron.
- **Variante local:** empaquetada y probada por stdio contra el export local y contra el publicado.
- **Revisión visual:**
  - Fichas de desocupación (las dos variantes), IPC, reservas y tipo de cambio: el pico de 2002 queda a 11 px o más de los números de los quiebres.
  - `/agentes/`, `/datos/` y el inicio, en 390 y 1280 px, claro y oscuro: 0 problemas.

## Pendientes

1. **Push y despliegue (piden aprobación).** Después del despliegue hay que:
   - correr `node mcp/scripts/probar-endpoint.mjs https://vaiven.argentino.workers.dev`;
   - confirmar que el plan gratuito acepta el binding de Rate Limiting;
   - mirar la CPU por pedido de `/mcp` en los registros del Worker.
2. **Prueba manual desde Claude, web y escritorio** (la hace Camilo): guion en `mcp/PRUEBA_MANUAL.md`. Es lo que cierra la fase según la SPEC (sección 11).
3. **Ficha web:** mostrar «Uso en la bibliografía» con los datos que ya trae `catalogo.json` (pendiente de la fase 2, para la fase 4).
4. **Distribución de la variante local por `npx`** (fase 5).
5. **SDK muy nuevo:** la 2.4.0 salió un día antes de esta fase. Si aparece una 2.4.x con correcciones, conviene actualizar y repetir la prueba manual (SPEC 10).
6. **Límite por IP:** revisar en los registros si los 120 pedidos por minuto alcanzan para Claude web, cuyos pedidos comparten IP.
