#!/usr/bin/env node
// Arma el HTML del recurso ui://vaiven/grafico (SPEC 7.4): empaqueta mcp/app/sonda.ts con esbuild (el SDK de la app y
// vega-embed, con Vega y Vega-Lite) y lo pone en línea en mcp/app/grafico.html. El resultado va a
// mcp/src/app/html.generado.ts, que no se versiona: lo regeneran las pruebas, los tipos, el lanzador local y el armado
// del Worker (wrangler.jsonc, `build`). El HTML se guarda partido en el marcador __ORIGEN__, para que el servidor ponga
// el dominio de Vaivén al leer el recurso con una concatenación, sin recorrer los ~900 KB en cada pedido.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mcp = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(mcp, "src", "app", "html.generado.ts");

export async function armarApp({ silencioso = false } = {}) {
  const { build } = await import("esbuild");
  const r = await build({
    entryPoints: [join(mcp, "app", "sonda.ts")], bundle: true, platform: "browser", format: "esm", target: "es2022",
    minify: true, write: false, legalComments: "none", logLevel: "warning",
  });
  // Un `</script` dentro del código cerraría la etiqueta antes de tiempo: se escapa (en JS, `<\/` es lo mismo que `</`).
  const codigo = r.outputFiles[0].text.replace(/<\/(script)/gi, "<\\/$1");
  const plantilla = await readFile(join(mcp, "app", "grafico.html"), "utf8");
  if (!plantilla.includes("/*__VAIVEN_APP__*/")) throw new Error("grafico.html no tiene el marcador /*__VAIVEN_APP__*/");
  const html = plantilla.replace("/*__VAIVEN_APP__*/", () => codigo);
  const partes = html.split("__ORIGEN__");
  const ts = `// Generado por mcp/scripts/armar-app.mjs a partir de mcp/app/: no se edita a mano ni se versiona.\n`
    + `/** El HTML de ui://vaiven/grafico partido en el marcador del dominio de Vaivén (${html.length} caracteres). */\n`
    + `export const PARTES_HTML_GRAFICO: readonly string[] = ${JSON.stringify(partes)};\n`;
  const previo = await readFile(SALIDA, "utf8").catch(() => "");
  if (previo !== ts) await writeFile(SALIDA, ts);
  if (!silencioso) process.stderr.write(`ui://vaiven/grafico: ${html.length.toLocaleString("es-AR")} caracteres (${codigo.length.toLocaleString("es-AR")} de script)\n`);
  return { caracteres: html.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await armarApp();
  } catch (e) {
    process.stderr.write(`No se pudo armar ui://vaiven/grafico: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}
