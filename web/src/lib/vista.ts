// Lo que hace el explorador con las series de la vista (SPEC 6.2, fase 4c/4d): agregarlas y quitarlas, elegir el color
// de una serie nueva, detectar una serie repetida y nombrar los archivos de la vista. Funciones puras: las reglas de la
// vista (disposición, alineación, URL) son las de @vaiven/transformaciones y @vaiven/grafico, y acá no se repiten.
import { MAX_SERIES, type Estado, type EstadoVista } from "@vaiven/grafico/estado";

/** Los parámetros comunes, que todas las series comparten (los de la serie 1 en la URL). */
const COMUNES = ["desde", "hasta", "sh", "ev"] as const;

/** Copia el período, el sombreado y los eventos de una serie a todas (se editan desde cualquiera). */
export function igualarComunes(v: EstadoVista, desde: Estado): EstadoVista {
  return { ...v, series: v.series.map((e) => ({ ...e, ...Object.fromEntries(COMUNES.map((k) => [k, k === "ev" ? [...desde.ev] : desde[k]])) })) };
}

/** El color de una serie nueva: el primero de la paleta que no usa ninguna serie de la vista. */
export function colorLibre(colores: readonly number[]): number {
  let k = 0;
  while (colores.includes(k)) k += 1;
  return k;
}

/** Se pueden agregar series hasta llegar a 4. */
export const puedeAgregar = (v: EstadoVista) => v.series.length < MAX_SERIES;

/** Agrega una serie al final, con el período, el sombreado y los eventos de la vista, y su color. */
export function agregarSerie(v: EstadoVista, colores: readonly number[], nueva: Estado): { vista: EstadoVista; colores: number[] } {
  if (!puedeAgregar(v)) throw new Error(`Se comparan hasta ${MAX_SERIES} series.`);
  const [primera] = v.series;
  const e: Estado = { ...nueva, desde: primera.desde, hasta: primera.hasta, sh: primera.sh, ev: [...primera.ev] };
  return { vista: { ...v, series: [...v.series, e] }, colores: [...colores, colorLibre(colores)] };
}

/**
 * Quita la serie `k` (desde 0): las siguientes suben un lugar y conservan su color (SPEC 6.2). El período, el
 * sombreado y los eventos no cambian, aunque se quite la serie 1. Con una sola serie no se quita nada.
 */
export function quitarSerie(v: EstadoVista, colores: readonly number[], k: number): { vista: EstadoVista; colores: number[] } {
  if (v.series.length < 2 || k < 0 || k >= v.series.length) return { vista: v, colores: [...colores] };
  const quitada = v.series[k];
  const series = v.series.filter((_, j) => j !== k);
  // Lo común vive en todas las series: la nueva serie 1 ya lo tiene, pero se copia por si se editó solo en la quitada.
  return { vista: igualarComunes({ ...v, series }, quitada), colores: colores.filter((_, j) => j !== k) };
}

/** Lo que distingue una serie de otra en la vista: serie, variante, países y la cadena de transformaciones. */
function clave(e: Estado): string {
  return JSON.stringify([e.s, e.v, e.p, e.pa, e.m, e.d, e.pib, e.t, e.f, e.mm, e.base]);
}

/**
 * Si la serie `k` es igual a otra de la vista (misma serie, variante y transformaciones), el índice de esa otra; si no,
 * -1. Una serie repetida no se admite (decisión del PR B): daría líneas y filas idénticas.
 */
export function repetida(series: readonly Estado[], k: number): number {
  const c = clave(series[k]);
  return series.findIndex((e, j) => j !== k && clave(e) === c);
}

/**
 * El nombre de los archivos de una vista con varias series (decisión del PR B):
 * `vaiven_<s1>_y_<s2>[_y_…]_<desde>_<hasta>[_sombreado_x]`. La variante va (`<s>-<variante>`) solo si no es la de por
 * defecto o si la serie se repite.
 */
export function nombreArchivoVista(series: ReadonlyArray<Pick<Estado, "s" | "v" | "desde" | "hasta" | "sh">>, porDefecto: (s: string) => string | undefined): string {
  const nombres = series.map((e) => {
    const repite = series.filter((x) => x.s === e.s).length > 1;
    return repite || e.v !== porDefecto(e.s) ? `${e.s}-${e.v}` : e.s;
  });
  const [primera] = series;
  const partes = ["vaiven", nombres.join("_y_"),
    primera.desde || primera.hasta ? `${primera.desde || "inicio"}_${primera.hasta || "hoy"}` : undefined,
    primera.sh ? `sombreado_${primera.sh}` : undefined];
  return partes.filter(Boolean).join("_").replace(/[^\w.-]+/g, "-");
}
