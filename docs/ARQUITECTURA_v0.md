# Herramienta de series económicas argentinas · Arquitectura v0

*22/10/2026 · Estado: aprobada (con Astro como framework web)*

## Requisitos que la arquitectura tiene que cumplir
- Costo cero permanente; mantenible por una sola persona con Claude Code.
- Series 1970–hoy en dos capas (fuente y derivadas con variantes), con metadatos y quiebres.
- Web con descargas, tablas y gráficos configurables; MCP remoto como opción principal (con variante local).
- Datos pequeños: unas 39 series (37 argentinas desde 1970 y 2 internacionales desde 1961), mayormente mensuales o anuales, más sus variantes. Del orden de megabytes, no de gigabytes.

## Arquitectura propuesta

```
Fuentes (API Series de Tiempo, API del BCRA, INDEC, ArgentinaDatos, series académicas)
        │  disparo programado: Cron Trigger de Cloudflare → workflow_dispatch de GitHub
        ▼
GitHub Actions (Python) ── 1. snapshot: archivo crudo + fecha + checksum + licencia
                        ── 2. capa 1: series fuente normalizadas
                        ── 3. capa 2: empalmes, deflactaciones, variantes
                        ── 4. validación (pandera) → si falla, abre un issue y no publica
                        ── 5. export: JSON por serie, CSV/XLSX/Parquet, datapackage.json, specs de Vega-Lite
        │  commit al repositorio (el historial de Git = versiones de los datos)
        ▼
Cloudflare Workers (un solo despliegue, plan gratuito)
   ├── sitio estático (Astro + Vega-Lite) ......... pedidos a archivos estáticos: gratis e ilimitados
   └── /mcp: servidor MCP sin estado (TypeScript) .. lee los JSON ya calculados
Riesgo país: consulta en vivo a ArgentinaDatos (navegador y MCP), sin almacenarlo.
Citación: release trimestral en GitHub → DOI en Zenodo + CITATION.cff.
```

## Decisiones por componente

| Componente | Propuesta original | Propuesta revisada | Por qué |
|---|---|---|---|
| Pipeline | Python + GitHub Actions | **Se mantiene** | Gratis para repositorios públicos con runners estándar. |
| Disparo programado | `schedule` de GitHub Actions | **Cron Trigger de Cloudflare → `workflow_dispatch`**, con `schedule` como respaldo | En repositorios públicos, los workflows programados se desactivan solos tras 60 días sin actividad. El plan gratuito de Cloudflare permite 5 cron triggers. |
| Organización del ETL | Capas 1 y 2 | **Snapshot → capa 1 → capa 2 → export**, versionado por fecha | Patrón probado por Our World in Data: conserva el archivo crudo aunque la fuente cambie o lo borre, y deja trazable el linaje. |
| Almacenamiento | Parquet/DuckDB | **Archivos en el repositorio**: JSON por serie para la web y el MCP; Parquet, CSV y XLSX para descargas | El volumen es chico. R2 (10 GB y egreso gratis) queda como opción si crece. |
| Consultas en el navegador | DuckDB-WASM | **Sin DuckDB-WASM en el MVP**; transformaciones simples en JavaScript | Con pocos megabytes de datos no compensa: agrega la descarga del motor en WebAssembly y tiene problemas conocidos (rangos HTTP en Firefox, cabeceras COOP/COEP para hilos). |
| Hosting web | GitHub Pages | **Cloudflare Workers con assets estáticos**; GitHub Pages como espejo | Los pedidos a archivos estáticos son gratis e ilimitados, y comparten despliegue y dominio con el MCP. GitHub Pages tiene tope blando de 100 GB/mes y 1 GB de sitio. |
| Framework web | Sin definir | **Astro** (decidido) | Astro está muy activo y es estándar; páginas por serie a partir de los metadatos y un explorador interactivo. Observable Framework queda descartado por baja actividad reciente; Evidence está orientado a BI. |
| Gráficos | Sin definir | **Vega-Lite** | La misma especificación JSON sirve en la web (vega-embed), en Python (Altair) y en el MCP; exporta SVG y PNG. |
| Metadatos | Sin definir | **Frictionless Data Package v2** + YAML por serie | Estándar abierto y liviano; SDMX es excesivo para este tamaño. |
| Validación | Sin definir | **pandera** en el pipeline | Evita publicar datos rotos cuando una fuente cambia de formato. |
| MCP remoto | Cloudflare Workers | **Se mantiene**, en TypeScript y sin estado | La revisión 2026-07-28 de MCP eliminó las sesiones, así que alcanza con un manejador sin estado (sin Durable Objects). Servir JSON precalculado usa 1–2 ms de CPU por pedido en un caso medido (límite: 10 ms). Python en Workers ya es GA, pero con arranques en frío de alrededor de 1 s reportados. |
| MCP local | Mismo código | **Se mantiene**: el mismo paquete corre por stdio con `npx` | Una sola base de código. |
| Riesgo país | Consulta en vivo | **Se mantiene** | La API de ArgentinaDatos permite CORS (`*`), así que el navegador la consulta directo. |
| Citación | Sin definir | **Zenodo + CITATION.cff** | DOI por release y DOI de concepto para la versión más reciente. |
| Licencias | MIT + CC BY 4.0 | **Se mantienen** | Las series de terceros conservan su licencia; el riesgo país no se redistribuye. |

## Riesgos y mitigaciones
- **Cambios en las fuentes** (formato, IDs, discontinuación): la capa de snapshot conserva los crudos; la validación frena la publicación y abre un issue.
- **Límites gratuitos de Cloudflare** (100.000 pedidos dinámicos por día y 10 ms de CPU por pedido): solo cuenta el MCP; todo se precalcula en el pipeline. Si se superan, el sitio sigue funcionando.
- **Evolución del protocolo MCP**: usar el SDK oficial de TypeScript, que negocia versiones; probar con los clientes reales (Claude web y escritorio) en cada actualización.
- **Riesgo país**: depende de un tercero (ArgentinaDatos) y de datos propietarios de JP Morgan; se muestra con fuente y sin descarga masiva. No es asesoramiento legal.
- **Dependencia de una sola persona**: documentación del pipeline, tests y releases periódicas.

