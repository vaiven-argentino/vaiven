# .github/workflows/

Workflows de GitHub Actions (SPEC, sección 5):

- `actualizar.yml`: corre el pipeline y las pruebas. Si todo pasa, commitea los datos con el resumen de cambios; si algo falla, abre (o comenta) un issue `validacion` asignado al responsable y termina en rojo. Lo dispara a diario el Cron Trigger del Worker (`workflow_dispatch`); el `schedule` semanal es el respaldo y abre un issue `disparador` si el disparo diario dejó de llegar.
- `pruebas.yml`: pytest y tipos del Worker en cada push a `main` y en cada PR (no figura en la SPEC, 5.4; ver `docs/NOTAS_FASE1.md`).
- `publicar.yml`: despliega el Worker con `wrangler deploy` cuando cambia `worker/`. Necesita los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.
- `release.yml`: release trimestral y archivo en Zenodo (fase 5).

**Se llenó en:** fase 1 (salvo `release.yml`).
