#!/usr/bin/env node
// Arma la interfaz del gráfico en Claude (ui://vaiven/grafico, SPEC 7.4): empaqueta mcp/app/grafico.ts con esbuild (el
// SDK de MCP Apps y vega-embed, con Vega y Vega-Lite) y deja:
//   - web/public/mcp-app/grafico-<hash>.js: el script, como asset estático del Worker (sin CPU). El nombre lleva el hash
//     de su contenido: un cambio nunca queda tapado por la caché del navegador;
//   - mcp/src/app/html.generado.ts: el HTML mínimo que lo pide al dominio de Vaivén (el recurso del Worker);
//   - mcp/src/app/html-en-linea.generado.ts: el mismo HTML con el script adentro (la variante local por stdio, que no
//     tiene por qué tener ese script publicado).
// Nada de esto se versiona: lo regeneran las pruebas, los tipos, el lanzador local, el armado del sitio y el `build` de
// wrangler.jsonc. Los HTML se guardan partidos en el marcador __ORIGEN__, para que el servidor ponga el dominio con una
// concatenación.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mcp = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raiz = resolve(mcp, "..");
const CARPETA_SCRIPT = join(raiz, "web", "public", "mcp-app");
const SALIDA = join(mcp, "src", "app", "html.generado.ts");
const SALIDA_EN_LINEA = join(mcp, "src", "app", "html-en-linea.generado.ts");

async function escribirSiCambio(ruta, texto) {
  const previo = await readFile(ruta, "utf8").catch(() => null);
  if (previo !== texto) await writeFile(ruta, texto);
}

const modulo = (nombre, descripcion, partes, script) => `// Generado por mcp/scripts/armar-app.mjs a partir de mcp/app/: no se edita a mano ni se versiona.\n`
  + `/** ${descripcion} */\n`
  + `export const ${nombre}: readonly string[] = ${JSON.stringify(partes)};\n`
  + (script ? `/** El script de la interfaz (con el hash de su contenido): lo informa /salud, para saber qué versión está arriba. */\nexport const SCRIPT_GRAFICO = ${JSON.stringify(script)};\n` : "");

export async function armarApp({ silencioso = false } = {}) {
  const { build } = await import("esbuild");
  const r = await build({
    entryPoints: [join(mcp, "app", "grafico.ts")], bundle: true, platform: "browser", format: "esm", target: "es2022",
    minify: true, write: false, legalComments: "none", logLevel: "warning", nodePaths: [join(raiz, "node_modules")],
  });
  const codigo = r.outputFiles[0].text;
  const nombre = `grafico-${createHash("sha256").update(codigo).digest("hex").slice(0, 12)}.js`;
  mkdirSync(CARPETA_SCRIPT, { recursive: true });
  for (const viejo of readdirSync(CARPETA_SCRIPT).filter((f) => /^grafico-[0-9a-f]+\.js$/.test(f) && f !== nombre)) rmSync(join(CARPETA_SCRIPT, viejo));
  await escribirSiCambio(join(CARPETA_SCRIPT, nombre), codigo);

  const plantilla = await readFile(join(mcp, "app", "grafico.html"), "utf8");
  const etiqueta = '<script type="module" src="__ORIGEN__/mcp-app/__SCRIPT__"></script>';
  if (!plantilla.includes(etiqueta)) throw new Error(`grafico.html no tiene la etiqueta del script (${etiqueta})`);
  const html = plantilla.replace("__SCRIPT__", nombre);
  // En línea: un `</script` dentro del código cerraría la etiqueta antes de tiempo (en JS, `<\/` es lo mismo que `</`).
  const enLinea = plantilla.replace(etiqueta, () => `<script type="module">${codigo.replace(/<\/(script)/gi, "<\\/$1")}</script>`);
  await escribirSiCambio(SALIDA, modulo("PARTES_HTML_GRAFICO", `El HTML de ui://vaiven/grafico, que pide ${nombre} al dominio de Vaivén (${html.length} caracteres).`, html.split("__ORIGEN__"), nombre));
  await escribirSiCambio(SALIDA_EN_LINEA, modulo("PARTES_HTML_GRAFICO_EN_LINEA", `El HTML de ui://vaiven/grafico con el script adentro, para la variante local (${enLinea.length} caracteres).`, enLinea.split("__ORIGEN__")));
  if (!silencioso) {
    process.stderr.write(`ui://vaiven/grafico: HTML de ${html.length.toLocaleString("es-AR")} caracteres; script ${nombre}, ${codigo.length.toLocaleString("es-AR")} caracteres\n`);
  }
  return { script: nombre, caracteres: html.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await armarApp();
  } catch (e) {
    process.stderr.write(`No se pudo armar ui://vaiven/grafico: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}
