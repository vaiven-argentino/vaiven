// La interfaz de especificacion_grafico en Claude (ui://vaiven/grafico, SPEC 7.4, fase 4e). No arma especificaciones:
// dibuja la que devuelve la herramienta y, para cambiar la vista (período, transformación, sombreado, eventos,
// leyenda, paneles, tema), la vuelve a pedir con callServerTool. Las opciones salen de describir_serie y de
// paquetes/grafico; el dibujo y la imagen, de web/src/graficos/vega.ts, como en la web.
import { App, applyDocumentTheme, type McpUiHostContext } from "@modelcontextprotocol/ext-apps/app-with-deps";
import { NOMBRE_TRANSFORMACION, unidadVisible } from "@vaiven/grafico/formato";
import { OPCIONES_SOMBREADO, nombreSombreado } from "@vaiven/grafico/periodos";
import { dibujarEn, imagenDe, type VistaGrafico } from "../../web/src/graficos/vega";

type Args = Record<string, unknown> & { series?: Array<Record<string, unknown>> };
interface Resultado { structuredContent?: Respuesta; content?: Array<{ type: string; text?: string }>; isError?: boolean }
interface Respuesta {
  especificacion: Record<string, unknown>;
  url_explorador: string;
  disposicion: { tipo: string; paneles: Array<{ unidad: string; series: number[]; escala: string }> };
  series: Array<{ numero: number; id: string; nombre: string; nombre_variante: string; unidad: string; transformacion?: string; cita: string; advertencias?: unknown[] }>;
  advertencias_combinacion: Array<{ id: string; descripcion: string }>;
  eventos?: Array<{ letra: string; fecha: string; nombre: string }>;
  quiebres: Array<{ numero: number; serie: number; descripcion: string; desde: string | null; hasta: string | null }>;
  nombre_archivo: string;
  n_observaciones: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const estadoTexto = $("estado");
const contenedor = $("grafico");

let args: Args = {};
let ultima: Respuesta | undefined;
let vista: VistaGrafico | undefined;
let tema: "claro" | "oscuro" = matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
let pidiendo = false;
/** El tema con que el modelo pidió la vista (casi siempre ninguno: claro). */
let temaPedido: unknown;

function estado(texto: string, error = false): void {
  estadoTexto.textContent = texto;
  if (error) estadoTexto.dataset.tipo = "error";
  else delete estadoTexto.dataset.tipo;
}

const textoDe = (r: Resultado) => (r.content ?? []).map((c) => c.text ?? "").join(" ").trim();
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── El host ──
const app = new App({ name: "Vaivén · gráfico", version: "1.0.0" }, {}, { autoResize: true });

/** El tema del host (si lo informa) y, si no, el del sistema (SPEC 7.4). */
function temaDe(c: McpUiHostContext | undefined): "claro" | "oscuro" {
  if (c?.theme) return c.theme === "dark" ? "oscuro" : "claro";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
}

function aplicarTema(t: "claro" | "oscuro"): void {
  tema = t;
  applyDocumentTheme(t === "oscuro" ? "dark" : "light");
}

// ── Dibujar una respuesta ──
async function mostrar(r: Respuesta, avisar = true): Promise<void> {
  ultima = r;
  vista?.finalize();
  contenedor.replaceChildren();
  vista = await dibujarEn(contenedor, r.especificacion, { ast: true });
  // Dos variantes de la misma serie se distinguen por su variante, como en el gráfico.
  const nombres = r.series.map((s) => (r.series.filter((x) => x.nombre === s.nombre).length > 1 ? `${s.nombre} · ${s.nombre_variante}` : s.nombre));
  $("titulo").textContent = nombres.join(" · ");
  const paneles = r.disposicion.paneles;
  const disposicion = r.disposicion.tipo === "doble_eje" ? "Doble eje" : r.disposicion.tipo === "paneles" ? `${paneles.length} paneles` : "Un gráfico";
  const unidades = paneles.map((p) => `${unidadVisible(p.unidad)}${p.escala === "log" ? " (escala logarítmica)" : ""}`).join(" · ");
  $("subtitulo").textContent = `${disposicion} · ${unidades}`;
  for (const id of ["abrir", "bajar-png", "bajar-svg"]) $<HTMLButtonElement>(id).disabled = false;
  listas(r);
  controles(r);
  estado("");
  if (avisar) void avisarAlModelo(r);
}

/** Las listas de debajo del gráfico: los quiebres numerados y los avisos, los eventos y las citas. */
function listas(r: Respuesta): void {
  const li = (marca: string, texto: string) => {
    const el = document.createElement("li");
    if (marca) el.append(Object.assign(document.createElement("span"), { className: "marca", textContent: marca }));
    el.append(texto);
    return el;
  };
  const circulo = (n: number) => (n >= 1 && n <= 20 ? String.fromCodePoint(0x245f + n) : `(${n})`);
  const avisos = [
    ...r.quiebres.map((q) => li(circulo(q.numero), `${r.series.length > 1 ? `Serie ${q.serie}: ` : ""}${q.descripcion}`)),
    ...r.advertencias_combinacion.map((a) => li("", a.descripcion)),
  ];
  $("avisos").replaceChildren(...avisos);
  $("cantidad-avisos").textContent = String(avisos.length);
  $("caja-avisos").hidden = !avisos.length;
  const eventos = r.eventos ?? [];
  $("lista-eventos").replaceChildren(...eventos.map((e) => li(`${e.letra}.`, `${e.fecha.split("-").reverse().join("/")} · ${e.nombre}`)));
  $("cantidad-eventos").textContent = String(eventos.length);
  $("caja-eventos").hidden = !eventos.length;
  $("citas").replaceChildren(...r.series.map((s) => li(r.series.length > 1 ? `${s.numero}.` : "", s.cita)));
  $("caja-citas").hidden = !r.series.length;
}

// ── Controles ──
const transformacionesPorSerie = new Map<string, Promise<string[]>>();

/** Las transformaciones que admite la variante (describir_serie): no hay una segunda lista en la interfaz. */
function transformacionesDe(id: string, variante: string | undefined): Promise<string[]> {
  const clave = `${id}·${variante ?? ""}`;
  if (!transformacionesPorSerie.has(clave)) {
    transformacionesPorSerie.set(clave, app.callServerTool({ name: "describir_serie", arguments: { id } }).then((r) => {
      const d = JSON.parse(textoDe(r as Resultado)) as { variantes: Array<{ id: string; es_por_defecto: boolean; transformaciones?: string[] }> };
      const v = d.variantes.find((x) => (variante ? x.id === variante : x.es_por_defecto));
      return v?.transformaciones ?? [];
    }).catch(() => []));
  }
  return transformacionesPorSerie.get(clave)!;
}

function controles(r: Respuesta): void {
  $<HTMLInputElement>("desde").value = typeof args.desde === "string" ? args.desde : "";
  $<HTMLInputElement>("hasta").value = typeof args.hasta === "string" ? args.hasta : "";
  const sombreado = $<HTMLSelectElement>("sombreado");
  if (sombreado.options.length === 1) {
    for (const sh of OPCIONES_SOMBREADO) sombreado.append(new Option(nombreSombreado(sh), sh));
  }
  sombreado.value = typeof args.sombreado === "string" ? args.sombreado : "";
  $<HTMLInputElement>("eventos").checked = args.eventos === true || Array.isArray(args.eventos);
  const varias = r.series.length > 1;
  $("campo-leyenda").hidden = !varias;
  $<HTMLInputElement>("leyenda").checked = args.leyenda === true;
  const dosUnidades = new Set(r.disposicion.paneles.map((p) => p.unidad)).size === 2 && r.disposicion.paneles.length === 2;
  $("campo-paneles").hidden = !dosUnidades;
  $<HTMLInputElement>("paneles").checked = args.ejes === "paneles";
  // Una lista de transformaciones por serie, con las que admite su variante.
  const caja = $("transformaciones");
  caja.replaceChildren(...(args.series ?? []).map((s, k) => {
    const label = document.createElement("label");
    label.textContent = r.series.length > 1 ? `${k + 1}. Transformación` : "Transformación";
    const select = document.createElement("select");
    select.dataset.serie = String(k);
    const actual = typeof s.transformacion === "string" ? s.transformacion : "";
    select.append(new Option(actual ? NOMBRE_TRANSFORMACION[actual] ?? actual : "La inicial de la serie", actual));
    select.disabled = true;
    void transformacionesDe(String(s.id), typeof s.variante === "string" ? s.variante : undefined).then((lista) => {
      select.replaceChildren(new Option("La inicial de la serie", ""), ...lista.map((t) => new Option(NOMBRE_TRANSFORMACION[t] ?? t, t)));
      select.value = actual;
      select.disabled = false;
    });
    label.append(select);
    return label;
  }));
}

/** Los argumentos que piden los controles, sobre los de la última vista. */
function argsDeControles(): Args {
  const nuevo: Args = { ...args, series: (args.series ?? []).map((s) => ({ ...s })) };
  const valor = (id: string) => $<HTMLInputElement>(id).value.trim();
  for (const campo of ["desde", "hasta"] as const) {
    if (valor(campo)) nuevo[campo] = valor(campo);
    else delete nuevo[campo];
  }
  const sh = $<HTMLSelectElement>("sombreado").value;
  if (sh) nuevo.sombreado = sh;
  else delete nuevo.sombreado;
  if ($<HTMLInputElement>("eventos").checked) nuevo.eventos = Array.isArray(args.eventos) ? args.eventos : true;
  else delete nuevo.eventos;
  if ($<HTMLInputElement>("leyenda").checked) nuevo.leyenda = true;
  else delete nuevo.leyenda;
  if ($<HTMLInputElement>("paneles").checked) nuevo.ejes = "paneles";
  else delete nuevo.ejes;
  for (const select of $("transformaciones").querySelectorAll<HTMLSelectElement>("select")) {
    const s = nuevo.series![Number(select.dataset.serie)];
    if (select.value) s.transformacion = select.value;
    else delete s.transformacion;
  }
  return nuevo;
}

/** Vuelve a pedir la vista. Si la herramienta da error, se muestra el mensaje y la vista no cambia. */
async function pedir(nuevo: Args, motivo = "Actualizando el gráfico…"): Promise<boolean> {
  if (pidiendo) return false;
  pidiendo = true;
  estado(motivo);
  try {
    const r = (await app.callServerTool({ name: "especificacion_grafico", arguments: { ...nuevo, tema } })) as Resultado;
    if (r.isError || !r.structuredContent) {
      estado(textoDe(r) || "La herramienta no devolvió el gráfico.", true);
      if (ultima) controles(ultima);
      return false;
    }
    args = nuevo;
    await mostrar(r.structuredContent);
    return true;
  } catch (e) {
    estado(`No se pudo pedir el gráfico: ${mensaje(e)}`, true);
    return false;
  } finally {
    pidiendo = false;
  }
}

$<HTMLFormElement>("controles").addEventListener("submit", (e) => e.preventDefault());
$<HTMLFormElement>("controles").addEventListener("change", () => void pedir(argsDeControles()));

// ── Acciones ──
$("abrir").addEventListener("click", async () => {
  if (!ultima) return;
  const r = await app.openLink({ url: ultima.url_explorador });
  if (r.isError) estado("Claude no abrió el enlace. Está en el texto de la respuesta.", true);
});

async function bajar(formato: "png" | "svg"): Promise<void> {
  if (!ultima || !app.getHostCapabilities()?.downloadFile) {
    estado("Este cliente no permite descargas desde la interfaz: usá «Abrir en el explorador».", true);
    return;
  }
  estado("Preparando la imagen…");
  try {
    // La imagen de 900 px, con título y pie (fuentes, licencia y enlace): la misma que baja el explorador (A3).
    const r = (await app.callServerTool({ name: "especificacion_grafico", arguments: { ...args, tema, imagen: true } })) as Resultado;
    if (r.isError || !r.structuredContent) return estado(textoDe(r) || "No se pudo armar la imagen.", true);
    const imagen = await imagenDe(r.structuredContent.especificacion, formato, { ast: true });
    const nombre = `${r.structuredContent.nombre_archivo}.${formato}`;
    const resource = formato === "svg"
      ? { uri: `file:///${nombre}`, mimeType: "image/svg+xml", text: imagen }
      : { uri: `file:///${nombre}`, mimeType: "image/png", blob: imagen.replace(/^data:image\/png;base64,/, "") };
    const d = await app.downloadFile({ contents: [{ type: "resource", resource }] });
    estado(d.isError ? "La descarga se canceló." : "");
  } catch (e) {
    estado(`No se pudo bajar la imagen: ${mensaje(e)}`, true);
  }
}
$("bajar-png").addEventListener("click", () => void bajar("png"));
$("bajar-svg").addEventListener("click", () => void bajar("svg"));

$("pantalla").addEventListener("click", async () => {
  const actual = app.getHostContext()?.displayMode;
  const r = await app.requestDisplayMode({ mode: actual === "fullscreen" ? "inline" : "fullscreen" });
  $("pantalla").textContent = r.mode === "fullscreen" ? "Salir de pantalla completa" : "Pantalla completa";
});

/** Le avisa al modelo que el gráfico ya está a la vista, para que no lo vuelva a dibujar (A1 de la 4e). */
async function avisarAlModelo(r: Respuesta): Promise<void> {
  if (!app.getHostCapabilities()?.updateModelContext) return;
  const desde = typeof args.desde === "string" ? args.desde : "el primer dato";
  const hasta = typeof args.hasta === "string" ? args.hasta : "el último dato";
  const texto = `Vaivén: el gráfico ya se mostró al usuario en la interfaz interactiva de Vaivén (${r.disposicion.tipo}, `
    + `${r.series.length} ${r.series.length === 1 ? "serie" : "series"}, desde ${desde} hasta ${hasta}${tema === "oscuro" ? ", en modo oscuro" : ""}; `
    + `enlace: ${r.url_explorador}). No lo vuelvas a dibujar ni pidas los datos para graficarlo: comentá la disposición, `
    + "las advertencias y las citas que trae el resultado de especificacion_grafico.";
  try {
    await app.updateModelContext({ content: [{ type: "text", text: texto }] });
  } catch {
    // Sin el aviso, el texto de la respuesta ya le dice al modelo qué hacer.
  }
}

// ── Lo que manda el host ──
app.addEventListener("toolinput", (p) => {
  args = { ...(p.arguments as Args) };
  // El tema lo elige la interfaz (el de Claude): no se arrastra el del pedido.
  temaPedido = args.tema;
  delete args.tema;
  delete args.imagen;
});
app.addEventListener("toolresult", (p) => {
  const r = p as Resultado;
  if (r.isError || !r.structuredContent) {
    estado(textoDe(r) || "La herramienta no devolvió el gráfico.", true);
    return;
  }
  // El modelo pide la vista en claro: si Claude está en modo oscuro, se vuelve a pedir con los colores oscuros.
  if ((temaPedido === "oscuro" ? "oscuro" : "claro") !== tema) {
    // El aviso al modelo va con la vista que queda (la del tema de Claude), no con la intermedia.
    void mostrar(r.structuredContent, false).then(() => pedir(args, tema === "oscuro" ? "Pasando el gráfico a modo oscuro…" : "Pasando el gráfico a modo claro…"));
  } else {
    void mostrar(r.structuredContent);
  }
});
app.addEventListener("hostcontextchanged", (p) => {
  const nuevo = temaDe({ ...app.getHostContext(), ...p });
  if (nuevo !== tema) {
    aplicarTema(nuevo);
    if (ultima) void pedir(args, nuevo === "oscuro" ? "Pasando el gráfico a modo oscuro…" : "Pasando el gráfico a modo claro…");
  }
});

try {
  await app.connect();
  const c = app.getHostContext();
  aplicarTema(temaDe(c));
  $("pantalla").hidden = !(c?.availableDisplayModes ?? []).includes("fullscreen");
} catch (e) {
  estado(`No se pudo conectar con Claude: ${mensaje(e)}`, true);
}
