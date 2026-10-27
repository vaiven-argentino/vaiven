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

- `fuentes/`: un módulo por API (`datos_gob_ar.py`, `datos_gob_ar_csv.py`, `bcra.py`; desde la fase 4a, `banco_mundial.py` para la API v2 del Banco Mundial, `ocde.py` para el SDMX de la OCDE y `bruegel.py` para la base REER de Bruegel) y `base.py`, que descarga con reintentos y guarda el snapshot con su checksum. Si el checksum no cambió, no se guarda nada nuevo.
- `capa1/`: normaliza cada snapshot a `datos/capa1/<fuente>.csv` (fecha ISO del inicio del período y valor), sin tocar el contenido. En las fuentes con varios países, una serie por entidad (`<fuente>#<ISO3>`) y el CSV en formato largo (`fecha,pais,valor`).
- `capa2/`: arma cada variante según su YAML: `empalmes.py` (encadenamiento de tasas, yuxtaposición y tramos agregados a años completos), `derivadas.py` (variantes calculadas a partir de otras), `signos_monetarios.py` (moneda de cada época ↔ pesos actuales) y `variantes.py`. Las derivadas se arman después de sus operandos, en orden de dependencias.
- `validacion/`: esquema con pandera, huecos, rangos plausibles, continuidad en las superposiciones, coherencia entre la serie mensual y la anual, y revisiones contra lo publicado.
- `export/`: JSON y CSV por variante, `catalogo.json`, `auxiliares.json`, `quiebres.json`, `revisiones.json`, `datapackage.json`, Vega-Lite y descargas. `insumos.py` declara qué series publicadas necesita cada medida (esquema 1.2).

## Cómo se declara una variante

En `metadatos/series/<slug>.yaml` (formato de la SPEC, 2.3), o en `metadatos/auxiliares/<slug>.yaml` si es una serie auxiliar (la carpeta la marca como tal: no va al catálogo y se exporta a `export/auxiliares/`). Además de los campos de la SPEC, el pipeline lee:

| Campo | Qué hace |
|---|---|
| `estado` | `publicada`, `pendiente` o `pendiente_licencia`. Solo las publicadas se arman y se exportan; las otras figuran en el catálogo con su `nota`. |
| `empalme` | `encadenar_tasas` (retropolación desde el tramo más reciente), `yuxtaponer` (une tramos, con un `coeficiente` opcional por tramo) o `derivar` (calcula la variante con otras; ver `operacion`). |
| `enlace` | En `encadenar_tasas`: `periodo` (por defecto: el tramo nuevo aporta su tasa desde el primer período, calculada con el período anterior de su propia fuente) o `anual` (enlaza con el promedio del primer año completo; lo usan las cuentas nacionales trimestrales, para no mezclar la estacionalidad de bases distintas). |
| `operacion` y `operandos` | Con `derivar`: `resta` (el primero menos la suma del resto), `suma`, `cociente`, `tcr` (tipo de cambio × IPC externo ÷ IPC, con `base`), `dividir_por_promedio` o `diferencia` (variación entre períodos de un stock). Los operandos son variantes («exportaciones.oficial») o fuentes de capa 1. Con `segmentos`, cada tramo de fechas tiene sus propios operandos. Las fechas que faltan en algún operando quedan afuera. |
| `invertir` | Da vuelta un índice (`invertir: 100` publica 100 ÷ valor; lo usa la base de Bruegel, donde una suba es apreciación). |
| `agregar` (en un tramo) | `{a: anual, con: suma}`: pasa el tramo a frecuencia anual, solo con los años completos. |
| `escala` | Cambio de unidad declarado (por ejemplo, 100 para pasar de fracción a porcentaje). |
| `conversion` y `fecha_conversion` | `a_moneda_de_epoca` o `a_pesos_actuales`; con `fin_de_mes`, se usa el signo vigente el último día del mes. |
| `excluir` | Observaciones de la fuente con errores evidentes, una por una, con su `motivo`. No se corrigen: se excluyen. |
| `continuidad` | Comparación de dos fuentes donde se superponen (tasas o niveles), con `tolerancia` y `excepciones` documentadas. |
| `coherencia` | La agregación de una serie mensual tiene que dar la anual publicada. |
| `validacion` | `min`, `max`, `var_min` y `var_max` (en %) y `umbral_revision_pct`. La de la variante pisa la de la serie. `var_excepciones` lista los períodos con una variación real fuera de rango, cada uno documentado con su quiebre (por ejemplo, la reforma financiera de julio de 1982). |
| `huecos_permitidos` | Períodos sin dato que la fuente no publica (`{desde, hasta}`); fuera de ellos, un hueco frena la publicación. |
| `moneda` | `pesos_actuales`, `moneda_de_epoca` o `dolares` (esquema 1.2). Decide qué medidas puede ofrecer la variante. |
| `unidades_medida` | La unidad del resultado de cada medida (por ejemplo, `real: 'pesos de {base}'`). |
| `vista_inicial` | Con qué transformación y medida arranca la ficha (por ejemplo, el salario real en términos reales). |
| `dimensiones`, `entidades` y `entidades_por_defecto` | Series con dimensión pais (SPEC 2.5): cada tramo se arma y se valida por entidad. |

En `metadatos/fuentes.yaml`, `redistribuible: false` hace que el snapshot guarde solo `meta.json` (los crudos van a `.crudos/`, fuera de Git) y el pipeline se niega a publicar una variante que use esa fuente.
