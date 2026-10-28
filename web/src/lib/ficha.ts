// Lógica de la ficha que se usa en el build y en el navegador: transformación inicial, quiebres numerados,
// resumen del gráfico (texto alternativo) y filas de la tabla.
import { PASO, disponibles, indiceFin, indiceMes, type Advertencia, type Resultado, type SerieExportada } from "@vaiven/transformaciones";
import type { Transformacion } from "@vaiven/transformaciones";
import { fechaCorta, fechaLegible, numero } from "./formato";

type ConVista = SerieExportada & { vista_inicial?: { transformacion?: string; medida?: string } };

export function transformacionInicial(serie: ConVista): Transformacion {
  const disp = disponibles(serie).transformaciones;
  // Si los metadatos dicen con qué vista arranca la serie (por ejemplo, el PIB en variación interanual), manda eso.
  const pedida = serie.vista_inicial?.transformacion as Transformacion | undefined;
  if (pedida && disp.includes(pedida)) return pedida;
  // El IPC en nivel va de 6e-11 a 12.276: se lee mejor como inflación interanual.
  return serie.tipo === "precio" && serie.unidad.startsWith("índice") && disp.includes("var_interanual") ? "var_interanual" : "nivel";
}

/** La medida con que arranca la ficha (por ejemplo, el salario en términos reales), si la variante la ofrece. */
export function medidaInicial(serie: ConVista): "real" | "en_dolares" | "pct_pib" | undefined {
  const m = serie.vista_inicial?.medida as "real" | "en_dolares" | "pct_pib" | undefined;
  return m && disponibles(serie).medidas.includes(m) ? m : undefined;
}

/**
 * La frecuencia con que arranca la ficha: anual si la medida inicial es % del PIB y la serie es más fina que el PIB
 * (el resultado fiscal mensual). Es la misma regla que aplica el selector cuando se elige «% del PIB».
 */
export function frecuenciaInicial(serie: ConVista): "anual" | undefined {
  if (medidaInicial(serie) !== "pct_pib" || ["anual", "trimestral"].includes(serie.frecuencia)) return undefined;
  return disponibles(serie).frecuencias.includes("anual") ? "anual" : undefined;
}

export const esVariacion = (t: string) => t.startsWith("var_") || t === "acumulada_anio";

export interface QuiebreNumerado {
  n: number;
  advertencia: Advertencia;
  /** «general» si cubre toda la serie (no se dibuja); «banda» si tiene rango; «regla» si es un punto o sigue abierto. */
  forma: "general" | "banda" | "regla";
}

/** Numera los quiebres de la variante en el orden del export; el gráfico y la lista usan los mismos números. */
export function numerarQuiebres(serie: SerieExportada): QuiebreNumerado[] {
  const inicio = indiceMes(serie.datos[0][0]);
  const fin = indiceFin(serie.datos[serie.datos.length - 1][0]);
  return serie.advertencias.map((a, k) => {
    const desde = a.desde ? indiceMes(a.desde) : Number.NEGATIVE_INFINITY;
    const hasta = a.hasta ? indiceFin(a.hasta) : Number.POSITIVE_INFINITY;
    let forma: QuiebreNumerado["forma"];
    if (desde <= inicio && hasta >= fin) forma = "general";
    else if (a.hasta && a.desde && hasta > desde) forma = "banda";
    else forma = "regla";
    return { n: k + 1, advertencia: a, forma };
  });
}

export function rangoQuiebre(a: Advertencia): string {
  if (a.desde && a.hasta) return a.desde === a.hasta ? fechaCorta(a.desde) : `${fechaCorta(a.desde)} – ${fechaCorta(a.hasta)}`;
  if (a.desde) return `desde ${fechaCorta(a.desde)}`;
  return a.hasta ? `hasta ${fechaCorta(a.hasta)}` : "toda la serie";
}

/** Resumen en texto del gráfico (SPEC 6.5): rango, máximo, mínimo, último dato y quiebres. */
export function resumen(r: Resultado, unidad: string, variacion: boolean, quiebres: QuiebreNumerado[]): string {
  const validos = r.datos.map((d, k) => ({ f: d[0], v: d[1], k })).filter((d): d is { f: string; v: number; k: number } => d.v !== null);
  if (!validos.length) return "No hay datos para mostrar con esta combinación.";
  const etiqueta = (d: { f: string; k: number }) => fechaLegible(d.f, r.frecuencias[d.k]);
  const max = validos.reduce((a, b) => (b.v > a.v ? b : a));
  const min = validos.reduce((a, b) => (b.v < a.v ? b : a));
  const ultimo = validos[validos.length - 1];
  const partes = [
    `${unidad[0].toUpperCase()}${unidad.slice(1)}, entre ${fechaLegible(validos[0].f, r.frecuencias[validos[0].k], true)} y ${fechaLegible(ultimo.f, r.frecuencias[ultimo.k], true)} (${validos.length} datos).`,
    `Máximo: ${numero(max.v, variacion)} (${etiqueta(max)}).`,
    `Mínimo: ${numero(min.v, variacion)} (${etiqueta(min)}).`,
    `Último dato: ${numero(ultimo.v, variacion)} (${etiqueta(ultimo)}).`,
  ];
  const ids = new Set(r.advertencias.map((a) => a.id));
  const cruzados = quiebres.filter((q) => ids.has(q.advertencia.id) && q.forma !== "general");
  if (cruzados.length) partes.push(`El período cruza ${cruzados.length === 1 ? "el quiebre" : "los quiebres"} ${cruzados.map((q) => q.n).join(", ")}.`);
  if (r.excluidos.length) partes.push(`Hay ${r.excluidos.length === 1 ? "un dato excluido" : `${r.excluidos.length} datos excluidos`} (${r.excluidos.map((e) => fechaCorta(e.fecha)).join(", ")}).`);
  return partes.join(" ");
}

export interface FilaTabla {
  fecha: string;
  etiqueta: string;
  valor: string;
  excluido: boolean;
}

export function filasTabla(r: Resultado, variacion: boolean): FilaTabla[] {
  const excluidos = new Set(r.excluidos.map((e) => e.fecha));
  return r.datos.map(([f, v], k) => ({
    fecha: f,
    etiqueta: fechaLegible(f, r.frecuencias[k]),
    valor: v === null && excluidos.has(f) ? "Excluido (ver nota)" : numero(v, variacion),
    excluido: excluidos.has(f),
  }));
}

/** Años para el selector de período: del primero al último dato de la variante. */
export function aniosDe(serie: SerieExportada): [number, number] {
  return [Number(serie.datos[0][0].slice(0, 4)), Number(serie.datos[serie.datos.length - 1][0].slice(0, 4))];
}

export { PASO };
