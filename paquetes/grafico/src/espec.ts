// Especificación de Vega-Lite de la ficha. Es una función pura (se prueba con Vitest) que recibe el resultado de
// la transformación y dibuja: la serie, cortada donde no hay continuidad; los quiebres como bandas o reglas
// numeradas; y los datos excluidos como una «×» sobre el eje. En las series con dimensión pais, las demás entidades
// de la selección inicial van como líneas finas en tono secundario y la elegida queda resaltada (SPEC 6.2).
import {
  PASO, fechaDeDibujo, indiceFin, indiceMes, referenciaDe, textoPeriodo, textoReparto, ubicar,
  type ContextoUbicacion, type Periodo, type Resultado, type TipoPeriodo, type Tramo,
} from "@vaiven/transformaciones";
import type { QuiebreNumerado } from "./ficha";
import { fechaCorta, fechaLegible, numero } from "./formato";

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
  /** Franja de los planes (1,47:1 o más contra el fondo en los dos modos). */
  periodoFranja?: string;
  /** Los gobiernos de facto en la cinta de los períodos, debajo del eje (sonda 3 de la 4e): el más oscuro. */
  periodoCintaFacto?: string;
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

/** Un episodio (proceso de varios meses, que puede superponerse con otros) y sus fases, para la franja de debajo del eje. */
export interface BandaEpisodio extends BandaPeriodo {
  fases?: BandaPeriodo[];
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
  otras?: Array<{ nombre: string; resultado: Resultado; ubicacion?: ContextoUbicacion; tramos?: Tramo[]; empalme?: EntradaGrafico["empalme"]; discontinua?: boolean }>;
  /**
   * Comparación: la línea principal es otra variante de una serie que ya está en la vista, y va con trazo discontinuo,
   * así donde las dos coinciden se ven las dos (M4, 4e). En `otras`, lo mismo para cada una.
   */
  discontinua?: boolean;
  /** Explorador: cada país con su color (`tema.paleta`) y su nombre al final de la línea, en lugar del tono secundario. */
  colores?: boolean;
  /**
   * Sombreado por períodos (fase 4b). Sin superposición (gobiernos, ministros, regímenes, etapas): una cinta entre el
   * eje X y los años, con el nombre de cada período adentro (sonda 3 de la 4e; antes, bandas de fondo). Con `franja`
   * (planes, que pueden superponerse): barras en una franja arriba del gráfico.
   */
  sombreado?: { bandas: BandaPeriodo[]; franja?: boolean };
  /**
   * Cómo se ubica cada dato en el tiempo (ubicacion.ts de la librería): los saldos en nivel, el último día; lo demás,
   * en el punto medio de la observación. Sin contexto, como un promedio.
   */
  ubicacion?: ContextoUbicacion;
  /** Con sombreado: los períodos del tipo elegido, para decir en el tooltip a cuál se asigna cada dato y su reparto. */
  asignacion?: { periodos: Periodo[]; tipo: TipoPeriodo };
  /** Episodios (con «Marcar eventos»): una franja debajo del eje, del estilo de los quiebres largos. */
  episodios?: BandaEpisodio[];
  eventos?: MarcaEvento[];
  /** Solo para exportar la imagen: título, subtítulo y pie impresos dentro del gráfico. */
  impreso?: { titulo: string; subtitulo: string; pie: string[] };

  // ── Comparación de series (4c/4d). Sin estos campos, el gráfico es el de una serie, como en la 4b. ──
  /** Dominio del eje X en meses, común a todas las series (y a todos los paneles). */
  dominio?: { ini: number; fin: number };
  /** Dominio del eje Y fijo (los ceros alineados del doble eje), sin redondear. */
  dominioY?: [number, number];
  /** Sin eje X (los paneles de arriba: el eje de fechas va solo en el último). */
  sinEjeX?: boolean;
  /** El eje Y a la derecha y sin grilla (el segundo eje del doble eje). */
  ejeDerecho?: boolean;
  /**
   * Título del eje Y con varias series: solo la unidad, horizontal y arriba del eje (a la izquierda o, en el eje derecho,
   * a la derecha), en el color de su serie si es una sola (N8, 4e).
   */
  tituloEjeY?: { texto: string; color: string };
  /** Con varias series: el nombre al final de la línea también cuando la línea va sola en su eje o panel (N8). */
  rotularSiempre?: boolean;
  /** Doble eje: los nombres van a la derecha del eje derecho, después de sus números, para no pisarlo (N8). */
  rotulosTrasEje?: boolean;
  /** Con la leyenda única: sin nombres al final de las líneas (N8). */
  sinRotulos?: boolean;
  /** La leyenda única (N8), arriba del gráfico: una entrada por serie, con su color y su trazo. */
  leyenda?: EntradaLeyenda[];
  /** Cuánto arriba del área del gráfico empieza la leyenda (en los paneles, por encima del título del panel). */
  leyendaEncima?: number;
  /** Cómo se llama en el tooltip lo que nombra cada línea: «País» (por defecto) o «Serie». */
  rotuloNombre?: string;
  /** Sin las letras de los eventos arriba del área (van solo en el primer panel; los demás conservan las reglas). */
  sinLetrasEventos?: boolean;
  /** Sin tooltip propio en las líneas: lo da la guía común de la comparación (`capasExtra`). */
  sinTooltip?: boolean;
  /**
   * Prefijo de los nombres de los datos compartidos (`datasets`). Con varias especificaciones en un mismo gráfico (doble
   * eje, paneles), cada una lleva el suyo para que los nombres no choquen.
   */
  prefijoDatos?: string;
  /**
   * Series distintas en el mismo panel (comparación): ninguna línea va resaltada, y cada una lleva sus puntos (si es
   * rala) en su propio color. Sin esto, la primera línea se resalta, como el país elegido de las internacionales.
   */
  sinResaltado?: boolean;
  /** Capas que se agregan al final (la guía vertical común). */
  capasExtra?: Record<string, unknown>[];
}

export interface EntradaLeyenda {
  texto: string;
  color: string;
  discontinua?: boolean;
}

/** Alto de un renglón de la leyenda única y aire entre la leyenda y el título de los ejes. */
const RENGLON_LEYENDA = 16;

/** Las entradas de la leyenda en renglones, sin pasar del ancho: posición en píxeles de cada una. */
export function ubicarLeyenda(entradas: EntradaLeyenda[], ancho: number): Array<EntradaLeyenda & { x: number; renglon: number }> {
  let x = 0, renglon = 0;
  return entradas.map((en) => {
    const largo = 22 + en.texto.length * 5.8 + 16;
    if (x > 0 && x + largo > ancho) { x = 0; renglon += 1; }
    const salida = { ...en, x, renglon };
    x += largo;
    return salida;
  });
}

/** Lo que ocupa la leyenda arriba del gráfico (para el margen superior). */
export const altoLeyenda = (entradas: EntradaLeyenda[] | undefined, ancho: number) =>
  entradas?.length ? (Math.max(...ubicarLeyenda(entradas, ancho).map((u) => u.renglon)) + 1) * RENGLON_LEYENDA + 6 : 0;

/** Lo que ocupan, más o menos, los números del eje derecho del doble eje («50.000»): ahí empiezan los nombres. */
const ANCHO_NUMEROS_EJE_DERECHO = 52;

/** Lo que se descuenta del ancho para la leyenda: el eje Y (y, en el doble eje, el derecho), más o menos. */
const ANCHO_EJE_LEYENDA = 110;

/** Lo que ocupa arriba el título horizontal de los ejes (N8). */
export const ALTO_TITULO_EJE = 18;

export interface Fila {
  t: string;
  v: number;
  segmento: number;
  tramo: string;
  fecha: string;
  valor: string;
  /** En las series con dimensión pais, el nombre de la entidad (para el tooltip). */
  pais?: string;
  /** Con sombreado: el período al que se asigna el dato y, si cruza un cambio, el reparto. */
  periodo?: string;
  reparto?: string;
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
export function filas(e: Pick<EntradaGrafico, "resultado" | "tramos" | "empalme" | "esVariacion" | "ubicacion" | "asignacion" | "sinTooltip">): Fila[] {
  // Sin tooltip propio (la comparación, con la guía común), cada fila lleva solo lo que dibuja la línea: la fecha de
  // dibujo, el valor y el segmento. Ahorra CPU y peso (SPEC 7.3).
  const compacto = e.sinTooltip === true;
  const contexto = e.ubicacion ?? { agregacion: "promedio" as const };
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
    const ref = referenciaDe(fecha, f, contexto);
    if (compacto) {
      // La fecha en ISO corto (sigue en UTC) y el valor con 6 cifras significativas: alcanza para dibujar y pesa menos.
      salida.push({ t: fechaDeDibujo(ref).replace(":00.000Z", "Z"), v: Number(v.toPrecision(6)), segmento } as Fila);
      anterior = { i, paso, tramo };
      return;
    }
    // La fecha de dibujo, en ISO corto como en el modo compacto (sonda 3 de la 4e: pesa menos y es la misma fecha).
    const fila: Fila = {
      t: fechaDeDibujo(ref).replace(":00.000Z", "Z"), v, segmento, tramo: tramo >= 0 ? nombreTramo(e.tramos[tramo]) : "",
      fecha: fechaLegible(fecha, f), valor: numero(v, e.esVariacion),
    };
    if (e.asignacion) {
      const u = ubicar(ref, e.asignacion.periodos, e.asignacion.tipo);
      fila.periodo = textoPeriodo(u);
      fila.reparto = textoReparto(u) || "—";
    }
    salida.push(fila);
    anterior = { i, paso, tramo };
  });
  return salida;
}

export function especificacion(e: EntradaGrafico): Record<string, unknown> {
  const filasLinea = filas(e);
  const { tema } = e;
  if (!filasLinea.length) return { $schema: "https://vega.github.io/schema/vega-lite/v6.json", data: { values: [] }, mark: "point" };

  const frecUltima = e.resultado.frecuencias[e.resultado.frecuencias.length - 1];
  // El eje va del primer día de la primera observación al día siguiente del último de la última (`dominioMeses`).
  // `meses` es la cantidad de meses que cubre (para las marcas del eje).
  const { ini, fin } = e.dominio ?? dominioMeses(e.resultado);
  const meses = fin - ini;
  const dominioX = [iso(ini), iso(fin)];
  const x = (campo: string) => ({ field: campo, type: "temporal", scale: { type: "utc", domain: dominioX }, title: null, ...(e.sinEjeX ? { axis: null } : {}) });

  // Los quiebres de la entidad resaltada y de las demás que se ven (un quiebre de un solo país, solo si ese país está).
  const ids = new Set([e.resultado, ...(e.otras ?? []).map((o) => o.resultado)].flatMap((r) => r.advertencias.map((a) => a.id)));
  const visibles = e.quiebres.filter((q) => ids.has(q.advertencia.id) && q.forma !== "general");
  const px = (i: number) => ((i - ini) / Math.max(fin - ini, 1)) * e.ancho;

  // Los datos que usan varias capas (la línea y sus puntos, o los puntos invisibles del tooltip) van una sola vez, en
  // `datasets`, con nombre: antes iban repetidos en cada capa y una serie mensual completa pesaba el doble (M11, 4e).
  // Los que son iguales en todos los paneles (los eventos) van sin prefijo, una vez para todo el gráfico (H6, sonda 3).
  const conjuntos: Record<string, unknown[]> = {};
  const compartir = (nombre: string, valores: unknown[], comun = false) => {
    const clave = `${comun ? "" : e.prefijoDatos ?? ""}${nombre}`;
    conjuntos[clave] = valores;
    return { name: clave };
  };
  const sombra = sombreado(e, ini, fin, px, compartir);
  // Un quiebre largo (más de un tercio de lo visible) no se sombrea: taparía la serie. Se marca arriba del
  // gráfico con una línea punteada que muestra su rango. Con la franja de los planes, ningún quiebre lleva relleno.
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
  // Los eventos marcados en lo que se ve. Sus letras van arriba del área, en el primer panel (O6, sonda 3 de la 4e).
  const eventos = (e.eventos ?? []).filter((ev) => indiceDia(ev.fecha) >= ini && indiceDia(ev.fecha) <= fin)
    .sort((a, b) => a.fecha.localeCompare(b.fecha)).map((ev) => ({ ...ev, dia: diaLegible(ev.fecha) }));
  const conLetras = eventos.length > 0 && !e.sinLetrasEventos;
  const arriba = sombra.arriba + (conLetras ? ALTO_LETRAS : 0);
  const marcadores = ubicarMarcadores([...rangos, ...reglas].map((q) => ({ n: q.n, i: q.medio })), ini, fin, e.ancho)
    .map((m) => ({ ...m, y: m.y + arriba }));
  const frecDe = (fecha: string) => e.resultado.frecuencias[e.resultado.datos.findIndex((d) => d[0] === fecha)] ?? frecUltima;
  const excluidos = e.resultado.excluidos.map((x) => ({
    t: fechaDeDibujo(referenciaDe(x.fecha, frecDe(x.fecha), e.ubicacion ?? { agregacion: "promedio" })),
    texto: `Dato excluido (${fechaCorta(x.fecha)}): ${x.motivo}`,
  }));

  const datosLinea = compartir("linea", filasLinea);

  const filasOtras = (e.otras ?? []).flatMap((o) => filas({ ...e, resultado: o.resultado, ubicacion: o.ubicacion ?? e.ubicacion, tramos: o.tramos ?? e.tramos, empalme: o.empalme ?? e.empalme }).map((f) => ({ ...f, pais: o.nombre })));
  const todas = [...filasLinea, ...filasOtras];
  const tramosDistintos = !e.sinTooltip && new Set(filasLinea.map((f) => f.tramo)).size > 1 && e.empalme === "yuxtaponer";
  // El tramo de cada fila solo hace falta para la forma de los puntos: si no se usa, sale (unos 30 caracteres por dato).
  if (!tramosDistintos) for (const f of filasLinea) delete (f as Partial<Fila>).tramo;
  const ralo = filasLinea.length <= 160 || e.resultado.frecuencias.some((f) => f === "semestral" || f === "anual");
  const positivos = todas.every((f) => f.v > 0);
  const log = e.log && positivos;
  const minimo = Math.min(...todas.map((f) => Math.abs(f.v)).filter((v) => v > 0));
  const cero = e.esVariacion || todas.every((f) => f.v >= 0);
  const tope = topeY(todas.map((f) => f.v), reservaSuperior(marcadores, barras.length > 0, arriba), e.alto, log, cero);
  // Con valores negativos, un margen abajo para que el mínimo no quede pegado al eje.
  const negativos = !log && todas.some((f) => f.v < 0);
  const minY = Math.min(...todas.map((f) => f.v));
  const piso = negativos ? minY - (Math.max(...todas.map((f) => f.v), 0) - minY) * 0.08 : undefined;
  const ejeY = log && minimo < 0.01 ? { labelExpr: ROTULO_POTENCIA, values: potenciasDeDiez(minimo, Math.max(...filasLinea.map((f) => f.v))) }
    : { format: ",~r", tickCount: 6 };
  const y = {
    field: "v", type: "quantitative", title: e.tituloEjeY?.texto ?? null,
    scale: e.dominioY && !log
      ? { domain: e.dominioY, nice: false, zero: false }
      : {
        ...(log ? { type: "log" } : { zero: cero }), ...(tope === undefined ? {} : { domainMax: tope }),
        ...(piso === undefined ? {} : { domainMin: piso, nice: false }),
      },
    axis: e.ejeDerecho || e.tituloEjeY
      ? {
        ...ejeY, ...(e.ejeDerecho ? { orient: "right", grid: false } : {}),
        // El título, horizontal y arriba del eje: no compite con los nombres al final de las líneas (N8).
        ...(e.tituloEjeY ? {
          titleColor: e.tituloEjeY.color, titleFontWeight: 600, titleFontSize: 12, titleAngle: 0, titleAnchor: "end",
          titleAlign: e.ejeDerecho ? "right" : "left", titleBaseline: "bottom", titleX: 0, titleY: -6,
        } : {}),
      }
      : ejeY,
  };
  const tooltip = e.sinTooltip ? undefined : [...(e.nombre ? [{ field: "pais", title: e.rotuloNombre ?? "País" }] : []), { field: "fecha", title: "Fecha" }, { field: "valor", title: "Valor" },
    ...(e.asignacion ? [{ field: "periodo", title: "Período" }, { field: "reparto", title: "Reparto" }] : [])];
  if (e.nombre && !e.sinTooltip) filasLinea.forEach((f) => Object.assign(f, { pais: e.nombre }));

  const capas: Record<string, unknown>[] = [...sombra.capas(x)];
  // Debajo del eje van, en orden: la cinta de los períodos, la franja de los episodios y los años.
  const franjaEpisodios = episodios({ ...e, alto: e.alto + sombra.abajo }, ini, fin, px, compartir);
  const debajo = sombra.abajo + franjaEpisodios.alto;
  // Eventos (SPEC 6.2): una regla punteada en cada panel, desde debajo de las letras; las letras, arriba del primero.
  const tooltipEvento = [{ field: "letra", title: "Evento" }, { field: "nombre", title: "Nombre" }, { field: "dia", title: "Fecha" }];
  if (eventos.length) {
    const datosEventos = compartir("eventos", eventos, true);
    capas.push({
      data: datosEventos, mark: { type: "rule", color: tema.borde, strokeDash: [1, 3], strokeWidth: 1, clip: true },
      encoding: { x: x("fecha"), y: { value: conLetras ? sombra.arriba + ALTO_LETRAS - 2 : sombra.arriba }, y2: { value: e.alto }, tooltip: tooltipEvento },
    });
    // Una franja invisible más ancha sobre cada regla, para que el nombre aparezca sin apuntar a la línea fina.
    capas.push({
      data: datosEventos, mark: { type: "rule", color: tema.fondo, strokeWidth: 9, opacity: 0, clip: true },
      encoding: { x: x("fecha"), y: { value: sombra.arriba }, y2: { value: e.alto }, tooltip: tooltipEvento },
    });
  }
  if (bandas.length) {
    capas.push({
      data: { values: bandas }, mark: { type: "rect", color: tema.banda, opacity: 1, clip: true },
      encoding: { x: x("desde"), x2: { field: "hasta", type: "temporal" } },
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
      encoding: { x: x("desde"), x2: { field: "hasta", type: "temporal" }, y: { value: 24 + arriba } },
    });
    capas.push({
      data: { values: barras.flatMap((b) => [{ t: b.desde }, { t: b.hasta }]) },
      mark: { type: "rule", color: tema.secundario, strokeWidth: 1.5, clip: true },
      encoding: { x: x("t"), y: { value: 19 + arriba }, y2: { value: 29 + arriba } },
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
  if (filasOtras.length && e.sinResaltado) {
    // Series distintas (comparación): una capa por línea, con su color en la marca.
    (e.otras ?? []).forEach((o, k) => {
      const valores = filasOtras.filter((f) => f.pais === o.nombre).map((f) => ({ t: f.t, v: f.v, segmento: f.segmento }));
      if (valores.length) {
        capas.push({
          data: compartir(`otra${k + 1}`, valores), mark: { type: "line", color: colorDe(k + 1), strokeWidth: 2, interpolate: "linear", ...(o.discontinua ? { strokeDash: TRAZO_VARIANTE } : {}) },
          encoding: { x: x("t"), y, detail: { field: "segmento", type: "nominal" } },
        });
      }
    });
  } else if (filasOtras.length) {
    const conColor = filasOtras.map((f) => ({ ...f, color: colorDe((e.otras ?? []).findIndex((o) => o.nombre === f.pais) + 1) }));
    const datosOtras = compartir("otras", conColor);
    capas.push({
      data: datosOtras,
      mark: e.colores
        ? { type: "line", strokeWidth: e.sinResaltado ? 2 : 1.6, opacity: e.sinResaltado ? 1 : 0.9, interpolate: "linear" }
        : { type: "line", color: tema.secundario, strokeWidth: 1.2, opacity: 0.75, interpolate: "linear" },
      encoding: {
        x: x("t"), y, detail: [{ field: "pais", type: "nominal" }, { field: "segmento", type: "nominal" }],
        ...(e.colores ? { color: { field: "color", type: "nominal", scale: null, legend: null } } : {}),
      },
    });
    if (tooltip) capas.push({ data: datosOtras, mark: { type: "point", opacity: 0, size: 60 }, encoding: { x: x("t"), y, tooltip } });
  }
  capas.push({
    data: datosLinea, mark: { type: "line", color: e.colores ? colorDe(0) : tema.serie, strokeWidth: filasOtras.length && !e.sinResaltado ? 2.6 : 2, interpolate: "linear", ...(e.discontinua ? { strokeDash: TRAZO_VARIANTE } : {}) },
    encoding: { x: x("t"), y, detail: { field: "segmento", type: "nominal" } },
  });
  if (e.sinResaltado) {
    // Cada línea rala (anual, semestral o con pocos datos) lleva sus puntos, en su color.
    const lineas = [{ filas: filasLinea, color: colorDe(0), r: e.resultado, datos: datosLinea }, ...(e.otras ?? []).map((o, k) => ({
      filas: filasOtras.filter((f) => f.pais === o.nombre), color: colorDe(k + 1), r: o.resultado, datos: { name: `${e.prefijoDatos ?? ""}otra${k + 1}` },
    }))];
    for (const l of lineas.filter((x) => x.filas.length && (x.filas.length <= 160 || x.r.frecuencias.some((f) => f === "semestral" || f === "anual")))) {
      capas.push({
        data: l.datos, mark: { type: "point", filled: true, color: l.color, size: e.ancho < 520 ? 12 : 22, opacity: 1 },
        encoding: { x: x("t"), y },
      });
    }
  } else if (tramosDistintos || ralo) {
    capas.push({
      data: datosLinea,
      mark: { type: "point", filled: true, color: tema.serie, size: e.ancho < 520 ? 12 : tramosDistintos ? 30 : 22, opacity: 1 },
      encoding: {
        x: x("t"), y, ...(tooltip ? { tooltip } : {}),
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
  if (!tramosDistintos && !ralo && tooltip) {
    capas.push({ data: datosLinea, mark: { type: "point", opacity: 0, size: 60 }, encoding: { x: x("t"), y, tooltip } });
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
  // Con varias series, todas llevan su nombre, también la que va sola en su eje o panel (N8); con la leyenda, ninguna.
  const rotulos = !e.sinRotulos && e.colores && (filasOtras.length || e.rotularSiempre) && e.ancho >= 520 ? rotulosFinales(e, filasLinea, filasOtras, colorDe) : [];
  const fuera = !e.rotulosTrasEje;
  if (rotulos.length) {
    // La separación mínima, en unidades del eje: 15 px sobre el dominio que se dibuja (con el 0 si el eje lo incluye).
    // Con 13 px, la caja de un rótulo de 11 px (unos 14 px de alto) se pisaba con la de al lado cuando el eje redondea
    // su dominio (revisión visual de la interfaz de la 4b: «Argentina» y «Chile» en int-pib, 1280 px).
    const alto = tope ?? Math.max(...todas.map((f) => f.v));
    const bajo = piso ?? (cero ? Math.min(0, ...todas.map((f) => f.v)) : Math.min(...todas.map((f) => f.v)));
    const vy = separarRotulos(rotulos.map((r) => r.v), ((alto - bajo) || 1) * 15 / e.alto);
    const valores = rotulos.map((r, k) => ({ ...r, vy: log ? r.v : vy[k] }));
    // En el doble eje, el margen derecho es del segundo eje: los nombres van después de sus números (revisión visual de
    // la 4e: dentro del gráfico pisaban las líneas y los marcadores de los quiebres).
    capas.push({
      data: { values: valores },
      mark: { type: "text", align: "left", baseline: "middle", dx: fuera ? 5 : 5 + ANCHO_NUMEROS_EJE_DERECHO, fontSize: 11, fontWeight: 600 },
      encoding: { x: x("t"), y: { ...y, field: "vy" }, text: { field: "pais" }, color: { field: "color", type: "nominal", scale: null, legend: null } },
    });
  }
  if (conLetras) {
    // Una letra en un círculo por fecha, arriba del área; las que quedarían pegadas van juntas («I–J», en un rectángulo),
    // con los nombres de todas en el tooltip (O6, sonda 3 de la 4e; antes, rayitas sin letra si no entraban).
    const letras = compartir("letras", agruparEventos(eventos, ini, fin, e.ancho).map((g) => ({ ...g, y: sombra.arriba + 10 })));
    const tooltipGrupo = [{ field: "texto", title: "Eventos" }];
    capas.push({
      data: letras, mark: { type: "point", size: 225, filled: true, color: tema.fondo, stroke: tema.texto, strokeWidth: 1, opacity: 1 },
      encoding: { x: x("t"), y: { field: "y", type: "quantitative", scale: null }, shape: { field: "forma", type: "nominal", scale: null }, tooltip: tooltipGrupo },
    });
    capas.push({
      data: letras, mark: { type: "text", color: tema.texto, fontSize: 9.5, fontWeight: 700, baseline: "middle" },
      encoding: { x: x("t"), y: { field: "y", type: "quantitative", scale: null }, text: { field: "etiqueta" }, tooltip: tooltipGrupo },
    });
  }
  capas.push(...franjaEpisodios.capas(x));
  // La leyenda arma sus renglones con el ancho del área del gráfico (sin el eje Y).
  if (e.leyenda?.length) capas.push(...capasLeyenda(e.leyenda, e.ancho - ANCHO_EJE_LEYENDA, e.leyendaEncima ?? (e.tituloEjeY ? ALTO_TITULO_EJE : 0) + 4));
  if (e.capasExtra) capas.push(...e.capasExtra);
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
    // Vega ya cuenta en el tamaño el título horizontal de los ejes y la leyenda: el margen de arriba no cambia.
    padding: e.impreso
      ? { top: 20, left: 20, bottom: 20, right: 20 + (fuera ? margenRotulos(rotulos) : 0) }
      : { top: 4, right: 6 + (fuera ? margenRotulos(rotulos) : 0), bottom: 4, left: 4 },
    background: e.impreso ? tema.fondo : null,
    ...(e.impreso ? { title: { text: e.impreso.titulo, subtitle: [e.impreso.subtitulo, "", ...e.impreso.pie], subtitlePadding: 6, offset: 14 } } : {}),
    layer: capas,
    datasets: conjuntos,
    config: {
      font: tema.fuente,
      view: { stroke: null },
      axis: {
        labelColor: tema.secundario, titleColor: tema.secundario, gridColor: tema.linea, domainColor: tema.borde,
        tickColor: tema.borde, labelFontSize: 12, labelFont: tema.fuente, labelOverlap: true, labelFlush: true,
      },
      axisX: { grid: false, labelPadding: 6 + debajo, ...marcasX(meses, e.ancho < 520 ? 5 : 10) },
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

/**
 * Las capas de la leyenda única (N8): una muestra del trazo y el nombre de cada serie, en renglones arriba del área del
 * gráfico (en píxeles, `encima` por arriba del borde superior).
 */
export function capasLeyenda(entradas: EntradaLeyenda[], ancho: number, encima: number): Record<string, unknown>[] {
  const ubicadas = ubicarLeyenda(entradas, ancho);
  const renglones = Math.max(...ubicadas.map((u) => u.renglon)) + 1;
  const valores = ubicadas.map((u) => ({
    ...u, x2: u.x + 16, xt: u.x + 22, y: -encima - (renglones - u.renglon) * RENGLON_LEYENDA + RENGLON_LEYENDA / 2,
  }));
  const px = (campo: string) => ({ field: campo, type: "quantitative", scale: null });
  return [
    ...[false, true].flatMap((discontinua) => {
      const filas = valores.filter((v) => !!v.discontinua === discontinua);
      return filas.length ? [{
        data: { values: filas },
        mark: { type: "rule", strokeWidth: 2.5, ...(discontinua ? { strokeDash: TRAZO_VARIANTE } : {}) },
        encoding: { x: px("x"), x2: { field: "x2" }, y: px("y"), color: { field: "color", type: "nominal", scale: null, legend: null } },
      }] : [];
    }),
    {
      data: { values: valores }, mark: { type: "text", align: "left", baseline: "middle", fontSize: 11.5, fontWeight: 600 },
      encoding: { x: px("xt"), y: px("y"), text: { field: "texto" }, color: { field: "color", type: "nominal", scale: null, legend: null } },
    },
  ];
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
 * El rótulo de una banda que entra en `ancho` píxeles: el nombre corto o, si no entra, sus iniciales («A. Fernández» →
 * «AF»; un nombre de una sola palabra, sus tres primeras letras con punto). Si tampoco entran, ninguno (M6, 4e).
 */
export function rotuloQueEntra(corto: string, ancho: number): string {
  if (ancho >= anchoTexto(corto)) return corto;
  const palabras = corto.split(/[\s.]+/).filter((p) => /^\p{Lu}/u.test(p));
  const iniciales = palabras.length > 1 ? palabras.map((p) => p[0]).join("") : `${corto.slice(0, 3)}.`;
  return ancho >= anchoTexto(iniciales) ? iniciales : "";
}

/** El trazo de la segunda variante de una misma serie (M4): guiones largos, distintos de las marcas punteadas. */
const TRAZO_VARIANTE = [7, 4];

/** Un período de menos de este ancho (los interinos de diciembre de 2001 en un eje de décadas) va como una rayita. */
const ANCHO_MINIMO_BANDA = 3;
/** Alto de la cinta de los períodos, debajo del eje X. */
export const ALTO_CINTA = 15;
/** Lo que ocupan arriba del área las letras de los eventos (un renglón de círculos de 15 px y aire). */
export const ALTO_LETRAS = 24;

type Compartir = (nombre: string, valores: unknown[], comun?: boolean) => { name: string };

const rangoPeriodo = (b: BandaPeriodo) => (b.hasta ? `${diaLegible(b.desde)}–${diaLegible(b.hasta)}` : `desde el ${diaLegible(b.desde)}`);

/**
 * Capas del sombreado por períodos. Sin superposición (gobiernos, ministros, regímenes, etapas): una cinta entre el
 * eje X y los años, en el último panel, con el nombre de cada período adentro, o sus iniciales si no entra (sonda 3 de
 * la 4e: las bandas de fondo cargaban el gráfico y los nombres quedaban dentro). Los períodos alternan dos tonos y los
 * gobiernos de facto van en uno más oscuro. Con `franja` (los planes, que se superponen): barras arriba del gráfico.
 * Devuelve cuántos píxeles ocupa arriba (la franja de los planes) y abajo (la cinta).
 */
function sombreado(e: EntradaGrafico, ini: number, fin: number, px: (i: number) => number, compartir: Compartir) {
  const nada = { activo: false, arriba: 0, abajo: 0, capas: () => [] as Record<string, unknown>[] };
  const bandas = (e.sombreado?.bandas ?? [])
    .map((b) => {
      const a = Math.max(indiceDia(b.desde), ini);
      const z = Math.min(b.hasta ? indiceDia(b.hasta) : fin, fin);
      return { ...b, a, z, xa: indiceDia(b.desde) < ini ? iso(ini) : b.desde, xz: !b.hasta || indiceDia(b.hasta) > fin ? iso(fin) : b.hasta };
    })
    .filter((b) => b.z > b.a);
  const t = e.tema;
  if (!bandas.length) return nada;
  const tooltip = [{ field: "nombre", title: "Período" }, { field: "rango", title: "Fechas" }];
  if (e.sombreado?.franja) {
    const filas = filasFranja(bandas.map((b) => ({ a: b.a, b: b.z })));
    const alto = 10, paso = 13;
    const datos = compartir("planes", bandas.map((b, k) => ({
      desde: b.xa, hasta: b.xz, nombre: b.nombre, rango: rangoPeriodo(b), y: 3 + filas[k] * paso, y2: 3 + filas[k] * paso + alto, yc: 3 + filas[k] * paso + alto / 2,
      rotulo: px(b.z) - px(b.a) >= anchoTexto(b.nombre_corto) ? b.nombre_corto : "",
    })));
    return {
      activo: true, arriba: (Math.max(...filas) + 1) * paso + 6, abajo: 0,
      capas: (x: (c: string) => Record<string, unknown>) => [
        // Un borde del color del fondo separa los planes contiguos de una misma fila (Austral y Primavera).
        { data: datos, mark: { type: "rect", color: t.periodoFranja ?? t.periodoFacto ?? t.banda, stroke: t.fondo, strokeWidth: 1, clip: true },
          encoding: { x: x("desde"), x2: { field: "hasta", type: "temporal" }, y: { field: "y", type: "quantitative", scale: null }, y2: { field: "y2" }, tooltip } },
        { data: datos, transform: [{ filter: "datum.rotulo" }], mark: { type: "text", color: t.texto, fontSize: 9.5, align: "left", baseline: "middle", dx: 3 },
          encoding: { x: x("desde"), y: { field: "yc", type: "quantitative", scale: null }, text: { field: "rotulo" } } },
      ],
    };
  }
  // La cinta va una sola vez, debajo del eje de fechas (en los paneles, el del último).
  if (e.sinEjeX) return nada;
  const y0 = e.alto + 7;
  const datos = compartir("periodos", bandas.map((b, k) => {
    const ancho = px(b.z) - px(b.a);
    return {
      desde: b.xa, hasta: b.xz, nombre: b.nombre, rango: rangoPeriodo(b), medio: isoDia((b.a + b.z) / 2),
      color: b.facto ? (t.periodoCintaFacto ?? t.periodoFacto ?? t.banda) : k % 2 ? (t.periodoFacto ?? t.banda) : (t.periodoB ?? t.banda),
      rotulo: rotuloQueEntra(b.nombre_corto, ancho - 2), fino: ancho < ANCHO_MINIMO_BANDA,
    };
  }));
  return {
    activo: false, arriba: 0, abajo: ALTO_CINTA + 8,
    capas: (x: (c: string) => Record<string, unknown>) => [
      { data: datos, mark: { type: "rect", stroke: t.fondo, strokeWidth: 1 },
        encoding: { x: x("desde"), x2: { field: "hasta", type: "temporal" }, y: { value: y0 }, y2: { value: y0 + ALTO_CINTA }, color: { field: "color", type: "nominal", scale: null, legend: null }, tooltip } },
      { data: datos, transform: [{ filter: "datum.fino" }], mark: { type: "rule", color: t.borde, strokeWidth: 2 },
        encoding: { x: x("medio"), y: { value: y0 }, y2: { value: y0 + ALTO_CINTA }, tooltip } },
      { data: datos, transform: [{ filter: "datum.rotulo" }], mark: { type: "text", color: t.texto, fontSize: 10, baseline: "middle", align: "center" },
        encoding: { x: x("medio"), y: { value: y0 + ALTO_CINTA / 2 }, text: { field: "rotulo" }, tooltip } },
    ],
  };
}

/**
 * Franja de los episodios, debajo del eje X (y de la cinta de los períodos), con el estilo de los quiebres largos: una
 * línea punteada con topes en los extremos (y en el cambio de fase), y el nombre arriba si entra. Los superpuestos van
 * en filas. El nombre y las fechas de cada fase, en el tooltip.
 */
function episodios(e: EntradaGrafico, ini: number, fin: number, px: (i: number) => number, compartir: Compartir) {
  const lista = (e.episodios ?? []).map((ep) => {
    const a = Math.max(indiceDia(ep.desde), ini);
    const z = Math.min(ep.hasta ? indiceDia(ep.hasta) : fin, fin);
    return { ep, a, z };
  }).filter((x) => x.z > x.a);
  if (!lista.length) return { alto: 0, capas: () => [] as Record<string, unknown>[] };
  const t = e.tema;
  const filas = filasFranja(lista.map((x) => ({ a: x.a, b: x.z })));
  const ALTO_FILA = 24;
  const dentro = (d: string) => (indiceDia(d) < ini ? iso(ini) : indiceDia(d) > fin ? iso(fin) : d);
  const valores = lista.flatMap(({ ep }, k) => {
    const y0 = e.alto + 6 + filas[k] * ALTO_FILA;
    const partes = ep.fases?.length ? ep.fases : [ep];
    return partes.map((f) => ({
      desde: dentro(f.desde), hasta: dentro(f.hasta ?? iso(fin)), episodio: ep.nombre, nombre: f.nombre, rango: rangoPeriodo(f),
      y: y0 + 16, y1: y0 + 12, y2: y0 + 20,
    })).filter((f) => f.hasta > f.desde);
  });
  const tramos = compartir("episodios", valores);
  const topes = valores.flatMap((f) => [{ t: f.desde, y1: f.y1, y2: f.y2 }, { t: f.hasta, y1: f.y1, y2: f.y2 }]);
  const rotulos = lista.map(({ ep, a, z }, k) => ({
    t: dentro(ep.desde), y: e.alto + 6 + filas[k] * ALTO_FILA + 5,
    rotulo: px(z) - px(a) >= anchoTexto(ep.nombre_corto) ? ep.nombre_corto : "",
  })).filter((r) => r.rotulo);
  const tooltip = [{ field: "episodio", title: "Episodio" }, { field: "nombre", title: "Fase" }, { field: "rango", title: "Fechas" }];
  return {
    alto: (Math.max(...filas) + 1) * ALTO_FILA + 4,
    capas: (x: (c: string) => Record<string, unknown>) => [
      { data: tramos, mark: { type: "rule", color: t.secundario, strokeWidth: 1.5, strokeDash: [2, 3] },
        encoding: { x: x("desde"), x2: { field: "hasta", type: "temporal" }, y: { field: "y", type: "quantitative", scale: null }, tooltip } },
      // Una franja invisible más ancha para que el tooltip aparezca sin apuntar a la línea fina.
      { data: tramos, mark: { type: "rect", opacity: 0, color: t.fondo },
        encoding: { x: x("desde"), x2: { field: "hasta", type: "temporal" }, y: { field: "y1", type: "quantitative", scale: null }, y2: { field: "y2" }, tooltip } },
      { data: { values: topes }, mark: { type: "rule", color: t.secundario, strokeWidth: 1.5 },
        encoding: { x: x("t"), y: { field: "y1", type: "quantitative", scale: null }, y2: { field: "y2" } } },
      ...(rotulos.length ? [{ data: { values: rotulos }, mark: { type: "text", color: t.secundario, fontSize: 10, align: "left", baseline: "middle", dx: 2 },
        encoding: { x: x("t"), y: { field: "y", type: "quantitative", scale: null }, text: { field: "rotulo" } } }] : []),
    ],
  };
}

/** Un grupo de eventos que van juntos arriba del gráfico: su etiqueta («C» o «I–J»), dónde va y los nombres. */
export interface GrupoEventos {
  etiqueta: string;
  /** La fecha de dibujo: el punto medio de las fechas del grupo. */
  t: string;
  /** La forma de la marca: un círculo, o un rectángulo del ancho de la etiqueta (un camino de SVG). */
  forma: string;
  /** Los eventos del grupo, con su letra, su nombre y su fecha («C: Plan Austral (14/6/1985) · D: …»). */
  texto: string;
}

/** Ancho (px) que ocupa la marca de un grupo: el círculo de una letra o el rectángulo de «I–J». */
const anchoGrupo = (etiqueta: string, uno: boolean) => (uno ? 15 : etiqueta.length * 6.2 + 6);

/**
 * Agrupa los eventos que quedarían pegados (sus marcas a menos de 2 px) en una sola marca, «I–J», con los nombres de
 * todos en el tooltip. `ancho` es el del gráfico; el área se toma 75 px más angosta (el eje Y y el margen).
 */
export function agruparEventos(eventos: Array<MarcaEvento & { dia?: string }>, ini: number, fin: number, ancho: number): GrupoEventos[] {
  const area = Math.max(100, ancho - 75);
  const px = (i: number) => ((i - ini) / Math.max(fin - ini, 1)) * area;
  let grupos = [...eventos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((ev) => [ev]);
  const etiqueta = (g: MarcaEvento[]) => (g.length === 1 ? g[0].letra : `${g[0].letra}–${g[g.length - 1].letra}`);
  const centro = (g: MarcaEvento[]) => px(g.reduce((a, ev) => a + indiceDia(ev.fecha), 0) / g.length);
  for (let k = 1; k < grupos.length;) {
    const [a, b] = [grupos[k - 1], grupos[k]];
    if (centro(b) - centro(a) < (anchoGrupo(etiqueta(a), a.length === 1) + anchoGrupo(etiqueta(b), b.length === 1)) / 2 + 2) {
      grupos = [...grupos.slice(0, k - 1), [...a, ...b], ...grupos.slice(k + 1)];
      k = Math.max(1, k - 1);
    } else k++;
  }
  return grupos.map((g) => {
    const e = etiqueta(g);
    // El camino del rectángulo, en las unidades de Vega para las formas (el lado del cuadrado de `size` es 2).
    const m = (anchoGrupo(e, false) / 2 / 7.5).toFixed(2);
    return {
      etiqueta: e, t: isoDia(g.reduce((a, ev) => a + indiceDia(ev.fecha), 0) / g.length),
      forma: g.length === 1 ? "circle" : `M-${m},-1H${m}V1H-${m}Z`,
      texto: g.map((ev) => `${ev.letra}: ${ev.nombre} (${diaLegible(ev.fecha)})`).join(" · "),
    };
  });
}

/**
 * Dominio del eje X en meses: del primer día de la primera observación al día siguiente del último de la última, para
 * que entre el punto medio (o el último día) de cada dato.
 */
export function dominioMeses(r: Pick<Resultado, "datos" | "frecuencias">): { ini: number; fin: number } {
  const ini = indiceMes(r.datos[0][0]);
  const frecUltima = r.frecuencias[r.frecuencias.length - 1];
  const fin = indiceMes(r.datos[r.datos.length - 1][0]) + (frecUltima === "semestral" ? 1 : (PASO[frecUltima as keyof typeof PASO] ?? 1));
  return { ini, fin };
}

/** «1990-01-03» → «3/1/1990». */
export const diaLegible = (d: string) => { const [a, m, dd] = d.split("-"); return `${Number(dd)}/${Number(m)}/${a}`; };
