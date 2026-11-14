// Explorador (SPEC 6.2): de una a cuatro series. Arma los controles según lo que admite la variante elegida, pide los
// datos a /datos/ y guarda todo en la URL. La URL se lee con `seriesDeUrl` y `vistaDesdeUrl` y se escribe con
// `urlDesdeVista`; el gráfico lo arma `armarVista`, la misma función que usa `especificacion_grafico` del MCP (con una
// serie, el gráfico de la 4b). Los controles, por ahora, editan la serie 1.
import { apa, bibtex, citaRegistro, NOMBRE_DENOMINADOR, nombreTransformacion, textoCita } from "@vaiven/cita";
import {
  REGLA_UBICACION, atraso, disponibles, fechaDeDibujo, rangoLegible, referenciaDe, tienePais,
  type Comparacion, type ContextoUbicacion, type DocumentoEventos, type DocumentoPeriodos, type Periodo, type Resultado, type Transformacion,
} from "@vaiven/transformaciones";
import { alinearVista, armarVista, compararVista, lecturasGuia, nombreSombreadoEnFrase, type Vista } from "@vaiven/grafico";
import { csvDeVista, hojasXlsx, type VistaDescarga } from "../lib/descarga";
import {
  MAX_PAISES, MEDIAS, opcionesDe, porDefecto, serieVista, seriesDeUrl, urlDesdeEstado, urlDesdeVista, vistaDesdeUrl,
  type Documento, type Estado, type EstadoVista, type IndiceSerie,
} from "../lib/estado";
import { esVariacion, rangoQuiebre, type QuiebreNumerado } from "../lib/ficha";
import { NOMBRE_MEDIDA, NOMBRE_TIPO_QUIEBRE, NOMBRE_TRANSFORMACION, diaDeVersion, fechaCorta, fechaLegible, numero, textoAtraso, ultimoDato } from "../lib/formato";
import { bajar, bajarTexto, cargarInsumos, dibujarEn, exportarImagen, leerDatos, licenciaImagen, tema, type Cargados, type VistaGrafico } from "./comun";
import { diaLegible, modoEventosDe, type BandaEpisodio, type MarcaEvento, type ModoEventos } from "./espec";
import {
  ACLARACION_ETAPAS, EPISODIO, enFrase, avisoConfianza, avisoFiltroEventos, columnasDe, contextoDe, textoConfianza, textoLectura,
  ubicacionesDe, type ColumnasPeriodo,
} from "../lib/periodos";
import { conectarLector, type Lectura } from "./lector";

type DocumentoCompleto = Documento & {
  nombre: string; nombre_variante: string; variante: string; serie: string; codigo: string; version_datos: string; cita: string;
  empalme: "encadenar_tasas" | "yuxtaponer" | "derivar"; fuentes: Array<{ organismo: string; nombre: string; licencia: string; url: string }>;
  licencia: string; es_variante_por_defecto: boolean;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface DatosPagina {
  series: IndiceSerie[];
  tipos: Array<{ id: string; nombre: string }>;
  etapas: Array<{ id: string; nombre: string; desde: string; hasta: string | null }>;
  /** Categorías de eventos.json, para el filtro de eventos (parámetro `ev`). */
  categorias: Array<{ id: string; nombre: string }>;
  version_sitio: string;
}

/** Desde este ancho, el explorador va en dos columnas: el panel de controles a la izquierda y el gráfico (SPEC 6.2). */
const ESCRITORIO = "(min-width: 1100px)";
/** Por debajo de 600 px, dos unidades van en paneles por defecto (SPEC 6.5). */
const ANGOSTO = "(max-width: 599px)";

const COLUMNA_PERIODO: Record<string, string> = {
  gobierno: "Gobierno", mandato: "Gobierno (mandato)", ministro: "Ministro de Economía", plan: "Plan", regimen_cambiario: "Régimen cambiario",
};

function iniciar(): void {
  const nodo = document.getElementById("x-datos");
  if (!nodo?.textContent) return;
  const pagina = JSON.parse(nodo.textContent) as DatosPagina;
  const indice = pagina.series;
  const nombreSombreado = (sh: string) => nombreSombreadoEnFrase(sh as never, pagina.tipos);
  const columnaPeriodo = (sh: string) => sh === "catedra" ? "Etapa" : COLUMNA_PERIODO[sh];
  // El filtro de eventos: las categorías de eventos.json y, al final, los episodios.
  const CATEGORIAS = [...pagina.categorias.map((k) => k.id), EPISODIO];

  const c = {
    serie: $<HTMLSelectElement>("x-serie"), variante: $<HTMLSelectElement>("x-variante"),
    campoPaises: $<HTMLFieldSetElement>("x-campo-paises"), paises: $<HTMLDivElement>("x-paises"), resaltado: $<HTMLSelectElement>("x-resaltado"),
    campoPesos: $<HTMLLabelElement>("x-campo-pesos"), pesos: $<HTMLInputElement>("x-pesos"),
    campoMedida: $<HTMLDivElement>("x-campo-medida"), medida: $<HTMLSelectElement>("x-medida"),
    campoDeflactor: $<HTMLDivElement>("x-campo-deflactor"), deflactor: $<HTMLSelectElement>("x-deflactor"),
    campoPib: $<HTMLDivElement>("x-campo-pib"), pib: $<HTMLSelectElement>("x-pib"),
    transformacion: $<HTMLSelectElement>("x-transformacion"),
    campoBase: $<HTMLDivElement>("x-campo-base"), base: $<HTMLInputElement>("x-base"),
    campoFrecuencia: $<HTMLDivElement>("x-campo-frecuencia"), frecuencia: $<HTMLSelectElement>("x-frecuencia"),
    campoMedia: $<HTMLDivElement>("x-campo-media"), media: $<HTMLSelectElement>("x-media"),
    desde: $<HTMLInputElement>("x-desde"), hasta: $<HTMLInputElement>("x-hasta"),
    etapa: document.getElementById("x-etapa") as HTMLSelectElement | null,
    campoLog: $<HTMLLabelElement>("x-campo-log"), log: $<HTMLInputElement>("x-log"),
    sombreado: $<HTMLSelectElement>("x-sombreado"), eventos: $<HTMLInputElement>("x-eventos"),
    campoCategorias: $<HTMLFieldSetElement>("x-categorias"),
    categorias: [...document.querySelectorAll<HTMLInputElement>("#x-categorias input[data-categoria]")],
  };
  const estadoTexto = $<HTMLParagraphElement>("x-estado");
  const contenedor = $<HTMLDivElement>("x-grafico");

  const documentos = new Map<string, DocumentoCompleto>();
  const cargados: Cargados = { series: {} };
  let registroPeriodos: DocumentoPeriodos | null = null;
  let registroEventos: DocumentoEventos | null = null;
  /** La vista: una o más series (los controles editan la serie 1, `estado`, con su documento, `doc`). */
  let vistaEstado!: EstadoVista;
  let docs: DocumentoCompleto[] = [];
  /** El color de cada serie (índice de la paleta): sigue a la serie, no a su posición (SPEC 6.2). */
  let colores: number[] = [];
  let doc!: DocumentoCompleto;
  let estado!: Estado;
  let avisosUrl: string[] = [];
  /** Fija la vista entera y sus atajos a la serie 1. */
  function fijarVista(v: EstadoVista, ds: DocumentoCompleto[]): void {
    vistaEstado = v;
    docs = ds;
    if (colores.length !== ds.length) colores = ds.map((_, k) => k);
    estado = v.series[0];
    doc = ds[0];
  }
  const varias = () => vistaEstado.series.length > 1;

  document.querySelectorAll<HTMLElement>("[data-requiere-js]").forEach((el) => (el.hidden = false));
  // En escritorio, «Opciones del gráfico» queda siempre abierto (su título se oculta) y las secciones se pliegan a mano.
  // En pantallas chicas las secciones van siempre abiertas y sin título, como antes; el panel arranca cerrado en 700 px o
  // menos, para que el gráfico quede a la vista (SPEC 6.5).
  const escritorio = window.matchMedia(ESCRITORIO);
  const panel = $<HTMLDetailsElement>("x-panel");
  const secciones = [...document.querySelectorAll<HTMLDetailsElement>("#x-controles details.seccion")];
  function acomodarPanel(): void {
    if (escritorio.matches) panel.open = true;
    else secciones.forEach((d) => (d.open = true));
  }
  if (window.matchMedia("(max-width: 700px)").matches) panel.open = false;
  acomodarPanel();
  escritorio.addEventListener("change", () => { acomodarPanel(); void dibujar(); });
  const angosto = window.matchMedia(ANGOSTO);
  // Cambia la disposición con dos unidades (paneles por defecto en el celular): se vuelve a comparar.
  angosto.addEventListener("change", () => void actualizar());

  async function documento(s: string, v: string): Promise<DocumentoCompleto> {
    const clave = `${s}.${v}`;
    if (!documentos.has(clave)) {
      const archivo = indice.find((x) => x.id === s)!.variantes.find((x) => x.id === v)!.archivo;
      documentos.set(clave, await leerDatos<DocumentoCompleto>(archivo));
    }
    return documentos.get(clave)!;
  }

  // ---- Controles: se arman según lo que admite la variante ----
  const opcion = (valor: string, texto: string, elegido = false) => Object.assign(document.createElement("option"), { value: valor, textContent: texto, selected: elegido });

  function armarControles(): void {
    const s = indice.find((x) => x.id === estado.s)!;
    c.serie.value = estado.s;
    c.variante.replaceChildren(...s.variantes.map((v) => opcion(v.id, v.nombre, v.id === estado.v)));
    c.campoPaises.hidden = !tienePais(doc);
    if (tienePais(doc)) {
      c.paises.replaceChildren(...doc.entidades.map((ent) => {
        const etiqueta = Object.assign(document.createElement("label"), { className: "casilla" });
        const caja = Object.assign(document.createElement("input"), { type: "checkbox", value: ent.id, checked: estado.p.includes(ent.id) });
        caja.dataset.pais = ent.id;
        etiqueta.append(caja, ` ${ent.nombre}`);
        return etiqueta;
      }));
      c.resaltado.replaceChildren(...estado.p.map((id) => opcion(id, nombrePais(id), id === estado.p[0])));
    }
    const serie = serieVista(doc, estado.p);
    const base = disponibles(serie);
    const disp = disponibles(serie, { pesosActuales: estado.pa });
    c.campoPesos.hidden = !base.medidas.includes("pesos_actuales");
    c.pesos.checked = estado.pa;
    const medidas = disp.medidas.filter((m) => m !== "pesos_actuales") as Array<"real" | "en_dolares" | "pct_pib">;
    c.campoMedida.hidden = !medidas.length;
    c.medida.replaceChildren(opcion("", "Nominal (como se publica)", !estado.m), ...medidas.map((m) => opcion(m, NOMBRE_MEDIDA[m], m === estado.m)));
    c.campoDeflactor.hidden = estado.m !== "real" || !disp.deflactores.length;
    c.deflactor.replaceChildren(...disp.deflactores.map((o, k) => opcion(o.id, o.nombre ?? o.id, estado.d ? o.id === estado.d : k === 0)));
    c.campoPib.hidden = estado.m !== "pct_pib" || disp.denominadores.length < 2;
    const pibDef = serie.insumos?.pct_pib?.opciones.find((o) => o.id === serie.insumos?.pct_pib?.por_defecto)?.denominador;
    c.pib.replaceChildren(...disp.denominadores.map((d) => opcion(d, NOMBRE_DENOMINADOR[d] ?? d, d === (estado.pib || pibDef))));
    c.transformacion.replaceChildren(...disp.transformaciones.map((t) => opcion(t, NOMBRE_TRANSFORMACION[t], t === estado.t)));
    c.campoBase.hidden = estado.t !== "base_100" && estado.t !== "indice_desde_tasas";
    c.base.value = estado.base;
    c.base.placeholder = estado.t === "base_100" ? serie.datos[0]?.[0].slice(0, 4) ?? "" : "primer año";
    c.campoFrecuencia.hidden = !disp.frecuencias.length;
    c.frecuencia.replaceChildren(opcion("", "Original", !estado.f), ...disp.frecuencias.map((f) => opcion(f, f === "anual" ? "Anual" : "Trimestral", f === estado.f)));
    c.campoMedia.hidden = !disp.mediaMovil;
    c.media.value = estado.mm ? String(estado.mm) : "";
    c.desde.value = estado.desde;
    c.hasta.value = estado.hasta;
    if (c.etapa) c.etapa.value = etapaElegida() ?? "";
    c.log.checked = estado.log;
    c.sombreado.value = estado.sh;
    c.eventos.checked = estado.ev.length > 0;
    // Sin eventos, las casillas quedan todas marcadas (y deshabilitadas): «Marcar eventos» vuelve a marcar todo.
    c.campoCategorias.disabled = !estado.ev.length;
    c.categorias.forEach((k) => (k.checked = !estado.ev.length || estado.ev.includes(k.dataset.categoria!)));
  }

  const nombrePais = (id: string) => (tienePais(doc) ? doc.entidades.find((e) => e.id === id)?.nombre : undefined) ?? id;

  /** La etapa del curso que coincide con el período elegido, si coincide con alguna. */
  function etapaElegida(): string | undefined {
    return pagina.etapas.find((e) => e.desde.slice(0, 7) === estado.desde && mesFinal(e.hasta) === estado.hasta)?.id;
  }
  /** El último mes de un período que termina (excluido) en `hasta`: el 10/12/1983 → 1983-12; el 1/4/1991 → 1991-03. */
  function mesFinal(hasta: string | null): string {
    if (!hasta) return "";
    const [a, m, d] = hasta.split("-").map(Number);
    if (d > 1) return `${a}-${String(m).padStart(2, "0")}`;
    return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  }

  /** Lee los controles y arma el estado (la serie y la variante se manejan aparte). */
  function leerControles(): void {
    if (tienePais(doc)) {
      const marcados = [...c.paises.querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value);
      const resaltado = marcados.includes(c.resaltado.value) ? c.resaltado.value : marcados[0];
      estado.p = resaltado ? [resaltado, ...marcados.filter((x) => x !== resaltado)].slice(0, MAX_PAISES) : estado.p;
    }
    estado.pa = !c.campoPesos.hidden && c.pesos.checked;
    estado.m = (c.campoMedida.hidden ? "" : c.medida.value) as Estado["m"];
    estado.d = estado.m === "real" && c.deflactor.selectedIndex > 0 ? c.deflactor.value : "";
    estado.pib = estado.m === "pct_pib" && c.pib.selectedIndex > 0 ? c.pib.value : "";
    estado.t = (c.transformacion.value || "nivel") as Transformacion;
    estado.base = /^\d{4}(-\d{2})?$/.test(c.base.value.trim()) ? c.base.value.trim() : "";
    estado.f = (c.campoFrecuencia.hidden ? "" : c.frecuencia.value) as Estado["f"];
    estado.mm = (MEDIAS as readonly number[]).includes(Number(c.media.value)) && !c.campoMedia.hidden ? Number(c.media.value) : 0;
    estado.desde = /^\d{4}(-\d{2})?$/.test(c.desde.value.trim()) ? c.desde.value.trim() : "";
    estado.hasta = /^\d{4}(-\d{2})?$/.test(c.hasta.value.trim()) ? c.hasta.value.trim() : "";
    estado.log = c.log.checked;
    estado.sh = c.sombreado.value as Estado["sh"];
    // «Marcar eventos» con las categorías marcadas; si no queda ninguna, se apaga.
    estado.ev = c.eventos.checked ? c.categorias.filter((k) => k.checked).map((k) => k.dataset.categoria!) : [];
    // Lo que deja de tener sentido con la nueva elección: la librería decide qué queda disponible.
    const disp = disponibles(serieVista(doc, estado.p), { pesosActuales: estado.pa });
    if (!disp.transformaciones.includes(estado.t)) estado.t = "nivel";
    if (estado.f && !(disp.frecuencias as string[]).includes(estado.f)) estado.f = "";
    if (estado.m && !(disp.medidas as string[]).includes(estado.m)) estado.m = "";
    // % del PIB pide la frecuencia del PIB: si la serie es más fina, pasa sola a anual (como la ficha).
    const serie = serieVista(doc, estado.p);
    if (estado.m === "pct_pib" && !estado.f && !["anual", "trimestral"].includes(serie.frecuencia) && disp.frecuencias.includes("anual")) estado.f = "anual";
  }

  // ---- Vista ----
  interface Ultimo {
    /** La vista armada (sin el tamaño final: el gráfico se arma de nuevo al dibujar, con la misma comparación). */
    vista: Vista;
    comparacion: Comparacion;
    /** La serie 1 (con su primer país en las internacionales) y sus otros países. */
    r: Resultado; otras: Array<{ id: string; nombre: string; resultado: Resultado }>; quiebres: QuiebreNumerado[];
    periodos: Periodo[]; eventos: MarcaEvento[]; episodios: BandaEpisodio[];
    /** La transformación de cada serie, en palabras. */
    transformaciones: Array<string | undefined>; transformacion: string | undefined;
    contexto: ContextoUbicacion; totalEventos: number;
  }
  let ultimo: Ultimo | null = null;

  const entradaVista = (ancho: number, alto: number) => ({
    estado: vistaEstado, docs, insumos: cargados, periodos: registroPeriodos ?? undefined, eventos: registroEventos ?? undefined,
    tema: tema(), ancho, alto, angosto: angosto.matches, colores,
  });

  async function actualizar(): Promise<void> {
    const opciones = vistaEstado.series.map((e, k) => opcionesDe(e, serieVista(docs[k], e.p)));
    let comparacion: Comparacion;
    try {
      for (const [k, e] of vistaEstado.series.entries()) {
        await cargarInsumos(serieVista(docs[k], e.p), opciones[k], cargados, () => { estadoTexto.textContent = "Cargando los datos que necesita la medida…"; });
      }
      comparacion = compararVista({ estado: vistaEstado, docs, insumos: cargados, angosto: angosto.matches });
    } catch (err) {
      estadoTexto.textContent = err instanceof Error ? err.message : String(err);
      estadoTexto.dataset.tipo = "error";
      return;
    }
    estadoTexto.textContent = "";
    delete estadoTexto.dataset.tipo;
    // Los períodos y los eventos se leen recién cuando se piden.
    try {
      if (estado.sh || estado.ev.includes(EPISODIO)) registroPeriodos ??= await leerDatos<DocumentoPeriodos>("periodos.json");
      if (estado.ev.length) registroEventos ??= await leerDatos<DocumentoEventos>("eventos.json");
    } catch (err) {
      estadoTexto.textContent = `No se pudieron leer los períodos o los eventos (${err instanceof Error ? err.message : String(err)}).`;
    }
    const ancho = contenedor.clientWidth || 600;
    const vista = armarVista({ ...entradaVista(ancho, altoGrafico(ancho)), comparacion });
    const s0 = comparacion.series[0];
    const r = s0.resultados[s0.entidades[0]];
    const otras = s0.entidades.slice(1).map((id) => ({ id, nombre: nombrePais(id), resultado: s0.resultados[id] }));
    const transformaciones = vistaEstado.series.map((e, k) => {
      const o = opciones[k];
      return nombreTransformacion({ ...o, deflactor: o.deflactor ?? (o.medida === "real" ? serieVista(docs[k], e.p).insumos?.real?.por_defecto : undefined) });
    });
    ultimo = {
      vista, comparacion, r, otras, quiebres: vista.quiebres[0], periodos: vista.periodos, eventos: vista.eventos, episodios: vista.episodios,
      transformaciones, transformacion: transformaciones[0], contexto: contextoDe(serieVista(doc, estado.p).agregacion, opciones[0]),
      totalEventos: vista.totalEventos,
    };
    armarControles();
    const positivos = r.datos.every((d) => d[1] === null || d[1] > 0) && otras.every((x) => x.resultado.datos.every((d) => d[1] === null || d[1] > 0));
    c.log.disabled = !positivos;
    c.campoLog.classList.toggle("deshabilitado", !positivos);
    $("x-unidad").textContent = varias() ? "" : r.unidad;
    ultimoDatoSerie();
    leyendas();
    avisos();
    tabla();
    cita();
    botonEjes();
    $<HTMLAnchorElement>("x-ficha").href = urlFicha();
    history.replaceState(null, "", `${location.pathname}${urlDesdeVista(vistaEstado, docs, indice, CATEGORIAS)}${location.hash}`);
    resumenOpciones();
    void dibujar();
  }

  /** Con dos unidades (y sin serie internacional), el botón que pasa del doble eje a los paneles y al revés (SPEC 6.2). */
  function botonEjes(): void {
    const b = $<HTMLButtonElement>("x-ejes");
    const d = ultimo?.comparacion.disposicion;
    const alternativa = !!d && d.paneles.length === 2 && !d.paneles.some((p) => p.internacional);
    b.hidden = !alternativa;
    if (alternativa) b.textContent = d.tipo === "doble_eje" ? "Ver en paneles" : "Ver en doble eje";
  }

  /** El último dato de cada variante y su atraso respecto del calendario de la fuente, como en la ficha. */
  function ultimoDatoSerie(): void {
    const linea = (d0: DocumentoCompleto, prefijo: string): Array<Node | string> => {
      const d = d0 as DocumentoCompleto & { cobertura: { hasta: string }; tramos: Array<{ frecuencia: string }>; frecuencia: string };
      const version = [pagina.version_sitio, d.version_datos].sort().at(-1)!;
      const texto = textoAtraso(atraso(d as never, version));
      return [prefijo, Object.assign(document.createElement("strong"), {
        textContent: ultimoDato(d.cobertura.hasta, d.tramos.at(-1)?.frecuencia ?? d.frecuencia),
      }), ...(texto ? [Object.assign(document.createElement("span"), { className: "atraso", textContent: ` · ${texto}` })] : [])];
    };
    const nodo = $("x-ultimo");
    if (!varias()) { nodo.replaceChildren(...linea(doc, "Último dato de la serie: ")); return; }
    nodo.replaceChildren("Último dato: ", ...docs.flatMap((d, k) => [...(k ? ["; "] : []), ...linea(d, `${k + 1}. ${d.nombre}, `)]));
  }

  function resumenOpciones(): void {
    if (!ultimo) return;
    if (varias()) {
      const periodo = estado.desde || estado.hasta ? `${estado.desde || "inicio"}–${estado.hasta || "hoy"}` : "toda la serie 1";
      $("x-resumen-opciones").textContent = [docs.map((d) => d.nombre).join(", "), periodo, ...(estado.sh ? [`sombreado: ${nombreSombreado(estado.sh)}`] : [])].join(" · ");
      return;
    }
    const partes = [doc.nombre];
    if (tienePais(doc)) partes.push(estado.p.map(nombrePais).join(", "));
    if (ultimo.transformacion) partes.push(ultimo.transformacion);
    partes.push(estado.desde || estado.hasta ? `${estado.desde || "inicio"}–${estado.hasta || "hoy"}` : "toda la serie");
    if (estado.sh) partes.push(`sombreado: ${nombreSombreado(estado.sh)}`);
    $("x-resumen-opciones").textContent = partes.join(" · ");
  }

  /** El texto alternativo del gráfico (SPEC 6.5): el de la vista, con un resumen por panel si hay varias series. */
  const textoResumen = (): string => ultimo?.vista.descripcion ?? "";

  function leyendas(): void {
    if (!ultimo) return;
    const { periodos, eventos } = ultimo;
    $("x-resumen").textContent = textoResumen();
    const lp = $("x-leyenda-periodos");
    lp.hidden = !periodos.length;
    $("x-titulo-periodos").textContent = estado.sh ? `Períodos: ${nombreSombreado(estado.sh)}` : "Períodos";
    $("x-lista-periodos").replaceChildren(...periodos.map((p) => {
      const li = document.createElement("li");
      li.append(`${p.nombre}${p.caracter === "de_facto" ? " (de facto)" : p.caracter === "interino" ? " (interino)" : ""} `,
        Object.assign(document.createElement("span"), { className: "rango", textContent: rangoLegible(p) }));
      const aviso = avisoConfianza(p);
      if (aviso) li.append(" ", Object.assign(document.createElement("span"), { className: "a-confirmar", textContent: `⚠ ${aviso}` }));
      return li;
    }));
    const { episodios } = ultimo;
    const le = $("x-leyenda-eventos");
    le.hidden = !eventos.length && !episodios.length;
    const lep = $("x-lista-episodios");
    lep.hidden = !episodios.length;
    lep.replaceChildren(...episodios.map((x) => {
      const li = document.createElement("li");
      li.append(`${x.nombre} `, Object.assign(document.createElement("span"), { className: "rango", textContent: rangoLegible(x) }));
      if (x.fases?.length) li.append(` (${x.fases.map((f) => `${enFrase(f.nombre_corto)}: ${rangoLegible(f)}`).join("; ")})`);
      return li;
    }));
    listaEventos();
    const filtro = avisoFiltro();
    $("x-aviso-filtro").textContent = filtro;
    $("x-aviso-filtro").hidden = !filtro;
    const lpaises = $("x-leyenda-paises");
    // La serie internacional (puede no ser la 1): sus países, con la paleta de 8 de su panel.
    const ki = docs.findIndex((d) => tienePais(d));
    lpaises.hidden = ki < 0;
    if (ki >= 0) {
      const t = tema();
      const di = docs[ki], ei = vistaEstado.series[ki];
      const nombre = (id: string) => (tienePais(di) ? di.entidades.find((e) => e.id === id)?.nombre : undefined) ?? id;
      lpaises.replaceChildren(...ei.p.map((id, k) => {
        const s = document.createElement("span");
        const muestra = Object.assign(document.createElement("span"), { className: "muestra" });
        muestra.style.borderTopColor = t.paleta?.[k] ?? t.serie;
        muestra.setAttribute("aria-hidden", "true");
        s.append(muestra, k === 0 ? Object.assign(document.createElement("strong"), { textContent: nombre(id) }) : nombre(id));
        return s;
      }));
    }
  }

  /** El aviso de los eventos que deja afuera el filtro («Se muestran 12 de 30 eventos…»), o vacío. */
  function avisoFiltro(): string {
    return ultimo && estado.ev.length ? avisoFiltroEventos(ultimo.eventos.length, ultimo.totalEventos, estado.ev, pagina.categorias) : "";
  }

  /** Cómo se marcan los eventos en el gráfico de la pantalla: con letras o, si no hay lugar, con rayitas. */
  const modoActual = (): ModoEventos => (ultimo ? modoEventosDe(varias() && ultimo.vista.dominio ? ultimo.vista.dominio : ultimo.r, ultimo.eventos, contenedor.clientWidth || 600) : "letras");

  /** La lista de los eventos marcados, siempre completa: con su letra o, con rayitas, con la fecha. */
  function listaEventos(): void {
    if (!ultimo) return;
    const rayitas = modoActual() === "rayitas";
    const lista = $("x-lista-eventos");
    lista.classList.toggle("con-fechas", rayitas);
    lista.replaceChildren(...ultimo.eventos.map((e) => {
      const li = document.createElement("li");
      const fecha = Object.assign(document.createElement("span"), { className: "rango", textContent: diaLegible(e.fecha) });
      if (rayitas) li.append(fecha, ` · ${e.nombre}`);
      else li.append(`${e.nombre} `, fecha);
      return li;
    }));
  }

  function avisos(): void {
    if (!ultimo) return;
    const lineas = [...avisosUrl];
    // Con varias series, los avisos de la combinación (4.1) y los de cada serie, con su número.
    if (varias()) lineas.push(...ultimo.vista.avisos.map((a) => a.descripcion));
    ultimo.comparacion.series.forEach((s, k) => {
      const prefijo = varias() ? `Serie ${k + 1}: ` : "";
      const resultados = s.entidades.map((id) => s.resultados[id]);
      const ids = new Set(resultados.flatMap((x) => x.advertencias.map((a) => a.id)));
      const cruzados = ultimo!.vista.quiebres[k].filter((q) => ids.has(q.advertencia.id) && q.forma !== "general");
      if (cruzados.length) {
        lineas.push(`${prefijo}El período cruza ${cruzados.length === 1 ? "un quiebre" : `${cruzados.length} quiebres`}: ${cruzados
          .map((q) => `${q.n}. ${NOMBRE_TIPO_QUIEBRE[q.advertencia.tipo] ?? q.advertencia.tipo} (${rangoQuiebre(q.advertencia)})`)
          .join("; ")}. El detalle está en la ficha de la serie.`);
      }
      const r = resultados[0];
      for (const e of r.excluidos) lineas.push(`${prefijo}${fechaCorta(e.fecha)}: dato excluido hasta confirmarlo. ${e.motivo}`);
      for (const n of r.notas) lineas.push(`${prefijo}${n}`);
    });
    // La regla de ubicación y el filtro de eventos no son advertencias: van debajo del gráfico y en la leyenda.
    $("x-regla").hidden = !ultimo.periodos.length;
    const caja = $("x-avisos");
    caja.replaceChildren(...lineas.map((l) => Object.assign(document.createElement("p"), { textContent: l })));
    caja.hidden = !lineas.length;
  }

  /** Filas de la vista: fecha, país (en las internacionales), valor y las tres columnas del período del sombreado. */
  function filasVista(): Array<{ fecha: string; pais?: string; valor: number | null; frecuencia: string } & Partial<ColumnasPeriodo>> {
    if (!ultimo) return [];
    const { r, otras, periodos, contexto } = ultimo;
    const conPeriodo = (res: Resultado) => (periodos.length && estado.sh ? ubicacionesDe(periodos, estado.sh, res, contexto).map(columnasDe) : []);
    const de = (res: Resultado, pais?: string) => {
      const ps = conPeriodo(res);
      return res.datos.map(([f, v], k) => ({ fecha: f, pais, valor: v, frecuencia: res.frecuencias[k], ...ps[k] }));
    };
    return tienePais(doc) ? [...de(r, estado.p[0]), ...otras.flatMap((o) => de(o.resultado, o.id))] : de(r);
  }

  /** Con varias series, la tabla va a la frecuencia común, con una columna por serie (y por país) (SPEC 6.2). */
  function tablaComun(): void {
    const u = ultimo!;
    const a = alinearVista({ estado: vistaEstado, docs, insumos: cargados, angosto: angosto.matches }, u.comparacion);
    const nombreColumna = (col: (typeof a.columnas)[number]) => {
      const d = docs[col.serie - 1];
      const pais = col.pais && tienePais(d) ? d.entidades.find((e) => e.id === col.pais)?.nombre ?? col.pais : "";
      return `${col.serie}. ${d.nombre}${pais ? ` · ${pais}` : ""} (${col.unidad})`;
    };
    const cab = document.createElement("tr");
    for (const t of [`Fecha (${a.frecuencia})`, ...a.columnas.map(nombreColumna)]) cab.append(Object.assign(document.createElement("th"), { scope: "col", textContent: t }));
    $("x-tabla-cabeza").replaceChildren(cab);
    const variaciones = a.columnas.map((col) => esVariacion(vistaEstado.series[col.serie - 1].t));
    const filas = a.filas.map(([fecha, ...valores]) => {
      const tr = document.createElement("tr");
      tr.append(Object.assign(document.createElement("th"), { scope: "row", textContent: fechaLegible(fecha, a.frecuencia) }));
      valores.forEach((v, k) => tr.append(Object.assign(document.createElement("td"), { className: "valor", textContent: numero(v, variaciones[k]) })));
      return tr;
    });
    $("x-tabla-cuerpo").replaceChildren(...filas);
    $("x-tabla-cantidad").textContent = `${filas.length} filas`;
  }

  function tabla(): void {
    if (!ultimo) return;
    if (varias()) { tablaComun(); return; }
    const { r } = ultimo;
    const conPais = tienePais(doc);
    const conPeriodo = !!estado.sh && ultimo.periodos.length > 0;
    const cab = document.createElement("tr");
    for (const t of ["Fecha", ...(conPais ? ["País"] : []), r.unidad, ...(conPeriodo ? [columnaPeriodo(estado.sh), "Proporción", "Otros períodos"] : [])]) {
      cab.append(Object.assign(document.createElement("th"), { scope: "col", textContent: t }));
    }
    $("x-tabla-cabeza").replaceChildren(cab);
    const variacion = esVariacion(estado.t);
    const excluidos = new Set(r.excluidos.map((e) => e.fecha));
    const filas = filasVista().map((f) => {
      const tr = document.createElement("tr");
      const esExcluido = f.valor === null && excluidos.has(f.fecha) && (!conPais || f.pais === estado.p[0]);
      if (esExcluido) tr.className = "excluido";
      tr.append(Object.assign(document.createElement("th"), { scope: "row", textContent: fechaLegible(f.fecha, f.frecuencia) }));
      if (conPais) tr.append(Object.assign(document.createElement("td"), { textContent: nombrePais(f.pais ?? "") }));
      tr.append(Object.assign(document.createElement("td"), { className: "valor", textContent: esExcluido ? "Excluido (ver nota)" : numero(f.valor, variacion) }));
      if (conPeriodo) {
        const prop = f.periodo_proporcion;
        tr.append(Object.assign(document.createElement("td"), { textContent: f.periodo ?? "—" }),
          Object.assign(document.createElement("td"), { className: "valor", textContent: typeof prop === "number" ? `${Math.round(prop * 100)} %` : (prop ?? "") }),
          Object.assign(document.createElement("td"), { textContent: f.otros_periodos || "—" }));
      }
      return tr;
    });
    $("x-tabla-cuerpo").replaceChildren(...filas);
    $("x-tabla-cantidad").textContent = `${filas.length} filas`;
  }

  function cita(): void {
    if (!ultimo) return;
    const citaDe = (k: number) => {
      const d = docs[k], e = vistaEstado.series[k];
      const paises = tienePais(d) ? e.p.map((id) => d.entidades.find((x) => x.id === id)?.nombre ?? id) : undefined;
      return textoCita(d, ultimo!.transformaciones[k], paises);
    };
    let texto = varias() ? docs.map((_, k) => `${k + 1}. ${citaDe(k)}`).join("\n") : citaDe(0);
    if (ultimo.periodos.length && registroPeriodos) texto += `\nSombreado: ${citaRegistro("periodos", registroPeriodos.version_datos)}`;
    $("x-cita").textContent = texto;
  }

  function urlFicha(): string {
    const s = indice.find((x) => x.id === estado.s)!;
    const ruta = estado.v === s.variante_por_defecto ? `/series/${estado.s}/` : `/series/${estado.s}/${estado.v}/`;
    // La ficha entiende los mismos parámetros, sombreado y eventos incluidos (salvo serie, variante y países); el
    // período, en años.
    const q = new URLSearchParams(urlDesdeEstado(estado, doc, indice, CATEGORIAS));
    for (const k of ["s", "v", "p"]) q.delete(k);
    if (tienePais(doc) && estado.p[0] !== doc.entidades_por_defecto[0]) q.set("e", estado.p[0]);
    for (const k of ["desde", "hasta"]) { const v = q.get(k); if (v && v !== "todo") q.set(k, v.slice(0, 4)); }
    return `${ruta}${q.size ? `?${q.toString().replaceAll("%2C", ",")}` : ""}`;
  }

  // ---- Gráfico ----
  let vista: VistaGrafico | null = null;
  const lector = conectarLector($("x-lector"), $("x-lectura"));

  /**
   * Lo que dice el lector del gráfico de cada dato: fecha, valor, la banda del sombreado con sus fechas (y el reparto),
   * el episodio y los eventos del dato (revisión externa de la 4b, 9.4).
   */
  function lecturas(): Lectura[] {
    if (!ultimo) return [];
    // Con varias series, la guía común: las fechas de la serie de frecuencia más alta y el valor de cada serie.
    if (varias()) {
      const g = ultimo.vista.guia;
      return g ? lecturasGuia(g, { sh: estado.sh, episodios: ultimo.episodios, eventos: ultimo.eventos, modo: modoActual() }) : [];
    }
    const { r, periodos, contexto, episodios, eventos } = ultimo;
    const us = periodos.length && estado.sh ? ubicacionesDe(periodos, estado.sh, r, contexto) : [];
    const variacion = esVariacion(estado.t);
    const modo = modoActual();
    return r.datos.flatMap(([f, v], k) => {
      if (v === null) return [];
      const texto = textoLectura({
        fecha: f, frecuencia: r.frecuencias[k], valor: numero(v, variacion), contexto,
        ...(us[k] ? { columna: columnaPeriodo(estado.sh), ubicacion: us[k] } : {}), episodios, eventos, modo,
      });
      return [{ t: fechaDeDibujo(referenciaDe(f, r.frecuencias[k], contexto)), texto }];
    });
  }
  let turno = 0;

  /** La especificación de la vista con su tamaño (y, para la imagen exportada, su título y su pie). */
  function entrada(ancho: number, alto: number, impreso?: { titulo: string; subtitulo: string; pie: string[] }): Record<string, unknown> {
    return armarVista({ ...entradaVista(ancho, alto), comparacion: ultimo!.comparacion, ...(impreso ? { impreso } : {}) }).especificacion;
  }

  /** En escritorio, el gráfico ocupa un 60 % del alto de la pantalla (menos el eje); si no, 260 o 360 px como antes. */
  function altoGrafico(ancho: number): number {
    if (!escritorio.matches) return ancho < 520 ? 260 : 360;
    return Math.min(720, Math.max(320, Math.round(window.innerHeight * 0.6) - 40));
  }

  async function dibujar(): Promise<void> {
    if (!ultimo) return;
    const mio = ++turno;
    const ancho = contenedor.clientWidth || 600;
    try {
      await import("vega-embed");
      if (mio !== turno) return;
      vista?.finalize();
      const spec = entrada(ancho, altoGrafico(ancho));
      // Lo que se dibujó, para la prueba de igualdad con `especificacion_grafico` (web/scripts/igualdad-explorador.mjs).
      (contenedor as HTMLElement & { especificacion?: unknown }).especificacion = spec;
      vista = await dibujarEn(contenedor, spec);
      contenedor.dataset.listo = "1";
      contenedor.dataset.eventos = ultimo.eventos.length ? modoActual() : "";
      listaEventos();
      lector.actualizar(lecturas(), vista);
    } catch (err) {
      estadoTexto.textContent = `No se pudo dibujar el gráfico (${err instanceof Error ? err.message : String(err)}). La tabla y las descargas siguen disponibles.`;
      estadoTexto.dataset.tipo = "error";
    }
  }

  // ---- Descargas ----
  function nombreArchivo(): string {
    const partes = ["vaiven", estado.s, estado.v, tienePais(doc) ? estado.p.join("-") : undefined, estado.pa ? "pesos_actuales" : undefined,
      estado.f || undefined, estado.m || undefined, estado.t !== "nivel" ? estado.t : undefined, estado.mm ? `mm${estado.mm}` : undefined,
      estado.desde || estado.hasta ? `${estado.desde || "inicio"}_${estado.hasta || "hoy"}` : undefined, estado.sh ? `sombreado_${estado.sh}` : undefined];
    return partes.filter(Boolean).join("_").replace(/[^\w.-]+/g, "-");
  }

  function lineasPie(): string[] {
    const fuentes = [...new Set(doc.fuentes.map((f) => f.organismo))].join("; ");
    const pie = [`Fuentes: ${fuentes}.`];
    if (tienePais(doc)) pie.push(`Países: ${estado.p.map(nombrePais).join(", ")} (resaltado: ${nombrePais(estado.p[0])}).`);
    if (ultimo?.transformacion) pie.push(`Transformación: ${ultimo.transformacion} (calculada por Vaivén).`);
    if (ultimo?.periodos.length && registroPeriodos) {
      pie.push(`Sombreado: ${nombreSombreado(estado.sh)}${estado.sh === "catedra" ? ` (${ACLARACION_ETAPAS})` : ""}. Cada dato, en el período vigente a mitad de su intervalo (los saldos en nivel, el último día). Fuente: Vaivén, períodos, versión ${diaDeVersion(registroPeriodos.version_datos)}.`);
    }
    if (ultimo?.episodios.length) pie.push(`Episodios: ${ultimo.episodios.map((e) => e.nombre).join("; ")}.`);
    if (ultimo?.eventos.length) {
      // En la imagen (900 px) los eventos pueden ir con letras aunque en la pantalla vayan como rayitas.
      const letras = modoEventosDe(ultimo.r, ultimo.eventos, 900) === "letras";
      pie.push(`Eventos: ${ultimo.eventos.map((e) => (letras ? `${e.letra}. ${e.nombre}` : `${diaLegible(e.fecha)}, ${e.nombre}`)).join("; ")}.`);
    }
    pie.push(`Elaboración: Vaivén, variante «${doc.variante}», versión de datos ${diaDeVersion(doc.version_datos)}. ${licenciaImagen(doc.fuentes)}`, location.href);
    return pie;
  }

  async function imagen(formato: "png" | "svg"): Promise<void> {
    if (!ultimo) return;
    const spec = entrada(900, 400, { titulo: `${doc.nombre} · ${doc.nombre_variante}`, subtitulo: ultimo.r.unidad, pie: lineasPie() });
    await exportarImagen(spec, formato, `${nombreArchivo()}.${formato}`);
  }

  function vistaDescarga(): VistaDescarga {
    const u = ultimo!;
    const conPeriodo = !!estado.sh && u.periodos.length > 0;
    const cruzados = u.quiebres.filter((q) => new Set(u.r.advertencias.map((a) => a.id)).has(q.advertencia.id));
    const paises = tienePais(doc) ? estado.p.map(nombrePais) : undefined;
    const metadatos: Array<[string, string]> = [
      ["Serie", `${doc.nombre} (${doc.codigo})`], ["Variante", `${doc.nombre_variante} («${doc.variante}»)`], ["Unidad", u.r.unidad],
      ["Transformación", u.transformacion ?? "ninguna (como se publica)"],
      ["Período", estado.desde || estado.hasta ? `${estado.desde || "inicio"} – ${estado.hasta || "último dato"}` : "toda la serie"],
      ...(paises ? [["Países", paises.join(", ")] as [string, string]] : []),
      ...(conPeriodo && registroPeriodos ? [
        ["Sombreado", `${nombreSombreado(estado.sh)}${estado.sh === "catedra" ? ` (${ACLARACION_ETAPAS})` : ""} (Vaivén, períodos, versión ${diaDeVersion(registroPeriodos.version_datos)})`] as [string, string],
        ["Columnas del período", `${REGLA_UBICACION} «periodo_proporcion» es la parte de la observación que cubre (de 0 a 1); «otros_periodos», los demás con su porcentaje.`] as [string, string],
      ] : []),
      ["Quiebres en el período", cruzados.length ? cruzados.map((q) => `${NOMBRE_TIPO_QUIEBRE[q.advertencia.tipo] ?? q.advertencia.tipo} (${rangoQuiebre(q.advertencia)}): ${q.advertencia.descripcion}`).join(" | ") : "ninguno"],
      ["Fuentes", doc.fuentes.map((f) => `${f.organismo}: ${f.nombre} (${f.licencia}) ${f.url}`).join(" | ")],
      ["Licencia de los datos derivados", doc.licencia],
      ["Versión de datos", diaDeVersion(doc.version_datos)],
      ["Vista en el explorador", location.href],
      ["Descargado", new Date().toISOString().slice(0, 10)],
      ["Nota", "Las celdas vacías son datos faltantes o excluidos: no se completan."],
    ];
    return {
      unidad: u.r.unidad, conPais: tienePais(doc), periodo: conPeriodo ? columnaPeriodo(estado.sh) : undefined,
      filas: filasVista().map((f) => ({ fecha: f.fecha, pais: f.pais, valor: f.valor, periodo: f.periodo, periodo_proporcion: f.periodo_proporcion, otros_periodos: f.otros_periodos })),
      metadatos,
      cita: { texto: $("x-cita").textContent ?? "", apa: apa(doc, u.transformacion, paises), bibtex: bibtex(doc, u.transformacion, paises) },
      periodos: conPeriodo ? u.periodos.map((p) => ({ nombre: p.nombre, desde: p.desde, hasta: p.hasta, confianza: textoConfianza(p), fuentes: p.fuentes.map((f) => `${f.para ? `${f.para}: ` : ""}${f.referencia ?? f.nota ?? ""}${f.pagina ? `, p. ${f.pagina}` : ""}${f.url ? ` ${f.url}` : ""}`).join(" | ") })) : undefined,
    };
  }

  async function xlsx(): Promise<void> {
    if (!ultimo) return;
    estadoTexto.textContent = "Armando el XLSX…";
    try {
      const { default: escribir } = await import("write-excel-file/browser");
      const blob = await escribir(hojasXlsx(vistaDescarga()) as never).toBlob();
      bajar(URL.createObjectURL(blob), `${nombreArchivo()}.xlsx`);
      estadoTexto.textContent = "";
    } catch (err) {
      estadoTexto.textContent = `No se pudo armar el XLSX (${err instanceof Error ? err.message : String(err)}). El CSV tiene los mismos datos.`;
      estadoTexto.dataset.tipo = "error";
    }
  }

  function citaTxt(): void {
    if (!ultimo) return;
    const v = vistaDescarga();
    const texto = [`${doc.nombre} · ${doc.nombre_variante}`, `Unidad: ${v.unidad}`, `Vista: ${location.href}`, "",
      "Cómo citar:", v.cita.texto, "", "APA:", v.cita.apa, "", "BibTeX:", v.cita.bibtex, "",
      ...v.metadatos.filter(([k]) => ["Fuentes", "Licencia de los datos derivados"].includes(k)).map(([k, x]) => `${k}: ${x}`)].join("\n");
    bajarTexto(texto + "\n", "text/plain;charset=utf-8", `${nombreArchivo()}_cita.txt`);
  }

  // ---- Eventos de la interfaz ----
  async function elegirSerie(s: string, v?: string): Promise<void> {
    const serie = indice.find((x) => x.id === s)!;
    const variante = v ?? serie.variante_por_defecto;
    estadoTexto.textContent = "Cargando la serie…";
    let nuevo: DocumentoCompleto;
    try {
      nuevo = await documento(s, variante);
    } catch (err) {
      estadoTexto.textContent = `No se pudo cargar la serie (${err instanceof Error ? err.message : String(err)}).`;
      estadoTexto.dataset.tipo = "error";
      return;
    }
    // Se conservan el sombreado y los eventos; lo demás vuelve a la vista inicial de la serie. Con varias series, el
    // período también se conserva: es común a todas.
    const { sh, ev, desde, hasta } = estado;
    const e = { ...porDefecto(s, variante, nuevo), sh, ev, ...(varias() ? { desde, hasta } : {}) };
    fijarVista({ ...vistaEstado, series: [e, ...vistaEstado.series.slice(1)] }, [nuevo, ...docs.slice(1)]);
    avisosUrl = [];
    await actualizar();
  }

  // Doble eje ⇄ paneles (SPEC 6.2 y 6.5): en el celular, el doble eje hay que pedirlo (`ejes=doble`); en pantallas
  // más anchas es lo automático, así que volver a él borra `ejes`.
  $("x-ejes").addEventListener("click", () => {
    const d = ultimo?.comparacion.disposicion;
    if (!d) return;
    vistaEstado.ejes = d.tipo === "doble_eje" ? "paneles" : angosto.matches ? "doble" : "";
    avisosUrl = [];
    void actualizar();
  });

  c.serie.addEventListener("change", () => void elegirSerie(c.serie.value));
  c.variante.addEventListener("change", () => void elegirSerie(estado.s, c.variante.value));
  $<HTMLFormElement>("x-controles").addEventListener("submit", (e) => e.preventDefault());
  $<HTMLFormElement>("x-controles").addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    if (t === c.serie || t === c.variante) return; // tienen su propio manejo
    if (t === c.eventos && c.eventos.checked && !c.categorias.some((k) => k.checked)) c.categorias.forEach((k) => (k.checked = true));
    if (t.dataset.categoria && !c.categorias.some((k) => k.checked)) c.eventos.checked = false;
    if (t === c.etapa && c.etapa) {
      const etapa = pagina.etapas.find((x) => x.id === c.etapa!.value);
      if (etapa) { c.desde.value = etapa.desde.slice(0, 7); c.hasta.value = mesFinal(etapa.hasta); }
    }
    if (t.dataset.pais) {
      const marcados = c.paises.querySelectorAll<HTMLInputElement>("input:checked");
      if (marcados.length > MAX_PAISES) (t as HTMLInputElement).checked = false;
      if (!marcados.length) (t as HTMLInputElement).checked = true;
    }
    leerControles();
    avisosUrl = [];
    void actualizar();
  });
  document.querySelectorAll<HTMLButtonElement>(".atajo").forEach((b) => b.addEventListener("click", () => {
    c.desde.value = b.dataset.desde ?? "";
    c.hasta.value = b.dataset.hasta ?? "";
    leerControles();
    void actualizar();
  }));
  $("x-bajar-csv").addEventListener("click", () => { if (ultimo) bajarTexto(csvDeVista(vistaDescarga()), "text/csv;charset=utf-8", `${nombreArchivo()}.csv`); });
  $("x-bajar-xlsx").addEventListener("click", () => void xlsx());
  $("x-bajar-png").addEventListener("click", () => void imagen("png"));
  $("x-bajar-svg").addEventListener("click", () => void imagen("svg"));
  $("x-bajar-cita").addEventListener("click", citaTxt);
  $("x-copiar").addEventListener("click", async () => {
    const aviso = $("x-copiado");
    try {
      await navigator.clipboard.writeText($("x-cita").textContent ?? "");
      aviso.textContent = "Copiada.";
    } catch {
      const rango = document.createRange();
      rango.selectNodeContents($("x-cita"));
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(rango);
      aviso.textContent = "Seleccionada: copiala con Ctrl+C.";
    }
    setTimeout(() => { aviso.textContent = ""; }, 4000);
  });
  document.addEventListener("vaiven:tema", () => { leyendas(); void dibujar(); });
  let anchoPrevio = contenedor.clientWidth;
  new ResizeObserver(() => {
    const ancho = contenedor.clientWidth;
    if (Math.abs(ancho - anchoPrevio) > 40) void dibujar();
    anchoPrevio = ancho;
  }).observe(contenedor);
  // En escritorio el alto del gráfico sigue al de la ventana.
  let altoPrevio = window.innerHeight;
  window.addEventListener("resize", () => {
    if (escritorio.matches && Math.abs(window.innerHeight - altoPrevio) > 40) void dibujar();
    altoPrevio = window.innerHeight;
  });

  // ---- Arranque: la URL manda ----
  void (async () => {
    const q = new URLSearchParams(location.search);
    const { pedidas, avisos: a1 } = seriesDeUrl(q, indice);
    let leidos: DocumentoCompleto[];
    try {
      leidos = await Promise.all(pedidas.map((p) => documento(p.serie.id, p.variante)));
    } catch (err) {
      estadoTexto.textContent = `No se pudo cargar la serie (${err instanceof Error ? err.message : String(err)}).`;
      estadoTexto.dataset.tipo = "error";
      return;
    }
    const r = vistaDesdeUrl(q, pedidas, leidos, CATEGORIAS);
    fijarVista(r.estado, r.docs as DocumentoCompleto[]);
    avisosUrl = [...a1, ...r.avisos];
    await actualizar();
  })();
}

iniciar();
