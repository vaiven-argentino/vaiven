// Sitio estático (sin adaptador): lo sirve el Worker como static assets desde web/dist (SPEC 5.4).
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://vaiven.argentino.workers.dev",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  // Vega se carga recién cuando hace falta el gráfico; no se avisa por el tamaño de ese bloque.
  vite: { build: { chunkSizeWarningLimit: 1500 } },
});
