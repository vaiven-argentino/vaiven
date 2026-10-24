// Especificación de Vega-Lite de la ficha. Es una función pura (se prueba con Vitest) que recibe el resultado de
// la transformación y dibuja: la serie, cortada donde no hay continuidad; los quiebres como bandas o reglas
// numeradas; y los datos excluidos como una «×» sobre el eje.
import { PASO, indiceFin, indiceMes, type Resultado, type Tramo } from "@vaiven/transformaciones";
import type { QuiebreNumerado } from "../lib/ficha";
import { fechaCorta, fechaLegible, numero } from "../lib/formato";

export interface Tema {
  fondo: string;
  texto: string;
  secundario: string;
  linea: string;
  banda: string;
  borde: string;
  serie: string;
  fuente: string;
}

export interface EntradaGrafico {
  resultado: Resultado;
  tramos: Tramo[];
  empalme: "encadenar_tasas" | "yuxtaponer";
  quiebres: QuiebreNumerado[];
  tema: Tema;
  esVariacion: boolean;
  log: boolean;
  alto: number;
  ancho: number;
  descripcion: string;
  /** Solo para exportar la imagen: título, subtítulo y pie impresos dentro del gráfico. */
  impreso?: { titulo: string; subtitulo: string; pie: string[] };
}

export interface Fila {
  t: string;
  v: number;
  segmento: number;
  tramo: string;
  fecha: string;
  valor: string;
}

// En escala logarítmica con valores muy chicos (el tipo de cambio de 1970 en pesos actuales es 3,5 × 10⁻¹¹), los
// rótulos menores que 1 van como potencias de 10 con superíndices («10⁻¹⁰»), y los demás con punto de miles.
const SUPERINDICES: Array<[string, string]> = [["-", "⁻"], ["0", "⁰"], ["1", "¹"], ["2", "²"], ["3", "³"], ["4", "⁴"], ["5", "⁵"], ["6", "⁶"], ["7", "⁷"], ["8", "⁸"], ["9", "⁹"]];
const exponente = SUPERINDICES.reduce((expr, [c, sup]) => `replace(${expr}, '${c}', '${sup}')`, "toString(round(log(datum.value) / LN10))");
// replace() de Vega cambia solo la primera aparición: alcanza, porque cada dígito se repite a lo sumo dos veces
// y se aplica dos pasadas.
const ROTULO_POTENCIA = `datum.value >= 1 ? format(datum.value, ',~r') : '10' + ${SUPERINDICES.reduce((expr, [c, sup]) => `replace(${expr}, '${c}', '${sup}')`, exponente)}`;

/** Potencias de 10 entre dos valores, de a una o de a varias para que no haya más de 8 rótulos. */
export function potenciasDeDiez(min: number, max: number): number[] {
  const desde = Math.floor(Math.log10(min)), hasta = Math.ceil(Math.log10(max));
  const paso = Math.max(1, Math.ceil((hasta - desde + 1) / 8));
  const salida: number[] = [];
  for (let e = desde; e <= hasta; e += paso) salida.push(10 ** e);
  return salida;
}

const iso = (indice: number) => `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}-01`;

/** Índice del tramo que contiene cada fecha (−1 si ninguno). */
function tramoDe(indice: number, tramos: Tramo[]): number {
  return tramos.findIndex((t) => indiceMes(t.desde) <= indice && (t.hasta === "hoy" || indice <= indiceFin(t.hasta)));
}

export function nombreTramo(t: Tramo): string {
  return `${fechaCorta(t.desde)}–${t.hasta === "hoy" ? "hoy" : fechaCorta(t.hasta)} (${t.frecuencia})`;
}

/**
 * Filas de la línea. El segmento cambia (la línea se corta) en un dato nulo o excluido, en un hueco más largo que
 * la frecuencia y, si los tramos están yuxtapuestos sin empalmar, en el cambio de tramo.
 */
export function filas(e: Pick<EntradaGrafico, "resultado" | "tramos" | "empalme" | "esVariacion">): Fila[] {
  const salida: Fila[] = [];
  let segmento = 0;
  let anterior: { i: number; paso: number; tramo: number } | null = null;
  const { datos, frecuencias } = e.resultado;
  datos.forEach(([fecha, v], k) => {
    const f = frecuencias[k];
    const i = indiceMes(fecha);
    const tramo = tramoDe(i, e.tramos);
    if (v === null) {
      anterior = null;
      segmento += 1;
      return;
    }
    const paso = PASO[f as keyof typeof PASO] ?? 1;
    if (anterior && (i - anterior.i > Math.max(paso, anterior.paso) || (e.empalme === "yuxtaponer" && tramo !== anterior.tramo))) {
      segmento += 1;
    }
    salida.push({
      t: iso(i), v, segmento, tramo: tramo >= 0 ? nombreTramo(e.tramos[tramo]) : "",
      fecha: fechaLegible(fecha, f), valor: numero(v, e.esVariacion),
    });
    anterior = { i, paso, tramo };
  });
  return salida;
}

export function especificacion(e: EntradaGrafico): Record<string, unknown> {
  const filasLinea = filas(e);
  const { tema } = e;
  if (!filasLinea.length) return { $schema: "https://vega.github.io/schema/vega-lite/v6.json", data: { values: [] }, mark: "point" };

  const ultimo = e.resultado.datos[e.resultado.datos.length - 1];
  const ini = indiceMes(e.resultado.datos[0][0]);
  const fin = indiceMes(ultimo[0]) + (PASO[e.resultado.frecuencias[e.resultado.frecuencias.length - 1] as keyof typeof PASO] ?? 1) - 1;
  const dominioX = [iso(ini), iso(fin)];
  const x = (campo: string) => ({ field: campo, type: "temporal", scale: { type: "utc", domain: dominioX }, title: null });

  const ids = new Set(e.resultado.advertencias.map((a) => a.id));
  const visibles = e.quiebres.filter((q) => ids.has(q.advertencia.id) && q.forma !== "general");
  // Un quiebre largo (más de un tercio de lo visible) no se sombrea: taparía la serie. Se marca arriba del
  // gráfico con una línea punteada que muestra su rango.
  const largo = (a: number, b: number) => b - a > (fin - ini) / 3;
  const rangos = visibles.filter((q) => q.forma === "banda").map((q) => {
    const a = Math.max(indiceMes(q.advertencia.desde!), ini);
    const b = Math.min(indiceFin(q.advertencia.hasta!) + 1, fin);
    return { n: q.n, a, b, desde: iso(a), hasta: iso(b), medio: (a + b) / 2, largo: largo(a, b) };
  });
  const bandas = rangos.filter((r) => !r.largo);
  const barras = rangos.filter((r) => r.largo);
  const reglas = visibles.filter((q) => q.forma === "regla").map((q) => {
    const i = Math.min(Math.max(indiceMes(q.advertencia.desde ?? q.advertencia.hasta!), ini), fin);
    return { n: q.n, desde: iso(i), medio: i };
  });
  const marcadores = ubicarMarcadores([...rangos, ...reglas].map((q) => ({ n: q.n, i: q.medio })), ini, fin, e.ancho);
  const excluidos = e.resultado.excluidos.map((x) => ({ t: iso(indiceMes(x.fecha)), texto: `Dato excluido (${fechaCorta(x.fecha)}): ${x.motivo}` }));

  const tramosDistintos = new Set(filasLinea.map((f) => f.tramo)).size > 1 && e.empalme === "yuxtaponer";
  const ralo = filasLinea.length <= 160 || e.resultado.frecuencias.some((f) => f === "semestral" || f === "anual");
  const positivos = filasLinea.every((f) => f.v > 0);
  const log = e.log && positivos;
  const minimo = Math.min(...filasLinea.map((f) => Math.abs(f.v)).filter((v) => v > 0));
  const y = {
    field: "v", type: "quantitative", title: null,
    scale: log ? { type: "log" } : { zero: e.esVariacion || filasLinea.every((f) => f.v >= 0) },
    axis: log && minimo < 0.01 ? { labelExpr: ROTULO_POTENCIA, values: potenciasDeDiez(minimo, Math.max(...filasLinea.map((f) => f.v))) }
      : { format: ",~r", tickCount: 6 },
  };
  const tooltip = [{ field: "fecha", title: "Fecha" }, { field: "valor", title: "Valor" }];

  const capas: Record<string, unknown>[] = [];
  if (bandas.length) {
    capas.push({
      data: { values: bandas }, mark: { type: "rect", color: tema.banda, opacity: 1, clip: true },
      encoding: { x: x("desde"), x2: { field: "hasta" } },
    });
    capas.push({
      data: { values: bandas.flatMap((b) => [{ t: b.desde }, { t: b.hasta }]) },
      mark: { type: "rule", color: tema.secundario, strokeDash: [2, 2], strokeWidth: 1, clip: true },
      encoding: { x: x("t") },
    });
  }
  if (barras.length) {
    // Línea punteada con topes en los extremos: se lee como anotación y no se confunde con la serie.
    capas.push({
      data: { values: barras }, mark: { type: "rule", color: tema.secundario, strokeWidth: 1.5, strokeDash: [2, 3], clip: true },
      encoding: { x: x("desde"), x2: { field: "hasta" }, y: { value: 24 } },
    });
    capas.push({
      data: { values: barras.flatMap((b) => [{ t: b.desde }, { t: b.hasta }]) },
      mark: { type: "rule", color: tema.secundario, strokeWidth: 1.5, clip: true },
      encoding: { x: x("t"), y: { value: 19 }, y2: { value: 29 } },
    });
  }
  if (reglas.length) {
    capas.push({
      data: { values: reglas }, mark: { type: "rule", color: tema.secundario, strokeDash: [4, 3], strokeWidth: 1.2, clip: true },
      encoding: { x: x("desde") },
    });
  }
  capas.push({
    data: { values: filasLinea }, mark: { type: "line", color: tema.serie, strokeWidth: 2, interpolate: "linear" },
    encoding: { x: x("t"), y, detail: { field: "segmento", type: "nominal" } },
  });
  if (tramosDistintos || ralo) {
    capas.push({
      data: { values: filasLinea },
      mark: { type: "point", filled: true, color: tema.serie, size: e.ancho < 520 ? 12 : tramosDistintos ? 30 : 22, opacity: 1 },
      encoding: {
        x: x("t"), y, tooltip,
        ...(tramosDistintos ? {
          shape: {
            field: "tramo", type: "nominal", title: "Tramo",
            scale: { domain: [...new Set(filasLinea.map((f) => f.tramo))], range: ["circle", "square", "triangle-up", "diamond"] },
            legend: { orient: "bottom", direction: e.ancho < 520 ? "vertical" : "horizontal", symbolFillColor: tema.serie, symbolStrokeColor: tema.serie },
          },
        } : {}),
      },
    });
  }
  // Puntos invisibles para el tooltip cuando la línea no lleva puntos.
  if (!tramosDistintos && !ralo) {
    capas.push({ data: { values: filasLinea }, mark: { type: "point", opacity: 0, size: 60 }, encoding: { x: x("t"), y, tooltip } });
  }
  if (marcadores.length) {
    capas.push({
      data: { values: marcadores },
      mark: { type: "point", shape: "circle", size: 230, filled: true, color: tema.fondo, stroke: tema.secundario, strokeWidth: 1, opacity: 1 },
      encoding: { x: x("t"), y: { field: "y", type: "quantitative", scale: null } },
    });
    capas.push({
      data: { values: marcadores }, mark: { type: "text", color: tema.texto, fontSize: 10.5, fontWeight: 600, baseline: "middle" },
      encoding: { x: x("t"), y: { field: "y", type: "quantitative", scale: null }, text: { field: "n" } },
    });
  }
  if (excluidos.length) {
    capas.push({
      data: { values: excluidos }, mark: { type: "text", text: "×", color: tema.texto, fontSize: 18, fontWeight: 700, baseline: "bottom" },
      encoding: { x: x("t"), y: { value: e.alto - 2 }, tooltip: [{ field: "texto", title: "Nota" }] },
    });
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    description: e.descripcion,
    width: e.impreso ? 900 : "container",
    height: e.alto,
    autosize: { type: "fit-x", contains: "padding" },
    padding: e.impreso ? 20 : { top: 4, right: 6, bottom: 4, left: 4 },
    background: e.impreso ? tema.fondo : null,
    ...(e.impreso ? { title: { text: e.impreso.titulo, subtitle: [e.impreso.subtitulo, "", ...e.impreso.pie], subtitlePadding: 6, offset: 14 } } : {}),
    layer: capas,
    config: {
      font: tema.fuente,
      view: { stroke: null },
      axis: {
        labelColor: tema.secundario, titleColor: tema.secundario, gridColor: tema.linea, domainColor: tema.borde,
        tickColor: tema.borde, labelFontSize: 12, labelFont: tema.fuente, labelOverlap: true, labelFlush: true,
      },
      axisX: { grid: false, tickCount: e.ancho < 520 ? 5 : 10, format: "%Y", labelPadding: 6 },
      legend: { labelColor: tema.texto, titleColor: tema.secundario, labelFontSize: 12, titleFontSize: 12, labelFont: tema.fuente, labelLimit: 320 },
      title: { color: tema.texto, subtitleColor: tema.secundario, anchor: "start", fontSize: 17, subtitleFontSize: 12, font: tema.fuente, subtitleFont: tema.fuente },
      text: { font: tema.fuente },
    },
  };
}

/**
 * Números de los quiebres arriba del gráfico. Si dos quedan a menos de 20 px, el segundo baja una fila, para que no
 * se pisen (por ejemplo, los quiebres de 2015 y 2016 del IPC).
 */
export function ubicarMarcadores(marcas: Array<{ n: number; i: number }>, ini: number, fin: number, ancho: number) {
  const px = (i: number) => ((i - ini) / Math.max(fin - ini, 1)) * ancho;
  const filas: number[] = [];
  return [...marcas].sort((a, b) => a.i - b.i).map((m) => {
    const x = px(m.i);
    let fila = filas.findIndex((ultimo) => x - ultimo >= 20);
    if (fila === -1) fila = filas.length;
    filas[fila] = x;
    return { n: String(m.n), t: iso(Math.round(m.i)), y: 10 + fila * 18 };
  });
}
