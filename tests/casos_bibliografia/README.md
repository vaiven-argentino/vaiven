# Casos de la bibliografía

Pruebas que comparan las series de Vaivén con cuadros y gráficos de la bibliografía de la cátedra (SPEC, sección 10). Hay dos tipos:

- **De forma** (`tests/test_casos_bibliografia.py`): comprueban lo que muestra cada cuadro o gráfico sin transcribir valores (por ejemplo, «la desocupación de 1989 es más del doble que la de 1980»). Corren siempre.
- **De valores**: comparan valores puntuales, con una tolerancia, contra lo que se carga a mano en `<ficha>.csv`. Mientras el CSV no tenga filas, el test queda *skipped* con el motivo «pendiente: faltan valores de referencia».

## Cómo cargar los valores

Un CSV por ficha, con estas columnas:

| Columna | Qué va |
|---|---|
| `anio` | `AAAA` para valores anuales; `AAAA-MM` para mensuales o para una onda de la EPH (`1989-05`). |
| `valor` | El número tal como figura en el texto, con punto decimal (por ejemplo, `4923.6`). |
| `unidad` | La unidad del texto (por ejemplo, `% dic./dic.` o `millones de US$`). |
| `pagina` | La página del PDF o del libro, como figura en el inventario. |
| `nota` | Opcional: si el valor es una lectura aproximada de un gráfico, si el autor usa otra fuente, etc. |
| `variable` | Opcional, en las fichas con varias series: la variante que corresponde al valor (`importaciones.oficial`). Si falta, se usa la de `casos.yaml`. |

Solo se cargan valores aislados con su cita: **no se suben capturas ni páginas** (CLAUDE.md). Lo que se compara en cada ficha (serie, variante, transformación y tolerancia) está en `casos.yaml`.

## Qué valores hacen falta (de 5 a 10 por ficha)

| Ficha | Variable | Años o meses sugeridos | Se compara con |
|---|---|---|---|
| DF2013-G2 | Variación interanual del **IPC-INDEC** (no la del IPC-9 de CIFRA), leída del gráfico | 2002-06, 2002-12, 2003-12, 2004-12, 2005-12, 2006-12, 2007-12, 2009-12, 2012-12 | `ipc.oficial`, variación interanual; tolerancia de 1 p. p. |
| DF1990-C1 | Inflación minorista (IPC) dic./dic., del anexo estadístico | 1975, 1976, 1980, 1983, 1984, 1985, 1986, 1988, 1989 | `ipc.oficial`, variación dic./dic.; tolerancia del 2 % del valor |
| OS2006-G3 | Tasa de desocupación (no la subocupación), leída del gráfico | 1980, 1982, 1984, 1986, 1988, 1989 | `desocupacion.total-urbano`, promedio de las dos ondas del año; tolerancia de 0,5 p. p. Si el gráfico usa una sola onda (por ejemplo, octubre) o el GBA, anotalo en `nota`. |
| CENDA2010-G5 | Exportaciones e importaciones en millones de US$ corrientes (una fila por variable, con `variable`) | 1990, 1993, 1996, 1999, 2002, 2005, 2008, 2009 | `exportaciones.oficial` e `importaciones.oficial`; tolerancia del 2 % |
| SCH1998c2-C8 | Exportaciones e importaciones en millones de US$ corrientes (no las de pesos de 1970), una fila por variable | 1975 a 1981 | `exportaciones.oficial` e `importaciones.oficial`; tolerancia del 3 %. Hasta 1991 las importaciones son las del balance de pagos del BCRA. |
| CENDA2010-G8 | Reservas internacionales del BCRA en millones de US$, leídas del gráfico | 1996-01, 1998-12, 2001-12, 2002-06, 2003-12, 2005-12, 2007-12, 2009-12, 2010-01 | `reservas.brutas`; tolerancia del 3 % |

Las tolerancias consideran que los datos se revisaron después de la publicación de cada texto y que los valores de gráficos son lecturas aproximadas. Si una diferencia es esperable (por ejemplo, el autor usa otra base), anotalo en `nota`.
