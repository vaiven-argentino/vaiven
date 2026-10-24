# tests/

Pruebas del pipeline (SPEC, sección 10). Se corren con `uv run pytest`.

- `test_empalmes.py`, `test_signos_monetarios.py` y `test_validacion.py`: unitarias, con casos conocidos y con casos que tienen que fallar.
- `test_pipeline.py`: corrida de punta a punta sin red, con metadatos y snapshots sintéticos.
- `test_contrato.py`: el JSON exportado cumple `contrato/serie.schema.json` y el catálogo y el `datapackage.json` apuntan a archivos que existen.
- `test_casos_bibliografia.py` y `casos_bibliografia/`: casos de la bibliografía (forma y valores; ver su README).
- `test_descargas.py`: el ZIP de descarga completa.

Las pruebas de TypeScript (transformaciones, MCP) llegan en las fases 2 y 3.

**Se llenó en:** fase 1; crece en cada fase.
