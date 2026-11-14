// Sonda de la 4e: la vista mínima de ui://vaiven/grafico para saber qué permite cada host (NOTAS_FASE4, «4e · Gráfico
// interactivo en Claude»). Muestra lo que recibió, si cargó el script del dominio de Vaivén, si hay `unsafe-eval`, si
// Vega dibuja con su intérprete y sin él, el tema y las capacidades del host, y prueba las tres acciones de la SPEC 7.4
// (volver a llamar a especificacion_grafico, descargar, abrir el explorador). No es el gráfico definitivo.
import { App, applyDocumentTheme, type McpUiHostContext } from "@modelcontextprotocol/ext-apps/app-with-deps";
import embed, { type Result } from "vega-embed";

type Resultado = { structuredContent?: Record<string, unknown>; content?: Array<{ type: string; text?: string }>; isError?: boolean; _meta?: unknown };
type Vista = Result["view"];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const filas = $("resultados").querySelector("tbody")!;
const inicio = performance.now();

function registrar(texto: string): void {
  $("registro").textContent += `${Math.round(performance.now() - inicio)} ms · ${texto}\n`;
}

/** Escribe (o reemplaza) una fila de la tabla de resultados. `estado` pinta el valor de verde o naranja. */
function fila(clave: string, valor: string, estado?: boolean): void {
  let tr = filas.querySelector<HTMLTableRowElement>(`tr[data-clave="${clave}"]`);
  if (!tr) {
    tr = document.createElement("tr");
    tr.dataset.clave = clave;
    tr.append(document.createElement("td"), document.createElement("td"));
    tr.cells[0].textContent = clave;
    filas.append(tr);
  }
  tr.cells[1].textContent = valor;
  tr.cells[1].className = estado === undefined ? "" : estado ? "bien" : "mal";
}

const mensaje = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

// 1. Lo que se puede saber sin el host: el tamaño del HTML, la sonda externa y `unsafe-eval`.
fila("HTML del recurso", `${document.documentElement.outerHTML.length.toLocaleString("es-AR")} caracteres`);
const origen = (window as unknown as { __vaivenOrigen?: string }).__vaivenOrigen ?? "?";
fila(`Script externo (${origen}/mcp-app/sonda.js)`, (window as unknown as { __vaivenSondaExterna?: string }).__vaivenSondaExterna ?? "no cargó",
  (window as unknown as { __vaivenSondaExterna?: string }).__vaivenSondaExterna === "cargó");
try {
  // eslint-disable-next-line no-new-func
  fila("unsafe-eval", new Function("return 1")() === 1 ? "permitido" : "raro", true);
} catch (e) {
  fila("unsafe-eval", `bloqueado (${mensaje(e)})`, false);
}
fila("Tema del sistema (prefers-color-scheme)", matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro");

// 2. El gráfico: la misma especificación, con el intérprete y sin él. Se comparan los SVG.
let vistaInterprete: Vista | undefined;
let ultimo: Record<string, unknown> | undefined;
let argumentos: Record<string, unknown> | undefined;

async function dibujar(destino: string, spec: Record<string, unknown>, ast: boolean): Promise<Vista | undefined> {
  const el = $(destino);
  el.replaceChildren();
  const t0 = performance.now();
  try {
    const r = await embed(el, spec as never, { renderer: "svg", actions: false, ast });
    fila(ast ? "Vega con intérprete" : "Vega sin intérprete", `dibujó (${Math.round(performance.now() - t0)} ms)`, true);
    return r.view;
  } catch (e) {
    fila(ast ? "Vega con intérprete" : "Vega sin intérprete", `falló: ${mensaje(e)}`, false);
    el.textContent = mensaje(e);
    return undefined;
  }
}

async function mostrar(r: Resultado, origenDelDato: string): Promise<void> {
  const sc = r.structuredContent;
  fila("Resultado recibido", `${origenDelDato}: ${JSON.stringify(r).length.toLocaleString("es-AR")} caracteres${r.isError ? " (isError)" : ""}`, !r.isError && !!sc);
  if (!sc) {
    fila("structuredContent", "no llegó (¿el host lo mandó a un archivo?)", false);
    return;
  }
  ultimo = sc;
  const spec = sc.especificacion as Record<string, unknown> | undefined;
  const disp = sc.disposicion as { tipo?: string } | undefined;
  fila("structuredContent", `disposición ${disp?.tipo ?? "?"}, ${String(sc.n_observaciones)} observaciones, especificación de ${spec ? JSON.stringify(spec).length.toLocaleString("es-AR") : 0} caracteres`, !!spec);
  if (!spec) return;
  vistaInterprete = await dibujar("con-interprete", spec, true);
  const sin = await dibujar("sin-interprete", spec, false);
  if (vistaInterprete && sin) {
    const [a, b] = await Promise.all([vistaInterprete.toSVG(), sin.toSVG()]);
    fila("SVG con y sin intérprete", a === b ? "iguales" : `distintos (${a.length} y ${b.length} caracteres)`, a === b);
  }
}

// 3. El host.
const app = new App({ name: "Vaivén · gráfico (sonda 4e)", version: "0.0.1" }, {}, { autoResize: true });

function contexto(c: McpUiHostContext | undefined): void {
  if (!c) return;
  if (c.theme) applyDocumentTheme(c.theme);
  fila("Tema del host (hostContext.theme)", c.theme ?? "no informa");
  if (c.locale) fila("Idioma del host", c.locale);
  if (c.displayMode) fila("Modo de presentación", `${c.displayMode} (disponibles: ${(c.availableDisplayModes ?? []).join(", ") || "?"})`);
  if (c.containerDimensions) fila("Contenedor", JSON.stringify(c.containerDimensions));
  if (c.platform) fila("Plataforma", String(c.platform));
}

app.addEventListener("toolinput", (p) => {
  argumentos = p.arguments as Record<string, unknown>;
  fila("Argumentos de la llamada", JSON.stringify(argumentos));
});
app.addEventListener("toolresult", (p) => void mostrar(p as Resultado, "el modelo"));
app.addEventListener("hostcontextchanged", (p) => {
  registrar(`hostcontextchanged: ${JSON.stringify(p)}`);
  contexto({ ...app.getHostContext(), ...p });
});

try {
  await app.connect();
  const host = app.getHostVersion();
  fila("Host", `${host?.name ?? "?"} ${host?.version ?? ""}`.trim(), true);
  const cap = app.getHostCapabilities() ?? {};
  fila("Capacidades del host", Object.keys(cap).join(", ") || "ninguna");
  fila("downloadFile", cap.downloadFile ? "sí" : "no", !!cap.downloadFile);
  fila("openLinks", cap.openLinks ? "sí" : "no", !!cap.openLinks);
  fila("serverTools", cap.serverTools ? "sí" : "no", !!cap.serverTools);
  contexto(app.getHostContext());
} catch (e) {
  fila("Host", `no se pudo conectar: ${mensaje(e)}`, false);
}

// 4. Las tres acciones de la SPEC 7.4.
/** Diez años antes, o 2000 si no había `desde`: lo justo para ver que la interfaz pide otra vista. */
function otroDesde(desde: unknown): string {
  const anio = typeof desde === "string" ? Number(desde.slice(0, 4)) : NaN;
  return Number.isFinite(anio) ? String(anio - 10) : "2000";
}

$("otro-periodo").addEventListener("click", async () => {
  const args = { ...(argumentos ?? { series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "reservas" }] }) };
  args.desde = otroDesde(args.desde);
  registrar(`callServerTool especificacion_grafico ${JSON.stringify(args)}`);
  try {
    const r = await app.callServerTool({ name: "especificacion_grafico", arguments: args });
    argumentos = args;
    await mostrar(r as Resultado, "la interfaz");
    fila("Otro período", `desde ${String(args.desde)}`, !r.isError);
  } catch (e) {
    fila("Otro período", `falló: ${mensaje(e)}`, false);
  }
});

async function bajar(formato: "svg" | "png"): Promise<void> {
  if (!vistaInterprete) return fila(`Descarga ${formato}`, "no hay gráfico", false);
  try {
    const nombre = `vaiven-sonda.${formato}`;
    const resource = formato === "svg"
      ? { uri: `file:///${nombre}`, mimeType: "image/svg+xml", text: await vistaInterprete.toSVG() }
      : { uri: `file:///${nombre}`, mimeType: "image/png", blob: (await vistaInterprete.toImageURL("png", 2)).replace(/^data:image\/png;base64,/, "") };
    const r = await app.downloadFile({ contents: [{ type: "resource", resource }] });
    fila(`Descarga ${formato}`, r.isError ? "el host la rechazó o se canceló" : "pedida al host", !r.isError);
  } catch (e) {
    fila(`Descarga ${formato}`, `falló: ${mensaje(e)}`, false);
  }
}
$("bajar-svg").addEventListener("click", () => void bajar("svg"));
$("bajar-png").addEventListener("click", () => void bajar("png"));

$("abrir").addEventListener("click", async () => {
  const url = typeof ultimo?.url_explorador === "string" ? ultimo.url_explorador : `${origen}/explorador/`;
  try {
    const r = await app.openLink({ url });
    fila("Abrir en el explorador", r.isError ? "el host lo rechazó" : `pedido: ${url}`, !r.isError);
  } catch (e) {
    fila("Abrir en el explorador", `falló: ${mensaje(e)}`, false);
  }
});
