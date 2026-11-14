// La vista del explorador, de una a cuatro series (SPEC 4.1 y 6.2): de lo que pide la URL a la especificación de
// Vega-Lite. Es la única función que arma el gráfico de una vista: la usan el explorador (en pantalla y en la imagen
// exportada) y `especificacion_grafico` del MCP, así que, para las mismas vistas, las dos especificaciones son iguales
// salvo el tamaño (SPEC 10). Con una sola serie arma exactamente el gráfico de la 4b.
import {
  alinear, cerosAlineados, comparar, diasDe, fechaDeDibujo, indiceMes, referenciaDe, tienePais,
  type AdvertenciaCombinacion, type Alineada, type Comparacion, type ContextoUbicacion, type DocumentoEventos,
  type DocumentoPeriodos, type InsumosCargados, type Panel, type Periodo, type Resultado,
} from "@vaiven/transformaciones";
import { dominioMeses, especificacion, modoEventosDe, type BandaEpisodio, type EntradaGrafico, type MarcaEvento, type Tema } from "./espec";
import { opcionesDe, serieVista, type Documento, type Estado, type EstadoVista } from "./estado";
import { esVariacion, numerarQuiebres, resumen, type QuiebreNumerado } from "./ficha";
import { fechaLegible, numero } from "./formato";
import { EPISODIO, bandasDe, contextoDe, episodiosEnRango, eventosEnRango, nombreSombreado, periodosEnRango, tipoDe, type OpcionSombreado } from "./periodos";

/** Aviso fijo del doble eje (SPEC 4.1). */
export const AVISO_DOBLE_EJE = "Las escalas de los dos ejes son independientes: que las líneas se crucen o se acerquen no indica una relación entre las series.";
/** El aviso en dos líneas, para que entre en el ancho del gráfico. */
const AVISO_DOBLE_EJE_LINEAS = ["Las escalas de los dos ejes son independientes: que las líneas se crucen o se acerquen", "no indica una relación entre las series."];
/** Alto mínimo de cada panel (SPEC 6.2). */
export const ALTO_MINIMO_PANEL = 180;
const SEPARACION_PANELES = 16;
/** Lo que ocupa, más o menos, el eje Y de un panel (rótulos y marcas). */
const EJE_Y = 56;

/** Lo que la vista necesita además del estado: los documentos de cada serie, los insumos y los registros. */
export interface EntradaVista {
  estado: EstadoVista;
  /** Uno por serie, en el orden del estado (los JSON completos del export). */
  docs: Documento[];
  insumos: InsumosCargados;
  periodos?: DocumentoPeriodos;
  eventos?: DocumentoEventos;
  tema: Tema;
  ancho: number;
  /** Alto del gráfico con una unidad o con doble eje; en paneles, el alto total que se reparte (180 px por panel o más). */
  alto: number;
  /** Pantalla de menos de 600 px: con dos unidades, paneles por defecto (SPEC 6.5). */
  angosto?: boolean;
  /** El color de cada serie (índice de la paleta, desde 0). Por defecto, su posición. */
  colores?: number[];
  impreso?: EntradaGrafico["impreso"];
  /** La comparación ya hecha con `compararVista` (por ejemplo, para controlar un límite antes de armar el gráfico). */
  comparacion?: Comparacion;
}

export interface Vista {
  comparacion: Comparacion;
  /** Avisos de la combinación (4.1). Los de cada serie están en sus resultados. */
  avisos: AdvertenciaCombinacion[];
  /** Los quiebres de cada serie, numerados de corrido en el orden de las series. */
  quiebres: QuiebreNumerado[][];
  periodos: Periodo[];
  eventos: MarcaEvento[];
  /** Cuántos eventos hay en el rango sin el filtro de categorías (para el aviso del filtro). */
  totalEventos: number;
  episodios: BandaEpisodio[];
  contextos: ContextoUbicacion[];
  /** El texto alternativo del gráfico. */
  descripcion: string;
  /** Uno por panel (o uno solo, con un gráfico o doble eje). */
  descripcionesPaneles: string[];
  especificacion: Record<string, unknown>;
}

type ConEmpalme = Documento & { empalme: EntradaGrafico["empalme"]; nombre?: string };
const nombreEntidad = (doc: Documento, id: string) => (tienePais(doc) ? doc.entidades.find((e) => e.id === id)?.nombre : undefined) ?? id;
const nombreDoc = (d: Documento) => (d as ConEmpalme).nombre ?? d.id;
const conDatos = (r: Resultado) => r.datos.some((d) => d[1] !== null);

/** Las opciones de la librería de cada serie, sin el período (es común: lo aplica la comparación). */
export function opcionesSinPeriodo(e: Estado, doc: Documento) {
  const { desde: _d, hasta: _h, ...o } = opcionesDe(e, serieVista(doc, e.p));
  return o;
}

function pedido(v: Pick<EntradaVista, "estado" | "docs" | "insumos" | "angosto">) {
  const [primera] = v.estado.series;
  return {
    series: v.estado.series.map((e, k) => ({
      documento: v.docs[k], opciones: opcionesSinPeriodo(e, v.docs[k]), insumos: v.insumos,
      ...(tienePais(v.docs[k]) ? { paises: e.p } : {}), log: e.log,
    })),
    ...(primera.desde ? { desde: primera.desde } : {}), ...(primera.hasta ? { hasta: primera.hasta } : {}),
    ejes: v.estado.ejes || ("auto" as const), angosto: v.angosto ?? false,
  };
}

/** La comparación de la vista: cada serie con su cadena y el período de la serie 1. */
export function compararVista(v: Pick<EntradaVista, "estado" | "docs" | "insumos" | "angosto">): Comparacion {
  return comparar(pedido(v));
}

/** La tabla de la vista y la hoja ancha: las series a la frecuencia común (4.1). */
export function alinearVista(v: Pick<EntradaVista, "estado" | "docs" | "insumos" | "angosto">, c?: Comparacion): Alineada {
  return alinear(pedido(v), c);
}

/** Un resultado de dos puntos con el primer y el último dato de todas las series: lo que se ve, para períodos y eventos. */
function dominioDe(c: Comparacion): Resultado | null {
  let a: { f: string; frec: Resultado["frecuencias"][number]; i: number } | null = null;
  let z: { f: string; frec: Resultado["frecuencias"][number]; fin: number } | null = null;
  for (const s of c.series) {
    for (const r of Object.values(s.resultados)) {
      r.datos.forEach(([f], k) => {
        const frec = r.frecuencias[k];
        const i = indiceMes(f);
        const fin = indiceMes(diasDe(f, frec).hasta.slice(0, 7));
        if (!a || i < a.i) a = { f, frec, i };
        if (!z || fin > z.fin) z = { f, frec, fin };
      });
    }
  }
  if (!a || !z) return null;
  const p = a as { f: string; frec: Resultado["frecuencias"][number] }, u = z as { f: string; frec: Resultado["frecuencias"][number] };
  return { datos: [[p.f, null], [u.f, null]], frecuencias: [p.frec, u.frec], unidad: "", advertencias: [], excluidos: [], notas: [] };
}

/**
 * La vista: la comparación, los períodos y eventos que se ven y la especificación de Vega-Lite. Con una serie, el
 * gráfico de la 4b; con varias, un gráfico, doble eje o paneles según la disposición de `alinear.ts`.
 */
export function armarVista(v: EntradaVista): Vista {
  const c = v.comparacion ?? compararVista(v);
  const { estado, docs, tema } = v;
  const [primera] = estado.series;
  const dominio = dominioDe(c);
  const sh = primera.sh as OpcionSombreado | "";
  const periodos = sh && v.periodos && dominio ? periodosEnRango(v.periodos, sh, dominio) : [];
  const eventos = primera.ev.length && v.eventos && dominio ? eventosEnRango(v.eventos, dominio, primera.ev) : [];
  const totalEventos = primera.ev.length && v.eventos && dominio ? eventosEnRango(v.eventos, dominio).length : 0;
  const episodios = primera.ev.includes(EPISODIO) && v.periodos && dominio ? episodiosEnRango(v.periodos, dominio) : [];
  let base = 0;
  const quiebres = estado.series.map((e, k) => {
    const lista = numerarQuiebres({ ...serieVista(docs[k], e.p), advertencias: docs[k].advertencias });
    const renumerada = lista.map((q) => ({ ...q, n: q.n + base }));
    base += lista.length;
    return renumerada;
  });
  const contextos = estado.series.map((e, k) => contextoDe(serieVista(docs[k], e.p).agregacion, opcionesSinPeriodo(e, docs[k])));
  const bandas = bandasDe(periodos);
  const sombreado = bandas.length ? { bandas, franja: sh === "plan" } : undefined;
  const asignacion = bandas.length && sh ? { periodos, tipo: tipoDe(sh) } : undefined;
  const textoSombra = textoSombreadoVista(sh, periodos, eventos, episodios);
  const comun = { periodos, eventos, totalEventos, episodios, contextos, quiebres, comparacion: c, avisos: c.advertencias };

  // ── Una sola serie: la entrada del explorador de la 4b, sin cambios. ──
  if (estado.series.length === 1) {
    const s = c.series[0], doc = docs[0], e = primera;
    const r = s.resultados[s.entidades[0]];
    const otras = s.entidades.slice(1).map((id) => ({ nombre: nombreEntidad(doc, id), resultado: s.resultados[id] }));
    const positivos = [r, ...otras.map((o) => o.resultado)].every((x) => x.datos.every((d) => d[1] === null || d[1] > 0));
    const descripcion = resumen(r, r.unidad, esVariacion(e.t), quiebres[0]) + textoSombra;
    const serie = serieVista(doc, e.p);
    return {
      ...comun, descripcion, descripcionesPaneles: [descripcion],
      especificacion: especificacion({
        resultado: r, tramos: serie.tramos, empalme: (doc as ConEmpalme).empalme, quiebres: quiebres[0], tema,
        esVariacion: esVariacion(e.t), log: e.log && positivos, alto: v.alto, ancho: v.ancho, descripcion,
        nombre: tienePais(doc) ? nombreEntidad(doc, e.p[0]) : undefined, otras, colores: tienePais(doc), sombreado, eventos,
        impreso: v.impreso, ubicacion: contextos[0], asignacion, episodios,
      }),
    };
  }

  // ── Varias series ──
  const colores = estado.series.map((_, k) => v.colores?.[k] ?? k);
  const paleta = tema.paleta?.length ? tema.paleta : [tema.serie];
  const colorSerie = (k: number) => paleta[colores[k] % paleta.length];
  // Dos variantes de la misma serie se distinguen por su variante («Inflación minorista (IPC) · provincias»).
  const nombreSerie = (k: number) => (estado.series.some((e, j) => j !== k && e.s === estado.series[k].s)
    ? `${nombreDoc(docs[k])} · ${estado.series[k].v}` : nombreDoc(docs[k]));
  const d = c.disposicion;
  const dom = dominio ? dominioMeses(dominio) : undefined;
  const descripcionesPaneles = d.paneles.map((p) => descripcionPanel(p, c, quiebres, estado));
  const descripcion = `${descripcionesPaneles.join(" ")}${textoSombra}`;
  const nombresGuia = d.tipo === "paneles" ? d.paneles.map((_, k) => `guia${k + 1}`) : ["guia"];
  const guia = guiaComun(c, docs, estado, contextos, tema, nombresGuia, dom);

  /** La entrada de `especificacion` de un panel (o de un eje): la primera línea con datos va como línea principal. */
  const entradaPanel = (panel: Panel, extra: Partial<EntradaGrafico>): EntradaGrafico | null => {
    const lineas = panel.series.flatMap((k) => c.series[k].entidades.map((id) => ({ k, id, r: c.series[k].resultados[id] })));
    const principal = lineas.find((l) => conDatos(l.r));
    if (!principal) return null;
    const ordenadas = [principal, ...lineas.filter((l) => l !== principal)];
    const nombreLinea = (l: { k: number; id: string }) => (panel.internacional ? nombreEntidad(docs[l.k], l.id) : nombreSerie(l.k));
    const positivos = ordenadas.every((l) => l.r.datos.every((x) => x[1] === null || x[1] > 0));
    const serieP = serieVista(docs[principal.k], estado.series[principal.k].p);
    return {
      resultado: principal.r, tramos: serieP.tramos, empalme: (docs[principal.k] as ConEmpalme).empalme,
      quiebres: panel.series.flatMap((k) => quiebres[k]),
      // En el panel de la internacional, la paleta de 8 de sus países; si no, el color de cada serie.
      tema: { ...tema, paleta: panel.internacional ? paleta : ordenadas.map((l) => colorSerie(l.k)) },
      esVariacion: esVariacion(estado.series[principal.k].t), log: panel.log && positivos, alto: v.alto, ancho: v.ancho, descripcion: "",
      nombre: nombreLinea(principal), rotuloNombre: panel.internacional ? "País" : "Serie",
      otras: ordenadas.slice(1).map((l) => ({
        nombre: nombreLinea(l), resultado: l.r, ubicacion: contextos[l.k],
        tramos: serieVista(docs[l.k], estado.series[l.k].p).tramos, empalme: (docs[l.k] as ConEmpalme).empalme,
      })),
      // Sin `asignacion`: con varias series, el tooltip es el de la guía común (el período de cada punto no se calcula).
      colores: true, sinResaltado: !panel.internacional, ubicacion: contextos[principal.k], ...(dom ? { dominio: dom } : {}),
      sinTooltip: true, ...extra,
    };
  };
  /** Sin ningún dato: el gráfico vacío de siempre. */
  const vacio = () => ({ ...comun, descripcion, descripcionesPaneles, especificacion: especificacion({
    resultado: c.series[0].resultados[c.series[0].entidades[0]], tramos: [], empalme: "derivar", quiebres: [], tema, esVariacion: false,
    log: false, alto: v.alto, ancho: v.ancho, descripcion,
  }) });

  if (d.tipo === "unico" || d.tipo === "doble_eje") {
    const [izq, der] = d.paneles;
    const rangos = d.tipo === "doble_eje" ? rangosAlineados(c, izq, der) : null;
    const titulo = (p: Panel) => ({ texto: `━ ${p.series.map(nombreSerie).join(" · ")} (${p.unidad})`, color: colorSerie(p.series[0]) });
    const eIzq = entradaPanel(izq, {
      alto: v.alto, sombreado, eventos, episodios, capasExtra: guia.capas(v.alto, "guia"), impreso: v.impreso,
      ...(der ? { tituloEjeY: titulo(izq) } : {}), ...(rangos ? { dominioY: rangos.izq } : {}),
    });
    const eDer = der ? entradaPanel(der, { alto: v.alto, ejeDerecho: true, tituloEjeY: titulo(der), ...(rangos ? { dominioY: rangos.der } : {}) }) : null;
    if (!eIzq && !eDer) return vacio();
    // Si el eje izquierdo no tiene datos, el derecho va solo (con su eje a la derecha y su título).
    const sIzq = especificacion({ ...(eIzq ?? eDer!), descripcion });
    if (!eIzq || !eDer) {
      const pIzq = sIzq.padding as Record<string, number>;
      return { ...comun, descripcion, descripcionesPaneles, especificacion: { ...sIzq, ...(v.impreso ? {} : { padding: { ...pIzq, right: 6 } }), datasets: guia.datasets } };
    }
    const sDer = especificacion({ ...eDer, descripcion });
    const impreso = sIzq.title as { text: string; subtitle: string[] } | undefined;
    const pad = (s: Record<string, unknown>) => s.padding as { top: number; right: number; bottom: number; left: number };
    return {
      ...comun, descripcion, descripcionesPaneles,
      especificacion: {
        ...sIzq,
        layer: [{ layer: sIzq.layer }, { layer: sDer.layer }],
        resolve: { scale: { y: "independent" }, axis: { y: "independent" } },
        // El aviso fijo va en el gráfico (también en la imagen exportada).
        title: impreso
          ? { ...impreso, subtitle: [...impreso.subtitle.slice(0, 1), AVISO_DOBLE_EJE, ...impreso.subtitle.slice(1)] }
          : { text: AVISO_DOBLE_EJE_LINEAS, fontSize: 12, fontWeight: "normal", color: tema.secundario, anchor: "start", offset: 10 },
        // Con `fit-x`, Vega ya deja lugar para los nombres al final de las líneas: el margen de la 4b los contaría dos veces.
        padding: v.impreso ? pad(sIzq) : { ...pad(sIzq), right: 6 },
        datasets: guia.datasets,
      },
    };
  }

  // ── Paneles ──
  const n = d.paneles.length;
  const alto = Math.max(ALTO_MINIMO_PANEL, Math.floor((v.alto - SEPARACION_PANELES * (n - 1)) / n));
  const letras = dominio ? modoEventosDe(dominio, eventos, v.ancho) === "letras" : false;
  const specs = d.paneles.map((p, k) => {
    const ultimo = k === n - 1;
    // El sombreado cruza todos los paneles (los rótulos de las bandas, solo en el primero); la franja de los planes va
    // arriba del primero y la de los episodios, debajo del último. Las reglas de los eventos cruzan todos los paneles;
    // las letras o las rayitas van en el último, debajo de su eje.
    const e = entradaPanel(p, {
      alto, sombreado: sombreado && (!sombreado.franja || k === 0) ? sombreado : undefined, sinRotulosSombreado: k > 0,
      eventos: ultimo || letras ? eventos : [], sinLetrasEventos: !ultimo, episodios: ultimo ? episodios : [], sinEjeX: !ultimo,
      capasExtra: guia.capas(alto, nombresGuia[k]),
    });
    return e ? { p, k, s: especificacion({ ...e, descripcion: descripcionesPaneles[k] }) } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  if (!specs.length) return vacio();
  const derecha = Math.max(...specs.map(({ s }) => (s.padding as { right: number }).right));
  const ultimaEsp = specs[specs.length - 1].s;
  const impreso = v.impreso ? especificacion({ ...entradaPanel(specs[0].p, { alto })!, descripcion, impreso: v.impreso }).title : undefined;
  return {
    ...comun, descripcion, descripcionesPaneles,
    especificacion: {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      description: descripcion,
      ...(impreso ? { title: impreso } : {}),
      background: v.impreso ? tema.fondo : null,
      // En paneles, Vega suma el eje Y y los nombres al final de las líneas al ancho de cada panel.
      padding: v.impreso ? { top: 20, left: 20, bottom: 20, right: 20 } : { top: 4, right: 6, bottom: 4, left: 4 },
      spacing: SEPARACION_PANELES,
      vconcat: specs.map(({ p, k, s }) => ({
        width: Math.max(160, (v.impreso ? 900 : v.ancho) - EJE_Y - derecha), height: alto, description: descripcionesPaneles[k], layer: s.layer,
        title: {
          text: `${p.unidad[0].toUpperCase()}${p.unidad.slice(1)}`,
          subtitle: p.internacional ? nombreSerie(p.series[0]) : p.series.map((x) => `${x + 1}. ${nombreSerie(x)}`).join(" · "),
          anchor: "start", fontSize: 12.5, subtitleFontSize: 11.5, offset: 4,
        },
      })),
      resolve: { scale: { x: "shared" } },
      datasets: guia.datasets,
      // La configuración es la del último panel: lleva el eje de fechas (y el espacio para las letras de los eventos).
      config: ultimaEsp.config,
    },
  };
}

/** Los rangos de los dos ejes con los ceros alineados, si los dos incluyen el 0 (si no, null: rango automático). */
function rangosAlineados(c: Comparacion, izq: Panel, der: Panel): { izq: [number, number]; der: [number, number] } | null {
  const rango = (p: Panel): [number, number] | null => {
    const vs = p.series.flatMap((k) => Object.values(c.series[k].resultados).flatMap((r) => r.datos.map((x) => x[1]).filter((x): x is number => x !== null)));
    if (!vs.length) return null;
    const min = Math.min(...vs), max = Math.max(...vs);
    // Como el eje de una serie: incluye el 0 si no hay negativos (en las variaciones, siempre), con un margen.
    const bajo = Math.min(min, 0), alto = Math.max(max, 0);
    const margen = (alto - bajo) * 0.06 || 1;
    return [min < 0 ? bajo - margen : bajo, alto + margen];
  };
  const a = rango(izq), b = rango(der);
  if (!a || !b) return null;
  const r = cerosAlineados(a, b);
  return r.alineados ? { izq: r.izq, der: r.der } : null;
}

/** El texto alternativo de un panel (SPEC 6.5): su unidad y el resumen de cada serie. */
function descripcionPanel(p: Panel, c: Comparacion, quiebres: QuiebreNumerado[][], estado: EstadoVista): string {
  const partes = p.series.map((k) => {
    const s = c.series[k];
    const r = s.resultados[s.entidades[0]];
    return `Serie ${k + 1}: ${resumen(r, r.unidad, esVariacion(estado.series[k].t), quiebres[k])}`;
  });
  return `${p.unidad[0].toUpperCase()}${p.unidad.slice(1)}. ${partes.join(" ")}`;
}

/** Las frases del sombreado, los episodios y los eventos para el texto alternativo (como en la 4b). */
function textoSombreadoVista(sh: OpcionSombreado | "", periodos: Periodo[], eventos: MarcaEvento[], episodios: BandaEpisodio[]): string {
  let t = "";
  if (periodos.length && sh) {
    t += ` Sombreado por ${nombreSombreado(sh)}: ${periodos.length === 1 ? "un período" : `${periodos.length} períodos`}, de ${periodos[0].nombre} a ${periodos[periodos.length - 1].nombre}.`;
    t += " Cada dato se asigna al período vigente a mitad de su intervalo (los saldos en nivel, el último día).";
  }
  if (episodios.length) t += ` ${episodios.length === 1 ? "Un episodio marcado" : `${episodios.length} episodios marcados`}: ${episodios.map((x) => x.nombre).join("; ")}.`;
  if (eventos.length) t += ` ${eventos.length === 1 ? "Un evento marcado" : `${eventos.length} eventos marcados`} (lista debajo del gráfico).`;
  return t;
}

// ── Guía común: tooltip y lector de teclado (SPEC 6.2) ───────────────────────────

export interface FilaGuia {
  /** Fecha de dibujo (ISO). */
  t: string;
  fecha: string;
  /** Por serie (y país): «458.796» o, si la observación es de otra fecha, «2001 (anual): 458.796»; «—» sin dato. */
  [campo: string]: string;
}

/**
 * Las fechas de la guía son las de la serie de frecuencia más alta (con empate, la de índice más bajo). En cada una, el
 * valor de cada serie es el de la observación cuyo intervalo contiene esa fecha (2.4), con su fecha si es otra.
 */
export function filasGuia(c: Comparacion, docs: Documento[], estado: EstadoVista, contextos: ContextoUbicacion[]):
  { filas: FilaGuia[]; campos: Array<{ campo: string; titulo: string }> } {
  const orden: Record<string, number> = { diaria: 0, mensual: 1, trimestral: 3, semestral: 6, anual: 12 };
  const conDato = c.series.filter((s) => s.frecuencia !== null);
  if (!conDato.length) return { filas: [], campos: [] };
  const guia = conDato.reduce((a, s) => (orden[s.frecuencia!] < orden[a.frecuencia!] ? s : a));
  const r0 = guia.resultados[guia.entidades.find((id) => conDatos(guia.resultados[id])) ?? guia.entidades[0]];
  const lineas = c.series.flatMap((s) => s.entidades.map((id) => ({ s, id })));
  const campos = lineas.map(({ s, id }) => ({
    campo: `s${s.indice + 1}${id ? `_${id}` : ""}`,
    titulo: s.internacional ? nombreEntidad(docs[s.indice], id) : `${s.indice + 1}. ${nombreDoc(docs[s.indice])}`,
  }));
  const observaciones = lineas.map(({ s, id }) => {
    const r = s.resultados[id];
    const variacion = esVariacion(estado.series[s.indice].t);
    return r.datos.map(([f, val], k) => ({ ...diasDe(f, r.frecuencias[k]), f, frec: r.frecuencias[k], val, variacion }));
  });
  // Las fechas de la guía y las observaciones de cada línea están en orden: se recorren juntas, en una sola pasada.
  const cursores = observaciones.map(() => 0);
  const filas = r0.datos.map(([f], k): FilaGuia => {
    const frec = r0.frecuencias[k];
    const t = fechaDeDibujo(referenciaDe(f, frec, contextos[guia.indice]));
    const dia = t.slice(0, 10);
    const fila: FilaGuia = { t, fecha: fechaLegible(f, frec) };
    observaciones.forEach((obs, j) => {
      while (cursores[j] < obs.length && obs[cursores[j]].hasta < dia) cursores[j] += 1;
      const o = cursores[j] < obs.length && obs[cursores[j]].desde <= dia ? obs[cursores[j]] : undefined;
      fila[campos[j].campo] = !o || o.val === null ? "—"
        : o.f === f && o.frec === frec ? numero(o.val, o.variacion) : `${fechaLegible(o.f, o.frec)} (${o.frec}): ${numero(o.val, o.variacion)}`;
    });
    return fila;
  });
  return { filas, campos };
}

/**
 * Las capas de la guía común: en cada panel, puntos invisibles a lo alto con el tooltip de todas las series, y una regla
 * vertical en la fecha más cercana al cursor. La regla de cada panel sigue al cursor en cualquiera de los paneles.
 */
function guiaComun(c: Comparacion, docs: Documento[], estado: EstadoVista, contextos: ContextoUbicacion[], tema: Tema, nombres: string[], dom?: { ini: number; fin: number }) {
  const { filas, campos } = filasGuia(c, docs, estado, contextos);
  // Sin eje propio: el de fechas lo dibujan las capas de la serie (y solo en el último panel).
  const iso = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
  const x = { field: "t", type: "temporal", scale: { type: "utc", ...(dom ? { domain: [iso(dom.ini), iso(dom.fin)] } : {}) }, title: null, axis: null };
  const enCualquiera = { or: nombres.map((param) => ({ param, empty: false })) };
  return {
    datasets: { guia: filas },
    capas: (alto: number, nombre: string): Record<string, unknown>[] => (filas.length ? [
      {
        data: { name: "guia" }, transform: [{ filter: enCualquiera }],
        mark: { type: "rule", color: tema.texto, strokeWidth: 1, opacity: 0.6 }, encoding: { x, y: { value: 0 }, y2: { value: alto } },
      },
      {
        data: { name: "guia" }, mark: { type: "point", opacity: 0, size: 300 },
        params: [{ name: nombre, select: { type: "point", fields: ["t"], on: "pointermove", nearest: true, clear: "pointerout" } }],
        encoding: { x, y: { value: alto / 2 }, tooltip: [{ field: "fecha", title: "Fecha" }, ...campos.map((k) => ({ field: k.campo, title: k.titulo }))] },
      },
    ] : []),
  };
}
