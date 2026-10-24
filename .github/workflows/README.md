# .github/workflows/

Workflows de GitHub Actions (SPEC, sección 5):

- `actualizar.yml`: corre el pipeline; lo dispara un Cron Trigger de Cloudflare vía `workflow_dispatch`, con `schedule` semanal de respaldo.
- `publicar.yml`: despliega el Worker con `wrangler deploy`.
- `release.yml`: release trimestral y archivo en Zenodo.

**Se llena en:** fase 1.
