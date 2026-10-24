// Prueba el Worker por HTTP: /mcp en las dos eras del protocolo, las 4 herramientas, CORS, GET y OPTIONS, y que el
// resto del sitio siga igual (/salud, /datos/, fichas, 301, 404 y, en local, el Cron).
//
// Uso: node mcp/scripts/probar-endpoint.mjs [base]
//   base: http://localhost:8787 (por defecto; con `npx wrangler dev --test-scheduled` en worker/)
//         o https://vaiven.argentino.workers.dev (después del despliegue).
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const base = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
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
    chequear(`MCP ${era}: 4 herramientas`, tools.length === 4, tools.map((t) => t.name).join(", "));

    const b = texto(await c.callTool({ name: "buscar_series", arguments: { texto: "desempleo" } }));
    chequear(`MCP ${era}: buscar_series «desempleo»`, b.series[0]?.id === "desocupacion", b.series.map((s) => s.id).join(", "));

    const d = texto(await c.callTool({ name: "describir_serie", arguments: { id: "PRE-01" } }));
    chequear(`MCP ${era}: describir_serie PRE-01`, d.id === "ipc" && d.bibliografia.length > 0, `${d.variantes.length} variantes`);

    const o = texto(await c.callTool({ name: "obtener_serie", arguments: { id: "reservas", desde: "1979-02", hasta: "1979-04" } }));
    chequear(`MCP ${era}: obtener_serie con el excluido de 1979`, o.datos[1][1] === null && o.excluidos.length === 1, JSON.stringify(o.datos));

    const i = texto(await c.callTool({ name: "obtener_serie", arguments: { id: "ipc", transformacion: "var_interanual", desde: "2023-12", hasta: "2023-12" } }));
    chequear(`MCP ${era}: IPC interanual dic. 2023`, Math.abs(i.datos[0][1] - 211.4) < 0.05, String(i.datos[0][1]));

    const ct = texto(await c.callTool({ name: "citar", arguments: { id: "reservas", formato: "bibtex" } }));
    chequear(`MCP ${era}: citar en BibTeX`, ct.bibtex?.startsWith("@misc{vaiven_reservas_brutas_"));

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
  chequear("/salud con fase 3", salud.ok && s.fase === 3, JSON.stringify(s));
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
