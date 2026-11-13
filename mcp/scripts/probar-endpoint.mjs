// Prueba el Worker por HTTP: /mcp en las dos eras del protocolo, las 6 herramientas, la versión, CORS, GET y OPTIONS, y que el
// resto del sitio siga igual (/salud, /datos/, fichas, 301, 404 y, en local, el Cron).
//
// Uso: node mcp/scripts/probar-endpoint.mjs [base]
//   base: http://localhost:8787 (por defecto; con `npx wrangler dev --test-scheduled` en worker/)
//         o https://vaiven.argentino.workers.dev (después del despliegue).
import { readFileSync } from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const base = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
// La versión única (mcp/package.json): la responden /salud y el initialize del MCP.
const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")).version;
const local = /^http:\/\/(localhost|127\.0\.0\.1)/.test(base);
let fallas = 0;

function chequear(nombre, ok, detalle = "") {
  console.log(`${ok ? "✓" : "✗"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallas += 1;
}

async function intentar(nombre, f) {
  try {
    await f();
  } catch (e) {
    chequear(nombre, false, e instanceof Error ? e.message : String(e));
  }
}

async function cliente(modo) {
  const c = new Client({ name: "probar-endpoint", version: "1.0.0" }, { versionNegotiation: { mode: modo } });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  return c;
}

const texto = (r) => JSON.parse(r.content[0].text);

// --- /mcp ---
for (const [era, modo] of [["2026-07-28", { pin: "2026-07-28" }], ["2025 (initialize)", "legacy"]]) {
  await intentar(`MCP ${era}`, async () => {
    const c = await cliente(modo);
    chequear(`MCP ${era}: conecta`, true, `era ${c.getProtocolEra()}, versión ${c.getNegotiatedProtocolVersion() ?? "?"}`);
    const { tools } = await c.listTools();
    chequear(`MCP ${era}: 6 herramientas`, tools.length === 6, tools.map((t) => t.name).join(", "));
    const version = c.getServerVersion()?.version;
    chequear(`MCP ${era}: versión ${VERSION}`, version === VERSION, `${version}`);

    const b = texto(await c.callTool({ name: "buscar_series", arguments: { texto: "desempleo" } }));
    chequear(`MCP ${era}: buscar_series «desempleo»`, b.series[0]?.id === "desocupacion", b.series.map((s) => s.id).join(", "));

    const d = texto(await c.callTool({ name: "describir_serie", arguments: { id: "PRE-01" } }));
    // La bibliografía está oculta hasta que responda la cátedra (MOSTRAR_BIBLIOGRAFIA, revisión de la 4a).
    chequear(`MCP ${era}: describir_serie PRE-01`, d.id === "ipc" && d.variantes.length > 0 && !("bibliografia" in d), `${d.variantes.length} variantes`);

    const o = texto(await c.callTool({ name: "obtener_serie", arguments: { id: "reservas", desde: "1979-02", hasta: "1979-04" } }));
    chequear(`MCP ${era}: obtener_serie con el excluido de 1979`, o.datos[1][1] === null && o.excluidos.length === 1, JSON.stringify(o.datos));

    const i = texto(await c.callTool({ name: "obtener_serie", arguments: { id: "ipc", transformacion: "var_interanual", desde: "2023-12", hasta: "2023-12" } }));
    chequear(`MCP ${era}: IPC interanual dic. 2023`, Math.abs(i.datos[0][1] - 211.4) < 0.05, String(i.datos[0][1]));

    // Fase 4a: una medida que lee un insumo de /datos/ y una serie por país.
    const real = texto(await c.callTool({ name: "obtener_serie", arguments: { id: "salario-real", medida: "real", deflactor: "provincias", base_real: "2016", desde: "2017-12", hasta: "2017-12" } }));
    chequear(`MCP ${era}: salario real con el IPC de provincias`, real.unidad === "pesos de 2016" && real.datos[0][1] > 0, `${real.unidad}: ${JSON.stringify(real.datos)}`);
    const pais = texto(await c.callTool({ name: "obtener_serie", arguments: { id: "int-pib", paises: ["ARG", "BRA"], transformacion: "indice_desde_tasas", base: "2000", desde: "2000", hasta: "2001" } }));
    chequear(`MCP ${era}: PIB de ARG y BRA como índice`, pais.datos?.ARG?.[0]?.[1] === 100 && pais.datos?.BRA?.length === 2, JSON.stringify(pais.datos));

    const ct = texto(await c.callTool({ name: "citar", arguments: { id: "reservas", formato: "bibtex" } }));
    chequear(`MCP ${era}: citar en BibTeX`, ct.bibtex?.startsWith("@misc{vaiven_reservas_brutas_"));

    // Segunda revisión de la 4a: un parámetro mal escrito da error en lugar de ignorarse.
    const mal = await c.callTool({ name: "obtener_serie", arguments: { id: "int-pib", entidades: ["ARG"] } });
    chequear(`MCP ${era}: parámetro desconocido da isError`, mal.isError === true, mal.content[0].text.slice(0, 80));

    const err = await c.callTool({ name: "obtener_serie", arguments: { id: "ipc", variante: "cavallo-bertolotto" } });
    chequear(`MCP ${era}: variante pendiente da isError`, err.isError === true, err.content[0].text.slice(0, 80));
    await c.close();
  });
}

await intentar("HTTP de /mcp", async () => {
  const get = await fetch(`${base}/mcp`);
  chequear("GET /mcp → 405 con Allow", get.status === 405 && get.headers.get("allow") === "POST, OPTIONS", `${get.status}`);
  const opt = await fetch(`${base}/mcp`, { method: "OPTIONS", headers: { origin: "https://ejemplo.org", "access-control-request-method": "POST" } });
  chequear("OPTIONS /mcp → 204 con CORS", opt.status === 204 && opt.headers.get("access-control-allow-origin") === "*", `${opt.status}`);
});

// --- El resto del sitio sigue igual ---
await intentar("Sitio", async () => {
  const salud = await fetch(`${base}/salud`);
  const s = await salud.json();
  // La fase esperada es la del package.json del Worker (la misma que lee /salud).
  const { vaiven } = JSON.parse(readFileSync(new URL("../../worker/package.json", import.meta.url), "utf-8"));
  chequear(`/salud con fase ${vaiven.fase}`, salud.ok && s.fase === vaiven.fase, JSON.stringify(s));
  // Una sola versión: la de mcp/package.json, en /salud y en el initialize del MCP.
  chequear(`/salud con versión ${VERSION}`, s.version === VERSION, JSON.stringify(s));
  const cat = await fetch(`${base}/datos/catalogo.json`);
  chequear("/datos/catalogo.json con CORS", cat.ok && cat.headers.get("access-control-allow-origin") === "*", `${cat.status}`);
  const ficha = await fetch(`${base}/series/ipc/`);
  chequear("/series/ipc/ → 200", ficha.status === 200);
  const agentes = await fetch(`${base}/agentes/`);
  chequear("/agentes/ → 200", agentes.status === 200, `${agentes.status}`);
  const r301 = await fetch(`${base}/series/ipc/oficial/`, { redirect: "manual" });
  chequear("/series/ipc/oficial/ → 301", r301.status === 301, `${r301.status} ${r301.headers.get("location")}`);
  const nada = await fetch(`${base}/no-existe/`);
  chequear("404 en español", nada.status === 404 && (await nada.text()).includes("No encontramos"), `${nada.status}`);
});

if (local) {
  await intentar("Cron", async () => {
    const cron = await fetch(`${base}/cdn-cgi/handler/scheduled`);
    chequear("Cron (/cdn-cgi/handler/scheduled)", cron.ok, `${cron.status}`);
  });
}

console.log(fallas ? `\n${fallas} chequeos fallaron.` : "\nTodo bien.");
process.exit(fallas ? 1 : 0);
