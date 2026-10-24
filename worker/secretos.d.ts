// Secretos del Worker (no van en wrangler.jsonc ni en el repositorio). Se cargan con `npx wrangler secret put <NOMBRE>`.
interface Env {
  /** Token de grano fino de GitHub, solo con Actions: write en vaiven-argentino/vaiven. */
  GITHUB_TOKEN_DISPARO?: string;
}
