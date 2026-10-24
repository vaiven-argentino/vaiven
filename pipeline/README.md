# pipeline/

Pipeline en Python (gestionado con uv): snapshot → capa 1 → capa 2 → validación → export (SPEC, sección 5).

- `fuentes/`: descarga de cada fuente y registro del snapshot.
- `capa1/`: normalización de las series fuente.
- `capa2/`: empalmes y variantes.
- `validacion/`: reglas con pandera.
- `export/`: generación de JSON, descargas, `datapackage.json` y Vega-Lite.

**Se llena en:** fase 1.
