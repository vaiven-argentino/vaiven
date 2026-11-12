// Especificación de Vega-Lite de la ficha. Es una función pura (se prueba con Vitest) que recibe el resultado de
// la transformación y dibuja: la serie, cortada donde no hay continuidad; los quiebres como bandas o reglas
// numeradas; y los datos excluidos como una «×» sobre el eje. En las series con dimensión pais, las demás entidades
// de la selección inicial van como líneas finas en tono secundario y la elegida queda resaltada (SPEC 6.2).
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
  /** Sombreado por períodos: dos grises que se alternan y uno más oscuro para los gobiernos de facto (SPEC 6.3). */
  periodoA?: string;
  periodoB?: string;
  periodoFacto?: string;
  /** Colores de los países, del resaltado (el primero) a los demás (hasta 8). */
  paleta?: string[];
}

/** Un período para sombrear (fechas AAAA-MM-DD; `hasta` null = vigente; intervalo [desde, hasta)). */
export interface BandaPeriodo {
  desde: string;
  hasta: string | null;
  nombre: string;
  nombre_corto: string;
  facto?: boolean;
}

/** Un evento marcado con una letra sobre el eje (la lista con los nombres va debajo del gráfico). */
export interface MarcaEvento {
  letra: string;
  fecha: string;
  nombre: string;
}

export interface EntradaGrafico {
  resultado: Resultado;
  tramos: Tramo[];
  /** En las derivadas, los tramos son insumos que se superponen: la línea no se corta entre ellos. */
  empalme: "encadenar_tasas" | "yuxtaponer" | "derivar";
  quiebres: QuiebreNumerado[];
  tema: Tema;
  esVariacion: boolean;
  log: boolean;
  alto: number;
  ancho: number;
  descripcion: string;
  /** Series con dimensión pais: el nombre de la entidad resaltada y las demás de la selección, en tono secundario. */
  nombre?: string;
  otras?: Array<{ nombre: string; resultado: Resultado }>;
  /** Explorador: cada país con su color (`tema.paleta`) y su nombre al final de la línea, en lugar del tono secundario. */
  colores?: boolean;
  /**
   * Sombreado por períodos (fase 4b). Sin superposición (gobiernos, ministros, regímenes, etapas): bandas de fondo que
   * alternan dos grises. Con `franja` (planes, que pueden superponerse): barras en una franja arriba del gráfico.
   */
  sombreado?: { bandas: BandaPeriodo[]; franja?: boolean };
  eventos?: MarcaEvento[];
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
  /** En las series con dimensión pais, el nombre de la entidad (para el tooltip). */
  pais?: string;
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

/** Índice de meses (con fracción) de un día AAAA-MM-DD: «1983-12-10» → diciembre de 1983 más 9/31. */
export function indiceDia(dia: string): number {
  return indiceMes(dia.slice(0, 7)) + (Number(dia.slice(8, 10) || "1") - 1) / 31;
}

/** Ancho aproximado de un rótulo de 10,5 px (para decidir si entra en la banda). */
const anchoTexto = (t: string) => t.length * 5.6 + 8;

/**
 * Filas de la franja de planes: un plan baja una fila si se superpone con uno de la fila de arriba (por ejemplo, el
 * programa de Martínez de Hoz y el del 20 de diciembre de 1978).
 */
export function filasFranja(bandas: Array<{ a: number; b: number }>): number[] {
  const finDeFila: number[] = [];
  return bandas.map(({ a, b }) => {
    let fila = finDeFila.findIndex((fin) => fin <= a);
    if (fila === -1) fila = finDeFila.length;
    finDeFila[fila] = b;
    return fila;
  });
}

/** Separa los rótulos finales de los países para que no se pisen (en unidades del eje Y). */
export function separarRotulos(valores: number[], minimo: number): number[] {
  const orden = valores.map((v, k) => ({ v, k })).sort((x, y) => y.v - x.v);
  const salida = new Array<number>(valores.length);
  let anterior = Number.POSITIVE_INFINITY;
  for (const { v, k } of orden) {
    const y = Math.min(v, anterior - minimo);
    salida[k] = y;
    anterior = y;
  }
  return salida;
}

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

  // Los quiebres de la entidad resaltada y de las demás que se ven (un quiebre de un solo país, solo si ese país está).
  const ids = new Set([e.resultado, ...(e.otras ?? []).map((o) => o.resultado)].flatMap((r) => r.advertencias.map((a) => a.id)));
  const visibles = e.quiebres.filter((q) => ids.has(q.advertencia.id) && q.forma !== "general");
  const px = (i: number) => ((i - ini) / Math.max(fin - ini, 1)) * e.ancho;
  const sombra = sombreado(e, ini, fin, px);
  // Un quiebre largo (más de un tercio de lo visible) no se sombrea: taparía la serie. Se marca arriba del
  // gráfico con una línea punteada que muestra su rango. Con sombreado por períodos, ningún quiebre lleva relleno:
  // el relleno queda para los períodos.
  const largo = (a: number, b: number) => sombra.activo || b - a > (fin - ini) / 3;
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
  const marcadores = ubicarMarcadores([...rangos, ...reglas].map((q) => ({ n: q.n, i: q.medio })), ini, fin, e.ancho)
    .map((m) => ({ ...m, y: m.y + sombra.arriba }));
  const excluidos = e.resultado.excluidos.map((x) => ({ t: iso(indiceMes(x.fecha)), texto: `Dato excluido (${fechaCorta(x.fecha)}): ${x.motivo}` }));

  const filasOtras = (e.otras ?? []).flatMap((o) => filas({ ...e, resultado: o.resultado }).map((f) => ({ ...f, pais: o.nombre })));
  const todas = [...filasLinea, ...filasOtras];
  const tramosDistintos = new Set(filasLinea.map((f) => f.tramo)).size > 1 && e.empalme === "yuxtaponer";
  const ralo = filasLinea.length <= 160 || e.resultado.frecuencias.some((f) => f === "semestral" || f === "anual");
  const positivos = todas.every((f) => f.v > 0);
  const log = e.log && positivos;
  const minimo = Math.min(...todas.map((f) => Math.abs(f.v)).filter((v) => v > 0));
  const cero = e.esVariacion || todas.every((f) => f.v >= 0);
  const tope = topeY(todas.map((f) => f.v), reservaSuperior(marcadores, barras.length > 0, sombra.arriba), e.alto, log, cero);
  // Con valores negativos, un margen abajo para que el mínimo no quede pegado al eje.
  const negativos = !log && todas.some((f) => f.v < 0);
  const minY = Math.min(...todas.map((f) => f.v));
  const piso = negativos ? minY - (Math.max(...todas.map((f) => f.v), 0) - minY) * 0.08 : undefined;
  const y = {
    field: "v", type: "quantitative", title: null,
    scale: {
      ...(log ? { type: "log" } : { zero: cero }), ...(tope === undefined ? {} : { domainMax: tope }),
      ...(piso === undefined ? {} : { domainMin: piso, nice: false }),
    },
    axis: log && minimo < 0.01 ? { labelExpr: ROTULO_POTENCIA, values: potenciasDeDiez(minimo, Math.max(...filasLinea.map((f) => f.v))) }
      : { format: ",~r", tickCount: 6 },
  };
  const tooltip = [...(e.nombre ? [{ field: "pais", title: "País" }] : []), { field: "fecha", title: "Fecha" }, { field: "valor", title: "Valor" }];
  if (e.nombre) filasLinea.forEach((f) => Object.assign(f, { pais: e.nombre }));

  const capas: Record<string, unknown>[] = [...sombra.capas(x)];
  // Las letras de los eventos cercanos (menos de 12 px) se escalonan en dos o tres alturas, para que no se pisen.
  const eventos = escalonar((e.eventos ?? []).filter((ev) => indiceDia(ev.fecha) >= ini && indiceDia(ev.fecha) <= fin), px);
  if (eventos.length) {
    capas.push({
      data: { values: eventos }, mark: { type: "rule", color: tema.borde, strokeDash: [1, 3], strokeWidth: 1, clip: true },
      encoding: { x: x("fecha"), tooltip: [{ field: "letra", title: "Evento" }, { field: "nombre", title: "Nombre" }] },
    });
  }
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
      encoding: { x: x("desde"), x2: { field: "hasta" }, y: { value: 24 + sombra.arriba } },
    });
    capas.push({
      data: { values: barras.flatMap((b) => [{ t: b.desde }, { t: b.hasta }]) },
      mark: { type: "rule", color: tema.secundario, strokeWidth: 1.5, clip: true },
      encoding: { x: x("t"), y: { value: 19 + sombra.arriba }, y2: { value: 29 + sombra.arriba } },
    });
  }
  if (reglas.length) {
    capas.push({
      data: { values: reglas }, mark: { type: "rule", color: tema.secundario, strokeDash: [4, 3], strokeWidth: 1.2, clip: true },
      encoding: { x: x("desde") },
    });
  }
  if (negativos) {
    // La línea del 0, más marcada que la grilla, cuando hay valores negativos. Repite la definición de `y` tal cual: un
    // `axis: null` (o un `datum` sin eje) en esta capa apaga el eje Y o la grilla de todo el gráfico, porque las capas
    // comparten el eje (revisión del 07/11/2026; lo controla web/test/espec.test.ts).
    capas.push({ data: { values: [{ v: 0 }] }, mark: { type: "rule", color: tema.borde, strokeWidth: 1.2 }, encoding: { y } });
  }
  const paleta = e.colores ? (tema.paleta ?? []) : [];
  const colorDe = (k: number) => paleta[k] ?? tema.secundario;
  if (filasOtras.length) {
    const conColor = filasOtras.map((f) => ({ ...f, color: colorDe((e.otras ?? []).findIndex((o) => o.nombre === f.pais) + 1) }));
    capas.push({
      data: { values: conColor },
      mark: e.colores
        ? { type: "line", strokeWidth: 1.6, opacity: 0.9, interpolate: "linear" }
        : { type: "line", color: tema.secundario, strokeWidth: 1.2, opacity: 0.75, interpolate: "linear" },
      encoding: {
        x: x("t"), y, detail: [{ field: "pais", type: "nominal" }, { field: "segmento", type: "nominal" }],
        ...(e.colores ? { color: { field: "color", type: "nominal", scale: null, legend: null } } : {}),
      },
    });
    capas.push({ data: { values: filasOtras }, mark: { type: "point", opacity: 0, size: 60 }, encoding: { x: x("t"), y, tooltip } });
  }
  capas.push({
    data: { values: filasLinea }, mark: { type: "line", color: e.colores ? colorDe(0) : tema.serie, strokeWidth: filasOtras.length ? 2.6 : 2, interpolate: "linear" },
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
  // Explorador con varios países: el nombre al final de cada línea, en su color (si hay lugar a la derecha).
  const rotulos = e.colores && filasOtras.length && e.ancho >= 520 ? rotulosFinales(e, filasLinea, filasOtras, colorDe) : [];
  if (rotulos.length) {
    // La separación mínima, en unidades del eje: 13 px sobre el dominio que se dibuja (con el 0 si el eje lo incluye).
    const alto = tope ?? Math.max(...todas.map((f) => f.v));
    const bajo = piso ?? (cero ? Math.min(0, ...todas.map((f) => f.v)) : Math.min(...todas.map((f) => f.v)));
    const vy = separarRotulos(rotulos.map((r) => r.v), ((alto - bajo) || 1) * 13 / e.alto);
    capas.push({
      data: { values: rotulos.map((r, k) => ({ ...r, vy: log ? r.v : vy[k] })) },
      mark: { type: "text", align: "left", baseline: "middle", dx: 5, fontSize: 11, fontWeight: 600 },
      encoding: { x: x("t"), y: { ...y, field: "vy" }, text: { field: "pais" }, color: { field: "color", type: "nominal", scale: null, legend: null } },
    });
  }
  if (eventos.length) {
    // Cada letra va sobre un cuadrado con el color del fondo, para que se lea aunque caiga sobre la serie o la línea
    // del 0 (revisión visual de la 4b); las muy pegadas al borde izquierdo se corren un poco.
    eventos.forEach((ev) => Object.assign(ev, { y: e.alto - 10 - ev.fila * 14, dx: px(indiceDia(ev.fecha)) < 8 ? 6 : 0 }));
    capas.push({
      data: { values: eventos }, mark: { type: "point", shape: "square", size: 150, filled: true, color: tema.fondo, stroke: tema.borde, strokeWidth: 0.8, opacity: 1 },
      encoding: { x: x("fecha"), xOffset: { field: "dx", type: "quantitative", scale: null }, y: { field: "y", type: "quantitative", scale: null }, tooltip: [{ field: "nombre", title: "Evento" }] },
    });
    capas.push({
      data: { values: eventos }, mark: { type: "text", color: tema.texto, fontSize: 9.5, fontWeight: 700, baseline: "middle" },
      encoding: { x: x("fecha"), xOffset: { field: "dx", type: "quantitative", scale: null }, y: { field: "y", type: "quantitative", scale: null }, text: { field: "letra" }, tooltip: [{ field: "nombre", title: "Evento" }] },
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
    padding: e.impreso
      ? { top: 20, left: 20, bottom: 20, right: 20 + margenRotulos(rotulos) }
      : { top: 4, right: 6 + margenRotulos(rotulos), bottom: 4, left: 4 },
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
      axisX: { grid: false, labelPadding: 6, ...marcasX(fin - ini + 1, e.ancho < 520 ? 5 : 10) },
      legend: { labelColor: tema.texto, titleColor: tema.secundario, labelFontSize: 12, titleFontSize: 12, labelFont: tema.fuente, labelLimit: 320 },
      title: { color: tema.texto, subtitleColor: tema.secundario, anchor: "start", fontSize: 17, subtitleFontSize: 12, font: tema.fuente, subtitleFont: tema.fuente },
      text: { font: tema.fuente },
    },
  };
}

const MESES_X = "['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.']";

/**
 * Marcas del eje X según el largo del período (en meses): en años enteros si son 3 años o más, y en meses, con
 * «mes año», si es más corto. Antes, con períodos cortos, el eje repetía el año («2024 2024 2024») porque ponía una
 * marca por trimestre con solo el año (segunda revisión de la 4a, revisión visual).
 */
export function marcasX(meses: number, maximo: number): Record<string, unknown> {
  if (meses >= 36) {
    const anios = meses / 12;
    const paso = [1, 2, 5, 10, 20, 25, 50].find((p) => anios / p <= maximo) ?? 50;
    return { tickCount: { interval: "year", step: paso }, format: "%Y" };
  }
  const paso = [1, 2, 3, 6, 12].find((p) => meses / p <= maximo) ?? 12;
  return {
    tickCount: { interval: "month", step: paso },
    labelExpr: `${MESES_X}[utcmonth(datum.value)] + ' ' + utcyear(datum.value)`,
  };
}

/**
 * Píxeles que ocupan arriba del gráfico los números de los quiebres (círculos de unos 17 px centrados en
 * 10 + fila × 18) y la línea punteada de los quiebres largos (de 19 a 29 px), más un margen que cubre el radio
 * de los puntos de la serie (hasta 3 px) y deja unos 8 px libres.
 */
export function reservaSuperior(marcadores: Array<{ y: number }>, hayBarras: boolean, arriba = 0): number {
  const bordes = [...marcadores.map((m) => m.y + 9), ...(hayBarras ? [29 + arriba] : []), ...(arriba ? [arriba] : [])];
  return bordes.length ? Math.max(...bordes) + 12 : 0;
}

/**
 * Máximo del eje Y que deja libres los `reserva` píxeles de arriba, para que la serie no toque los números de los
 * quiebres (por ejemplo, el pico de desocupación de 2002). En escala logarítmica, la cuenta se hace en logaritmos.
 */
export function topeY(valores: number[], reserva: number, alto: number, log: boolean, cero: boolean): number | undefined {
  if (!reserva || !valores.length || reserva >= alto / 2) return undefined;
  const fraccion = reserva / (alto - reserva);
  if (log) {
    const lo = Math.log10(Math.min(...valores)), hi = Math.log10(Math.max(...valores));
    return 10 ** (hi + Math.max(hi - lo, 1) * fraccion);
  }
  const hi = Math.max(...valores);
  const lo = cero ? Math.min(0, ...valores) : Math.min(...valores);
  return hi + (hi - lo || Math.abs(hi) || 1) * fraccion;
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

/** El último dato de cada país (para el rótulo al final de la línea). */
function rotulosFinales(e: EntradaGrafico, linea: Fila[], otras: Fila[], colorDe: (k: number) => string) {
  const ultimo = (fs: Fila[]) => fs.reduce<Fila | null>((a, f) => (!a || f.t >= a.t ? f : a), null);
  const salida: Array<{ t: string; v: number; pais: string; color: string }> = [];
  const propia = ultimo(linea);
  if (propia && e.nombre) salida.push({ t: propia.t, v: propia.v, pais: e.nombre, color: colorDe(0) });
  (e.otras ?? []).forEach((o, k) => {
    const f = ultimo(otras.filter((x) => x.pais === o.nombre));
    if (f) salida.push({ t: f.t, v: f.v, pais: o.nombre, color: colorDe(k + 1) });
  });
  return salida;
}

const margenRotulos = (r: Array<{ pais: string }>) => (r.length ? Math.min(150, Math.max(...r.map((x) => anchoTexto(x.pais)))) : 0);

/** Un día AAAA-MM-DD a partir de un índice de meses con fracción (para centrar rótulos). */
function isoDia(i: number): string {
  const mes = Math.floor(i);
  const dia = Math.min(28, 1 + Math.round((i - mes) * 31));
  return `${iso(mes).slice(0, 8)}${String(dia).padStart(2, "0")}`;
}

/**
 * Capas del sombreado por períodos. Devuelve también cuántos píxeles ocupa arriba (rótulos o franja de planes), para
 * bajar los números de los quiebres y dejar aire en el eje Y.
 */
function sombreado(e: EntradaGrafico, ini: number, fin: number, px: (i: number) => number) {
  const bandas = (e.sombreado?.bandas ?? [])
    .map((b) => {
      const a = Math.max(indiceDia(b.desde), ini);
      const z = Math.min(b.hasta ? indiceDia(b.hasta) : fin, fin);
      return { ...b, a, z, xa: indiceDia(b.desde) < ini ? iso(ini) : b.desde, xz: !b.hasta || indiceDia(b.hasta) > fin ? iso(fin) : b.hasta };
    })
    .filter((b) => b.z > b.a);
  const t = e.tema;
  if (!bandas.length) return { activo: false, arriba: 0, capas: () => [] as Record<string, unknown>[] };
  const rango = (b: BandaPeriodo) => {
    const f = (d: string) => { const [a, m, dd] = d.split("-"); return `${Number(dd)}/${Number(m)}/${a}`; };
    return b.hasta ? `${f(b.desde)}–${f(b.hasta)}` : `desde el ${f(b.desde)}`;
  };
  const tooltip = [{ field: "nombre", title: "Período" }, { field: "rango", title: "Fechas" }];
  if (e.sombreado?.franja) {
    const filas = filasFranja(bandas.map((b) => ({ a: b.a, b: b.z })));
    const alto = 10, paso = 13;
    const datos = bandas.map((b, k) => ({
      desde: b.xa, hasta: b.xz, nombre: b.nombre, corto: b.nombre_corto, rango: rango(b), y: 3 + filas[k] * paso, y2: 3 + filas[k] * paso + alto, yc: 3 + filas[k] * paso + alto / 2,
      rotulo: px(b.z) - px(b.a) >= anchoTexto(b.nombre_corto) ? b.nombre_corto : "",
    }));
    const arriba = (Math.max(...filas) + 1) * paso + 6;
    return {
      activo: true, arriba,
      capas: (x: (c: string) => Record<string, unknown>) => [
        { data: { values: datos }, mark: { type: "rect", color: t.periodoFacto ?? t.banda, clip: true },
          encoding: { x: x("desde"), x2: { field: "hasta" }, y: { field: "y", type: "quantitative", scale: null }, y2: { field: "y2" }, tooltip } },
        { data: { values: datos.filter((d) => d.rotulo) }, mark: { type: "text", color: t.texto, fontSize: 9.5, align: "left", baseline: "middle", dx: 3 },
          encoding: { x: x("desde"), y: { field: "yc", type: "quantitative", scale: null }, text: { field: "rotulo" } } },
      ],
    };
  }
  const datos = bandas.map((b, k) => ({
    desde: b.xa, hasta: b.xz, nombre: b.nombre, rango: rango(b), medio: isoDia((b.a + b.z) / 2),
    color: b.facto ? (t.periodoFacto ?? t.banda) : k % 2 ? (t.periodoB ?? t.banda) : (t.periodoA ?? t.fondo),
    rotulo: px(b.z) - px(b.a) >= anchoTexto(b.nombre_corto) ? b.nombre_corto : "",
  }));
  const conRotulo = datos.filter((d) => d.rotulo);
  return {
    activo: true, arriba: conRotulo.length ? 16 : 0,
    capas: (x: (c: string) => Record<string, unknown>) => [
      { data: { values: datos }, mark: { type: "rect", clip: true, opacity: 1 },
        encoding: { x: x("desde"), x2: { field: "hasta" }, color: { field: "color", type: "nominal", scale: null, legend: null }, tooltip } },
      ...(conRotulo.length ? [{ data: { values: conRotulo }, mark: { type: "text", color: t.secundario, fontSize: 10, baseline: "top", dy: 0 },
        encoding: { x: x("medio"), y: { value: 3 }, text: { field: "rotulo" } } }] : []),
    ],
  };
}

/** Fila (0 abajo) de la letra de cada evento: sube una fila si queda a menos de 13 px del anterior de esa fila (hasta 6). */
function escalonar(eventos: MarcaEvento[], px: (i: number) => number): Array<MarcaEvento & { fila: number; y?: number }> {
  const ultimoEnFila: number[] = [];
  return [...eventos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((ev) => {
    const x = px(indiceDia(ev.fecha));
    let fila = ultimoEnFila.findIndex((u) => x - u >= 13);
    if (fila === -1) fila = Math.min(ultimoEnFila.length, 5);
    ultimoEnFila[fila] = x;
    return { ...ev, fila };
  });
}
