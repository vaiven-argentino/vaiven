# .github/workflows/

Workflows de GitHub Actions (SPEC, sección 5):

- `actualizar.yml`: corre el pipeline y las pruebas. Si todo pasa, commitea los datos con el resumen de cambios (si mientras tanto alguien empujó a `main`, hace `pull --rebase` y reintenta una vez). Si algunas variantes no pasan la validación, se publican las demás y esas quedan «retenidas» con su versión anterior: se commitea y se abre (o comenta) un issue `validacion`. Si no se pudo publicar nada, abre el issue y termina en rojo. Lo dispara a diario el Cron Trigger del Worker (`workflow_dispatch`); el `schedule` semanal es el respaldo y abre un issue `disparador` si el disparo diario dejó de llegar.
- `pruebas.yml`: en cada push a `main` y en cada PR, pytest y, del lado de TypeScript, Vitest, `astro check`, tipos del Worker, build de la web y enlaces internos (no figura en la SPEC, 5.4; ver `docs/NOTAS_FASE1.md`).
- `publicar.yml`: genera la descarga completa (Parquet y ZIP), arma la web y despliega el Worker con `wrangler deploy`. Corre cuando cambian `worker/`, `web/`, `paquetes/` o `export/` en `main`, y cuando termina bien «Actualizar datos» (`workflow_run`), siempre que esa corrida haya hecho commit de datos. Necesita los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.
- `release.yml`: release trimestral y archivo en Zenodo (fase 5).

Las acciones de terceros van fijadas por SHA, con la versión en un comentario (revisión de la 4a): una etiqueta se puede mover, un SHA no. Para actualizarlas, se busca el SHA de la etiqueta nueva con `git ls-remote --tags https://github.com/<dueño>/<acción>.git`.

**Se llenó en:** fase 1 (salvo `release.yml`); `publicar.yml` y `pruebas.yml` se ampliaron en la fase 2.
