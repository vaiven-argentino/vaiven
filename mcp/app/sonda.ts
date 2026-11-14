// Sonda de la 4e: la vista mínima de ui://vaiven/grafico para saber qué permite cada host (NOTAS_FASE4, «4e · Gráfico
// interactivo en Claude»). Muestra lo que recibió, si cargó el script del dominio de Vaivén, si hay `unsafe-eval`, si
// Vega dibuja con su intérprete y sin él, el tema y las capacidades del host, y prueba las tres acciones de la SPEC 7.4
// (volver a llamar a especificacion_grafico, descargar, abrir el explorador). No es el gráfico definitivo.
// Segunda versión (tras la prueba en Claude Desktop): avisa al modelo que el gráfico ya se mostró (updateModelContext),
// lista los eventos, compara los SVG sin los id internos, maneja los errores de «Otro período» y copia los resultados.
import { App, applyDocumentTheme, type McpUiHostContext } from "@modelcontextprotocol/ext-apps/app-with-deps";
import embed, { type Result } from "vega-embed";

const VERSION_SONDA = "2";

type Resultado = { structuredContent?: Record<string, unknown>; content?: Array<{ type: string; text?: string }>; isError?: boolean; _meta?: unknown };
type Vista = Result["view"];
type Evento = { letra?: string; fecha?: string; nombre?: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const filas = $("resultados").querySelector("tbody")!;
const inicio = performance.now();
const ms = () => Math.round(performance.now() - inicio);

// El registro: una línea corta por evento, plegado (lo que cambió, no el JSON entero).
const registro: Array<{ ms: number; tipo: string; detalle: string }> = [];
function registrar(tipo: string, detalle: string): void {
  registro.push({ ms: ms(), tipo, detalle });
  $("registro").textContent += `${ms()} ms · ${tipo}: ${detalle}\n`;
  $("cantidad-registro").textContent = String(registro.length);
}

/** Escribe (o reemplaza) una fila de la tabla de resultados. `estado` pinta el valor de verde o naranja. */
function fila(clave: string, valor: string, estado?: boolean): void {
  let tr = filas.querySelector<HTMLTableRowElement>(`tr[data-clave="${CSS.escape(clave)}"]`);
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
const textoDe = (r: Resultado) => (r.content ?? []).map((c) => c.text ?? "").join(" ").trim();

// 1. Lo que se puede saber sin el host: el tamaño del HTML, la sonda externa y `unsafe-eval`.
fila("Versión de la sonda", VERSION_SONDA);
fila("HTML del recurso", `${document.documentElement.outerHTML.length.toLocaleString("es-AR")} caracteres`);
const origen = (window as unknown as { __vaivenOrigen?: string }).__vaivenOrigen ?? "?";
const externa = (window as unknown as { __vaivenSondaExterna?: string }).__vaivenSondaExterna;
fila(`Script externo (${origen}/mcp-app/sonda.js)`, externa ?? "no cargó", externa === "cargó");
try {
  // eslint-disable-next-line no-new-func
  fila("unsafe-eval", new Function("return 1")() === 1 ? "permitido" : "raro", true);
} catch (e) {
  fila("unsafe-eval", `bloqueado (${mensaje(e)})`, false);
}
fila("Tema del sistema (prefers-color-scheme)", matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro");

// 2. El gráfico: la misma especificación, con el intérprete y sin él.
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

/**
 * Vega numera los `id` internos (recortes, degradés) con un contador por página: dos vistas del mismo gráfico dan id
 * distintos. Se renumeran en orden de aparición, con sus referencias (`url(#…)` y `href="#…"`), antes de comparar.
 */
function sinIds(svg: string): string {
  const mapa = new Map<string, string>();
  const nuevo = (id: string) => { if (!mapa.has(id)) mapa.set(id, `i${mapa.size}`); return mapa.get(id)!; };
  return svg
    .replace(/\bid="([^"]+)"/g, (_, id: string) => `id="${nuevo(id)}"`)
    .replace(/url\(#([^)]+)\)/g, (m, id: string) => (mapa.has(id) ? `url(#${mapa.get(id)})` : m))
    .replace(/href="#([^"]+)"/g, (m, id: string) => (mapa.has(id) ? `href="#${mapa.get(id)}"` : m));
}

function primeraDiferencia(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `en el carácter ${i}: «${a.slice(Math.max(0, i - 30), i + 30)}» y «${b.slice(Math.max(0, i - 30), i + 30)}»`;
}

function listarEventos(eventos: Evento[] | undefined): void {
  const lista = $("eventos");
  lista.replaceChildren(...(eventos ?? []).map((e) => {
    const li = document.createElement("li");
    li.textContent = `${e.letra ? `${e.letra}. ` : ""}${e.fecha ?? ""} · ${e.nombre ?? ""}`;
    return li;
  }));
  $("caja-eventos").hidden = !eventos?.length;
  if (eventos?.length) fila("Lista de eventos", `${eventos.length} eventos debajo del gráfico`, true);
}

/** Avisa al modelo que el gráfico ya está a la vista (hallazgo A1 de la prueba en Desktop). */
async function avisarAlModelo(sc: Record<string, unknown>, args: Record<string, unknown> | undefined): Promise<void> {
  if (!app.getHostCapabilities()?.updateModelContext) return fila("Aviso al modelo (updateModelContext)", "el host no lo ofrece", false);
  const disp = (sc.disposicion as { tipo?: string } | undefined)?.tipo ?? "?";
  const n = Array.isArray(sc.series) ? sc.series.length : "?";
  const desde = args?.desde ?? "el inicio", hasta = args?.hasta ?? "el último dato";
  const texto = `Vaivén: el gráfico ya se mostró al usuario en la interfaz interactiva de Vaivén (${disp}, ${n} series, desde ${String(desde)} hasta ${String(hasta)}). `
    + "No lo vuelvas a dibujar ni pidas los datos para graficarlo: comentá la disposición, las advertencias y las citas que trae el resultado de especificacion_grafico.";
  try {
    await app.updateModelContext({ content: [{ type: "text", text: texto }] });
    fila("Aviso al modelo (updateModelContext)", "enviado", true);
    registrar("updateModelContext", texto);
  } catch (e) {
    fila("Aviso al modelo (updateModelContext)", `falló: ${mensaje(e)}`, false);
  }
}

/**
 * Muestra un resultado de especificacion_grafico. `prefijo` separa las filas del botón «Otro período» de las de la
 * llamada del modelo. Devuelve si se dibujó.
 */
async function mostrar(r: Resultado, prefijo: string, args: Record<string, unknown> | undefined): Promise<boolean> {
  const sc = r.structuredContent;
  fila(`${prefijo}Resultado recibido`, `${JSON.stringify(r).length.toLocaleString("es-AR")} caracteres`, !r.isError && !!sc);
  if (r.isError) {
    fila(`${prefijo}structuredContent`, `error de la herramienta: ${textoDe(r) || "(sin mensaje)"}`, false);
    return false;
  }
  if (!sc) {
    fila(`${prefijo}structuredContent`, "no llegó (sin isError: ¿el host lo mandó a un archivo?)", false);
    return false;
  }
  const spec = sc.especificacion as Record<string, unknown> | undefined;
  const disp = sc.disposicion as { tipo?: string } | undefined;
  fila(`${prefijo}structuredContent`, `disposición ${disp?.tipo ?? "?"}, ${String(sc.n_observaciones)} observaciones, especificación de ${spec ? JSON.stringify(spec).length.toLocaleString("es-AR") : 0} caracteres`, !!spec);
  if (!spec) return false;
  ultimo = sc;
  vistaInterprete = await dibujar("con-interprete", spec, true);
  const sin = await dibujar("sin-interprete", spec, false);
  if (vistaInterprete && sin) {
    const [a, b] = (await Promise.all([vistaInterprete.toSVG(), sin.toSVG()])).map(sinIds);
    fila("SVG con y sin intérprete (sin los id internos)", a === b ? "iguales" : `distintos, ${primeraDiferencia(a, b)}`, a === b);
  }
  listarEventos(sc.eventos as Evento[] | undefined);
  if (vistaInterprete) await avisarAlModelo(sc, args);
  return !!vistaInterprete;
}

// 3. El host.
const app = new App({ name: "Vaivén · gráfico (sonda 4e)", version: VERSION_SONDA }, {}, { autoResize: true });

function contexto(c: McpUiHostContext | undefined): void {
  if (!c) return;
  if (c.theme) applyDocumentTheme(c.theme);
  fila("Tema del host (hostContext.theme)", c.theme ?? "no informa");
  if (c.locale) fila("Idioma del host", c.locale);
  if (c.displayMode) fila("Modo de presentación", `${c.displayMode} (disponibles: ${(c.availableDisplayModes ?? []).join(", ") || "?"})`);
  if (c.containerDimensions) fila("Contenedor", JSON.stringify(c.containerDimensions));
  if (c.platform) fila("Plataforma", String(c.platform));
}

/** Lo que cambió, en corto: los valores simples tal cual; los objetos, solo su nombre. */
function resumenCambio(p: Record<string, unknown>): string {
  return Object.entries(p).map(([k, v]) => (v === null || typeof v !== "object" ? `${k}: ${String(v)}` : `${k}: (${Array.isArray(v) ? "lista" : "objeto"})`)).join(", ") || "(vacío)";
}

const botonPeriodo = $<HTMLButtonElement>("otro-periodo");
/** Diez años antes, o 2000 si no había `desde`. */
function otroDesde(desde: unknown): string {
  const anio = typeof desde === "string" ? Number(desde.slice(0, 4)) : NaN;
  return Number.isFinite(anio) ? String(anio - 10) : "2000";
}
const rotularBoton = () => { botonPeriodo.textContent = `Ver desde ${otroDesde(argumentos?.desde)} (llama otra vez a la herramienta)`; };

app.addEventListener("toolinput", (p) => {
  argumentos = p.arguments as Record<string, unknown>;
  fila("Argumentos de la llamada", JSON.stringify(argumentos));
  rotularBoton();
  registrar("toolinput", `${Object.keys(argumentos ?? {}).join(", ")}`);
});
app.addEventListener("toolresult", (p) => {
  registrar("toolresult", `${JSON.stringify(p).length} caracteres${(p as Resultado).isError ? ", isError" : ""}`);
  void mostrar(p as Resultado, "", argumentos);
});
app.addEventListener("hostcontextchanged", (p) => {
  registrar("hostcontextchanged", resumenCambio(p as Record<string, unknown>));
  contexto({ ...app.getHostContext(), ...p });
});

try {
  await app.connect();
  const host = app.getHostVersion();
  fila("Host", `${host?.name ?? "?"} ${host?.version ?? ""}`.trim(), true);
  const cap = app.getHostCapabilities() ?? {};
  fila("Capacidades del host", Object.keys(cap).join(", ") || "ninguna");
  for (const k of ["downloadFile", "openLinks", "serverTools", "updateModelContext"] as const) fila(k, cap[k] ? "sí" : "no", !!cap[k]);
  contexto(app.getHostContext());
  rotularBoton();
} catch (e) {
  fila("Host", `no se pudo conectar: ${mensaje(e)}`, false);
}

// 4. Las acciones de la SPEC 7.4, más copiar los resultados.
botonPeriodo.addEventListener("click", async () => {
  const args = { ...(argumentos ?? { series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "reservas" }] }) };
  args.desde = otroDesde(args.desde);
  fila("Otro período: pedido", `desde ${String(args.desde)}${args.hasta ? ` hasta ${String(args.hasta)}` : ""}`);
  registrar("callServerTool", `especificacion_grafico desde ${String(args.desde)}`);
  try {
    const r = (await app.callServerTool({ name: "especificacion_grafico", arguments: args })) as Resultado;
    // Solo avanza si la herramienta respondió bien: con un error, el período sigue siendo el anterior.
    const dibujo = await mostrar(r, "Otro período: ", args);
    if (dibujo) {
      argumentos = args;
      rotularBoton();
    }
    fila("Otro período: resultado", dibujo ? `se dibujó desde ${String(args.desde)}` : `no cambió: ${r.isError ? textoDe(r) : "sin gráfico"}`, dibujo);
  } catch (e) {
    fila("Otro período: resultado", `falló la llamada: ${mensaje(e)}`, false);
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

$("copiar").addEventListener("click", async () => {
  const datos = {
    sonda: VERSION_SONDA, fecha: new Date().toISOString(), host: app.getHostVersion(),
    filas: [...filas.rows].map((tr) => ({ fila: tr.cells[0].textContent, valor: tr.cells[1].textContent, estado: tr.cells[1].className || undefined })),
    registro,
  };
  const json = JSON.stringify(datos, null, 1);
  try {
    await navigator.clipboard.writeText(json);
    fila("Copiar resultados", "copiados al portapapeles", true);
  } catch (e) {
    // Si el host no da permiso de portapapeles, el JSON queda seleccionado para copiarlo a mano (Cmd+C).
    const caja = $<HTMLTextAreaElement>("copia");
    caja.value = json;
    caja.hidden = false;
    caja.focus();
    caja.select();
    fila("Copiar resultados", `sin permiso de portapapeles (${mensaje(e)}): el JSON está abajo, seleccionado; copialo con Cmd+C`, false);
  }
});
