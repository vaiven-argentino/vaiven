// Explorador (SPEC 6.2): de una a cuatro series. Arma los controles según lo que admite la variante elegida, pide los
// datos a /datos/ y guarda todo en la URL. La URL se lee con `seriesDeUrl` y `vistaDesdeUrl` y se escribe con
// `urlDesdeVista`; el gráfico lo arma `armarVista`, la misma función que usa `especificacion_grafico` del MCP (con una
// serie, el gráfico de la 4b). Los controles, por ahora, editan la serie 1.
import { apa, bibtex, citaRegistro, NOMBRE_DENOMINADOR, nombreTransformacion, textoCita } from "@vaiven/cita";
import {
  REGLA_UBICACION, atraso, disponibles, fechaDeDibujo, rangoLegible, referenciaDe, tienePais, ubicar,
  type Comparacion, type ContextoUbicacion, type DocumentoEventos, type DocumentoPeriodos, type Periodo, type Resultado, type Transformacion,
} from "@vaiven/transformaciones";
import { alinearVista, armarVista, compararVista, lecturasGuia, nombreSombreadoEnFrase, partirEnRenglones, type Vista } from "@vaiven/grafico";
import { REGLA_ALINEACION, csvLargo, hojasVista, type FilaLarga, type HojaAncha, type VistaDescargaVarias } from "../lib/descarga";
import { agregarSerie, colorLibre, igualarComunes, nombreArchivoVista, puedeAgregar, quitarSerie, repetida } from "../lib/vista";
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
  tipoDe, ubicacionesDe, type ColumnasPeriodo,
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
  /**
   * La vista: de una a cuatro series. Los controles editan una por vez, la activa (`estado`, con su documento, `doc`;
   * SPEC 6.5). El período, el sombreado y los eventos son comunes: se copian a todas las series.
   */
  let vistaEstado!: EstadoVista;
  let docs: DocumentoCompleto[] = [];
  /** El color de cada serie (índice de la paleta): sigue a la serie, no a su posición (SPEC 6.2). */
  let colores: number[] = [];
  /** La serie que editan los controles (desde 0). */
  let activa = 0;
  /** Una serie agregada que todavía no se eligió: su bloque arranca vacío y no va al gráfico ni a la URL. */
  let pendiente = false;
  let doc!: DocumentoCompleto;
  let estado!: Estado;
  let avisosUrl: string[] = [];
  /** Fija la vista entera, sus colores y la serie activa. */
  function fijarVista(v: EstadoVista, ds: DocumentoCompleto[], k = activa, cs?: number[]): void {
    vistaEstado = v;
    docs = ds;
    colores = cs ?? (colores.length === ds.length ? colores : ds.map((_, j) => j));
    activa = Math.max(0, Math.min(k, ds.length - 1));
    estado = v.series[activa];
    doc = ds[activa];
  }
  const varias = () => vistaEstado.series.length > 1;
  const esInternacional = (id: string) => indice.find((x) => x.id === id)?.bloque === "Contexto internacional";
  const anuncio = $<HTMLParagraphElement>("x-anuncio");
  const anunciar = (t: string) => { anuncio.textContent = ""; setTimeout(() => { anuncio.textContent = t; }, 50); };

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
    listaSeries();
    // Una sola serie internacional por vista (SPEC 4.1): en la serie que se edita, las demás internacionales van
    // deshabilitadas si otra serie ya lo es, con la razón en el texto de la opción.
    const otraInternacional = docs.some((d, k) => (pendiente || k !== activa) && tienePais(d));
    for (const o of c.serie.options) {
      if (!o.value) continue;
      o.dataset.texto ??= o.textContent ?? "";
      const bloqueada = otraInternacional && esInternacional(o.value);
      o.disabled = bloqueada;
      o.textContent = bloqueada ? `${o.dataset.texto} (ya hay una serie internacional)` : o.dataset.texto;
    }
    const numero = varias() || pendiente ? ` ${pendiente ? docs.length + 1 : activa + 1}` : "";
    $("x-serie-numero").textContent = numero;
    $("x-trans-numero").textContent = numero ? ` de la serie${numero}` : "";
    $("x-pendiente").hidden = !pendiente;
    $("x-seccion-trans").hidden = pendiente;
    c.variante.disabled = pendiente;
    if (pendiente) {
      c.serie.value = "";
      c.variante.replaceChildren();
      c.campoPaises.hidden = true;
      return;
    }
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
    // Una transformación que dejaría la serie igual a otra de la vista no se ofrece (decisión del PR B).
    c.transformacion.replaceChildren(...disp.transformaciones.map((t) => {
      const o = opcion(t, NOMBRE_TRANSFORMACION[t], t === estado.t);
      const j = t === estado.t ? -1 : repetida(vistaEstado.series.map((e, k) => (k === activa ? { ...e, t } : e)), activa);
      if (j >= 0) { o.disabled = true; o.textContent = `${o.textContent} (igual a la serie ${j + 1})`; }
      return o;
    }));
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
    actualizarLog();
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

  /** La escala logarítmica de la serie activa solo se ofrece si todos sus valores son positivos. */
  function actualizarLog(): void {
    const s = ultimo?.comparacion.series[activa];
    const positivos = !s || s.entidades.every((id) => s.resultados[id].datos.every((d) => d[1] === null || d[1] > 0));
    c.log.disabled = !positivos;
    c.campoLog.classList.toggle("deshabilitado", !positivos);
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
    // Con varias series, cada panel (o cada eje) tiene su resumen (SPEC 6.5), uno por renglón.
    const resumen = $("x-resumen");
    if (varias() && ultimo.vista.descripcionesPaneles.length > 1) {
      const resto = ultimo.vista.descripcion.slice(ultimo.vista.descripcionesPaneles.join(" ").length).trim();
      resumen.replaceChildren(...ultimo.vista.descripcionesPaneles.map((t) => Object.assign(document.createElement("span"), { className: "resumen-panel", textContent: `${t} ` })),
        ...(resto ? [Object.assign(document.createElement("span"), { className: "resumen-panel", textContent: resto })] : []));
    } else resumen.textContent = textoResumen();
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

  /** Las columnas del período en la tabla de varias series (decisión del PR B: ocultas por defecto, con un botón). */
  let verPeriodosTabla = false;

  /** Con varias series, la tabla va a la frecuencia común, con una columna por serie (y por país) (SPEC 6.2). */
  function tablaComun(): void {
    const { a, columnas, periodos } = tablaAlineada();
    const boton = $<HTMLButtonElement>("x-tabla-periodos");
    boton.hidden = !periodos;
    boton.setAttribute("aria-pressed", String(verPeriodosTabla));
    boton.textContent = verPeriodosTabla ? "Ocultar las columnas del período" : "Mostrar las columnas del período";
    const conPeriodo = !!periodos && verPeriodosTabla;
    const cab = document.createElement("tr");
    for (const t of [`Fecha (${a.frecuencia})`, ...columnas.map((x) => `${x.titulo} (${x.unidad})`),
      ...(conPeriodo ? [columnaPeriodo(primera().sh), "Proporción", "Otros períodos"] : [])]) {
      cab.append(Object.assign(document.createElement("th"), { scope: "col", textContent: t }));
    }
    $("x-tabla-cabeza").replaceChildren(cab);
    const filas = a.filas.map(([fecha, ...valores], k) => {
      const tr = document.createElement("tr");
      tr.append(Object.assign(document.createElement("th"), { scope: "row", textContent: fechaLegible(fecha, a.frecuencia) }));
      valores.forEach((v, j) => tr.append(Object.assign(document.createElement("td"), { className: "valor", textContent: numero(v, columnas[j].variacion) })));
      if (conPeriodo) {
        const p = periodos![k];
        const prop = p.periodo_proporcion;
        tr.append(Object.assign(document.createElement("td"), { textContent: p.periodo ?? "—" }),
          Object.assign(document.createElement("td"), { className: "valor", textContent: typeof prop === "number" ? `${Math.round(prop * 100)} %` : (prop ?? "") }),
          Object.assign(document.createElement("td"), { textContent: p.otros_periodos || "—" }));
      }
      return tr;
    });
    $("x-tabla-cuerpo").replaceChildren(...filas);
    $("x-tabla-cantidad").textContent = `${filas.length} filas`;
  }

  function tabla(): void {
    if (!ultimo) return;
    $("x-tabla-comun").hidden = !varias();
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

  // ---- Descargas (SPEC 6.2: CSV largo, XLSX con hoja larga, ancha y metadatos, PNG y SVG con todos los paneles) ----
  const porDefectoDe = (id: string) => indice.find((x) => x.id === id)?.variante_por_defecto;
  const nombreEntidadDe = (k: number, id: string) => { const d = docs[k]; return (tienePais(d) ? d.entidades.find((e) => e.id === id)?.nombre : undefined) ?? id; };
  const paisesDe = (k: number) => (tienePais(docs[k]) ? vistaEstado.series[k].p.map((id) => nombreEntidadDe(k, id)) : undefined);
  const primera = () => vistaEstado.series[0];

  function nombreArchivo(): string {
    if (varias()) return nombreArchivoVista(vistaEstado.series, porDefectoDe);
    const e = primera(), d = docs[0];
    const partes = ["vaiven", e.s, e.v, tienePais(d) ? e.p.join("-") : undefined, e.pa ? "pesos_actuales" : undefined,
      e.f || undefined, e.m || undefined, e.t !== "nivel" ? e.t : undefined, e.mm ? `mm${e.mm}` : undefined,
      e.desde || e.hasta ? `${e.desde || "inicio"}_${e.hasta || "hoy"}` : undefined, e.sh ? `sombreado_${e.sh}` : undefined];
    return partes.filter(Boolean).join("_").replace(/[^\w.-]+/g, "-");
  }

  function lineasPie(): string[] {
    const u = ultimo!;
    const e0 = primera();
    const pie: string[] = [];
    if (!varias()) {
      const d = docs[0];
      pie.push(`Fuentes: ${[...new Set(d.fuentes.map((f) => f.organismo))].join("; ")}.`);
      if (tienePais(d)) pie.push(`Países: ${paisesDe(0)!.join(", ")} (resaltado: ${nombreEntidadDe(0, e0.p[0])}).`);
      if (u.transformacion) pie.push(`Transformación: ${u.transformacion} (calculada por Vaivén).`);
    } else {
      // Una línea por serie: su variante, su transformación y sus fuentes.
      docs.forEach((d, k) => {
        const paises = paisesDe(k);
        pie.push(`${k + 1}. ${d.nombre} · ${d.nombre_variante} · ${u.transformaciones[k] ? `${u.transformaciones[k]} (calculada por Vaivén)` : "como se publica"}${paises ? ` · países: ${paises.join(", ")}` : ""} · fuentes: ${[...new Set(d.fuentes.map((f) => f.organismo))].join("; ")}.`);
      });
    }
    if (u.periodos.length && registroPeriodos) {
      pie.push(`Sombreado: ${nombreSombreado(e0.sh)}${e0.sh === "catedra" ? ` (${ACLARACION_ETAPAS})` : ""}. Cada dato, en el período vigente a mitad de su intervalo (los saldos en nivel, el último día). Fuente: Vaivén, períodos, versión ${diaDeVersion(registroPeriodos.version_datos)}.`);
    }
    if (u.episodios.length) pie.push(`Episodios: ${u.episodios.map((x) => x.nombre).join("; ")}.`);
    if (u.eventos.length) {
      // En la imagen (900 px) los eventos pueden ir con letras aunque en la pantalla vayan como rayitas.
      const letras = modoEventosDe(varias() && u.vista.dominio ? u.vista.dominio : u.r, u.eventos, 900) === "letras";
      pie.push(`Eventos: ${u.eventos.map((x) => (letras ? `${x.letra}. ${x.nombre}` : `${diaLegible(x.fecha)}, ${x.nombre}`)).join("; ")}.`);
    }
    const version = docs.map((d) => d.version_datos).sort().at(-1)!;
    const fuentes = docs.flatMap((d) => d.fuentes);
    pie.push(varias()
      ? `Elaboración: Vaivén, versión de datos ${diaDeVersion(version)}. ${licenciaImagen(fuentes)}`
      : `Elaboración: Vaivén, variante «${docs[0].variante}», versión de datos ${diaDeVersion(docs[0].version_datos)}. ${licenciaImagen(docs[0].fuentes)}`);
    // La imagen mide 900 px: cada línea larga se parte en renglones de unos 130 caracteres para que no se corte
    // (revisión visual del PR B). La URL va entera, al final.
    return [...pie.flatMap((l) => partirEnRenglones(l, 130)), location.href];
  }

  async function imagen(formato: "png" | "svg"): Promise<void> {
    if (!ultimo) return;
    const d = ultimo.comparacion.disposicion;
    const unidades = [...new Set(d.paneles.map((p) => p.unidad))];
    const titulo = varias() ? `Comparación: ${docs.map((x) => x.nombre).join(" · ")}` : `${docs[0].nombre} · ${docs[0].nombre_variante}`;
    const subtitulo = varias() ? (unidades.length === 1 ? unidades[0] : "Varias unidades: cada una en su eje o en su panel") : ultimo.r.unidad;
    // En paneles, 200 px por panel (el alto mínimo es 180 px, SPEC 6.2).
    const alto = d.tipo === "paneles" ? Math.max(400, d.paneles.length * 200) : 400;
    const spec = entrada(900, alto, { titulo, subtitulo, pie: lineasPie() });
    await exportarImagen(spec, formato, `${nombreArchivo()}.${formato}`);
  }

  /** Las filas del CSV largo: una por observación de cada serie (y país), con la fecha en su frecuencia. */
  function filasLargas(): FilaLarga[] {
    const u = ultimo!;
    const sh = primera().sh;
    return u.comparacion.series.flatMap((s, k) => {
      const e = vistaEstado.series[k];
      return s.entidades.flatMap((id) => {
        const r = s.resultados[id];
        const ps = u.periodos.length && sh ? ubicacionesDe(u.periodos, sh, r, u.vista.contextos[k]).map(columnasDe) : [];
        return r.datos.map(([fecha, valor], j) => ({
          fecha, serie: e.s, variante: e.v, ...(s.internacional ? { pais: id } : {}), transformacion: u.transformaciones[k] ?? "nivel",
          unidad: r.unidad, valor, ...ps[j],
        }));
      });
    });
  }

  /** La tabla de la vista a la frecuencia común: la misma de la pantalla y de la hoja ancha del XLSX. */
  function tablaAlineada() {
    const u = ultimo!;
    const a = alinearVista({ estado: vistaEstado, docs, insumos: cargados, angosto: angosto.matches }, u.comparacion);
    const sh = primera().sh;
    // Con sombreado, el período de cada fila: el de su intervalo, ubicado con la regla de la serie 1.
    const periodos = u.periodos.length && sh
      ? a.filas.map(([fecha]) => columnasDe(ubicar(referenciaDe(fecha, a.frecuencia, u.vista.contextos[0]), u.periodos, tipoDe(sh))))
      : undefined;
    const columnas = a.columnas.map((col) => ({
      titulo: `${col.serie}. ${docs[col.serie - 1].nombre}${col.pais ? ` · ${nombreEntidadDe(col.serie - 1, col.pais)}` : ""}`, unidad: col.unidad,
      variacion: esVariacion(vistaEstado.series[col.serie - 1].t), notas: col.notas,
    }));
    return { a, columnas, periodos };
  }

  /** Lo que lleva una serie en la hoja de metadatos. */
  function metadatosSerie(k: number, prefijo: string): Array<[string, string]> {
    const u = ultimo!, d = docs[k], s = u.comparacion.series[k];
    const ids = new Set(s.entidades.flatMap((id) => s.resultados[id].advertencias.map((x) => x.id)));
    const cruzados = u.vista.quiebres[k].filter((q) => ids.has(q.advertencia.id));
    const paises = paisesDe(k);
    return [
      [`${prefijo}Serie`, `${d.nombre} (${d.codigo})`], [`${prefijo}Variante`, `${d.nombre_variante} («${d.variante}»)`],
      [`${prefijo}Unidad`, s.unidad], [`${prefijo}Transformación`, u.transformaciones[k] ?? "ninguna (como se publica)"],
      ...(paises ? [[`${prefijo}Países`, paises.join(", ")] as [string, string]] : []),
      [`${prefijo}Quiebres en el período`, cruzados.length ? cruzados.map((q) => `${NOMBRE_TIPO_QUIEBRE[q.advertencia.tipo] ?? q.advertencia.tipo} (${rangoQuiebre(q.advertencia)}): ${q.advertencia.descripcion}`).join(" | ") : "ninguno"],
      [`${prefijo}Fuentes`, d.fuentes.map((f) => `${f.organismo}: ${f.nombre} (${f.licencia}) ${f.url}`).join(" | ")],
      [`${prefijo}Licencia de los datos derivados`, d.licencia],
      [`${prefijo}Versión de datos`, diaDeVersion(d.version_datos)],
    ];
  }

  function vistaDescarga(): VistaDescargaVarias {
    const u = ultimo!;
    const e0 = primera();
    const conPeriodo = !!e0.sh && u.periodos.length > 0;
    const { a, columnas, periodos } = tablaAlineada();
    const notas = columnas.filter((col) => col.notas.length).map((col) => `${col.titulo}: ${col.notas.join(" ")}`);
    const metadatos: Array<[string, string]> = [
      ["Vista en el explorador", location.href],
      ["Período", e0.desde || e0.hasta ? `${e0.desde || "inicio"} – ${e0.hasta || "último dato"}` : varias() ? "la vista inicial de la serie 1" : "toda la serie"],
      ...(varias() ? [["Disposición", { unico: "un solo gráfico", doble_eje: "doble eje", paneles: "paneles" }[u.comparacion.disposicion.tipo]] as [string, string]] : []),
      ["Frecuencia común (hoja ancha)", `${a.frecuencia}. ${REGLA_ALINEACION}`],
      ...(notas.length ? [["Notas de la frecuencia común", notas.join(" | ")] as [string, string]] : []),
      ...(u.vista.avisos.length && varias() ? [["Avisos de la comparación", u.vista.avisos.map((x) => x.descripcion).join(" | ")] as [string, string]] : []),
      ...(conPeriodo && registroPeriodos ? [
        ["Sombreado", `${nombreSombreado(e0.sh)}${e0.sh === "catedra" ? ` (${ACLARACION_ETAPAS})` : ""} (Vaivén, períodos, versión ${diaDeVersion(registroPeriodos.version_datos)})`] as [string, string],
        ["Columnas del período", `${REGLA_UBICACION} «periodo_proporcion» es la parte de la observación que cubre (de 0 a 1); «otros_periodos», los demás con su porcentaje. En la hoja ancha, cada fila es un período de la frecuencia común y se ubica con la regla de la serie 1.`] as [string, string],
      ] : []),
      ...docs.flatMap((_, k) => metadatosSerie(k, varias() ? `Serie ${k + 1} · ` : "")),
      ["Descargado", new Date().toISOString().slice(0, 10)],
      ["Nota", "Las celdas vacías son datos faltantes o excluidos: no se completan."],
    ];
    return {
      filas: filasLargas(), conPais: docs.some((d) => tienePais(d)),
      ancha: { frecuencia: a.frecuencia, columnas: columnas.map((col) => ({ titulo: col.titulo, unidad: col.unidad })), filas: a.filas as HojaAncha["filas"], periodos },
      columnaPeriodo: conPeriodo ? columnaPeriodo(e0.sh) : undefined,
      metadatos,
      citas: docs.map((d, k) => {
        const paises = paisesDe(k);
        return { serie: `${k + 1}. ${d.nombre}`, texto: textoCita(d, u.transformaciones[k], paises), apa: apa(d, u.transformaciones[k], paises), bibtex: bibtex(d, u.transformaciones[k], paises) };
      }),
      periodos: conPeriodo ? u.periodos.map((p) => ({ nombre: p.nombre, desde: p.desde, hasta: p.hasta, confianza: textoConfianza(p), fuentes: p.fuentes.map((f) => `${f.para ? `${f.para}: ` : ""}${f.referencia ?? f.nota ?? ""}${f.pagina ? `, p. ${f.pagina}` : ""}${f.url ? ` ${f.url}` : ""}`).join(" | ") })) : undefined,
    };
  }

  async function xlsx(): Promise<void> {
    if (!ultimo) return;
    estadoTexto.textContent = "Armando el XLSX…";
    try {
      const { default: escribir } = await import("write-excel-file/browser");
      const blob = await escribir(hojasVista(vistaDescarga()) as never).toBlob();
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
    const generales = v.metadatos.filter(([k]) => /Fuentes$|Licencia de los datos derivados$/.test(k)).map(([k, x]) => `${k}: ${x}`);
    const texto = [varias() ? `Comparación: ${docs.map((d) => d.nombre).join(" · ")}` : `${docs[0].nombre} · ${docs[0].nombre_variante}`,
      ...(varias() ? [] : [`Unidad: ${ultimo.r.unidad}`]), `Vista: ${location.href}`, "",
      ...v.citas.flatMap((x) => [...(varias() ? [x.serie, ""] : []), "Cómo citar:", x.texto, "", "APA:", x.apa, "", "BibTeX:", x.bibtex, ""]),
      ...generales].join("\n");
    bajarTexto(texto + "\n", "text/plain;charset=utf-8", `${nombreArchivo()}_cita.txt`);
  }

  // ---- Lista de series (SPEC 6.2 y 6.5) ----
  const lista = $<HTMLOListElement>("x-series-lista");
  const plantilla = $<HTMLTemplateElement>("x-plantilla-serie");
  const agregar = $<HTMLButtonElement>("x-agregar");
  const nombreSerie = (k: number) => docs[k]?.nombre ?? "";

  /** Un bloque por serie, con su color, su nombre y «Quitar»; la activa, marcada. Con una sola serie no se muestra. */
  function listaSeries(): void {
    const t = tema();
    const filas = vistaEstado.series.map((_, k) => ({ k, nombre: `${k + 1}. ${nombreSerie(k)}`, detalle: ultimo?.transformaciones[k] ?? "", color: t.paleta?.[colores[k] % (t.paleta?.length ?? 1)] ?? t.serie }));
    const items = filas.map((f) => {
      const li = plantilla.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
      const radio = li.querySelector("input")!;
      radio.value = String(f.k);
      radio.checked = !pendiente && f.k === activa;
      radio.id = `x-activa-${f.k + 1}`;
      li.classList.toggle("activa", radio.checked);
      li.querySelector<HTMLElement>(".muestra")!.style.color = f.color;
      li.querySelector(".bloque-nombre")!.textContent = f.nombre;
      li.querySelector(".bloque-detalle")!.textContent = f.detalle;
      const quitar = li.querySelector<HTMLButtonElement>(".quitar")!;
      quitar.dataset.quitar = String(f.k);
      quitar.setAttribute("aria-label", `Quitar la serie ${f.nombre}`);
      quitar.hidden = filas.length < 2 && !pendiente;
      return li;
    });
    if (pendiente) {
      const li = plantilla.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
      const radio = li.querySelector("input")!;
      radio.value = "nueva";
      radio.checked = true;
      radio.id = `x-activa-${filas.length + 1}`;
      li.classList.add("activa");
      li.querySelector<HTMLElement>(".muestra")!.style.color = t.paleta?.[colorLibre(colores)] ?? t.serie;
      li.querySelector(".bloque-nombre")!.textContent = `${filas.length + 1}. `;
      li.querySelector(".bloque-nombre")!.append($<HTMLTemplateElement>("x-texto-pendiente").content.textContent!.trim());
      const quitar = li.querySelector<HTMLButtonElement>(".quitar")!;
      quitar.dataset.quitar = "nueva";
      quitar.setAttribute("aria-label", `Quitar la serie ${filas.length + 1}, todavía sin elegir`);
      items.push(li);
    }
    lista.replaceChildren(...items);
    $("x-series").hidden = items.length < 2;
    agregar.disabled = pendiente || !puedeAgregar(vistaEstado);
    $("x-agregar-nota").textContent = puedeAgregar(vistaEstado) ? "Hasta 4 series; una puede ser internacional." : "Ya hay 4 series: es el máximo. Quitá una para agregar otra.";
  }

  /** Lleva el foco a un elemento después de rearmar la lista (sin perder el lugar del lector de pantalla). */
  const enfocar = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

  lista.addEventListener("change", (ev) => {
    const r = ev.target as HTMLInputElement;
    if (r.name !== "x-activa" || r.value === "nueva") return;
    pendiente = false;
    fijarVista(vistaEstado, docs, Number(r.value));
    armarControles();
    actualizarLog();
    anunciar(`Editás la serie ${activa + 1}, ${nombreSerie(activa)}.`);
  });

  lista.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button.quitar");
    if (!b) return;
    if (b.dataset.quitar === "nueva") {
      pendiente = false;
      fijarVista(vistaEstado, docs, activa);
      armarControles();
      anunciar("Se quitó la serie sin elegir.");
      enfocar("x-agregar");
      return;
    }
    const k = Number(b.dataset.quitar);
    const nombre = nombreSerie(k);
    const r = quitarSerie(vistaEstado, colores, k);
    const ds = docs.filter((_, j) => j !== k);
    pendiente = false;
    fijarVista(r.vista, ds, Math.min(k, ds.length - 1), r.colores);
    avisosUrl = [];
    const siguen = k < ds.length ? ` La serie ${k + 2} pasa a ser la ${k + 1}.` : "";
    anunciar(`Se quitó la serie ${k + 1} (${nombre}).${siguen}`);
    void actualizar().then(() => enfocar(ds.length > 1 ? `x-activa-${activa + 1}` : "x-agregar"));
  });

  agregar.addEventListener("click", () => {
    if (!puedeAgregar(vistaEstado) || pendiente) return;
    pendiente = true;
    armarControles();
    anunciar(`Serie ${docs.length + 1} agregada: elegí cuál en «Serie ${docs.length + 1}».`);
    enfocar("x-serie");
  });

  // ---- Eventos de la interfaz ----
  /** Cambia la serie (o la variante) de la serie activa, o elige la de un bloque nuevo. */
  async function elegirSerie(s: string, v?: string): Promise<void> {
    if (!s) return;
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
    estadoTexto.textContent = "";
    const primera = vistaEstado.series[0];
    let vista: EstadoVista, ds: DocumentoCompleto[], k: number, cs = colores;
    if (pendiente) {
      // La serie agregada entra con su vista inicial, salvo el período, el sombreado y los eventos, que son comunes.
      const r = agregarSerie(vistaEstado, colores, porDefecto(s, variante, nuevo));
      vista = r.vista; cs = r.colores; ds = [...docs, nuevo]; k = ds.length - 1;
    } else {
      // Se conservan el sombreado y los eventos; lo demás vuelve a la vista inicial de la serie. Con varias series, el
      // período también se conserva: es común a todas.
      const { sh, ev, desde, hasta } = primera;
      const e = { ...porDefecto(s, variante, nuevo), sh, ev, ...(varias() ? { desde, hasta } : {}) };
      vista = { ...vistaEstado, series: vistaEstado.series.map((x, j) => (j === activa ? e : x)) };
      ds = docs.map((d, j) => (j === activa ? nuevo : d));
      k = activa;
      if (!varias()) vista = igualarComunes(vista, e);
    }
    const j = repetida(vista.series, k);
    if (j >= 0) {
      estadoTexto.textContent = `La serie ${k + 1} quedaría igual a la serie ${j + 1} (misma serie, variante y transformación): elegí otra o cambiá la transformación de la ${j + 1}.`;
      estadoTexto.dataset.tipo = "error";
      armarControles();
      return;
    }
    pendiente = false;
    fijarVista(vista, ds, k, cs);
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

  c.serie.addEventListener("change", () => void elegirSerie(c.serie.value).then(() => { if (!pendiente) anunciar(`Serie ${activa + 1}: ${nombreSerie(activa)}.`); }));
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
    if ((t as HTMLInputElement).name === "x-activa") return; // la lista de series tiene su propio manejo
    if (!aplicarControles()) return;
    avisosUrl = [];
    void actualizar();
  });
  document.querySelectorAll<HTMLButtonElement>(".atajo").forEach((b) => b.addEventListener("click", () => {
    c.desde.value = b.dataset.desde ?? "";
    c.hasta.value = b.dataset.hasta ?? "";
    if (aplicarControles()) void actualizar();
  }));

  /**
   * Lee los controles en la serie activa y copia lo común (período, sombreado y eventos) a todas. Si la serie quedaría
   * igual a otra de la vista, no se aplica y se avisa (decisión del PR B).
   */
  function aplicarControles(): boolean {
    const antes = structuredClone(estado);
    leerControles();
    const j = repetida(vistaEstado.series, activa);
    if (j >= 0) {
      vistaEstado.series[activa] = antes;
      fijarVista(vistaEstado, docs);
      armarControles();
      estadoTexto.textContent = `Ese cambio deja la serie ${activa + 1} igual a la serie ${j + 1}: no se aplicó.`;
      estadoTexto.dataset.tipo = "error";
      return false;
    }
    fijarVista(igualarComunes(vistaEstado, estado), docs);
    return true;
  }
  $("x-bajar-csv").addEventListener("click", () => { if (ultimo) bajarTexto(csvLargo(vistaDescarga()), "text/csv;charset=utf-8", `${nombreArchivo()}.csv`); });
  // Las columnas del período en la tabla de varias series: ocultas por defecto, con un botón a la vista.
  $("x-tabla-periodos").addEventListener("click", () => { verPeriodosTabla = !verPeriodosTabla; tabla(); });
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
