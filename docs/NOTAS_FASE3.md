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
- **Límite por IP:** el binding de Rate Limiting es GA y no tiene costo aparte. La documentación no dice explícitamente que esté en el plan gratuito, pero el despliegue del 24/10/2026 lo aceptó (`env.LIMITE_MCP (120 requests/60s)`). Las reglas de WAF no sirven, porque son por zona y `workers.dev` no es una zona propia.

## Decisiones de diseño (revisables)

- **Estructura de `mcp/`:**
  - `src/datos.ts`: la interfaz `FuenteDatos` (assets del Worker o URL), el `Repositorio` con caché y la resolución de ids (slug, código o `serie.variante`, sin distinguir mayúsculas).
  - `src/fuente-carpeta.ts`: la lectura desde una carpeta (va aparte porque usa `node:fs`).
  - `src/herramientas/`: funciones puras que prueban Vitest sin pasar por el protocolo.
  - `src/servidor.ts`: registra las herramientas, con anotaciones de solo lectura e idempotentes.
  - `src/http.ts`: CORS, OPTIONS, 405, Host y límite.
  - `src/stdio.ts`: la variante local.
- **Una instancia del servidor por pedido**, como pide el SDK sin estado. Los esquemas de zod se arman al cargar el módulo.
- **Respuestas:** JSON en un bloque de texto, sin `outputSchema`. Al principio el mismo objeto iba también en `structuredContent`; se sacó después del despliegue (ver «CPU de `/mcp` por método»). Los errores esperables (serie o variante inexistente, variante pendiente, transformación no admitida, base mal escrita, período invertido, más de 10.000 observaciones) salen con `isError` y un mensaje en español que dice cómo seguir.
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

- **7.1, límite por IP:** es aproximado (se cuenta por ubicación de Cloudflare y con consistencia eventual).
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

## Despliegue (24/10/2026)

- **PR y CI:** [vaiven-argentino/vaiven#4](https://github.com/vaiven-argentino/vaiven/pull/4), mergeado con commit de merge después de `Pruebas` en verde.
- **`Publicar`:** desplegó con `wrangler deploy` (versión `6404363f-1b33-43ab-8a2c-5770a96f3e7b`).
  - Cloudflare aceptó el binding `LIMITE_MCP` en el plan gratuito.
  - El Worker arranca en 45 ms. El bundle pesa 1.259 KiB (223 KiB comprimido).
- **Producción:** `mcp/scripts/probar-endpoint.mjs` pasó entero contra `https://vaiven.argentino.workers.dev`:
  - `/mcp` en las dos eras, con las 4 herramientas;
  - GET 405 y OPTIONS 204, con CORS y `no-store`;
  - `/salud` con fase 3, `/datos/`, `/agentes/`, el 301 y el 404.
  - El 429 no se forzó en producción.
- **CPU de `/mcp`** (panel de Cloudflare, 17 invocaciones de esa prueba, 20:49 UTC):
  - Gráfico «CPU Time»: P50 5,94 ms, P90 14,42 ms, P99 y P999 50 ms.
  - Query Builder: mediana de `$workers.cpuTimeMs` 7 ms, máximo 50 ms.
  - Ningún pedido falló: en el plan gratuito, Cloudflare tolera que un pedido pase de 10 ms de vez en cuando, pero corta con el error 1102 si pasa seguido.
  - La mediana entra en el límite, pero una parte de los pedidos lo pasa. Todavía no se sabe cuáles son (el primero de cada isolate, `tools/list` o alguna herramienta en particular).

## Precalentamiento al arrancar (decidido con Camilo)

**Diagnóstico.** Medido en Node:
- Con el isolate ya «caliente», cada pedido cuesta de 0,6 a 3,6 ms.
- El exceso está en el primer pedido de cada isolate y en la primera llamada de cada herramienta, por la inicialización perezosa del SDK, de zod y del código propio.
- Con poco tráfico, casi cada conexión de Claude cae en un isolate nuevo.

**Medidas:**
- `mcp/src/precalentar.ts`, llamado al cargar el módulo del Worker. El arranque tiene su propio límite de 1 s; cada pedido, 10 ms de CPU. Hace dos cosas:
  - corre `preloadSchemas()` del SDK (lo recomienda para estos entornos);
  - arma el JSON Schema de las herramientas y pasa una serie chica en memoria por las transformaciones y la cita.
- Los esquemas de las herramientas se envuelven (`conJsonFijo` en `servidor.ts`): el JSON Schema se arma una vez por isolate y no en cada pedido, porque el SDK lo guarda por instancia del servidor y hay una instancia por pedido.

**Límite.** Los primeros pedidos completos del protocolo no se pueden hacer al arrancar: el transporte del SDK usa `crypto.randomUUID` y temporizadores, y workerd los prohíbe al cargar el módulo (se probó y el Worker no arranca). Por eso el primer pedido de cada isolate sigue pagando la inicialización de esa parte.

**Efecto medido en Node, en un proceso nuevo** (sin contar la carga de `undici`, que en workerd no existe):

| Primer pedido | Sin precalentar | Con precalentar |
|---|---|---|
| `initialize` | ~28 ms | ~21–26 ms |
| `tools/list` | ~7 ms | ~3–5 ms |
| `buscar_series` | ~11–13 ms | ~7 ms |
| `describir_serie` | ~9 ms | ~6,5 ms |
| `obtener_serie` | ~5 ms | ~4 ms |
| `citar` | ~4 ms | ~3 ms |

**Riesgo que queda.** El primer pedido de cada isolate puede pasar de 10 ms. Cloudflare tolera excesos esporádicos por isolate y corta (error 1102) solo si se repiten. Como este exceso ocurre una vez por isolate, se espera que entre en esa tolerancia, pero hay que confirmarlo en producción.

**Resultado en producción.** No hubo un cambio medible:
- antes: mediana de 7 ms y máximo de 50 ms;
- después: mediana de 8 ms y máximo de 40 ms;
- con 17 invocaciones en cada caso, la diferencia está dentro del ruido.

## CPU de `/mcp` por método (decidido con Camilo)

**Medición.** Cada POST a `/mcp` deja un registro `{ mcp: { metodo, herramienta, protocolo, estado } }` ([vaiven-argentino/vaiven#6](https://github.com/vaiven-argentino/vaiven/pull/6)), y Observabilidad lo muestra junto a la CPU de la invocación. Resultado de la prueba del 24/10/2026, 21:38 UTC (versión `ee7017d8`):

| Pedido | CPU |
|---|---|
| Apertura de la conexión (`server/discover` o `initialize`) | 18–23 ms |
| Primera llamada de cada herramienta en un isolate (lee y parsea el export) | 10–16 ms |
| `tools/list` | 8 ms |
| Llamadas siguientes | 4–5 ms |
| GET y OPTIONS de `/mcp`, `/salud` | 0 ms |

En total, 6 de 22 POST pasaron de 10 ms, 2 quedaron justo en 10 y ninguno fue cortado. Los tiempos de reloj de 46–61 ms son la lectura de `/datos/` desde los assets: es espera, no CPU.

**Medida: sin `structuredContent`.** Cada resultado iba dos veces: como texto y como `structuredContent`. Ahora va solo como texto, y las respuestas pesan la mitad (IPC completo: de 34 a 18 KB). En Node la CPU no cambió de forma medible (las diferencias son ruido). Además, si el cliente le pasa al modelo los dos bloques, se ahorran tokens.

**Resultado en producción** (misma prueba, 24/10/2026, 21:50 UTC, versión `de4acad8`):

| Pedido | Antes (21:38) | Después (21:50) |
|---|---|---|
| Apertura 2026-07-28 (`server/discover`) | 23 ms | 12 ms |
| Apertura 2025 (`initialize`) | 18 ms | 12 ms |
| `tools/list` (dos conexiones) | 8 / 8 ms | 4 / 20 ms |
| `buscar_series` (primera en cada conexión) | 12 / 15 ms | 8 / 4 ms |
| `describir_serie` | 16 / 10 ms | 17 / 19 ms |
| `obtener_serie` | 11, 10, 4 / 5, 5, 4 ms | 6, 7, 3 / 9, 5, 2 ms |
| `citar` | 7 / 5 ms | 8 / 3 ms |
| POST: mediana / máximo / más de 10 ms | 8 / 23 ms / 6 de 17 | 8 / 20 ms / 5 de 17 |

En conjunto, la diferencia está dentro del ruido. El pedido más caro cambia según qué isolate atienda cada pedido. Lo que se repite en las cuatro mediciones es:
- el primer pedido de cada isolate nuevo;
- `describir_serie`, con 10–19 ms. Es la herramienta más pesada: lee el catálogo, los quiebres y todas las variantes, revisa las transformaciones de cada una recorriendo sus datos y arma tres citas.

En las tres corridas no hubo ningún corte por CPU.

**Decisión (con Camilo): cerrar y vigilar.**
- Queda el registro por pedido.
- **Causa probable de los 10–19 ms de `describir_serie`:** fue siempre la primera llamada a esa herramienta en el isolate, así que es costo de arranque en frío. Lee y parsea por primera vez el catálogo, los quiebres y los JSON completos de cada variante, y compila ese código por primera vez. Con todo en memoria, en Node cuesta ~2 ms.
- **Descartado: caché de transformaciones y cita solo en texto.**
  - Se evaluó guardar en memoria las transformaciones disponibles de cada variante y devolver solo la cita en texto.
  - Ninguna de las dos cosas ataca el costo en frío: la caché solo ayuda desde la segunda llamada, que ya es barata.
  - Sin APA ni BibTeX, Claude necesitaría una llamada más a `citar` para esos formatos, lo que suma CPU en total.
  - Con unas 17 muestras por medición, un ahorro chico tampoco se podría comprobar.
- **Si aparecen errores 1102:** evitar que `describir_serie` lea los archivos completos de cada variante, con un archivo de metadatos livianos por serie precalculado al armar el export.
  - Es un cambio más grande: toca cómo se genera el export.
  - Hay que pensarlo con la SPEC, porque las transformaciones se implementan una sola vez, en TypeScript (sección 4), y ese archivo tendría que salir de esa librería, no del pipeline de Python.

**Lo que no se tocó.** La apertura de la conexión (18–23 ms) es del SDK y solo bajaría con un manejador propio sin el SDK. Eso se aparta de la SPEC 7.1 y quedó descartado por ahora.

## Pendientes

1. **CPU por pedido de `/mcp` (vigilar):** durante la prueba manual y en las primeras semanas, revisar en Observabilidad si aparecen errores «Exceeded CPU» (1102). Si aparecen:
   - primero, el archivo de metadatos livianos para `describir_serie` (ver «CPU de `/mcp` por método»);
   - después, evaluar un manejador propio sin el SDK (diferencia con la SPEC 7.1).
2. **Prueba manual desde Claude, web y escritorio** (la hace Camilo): guion en `mcp/PRUEBA_MANUAL.md`. Es lo que cierra la fase según la SPEC (sección 11).
3. **Ficha web:** mostrar «Uso en la bibliografía» con los datos que ya trae `catalogo.json` (pendiente de la fase 2, para la fase 4).
4. **Distribución de la variante local por `npx`** (fase 5).
5. **SDK muy nuevo:** la 2.4.0 salió un día antes de esta fase. Si aparece una 2.4.x con correcciones, conviene actualizar y repetir la prueba manual (SPEC 10).
6. **Límite por IP:** revisar en los registros si los 120 pedidos por minuto alcanzan para Claude web, cuyos pedidos comparten IP.
