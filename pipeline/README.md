# pipeline/

Pipeline en Python (gestionado con uv): snapshot → capa 1 → capa 2 → validación → export (SPEC, sección 5).

## Cómo se corre

```bash
uv sync                                                  # dependencias (una vez)
uv run python -m pipeline actualizar                     # todas las series, con descarga
uv run python -m pipeline actualizar --series ipc        # solo algunas
uv run python -m pipeline actualizar --sin-red           # con los últimos snapshots, sin descargar
uv run --group descargas python -m pipeline descargas    # Parquet y ZIP de descarga completa (no se versionan)
uv run pytest                                            # pruebas
```

`actualizar` sale con código 0 si publicó (con cambios o sin ellos), 1 si la validación falló (no se escribe nada en `export/`) y 2 si el pipeline se detuvo (por ejemplo, una fuente sin snapshots que no responde). Con `--informe RUTA` deja el resumen en Markdown; el workflow lo usa para el mensaje del commit o el issue.

## Qué hace cada carpeta

- `fuentes/`: un módulo por API (`datos_gob_ar.py`, `datos_gob_ar_csv.py`, `bcra.py`) y `base.py`, que descarga con reintentos y guarda el snapshot con su checksum. Si el checksum no cambió, no se guarda nada nuevo.
- `capa1/`: normaliza cada snapshot a `datos/capa1/<fuente>.csv` (fecha ISO del inicio del período y valor), sin tocar el contenido.
- `capa2/`: arma cada variante según su YAML: `empalmes.py` (encadenamiento de tasas y yuxtaposición), `signos_monetarios.py` (moneda de cada época ↔ pesos actuales) y `variantes.py`.
- `validacion/`: esquema con pandera, huecos, rangos plausibles, continuidad en las superposiciones, coherencia entre la serie mensual y la anual, y revisiones contra lo publicado.
- `export/`: JSON y CSV por variante, `catalogo.json`, `quiebres.json`, `revisiones.json`, `datapackage.json`, Vega-Lite y descargas.

## Cómo se declara una variante

En `metadatos/series/<slug>.yaml` (formato de la SPEC, 2.3). Además de los campos de la SPEC, el pipeline lee:

| Campo | Qué hace |
|---|---|
| `estado` | `publicada`, `pendiente` o `pendiente_licencia`. Solo las publicadas se arman y se exportan; las otras figuran en el catálogo con su `nota`. |
| `empalme` | `encadenar_tasas` (retropolación desde el tramo más reciente) o `yuxtaponer` (une tramos, con un `coeficiente` opcional por tramo). |
| `escala` | Cambio de unidad declarado (por ejemplo, 100 para pasar de fracción a porcentaje). |
| `conversion` y `fecha_conversion` | `a_moneda_de_epoca` o `a_pesos_actuales`; con `fin_de_mes`, se usa el signo vigente el último día del mes. |
| `excluir` | Observaciones de la fuente con errores evidentes, una por una, con su `motivo`. No se corrigen: se excluyen. |
| `continuidad` | Comparación de dos fuentes donde se superponen (tasas o niveles), con `tolerancia` y `excepciones` documentadas. |
| `coherencia` | La agregación de una serie mensual tiene que dar la anual publicada. |
| `validacion` | `min`, `max`, `var_min` y `var_max` (en %) y `umbral_revision_pct`. La de la variante pisa la de la serie. |

En `metadatos/fuentes.yaml`, `redistribuible: false` hace que el snapshot guarde solo `meta.json` (los crudos van a `.crudos/`, fuera de Git) y el pipeline se niega a publicar una variante que use esa fuente.
