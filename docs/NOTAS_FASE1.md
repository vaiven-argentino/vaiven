# Vaivén · Notas de la fase 1 (pipeline piloto)

*24/10/2026 · Decisiones tomadas durante la fase 1, diferencias con la SPEC y el catálogo, y pendientes. Lo que acá figura como «a consultar» no se resolvió por cuenta propia (CLAUDE.md).*

## Decisiones tomadas con Camilo

| Tema | Decisión |
|---|---|
| Token del disparo diario | De grano fino, dueño `vaiven-argentino`, solo el repo `vaiven`, permiso Actions: write, **sin vencimiento**. Se guarda como secreto del Worker (`GITHUB_TOKEN_DISPARO`). |
| Avisos | Si la validación falla, el bot abre (o comenta) un issue con la etiqueta `validacion`, asignado al responsable; el job termina en rojo. El respaldo semanal abre un issue `disparador` si pasan 3 días sin disparos. |
| Cavallo–Bertolotto | Pendiente de licencia: los términos del dataset de Cavallo (2013) en Harvard Dataverse limitan el uso a investigación y publicaciones académicas y prohíben el uso comercial, lo que no es compatible con CC BY 4.0. Variante declarada, sin datos; no se descarga. Hay que pedir permiso a los autores. |
| API del BCRA | **No se usa por ahora.** Su aviso legal (dic. 2025) permite reutilizar «con fines informativos, educativos o académicos», pero no el uso comercial sin autorización. Se usan las copias de datos.gob.ar, que tienen CC BY 4.0, aunque llegan con atraso (abr. 2026 al 24/10/2026). Hay que consultar al BCRA. |
| Tipo de cambio | Serie mensual del BCRA (fin de mes), con un quiebre que dice qué mercado sigue en los períodos de desdoblamiento. La variante comercial queda pendiente. |
| Casos de la bibliografía | Tests de forma ya; tests de valores con CSV vacíos para cargar después (*skipped* mientras falten). SCH1998c2-C8 pasa a la fase 4. |

## Decisiones de diseño (revisables)

- **IPC, tramo 1993–2006:** se usa el IPC-GBA base 2008 desde febrero de 1993 en lugar del IPC histórico hasta 2006 (que es lo que sugiere el ejemplo de la SPEC, 2.3). Las dos series dan las mismas tasas (diferencia máxima de 0,004 p. p.) salvo en mayo y junio de 2004 (±0,13 p. p.), donde el IPC-GBA coincide con lo que publicó el INDEC en su momento (0,7 % y 0,6 %).
- **IPC Nacional Urbano:** hay dos series en la API (98.3 y 124.3) que difieren en las tasas de enero de 2014 y octubre de 2014. Se usa 98.3, cuyas tasas redondeadas coinciden con las publicadas por el INDEC (3,7 % y 1,2 %).
- **IPC, emergencia estadística (nov. 2015 – abr. 2016):** la variante oficial usa las tasas del IPC de la Ciudad de Buenos Aires. No se encontró el texto del INDEC que recomiende CABA y San Luis para ese período; solo una fuente secundaria (Chequeado, 15/1/2016) que lo atribuye a autoridades del INDEC.
- **Tipo de cambio en moneda de época:** se calcula desde la serie en pesos equivalentes con `metadatos/signos_monetarios.yaml`. La serie «moneda de cada momento» de la fuente cambia de unidad en enero de 1983, enero de 1985 y enero de 1990, en vez de en las fechas de los cambios de signo.
- **Reservas, marzo de 1979:** la fuente publica 675,8, entre 6.282,9 (febrero) y 7.270,3 (abril). Se excluye el dato (no se corrige) hasta confirmarlo. **A consultar.**
- **Desocupación:** la EPH puntual 1974–2003 sale del CSV del dataset 343 de datos.gob.ar (la API devuelve 0 filas). Las ondas vienen fechadas en mayo y noviembre. Variantes: total urbano (por defecto) y GBA, sin empalmar; la empalmada queda pendiente porque no se ubicaron coeficientes oficiales.
- **Fechas del export:** `AAAA-MM` en mensuales, trimestrales (mes de inicio) y semestrales (mes de la onda); `AAAA` en anuales.
- **Variantes por frecuencia:** exportaciones tiene `oficial` (anual, desde 1970) y `mensual` (desde 1992), porque antes de 1992 solo hay datos anuales.
- **Descargas:** el Parquet y el ZIP no se versionan en Git; se generan con `python -m pipeline descargas`. Se van a servir cuando el Worker sirva el export (fase 2).
- **Workflow nuevo:** `pruebas.yml` (pytest y tipos del Worker en cada push y PR), que no figura en la SPEC (5.4).

## Diferencias con el catálogo (`catalogo_mvp_propuesta.csv`)

- **IPC histórico 1943–2008:** la API no dice que sea GBA; la cobertura es 1943-01 a 2008-04.
- **CAM-01:** no hay una serie diaria continua del mercado oficial desde 1970: las del dataset 175 tienen huecos largos (al oficial le faltan los datos de nov. 1976 a ene. 1987). La serie mensual larga es la del dataset 174.
- **EXT-01:** no hay índice de precios de exportación en la API, así que la variante en dólares constantes queda pendiente. Las importaciones anuales largas (74.1_IIT) figuran en el catálogo, pero la API no devuelve datos.
- **EXT-06:** sin series diarias (dependían de la API del BCRA). Las netas siguen pendientes de definición (pregunta abierta de la SPEC).
- **TRA-01:** el total urbano está desde 1974 (el catálogo decía «desde 1982»).

## Pendientes

1. Permiso de Cavallo y Bertolotto para redistribuir su índice con atribución.
2. Consulta al BCRA sobre el uso de la API de estadísticas bajo CC BY 4.0.
3. Confirmar el dato de reservas de marzo de 1979.
4. Valores de referencia de los casos de la bibliografía (`tests/casos_bibliografia/`).
5. Tramos sin fuente abierta: TC comercial continuo, índice de precios de exportación, importaciones anteriores a 1990 y coeficientes de empalme de la EPH.
6. Definición de reservas netas.
