// Una sola implementación, en el navegador (SPEC 10): para las mismas vistas, la especificación que dibuja el explorador
// real es la de `especificacion_grafico` del MCP local, salvo el tamaño. Las vistas son las de
// mcp/test/vistas-igualdad.json (las mismas que compara Vitest sin navegador).
//
// Para cada vista: pide `especificacion_grafico` al MCP local por stdio (mcp/scripts/stdio-local.mjs, el de .mcp.json),
// que lee el export que sirve el sitio (`--url <base>/datos/`), así los dos usan los mismos datos; abre su
// `url_explorador` en el sitio y lee lo que dibujó el explorador (la propiedad `especificacion` de #x-grafico).
//   - Con el gráfico de 800 × 400 px (el tamaño del MCP), las dos especificaciones tienen que ser idénticas.
//   - En 1280 y 390 px, lo que no depende del tamaño: los datos de cada línea y la guía común.
//
// Uso (contra `wrangler dev`, como el revisor visual):
//   node web/scripts/igualdad-explorador.mjs --base http://localhost:8787
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const argv = process.argv.slice(2);
const opcion = (n) => { const i = argv.indexOf(n); return i === -1 ? undefined : argv[i + 1]; };
const base = (opcion("--base") ?? "http://localhost:8787").replace(/\/$/, "");
const RAIZ = join(import.meta.dirname, "..", "..");
const VISTAS = JSON.parse(readFileSync(join(RAIZ, "mcp", "test", "vistas-igualdad.json"), "utf-8"));
/** El tamaño del gráfico del MCP (mcp/src/herramientas/comparar.ts, ANCHO_MCP y ALTO_MCP). */
const ANCHO_MCP = 800, ALTO_MCP = 400;

// ── MCP local por stdio (JSON-RPC, un mensaje por línea) ──
const mcp = spawn(process.execPath, [join(RAIZ, "mcp", "scripts", "stdio-local.mjs"), "--url", `${base}/datos/`], { stdio: ["pipe", "pipe", "inherit"] });
const pendientes = new Map();
let resto = "";
mcp.stdout.on("data", (b) => {
  resto += b.toString();
  let i;
  while ((i = resto.indexOf("\n")) >= 0) {
    const linea = resto.slice(0, i).trim();
    resto = resto.slice(i + 1);
    if (!linea) continue;
    const m = JSON.parse(linea);
    if (m.id !== undefined && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
  }
});
let siguiente = 1;
const pedir = (method, params) => new Promise((ok) => {
  const id = siguiente++;
  pendientes.set(id, ok);
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
});
await pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "igualdad-explorador", version: "1" } });
mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

/** Las capas de línea (con sus datos) y la guía común: lo que no depende del tamaño del gráfico. */
function sinTamano(spec) {
  const lineas = [];
  const recorrer = (nodo) => {
    if (!nodo || typeof nodo !== "object") return;
    if (Array.isArray(nodo)) { nodo.forEach(recorrer); return; }
    const marca = typeof nodo.mark === "string" ? nodo.mark : nodo.mark?.type;
    if (marca === "line") lineas.push({ datos: nodo.data?.values ?? nodo.data?.name, color: nodo.mark?.color ?? nodo.encoding?.color });
    for (const k of ["layer", "vconcat"]) if (nodo[k]) recorrer(nodo[k]);
  };
  recorrer(spec);
  return { lineas, guia: spec.datasets?.guia ?? null, descripcion: spec.description };
}

/** La primera ruta en que difieren dos valores (para el informe). */
function diferencia(a, b, ruta = "") {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = diferencia(a[k], b[k], `${ruta}${Array.isArray(a) ? `[${k}]` : `.${k}`}`);
      if (d) return d;
    }
  }
  const corto = (x) => { const t = JSON.stringify(x); return t === undefined ? "(no está)" : t.length > 160 ? `${t.slice(0, 160)}…` : t; };
  return `${ruta || "(raíz)"}: MCP ${corto(a)} · explorador ${corto(b)}`;
}

const navegador = await chromium.launch();
/** Abre una vista y devuelve lo que dibujó el explorador y su tamaño. */
async function dibujada(pagina, ruta) {
  await pagina.goto(`${base}${ruta}`, { waitUntil: "networkidle" });
  await pagina.waitForFunction(() => document.querySelector("#x-grafico")?.dataset.listo === "1" && document.querySelector("#x-grafico svg"), null, { timeout: 30000 });
  return pagina.evaluate(() => {
    const g = document.querySelector("#x-grafico");
    return { spec: JSON.parse(JSON.stringify(g.especificacion)), ancho: g.clientWidth };
  });
}

const fallas = [];
let iguales = 0;
for (const [nombre, args] of VISTAS) {
  const r = await pedir("tools/call", { name: "especificacion_grafico", arguments: args });
  if (r.error || r.result?.isError) { fallas.push(`${nombre}: el MCP devolvió un error (${JSON.stringify(r.error ?? r.result.content)})`); continue; }
  const { especificacion, url_explorador } = r.result.structuredContent;
  const u = new URL(url_explorador);
  const ruta = `${u.pathname}${u.search}`;

  // 1) El tamaño del MCP. En escritorio (1100 px o más), el alto del gráfico es el 60 % de la ventana menos 40 px:
  // 733 px dan 400. El ancho de la columna del gráfico tiene un máximo (792 px en 1280), así que el contenedor se fija
  // en 800 px con un estilo propio de la prueba, antes de que el explorador lo mida.
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 733 }, colorScheme: "light", deviceScaleFactor: 1 });
  await contexto.addInitScript((ancho) => {
    document.addEventListener("DOMContentLoaded", () => {
      document.head.append(Object.assign(document.createElement("style"), { textContent: `#x-grafico { width: ${ancho}px !important; max-width: none !important; }` }));
    });
  }, ANCHO_MCP);
  const pagina = await contexto.newPage();
  const d = await dibujada(pagina, ruta);
  if (d.ancho !== ANCHO_MCP) fallas.push(`${nombre}: no se pudo llevar el gráfico a ${ANCHO_MCP} px (quedó en ${d.ancho})`);
  else {
    const dif = diferencia(JSON.parse(JSON.stringify(especificacion)), d.spec);
    if (dif) fallas.push(`${nombre} (${ANCHO_MCP} × ${ALTO_MCP}): ${dif}`);
    else iguales += 1;
  }
  await contexto.close();

  // 2) Otros tamaños: lo que no depende del tamaño.
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const c2 = await navegador.newContext({ viewport: { width: w, height: h }, colorScheme: "light", deviceScaleFactor: 1 });
    const p2 = await c2.newPage();
    const e = await dibujada(p2, ruta);
    const a = sinTamano(especificacion), b = sinTamano(e.spec);
    // En 390 px, dos unidades van en paneles (SPEC 6.5): cambia el reparto de las líneas en capas, no sus datos.
    const dif = diferencia({ lineas: a.lineas.map((x) => x.datos), guia: a.guia }, { lineas: b.lineas.map((x) => x.datos), guia: b.guia });
    if (dif) fallas.push(`${nombre} (${w} px): ${dif}`);
    await c2.close();
  }
  console.log(`${nombre}: ${fallas.some((f) => f.startsWith(nombre)) ? "con diferencias" : "igual"}`);
}
await navegador.close();
mcp.kill();

if (fallas.length) {
  console.log(`\n${fallas.length} diferencias:\n${fallas.join("\n")}`);
  process.exit(1);
}
console.log(`\nTodo bien: en ${iguales} de ${VISTAS.length} vistas, la especificación del explorador es la de especificacion_grafico con el mismo tamaño, y en 1280 y 390 px dibujan los mismos datos.`);
