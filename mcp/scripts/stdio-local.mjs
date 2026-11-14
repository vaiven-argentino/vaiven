#!/usr/bin/env node
// Lanzador del MCP local para `.mcp.json` (SPEC 5.4 y 11: lo usa el subagente probador-mcp).
// No se usa `npm run local` porque npm escribe su encabezado en stdout, que es el canal del protocolo.
// Este script empaqueta el servidor con la API de esbuild (todo aviso va a stderr) y después lo carga en el mismo
// proceso, con los mismos argumentos (`--export <carpeta>` o `--url <base>`). Sin argumentos, lee el export del repo.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mcp = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raiz = resolve(mcp, "..");
const salida = join(mcp, "dist", "vaiven-mcp.mjs");

if (!existsSync(join(raiz, "node_modules", "esbuild"))) {
  process.stderr.write(`Vaivén MCP local: faltan las dependencias. Corré \`npm ci\` en ${raiz} y volvé a iniciar el servidor.\n`);
  process.exit(1);
}

const { build } = await import("esbuild");
try {
  // El HTML del recurso del gráfico (SPEC 7.4) se arma antes que el servidor, que lo lleva adentro.
  const { armarApp } = await import("./armar-app.mjs");
  await armarApp({ silencioso: true });
  await build({
    entryPoints: [join(mcp, "src", "stdio.ts")], bundle: true, platform: "node", format: "esm",
    target: "node22", outfile: salida, logLevel: "warning",
  });
} catch (e) {
  process.stderr.write(`Vaivén MCP local: no se pudo empaquetar el servidor: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}

if (!process.argv.includes("--export") && !process.argv.includes("--url")) {
  process.argv.push("--export", join(raiz, "export"));
}
await import(pathToFileURL(salida).href);
