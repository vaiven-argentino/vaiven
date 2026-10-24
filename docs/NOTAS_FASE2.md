# Vaivén · Notas de la fase 2 (web mínima)

*24/10/2026 · Decisiones tomadas durante la fase 2, diferencias con la SPEC y pendientes. Lo que acá figura como «a consultar» no se resolvió por cuenta propia (CLAUDE.md).*

## Decisiones tomadas con Camilo

| Tema | Decisión |
|---|---|
| Rutas | `/series/<serie>/` es la variante por defecto (la URL de la cita no cambia); las otras variantes publicadas tienen su página en `/series/<serie>/<variante>/`. El export se sirve tal cual en `/datos/` (API de solo lectura) y los esquemas en `/esquemas/`. |
| Cita de las variantes | Las variantes que no son la de por defecto citan su propia página (`/series/<serie>/<variante>/`). |
| Transformaciones | La librería `paquetes/transformaciones` (TypeScript, Vitest) arranca en esta fase, con 8: nivel, variación mensual, interanual, dic.–dic. y acumulada en el año, base 100, frecuencia y media móvil. Las que necesitan series auxiliares (`real`, `en_dolares`, `pct_pib`, `pesos_actuales`) quedan para la fase 4. |
| Redespliegue | `publicar.yml` escucha a «Actualizar datos» (`workflow_run`) y despliega solo si esa corrida hizo commit de datos. El Parquet y el ZIP se generan en ese mismo workflow y no se versionan. |
| Catálogo | Muestra las 5 series publicadas, con una línea que avisa que el catálogo completo va a tener 39. |
| Autoría de la cita por serie | Queda «Vaivén (2026)» como autor en texto, APA y BibTeX, igual que la cita del export. `CITATION.cff` sigue nombrando a Camilo como autor de Vaivén en general. |
| Identidad visual | Opción A, variante A4: hoja de álamo dorada, a 35° por debajo de la horizontal, con nervaduras casi negras y la estela punteada en gris. Paleta otoñal para la interfaz: fondo `#FAF7F0`, texto `#22201B`, acento terracota `#9A4422`; en oscuro, fondo `#17140F`, acento `#EE9A7A`. Para los gráficos, una paleta aparte basada en Okabe–Ito. |

## Decisiones de diseño (revisables)

- **Esquema del export 1.1 (aditivo).** Suma `empalme`, `transformaciones`, `excluidos` (con su motivo) y la frecuencia de cada tramo. `catalogo.json` suma `tipo`, `agregacion` y `transformaciones`. El contrato 1.0 sigue publicado, y las pruebas (pytest y Vitest con ajv) fallan si el export usa una versión sin esquema.
- **Transformaciones por variante.** Una variante puede declarar su propia lista. `tc-oficial.moneda-de-epoca` queda solo en nivel, porque las variaciones y los promedios cruzarían los cambios de signo monetario.
- **Especificaciones de Vega-Lite del export** con URL absoluta (`https://vaiven.argentino.workers.dev/datos/descargas/csv/...`), para que funcionen fuera del sitio.
- **Vista inicial de la ficha.** El IPC arranca en variación interanual (en nivel va de 6 × 10⁻¹¹ a 12.276). El resto arranca en nivel. La escala logarítmica se activa sola cuando todos los valores son positivos y el máximo supera 1.000 veces al mínimo (tipo de cambio).
- **Pico que comprime el gráfico.** Si el máximo supera 15 veces el percentil 90, un aviso sugiere acotar el período. Le pasa al IPC interanual por el pico de marzo de 1990 (20.262,9 %).
- **Frecuencia mixta (desocupación).** La variación interanual compara la misma fecha del año anterior con la misma frecuencia (onda contra onda, trimestre contra trimestre). El paso a anual solo usa años completos, así que 2003 (una onda y dos trimestres) queda sin dato y se avisa. En el gráfico, la línea se corta en el cambio de tramo y cada tramo tiene su forma de punto.
- **Quiebres en el gráfico.**
  - Un quiebre con rango es una banda neutra con bordes punteados.
  - Uno abierto o puntual es una regla vertical.
  - Uno largo (más de un tercio de lo visible) es una línea punteada arriba del gráfico, para no tapar la serie.
  - Uno que cubre toda la serie (por ejemplo, el de reservas brutas) no se dibuja y va en la lista como general.
  - Los números se escalonan cuando quedarían a menos de 20 px.
- **Dato excluido (reservas, marzo de 1979).** La línea se corta, hay una «×» sobre el eje con el motivo y la fila de la tabla dice «Excluido». Las variaciones que lo usan dan hueco. No se interpola.
- **Celular.** El panel de opciones del gráfico arranca cerrado. Los tramos de la metodología se muestran como fichas.
- **Descargas.** Hay CSV y JSON de la variante, y CSV, PNG, SVG y cita en `.txt` de la vista. La descarga completa se sirve solo en su versión vigente, con nombres fijos (`/datos/descargas/vaiven.zip` y `.parquet`, que mandan 302 a la vigente). Las anteriores van a quedar en Zenodo (fase 5). El XLSX queda para la fase 4, con el explorador.
- **Tipografía.** Inter, autoalojada con `@fontsource-variable/inter` (OFL), con numerales tabulares.
- **Workspaces de npm** en la raíz (`paquetes/*`, `web`, `worker`) con un solo `package-lock.json`.
- **Node.** Astro 7 pide Node 22.23.4 o posterior: los workflows usan Node 24 (LTS).

## Diferencias con la SPEC

- **SPEC 6.1:** la ficha todavía no tiene «Uso en la bibliografía». Se puede sumar con los datos de `docs/planificacion/inventario_graficos.csv`, que son referencias y no contenido protegido.
- **SPEC 2.5:** la SPEC no dice en qué ruta se sirve el export; se eligió `/datos/`.
- **SPEC 5.4:** la estructura suma un `package.json` en la raíz (workspaces) y `web/scripts/` con la copia del export, la revisión de enlaces, la revisión visual y la prueba de punta a punta.
- **Subagente nuevo:** `.claude/agents/revisor-visual.md` (Sonnet). En esta sesión no se pudo invocar por su nombre, porque los subagentes se cargan al empezar la sesión; se usó uno general con las mismas instrucciones. Va a estar disponible en la próxima.

## Verificación hecha en la fase

- pytest: 53 pruebas, 5 salteadas (los casos de la bibliografía siguen sin valores de referencia).
- Vitest: 40 pruebas en `@vaiven/transformaciones` (incluida la inflación dic.–dic. de 2017, 2018, 2019, 2023 y 2024 y la mensual de dic. 2023 y abr. 2024, confirmadas en los informes del INDEC) y 14 en la web. `astro check` y los tipos del Worker, sin errores.
- `wrangler dev`, en local:
  - `/salud` responde con fase 2.
  - Rutas, 301 de la variante por defecto, 302 a la descarga completa, CORS y caché en `/datos/` y 404 en español.
  - El handler del Cron, por `/cdn-cgi/handler/scheduled`.
- Revisión visual: 14 páginas × 2 anchos × 2 modos, con axe-core, desbordes y contraste del SVG. La primera pasada dio 12 problemas (desborde en `/datos/` y un falso positivo); después de las correcciones dio 0.
- Prueba de punta a punta: las 5 series se encuentran, se grafican, se descargan (CSV, PNG y ZIP) y se citan, en 390 y 1280 px.

## Pendientes

1. **Primer despliegue (pide aprobación).** Después, hay que confirmar en producción que `_headers` y `_redirects` se aplican igual que en `wrangler dev`.
2. **Vulnerabilidades de `undici`** (npm audit: 1 alta y 2 moderadas). Llegan por miniflare, que es dependencia de desarrollo de wrangler y no se despliega. Se resuelve cuando wrangler actualice miniflare; no conviene `npm audit fix --force`, porque baja wrangler a la 4.35.
3. **npm 11 y `allowScripts`.** npm avisa que no corrió los scripts de instalación de `esbuild` y `workerd`. Funcionan igual, porque los binarios vienen en dependencias opcionales. Si en CI fallara, hay que habilitarlos explícitamente.
4. **Íconos e imagen para redes.** No hay `apple-touch-icon` (PNG) ni `og:image`. Hoy solo está el favicon en SVG.
5. **Bandas de quiebres.** El relleno es decorativo (1,2:1 contra el fondo). Lo que se tiene que distinguir son los bordes y los números, que superan 7:1. Si se quiere que la banda sola se distinga, hay que oscurecerla.
