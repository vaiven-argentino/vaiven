# snapshots/

Archivos crudos tal como los devolvió cada fuente, en `<fuente>/<fecha>/`, con su fecha de descarga, URL, checksum y licencia. Nunca se modifican (SPEC, 2.1).

Solo se guardan fuentes cuya licencia permita redistribuirlas. El riesgo país no se guarda.

`estado-fuentes.json` (solo existe si alguna fuente está fallando) guarda desde qué día no responde cada fuente. Lo escribe el pipeline; ver `pipeline/README.md`. Las fuentes de descarga manual (Bruegel) se bajan con `uv run python -m pipeline bajar-manual`.

**Se llena desde:** la fase 1, automáticamente desde el pipeline.
