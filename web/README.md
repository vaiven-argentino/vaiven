# web/

Sitio de Vaivén en Astro (estático, sin adaptador), con gráficos de Vega-Lite (SPEC, sección 6). Lo sirve el Worker como static assets desde `web/dist` (ver `worker/README.md`).

## Fase 2 (ahora)
| Ruta | Qué es |
|---|---|
| `/` | Inicio. |
| `/series/` | Catálogo, con búsqueda (sin distinguir acentos) y filtros por bloque y frecuencia. |
| `/series/<serie>/` | Ficha con la variante por defecto (es la URL de la cita). |
| `/series/<serie>/<variante>/` | Ficha de otra variante publicada. `/series/<serie>/<variante-por-defecto>/` manda 301 a `/series/<serie>/`. |
| `/datos/` | Datos abiertos. Debajo está el export tal cual (API de solo lectura) y la descarga completa. |
| `/esquemas/serie-<versión>.json` | El contrato del export. |
| `/agentes/` | Para agentes de IA: cómo conectar el servidor MCP (`/mcp`) en Claude u otro asistente, herramientas, límites y variante local. |
| `/acerca/` | Qué es, cómo citar, licencias y créditos. |

La ficha funciona sin JavaScript (texto, tabla, descargas, cita y metodología están en el HTML). La cita (texto, APA y BibTeX) sale de `@vaiven/cita`, el mismo paquete que usa la herramienta `citar` del MCP. Con JavaScript se suman el gráfico, las transformaciones (`@vaiven/transformaciones`), el período, la escala logarítmica y las descargas de la vista (CSV, PNG, SVG y la cita en `.txt`). El estado queda en la URL (`?t=var_interanual&desde=1991`).

## Cómo se arma
- `scripts/copiar-datos.mjs` corre antes de `dev`, `build` y `verificar`. Copia `export/` a `public/datos/` y los esquemas de `tests/contrato/` a `public/esquemas/`, y genera `public/_redirects`. Los tres están en `.gitignore`.
- Las páginas leen `../export/*.json` en el build. Cada ficha lleva los datos de su variante en un `<script type="application/json">`.
- La descarga completa (`vaiven_<versión>.zip` y `.parquet`) tiene que existir antes del build: `uv run python -m pipeline descargas`.
- `public/_headers`: CORS abierto y una hora de caché en `/datos/*` y `/esquemas/*`.

## Identidad visual
Hoja de álamo dorada, a 35°, con la estela de su caída (`src/componentes/Hoja.astro`, `public/favicon.svg`). Paleta otoñal para la interfaz y paleta aparte para los gráficos (Okabe–Ito, oscurecida en modo claro), en `src/estilos/global.css`, con los contrastes WCAG anotados. Modo claro y oscuro: sigue al sistema y tiene un botón.

## Comandos (desde la raíz del repositorio)
```bash
npm install
npm run dev -w @vaiven/web          # http://localhost:4321
npm run build -w @vaiven/web        # web/dist
npm run verificar -w @vaiven/web    # astro check
npm test -w @vaiven/web             # Vitest: especificación de los gráficos, cita y formato
```
Astro 7 pide Node 22.23.4 o posterior.

**Se llenó en:** fase 2 (web mínima). **Fase 4:** explorador y períodos.
