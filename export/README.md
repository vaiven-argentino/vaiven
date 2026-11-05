# export/

Lo que consumen la web y el MCP, y que funciona además como API pública de solo lectura (SPEC, 2.5): `series/<slug>/<variante>.json`, `catalogo.json`, `auxiliares/<slug>/<variante>.json` con su índice `auxiliares.json` (y `auxiliares/signos-monetarios.json`), `periodos.json`, `eventos.json`, `quiebres.json`, `revisiones.json`, `datapackage.json`, `descargas/` y `vega/`.

Se regenera completo en cada actualización. No se edita a mano.

En el sitio se sirve bajo `/datos/` (por ejemplo, `https://vaiven.argentino.workers.dev/datos/series/ipc/oficial.json`). Cada JSON de serie declara su versión de esquema en `esquema`; el contrato vigente es el 1.2 (`tests/contrato/serie-1.2.schema.json`, publicado en `/esquemas/serie-1.2.json`).
- La 1.1 agrega a la 1.0 `empalme`, `transformaciones`, `excluidos` (observaciones de la fuente quitadas a propósito, con su motivo) y la frecuencia de cada tramo.
- La 1.2 agrega a la 1.1 `moneda` (`pesos_actuales`, `moneda_de_epoca`, `dolares` o `null`), `insumos` (qué series publicadas necesita cada medida y en qué unidad queda), `auxiliar`, `vista_inicial` y, en las series con dimensión pais, `dimensiones`, `entidades`, `entidades_por_defecto` y `datos` como objeto por entidad (`{"ARG": [[fecha, valor], …], …}`). El `empalme` suma `derivar`.
- La web, el MCP y la librería leen las dos versiones (`ESQUEMAS_SOPORTADOS`).

En las series con dimensión pais, el CSV es largo (`fecha,pais,valor`), el Parquet lleva la columna `pais`, el `primaryKey` del datapackage es `[fecha, pais]` y la especificación de Vega-Lite colorea por país y filtra la selección inicial.

Las descargas completas (`descargas/vaiven_<versión>.zip` y `.parquet`) se generan con `python -m pipeline descargas` y no se versionan.

**Se llenó en:** fase 1 (5 series piloto); fase 4a (22 series, auxiliares y esquema 1.2).
