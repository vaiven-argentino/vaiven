# export/

Lo que consumen la web y el MCP, y que funciona además como API pública de solo lectura (SPEC, 2.5): `series/<slug>/<variante>.json`, `catalogo.json`, `periodos.json`, `eventos.json`, `quiebres.json`, `datapackage.json`, `descargas/` y `vega/`.

Se regenera completo en cada actualización. No se edita a mano.

En el sitio se sirve bajo `/datos/` (por ejemplo, `https://vaiven.argentino.workers.dev/datos/series/ipc/oficial.json`). Cada JSON de serie declara su versión de esquema en `esquema`; el contrato vigente es el 1.1 (`tests/contrato/serie-1.1.schema.json`, publicado en `/esquemas/serie-1.1.json`). La 1.1 agrega a la 1.0 `empalme`, `transformaciones`, `excluidos` (observaciones de la fuente quitadas a propósito, con su motivo) y la frecuencia de cada tramo.

Las descargas completas (`descargas/vaiven_<versión>.zip` y `.parquet`) se generan con `python -m pipeline descargas` y no se versionan.

**Se llenó en:** fase 1 (5 series piloto).
