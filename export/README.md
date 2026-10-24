# export/

Lo que consumen la web y el MCP, y que funciona además como API pública de solo lectura (SPEC, 2.5): `series/<slug>/<variante>.json`, `catalogo.json`, `periodos.json`, `eventos.json`, `quiebres.json`, `datapackage.json`, `descargas/` y `vega/`.

Se regenera completo en cada actualización. No se edita a mano.

Las descargas completas (`descargas/vaiven_<versión>.zip` y `.parquet`) se generan con `python -m pipeline descargas` y no se versionan.

**Se llenó en:** fase 1 (5 series piloto).
