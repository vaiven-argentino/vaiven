# tests/

Pruebas del pipeline (SPEC, sección 10). Se corren con `uv run pytest`.

- `test_empalmes.py`, `test_signos_monetarios.py` y `test_validacion.py`: unitarias, con casos conocidos y con casos que tienen que fallar.
- `test_pipeline.py`: corrida de punta a punta sin red, con metadatos y snapshots sintéticos.
- `test_contrato.py`: el JSON exportado cumple el esquema de su versión (`contrato/serie-<versión>.schema.json`) y el catálogo y el `datapackage.json` apuntan a archivos que existen.
- `test_casos_bibliografia.py` y `casos_bibliografia/`: casos de la bibliografía (forma y valores; ver su README).
- `test_descargas.py`: el ZIP de descarga completa.

- `test_contrato.py` revisa también que `catalogo.json` traiga la bibliografía de los metadatos (fase 3).

Las pruebas de TypeScript están en cada paquete (`paquetes/transformaciones/test`, `paquetes/cita/test`, `mcp/test` y `web/test`) y se corren con `npm test` desde la raíz.

**Se llenó en:** fase 1; crece en cada fase.
