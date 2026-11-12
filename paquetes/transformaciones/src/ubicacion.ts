// Dónde cae cada dato en el tiempo (SPEC 2.4 y 6.2, desde la v1.4): una sola regla para el gráfico, la tabla, las
// descargas, el resumen textual y el MCP, para que no puedan contradecirse.
//
// - Un saldo a fin de período (`agregacion: fin_de_periodo`) mostrado en nivel (nivel o base 100, con cualquier medida,
//   sin media móvil) es un **instante**: el último día de la observación. Se dibuja ese día y se asigna al período
//   vigente ese día.
// - Todo lo demás (promedios, sumas y cualquier variación, también la de un saldo) es un **intervalo**: se dibuja en su
//   punto medio y se asigna al período que contiene el punto medio. Si un período cubre más de la mitad del intervalo,
//   contiene el punto medio; si el del punto medio no pasa del 50 %, la asignación es «sin mayoría».
// - Además se calcula el reparto completo por días. Límite que se dice y no se arregla: una variación interanual compara
//   con 12 meses antes (y una media móvil promedia meses anteriores), pero se asigna al período de la observación.
import { SUPERPONIBLES, diasDe, vigenteEl, type Periodo, type TipoPeriodo } from "./periodos";
import type { Agregacion, Frecuencia, Transformacion } from "./tipos";

export type Referencia =
  | { clase: "instante"; dia: string }
  | { clase: "intervalo"; desde: string; hasta: string; dias: number; medio: string };

/** Lo que hace falta saber de la vista para ubicar sus datos. */
export interface ContextoUbicacion {
  /** La agregación de la variante (la de la serie si la variante no la cambia). */
  agregacion: Agregacion;
  transformacion?: Transformacion;
  mediaMovil?: number;
}

/** Un tramo del reparto: un período (o un hueco, con `id` null), los días que cubre y su proporción. */
export interface TramoReparto {
  id: string | null;
  nombre: string;
  nombre_corto: string;
  dias: number;
  proporcion: number;
}

export interface Ubicacion {
  referencia: Referencia;
  /** Vigentes en el instante o en el punto medio. En planes y episodios puede haber varios; [] es un hueco. */
  vigentes: Periodo[];
  /** Nombre (o nombres, separados por «; ») de lo vigente, o el nombre del hueco («sin ministro titular»). */
  etiqueta: string;
  /** Proporción de la observación que cubre cada vigente (en un instante, 1); en un hueco, la del hueco. */
  proporciones: number[];
  /** En los tipos sin superposición: el vigente pasa del 50 %. En los instantes y en planes y episodios, siempre. */
  mayoria: boolean;
  /** Reparto completo, en orden de fecha, con los huecos (un solo tramo por período o por hueco). */
  reparto: TramoReparto[];
  /** El reparto sin lo vigente. */
  otros: TramoReparto[];
}

const DIA_MS = 86_400_000;
const ms = (dia: string) => Date.parse(`${dia}T00:00:00Z`);
const dia = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Nombre de los días sin período de cada tipo. */
export const NOMBRE_HUECO: Record<TipoPeriodo, string> = {
  gobierno: "sin registro", ministro: "sin ministro titular", plan: "sin plan", regimen_cambiario: "sin régimen cambiario",
  catedra: "sin etapa", episodio: "sin episodio",
};

/** ¿Se ubica en un instante (el último día) o en un intervalo? */
export function esInstante(c: ContextoUbicacion): boolean {
  const nivel = !c.transformacion || c.transformacion === "nivel" || c.transformacion === "base_100";
  return c.agregacion === "fin_de_periodo" && nivel && !(c.mediaMovil && c.mediaMovil > 1);
}

/** La referencia temporal de una observación (fecha del export AAAA o AAAA-MM, con su frecuencia). */
export function referenciaDe(fecha: string, frecuencia: Frecuencia | string, contexto: ContextoUbicacion): Referencia {
  const { desde, hasta } = diasDe(fecha, frecuencia);
  if (esInstante(contexto)) return { clase: "instante", dia: hasta };
  const dias = Math.round((ms(hasta) - ms(desde)) / DIA_MS) + 1;
  const medio = new Date(ms(desde) + (dias * DIA_MS) / 2).toISOString();
  return { clase: "intervalo", desde, hasta, dias, medio };
}

/** La fecha y hora en que se dibuja el punto: el último día a las 12 o el punto medio (ISO, UTC). */
export function fechaDeDibujo(r: Referencia): string {
  return r.clase === "instante" ? `${r.dia}T12:00:00.000Z` : r.medio;
}

/** El día (AAAA-MM-DD) de la referencia: el que decide qué período está vigente. */
export const diaDeReferencia = (r: Referencia): string => (r.clase === "instante" ? r.dia : r.medio.slice(0, 10));

/** Días de [desde, hasta] (incluidos) que cubre un período semiabierto. */
function diasEn(p: { desde: string; hasta: string | null }, desde: string, hasta: string): number {
  const a = Math.max(ms(desde), ms(p.desde));
  const z = Math.min(ms(hasta) + DIA_MS, p.hasta ? ms(p.hasta) : Number.POSITIVE_INFINITY);
  return Math.max(0, Math.round((z - a) / DIA_MS));
}

const tramo = (p: Periodo, dias: number, total: number): TramoReparto =>
  ({ id: p.id, nombre: p.nombre, nombre_corto: p.nombre_corto, dias, proporcion: dias / total });

/** Ubica una observación entre los períodos de un tipo (los de `periodosDe`, por mandato si corresponde). */
export function ubicar(r: Referencia, periodos: Periodo[], tipo: TipoPeriodo): Ubicacion {
  const superponible = SUPERPONIBLES.includes(tipo);
  const hueco = NOMBRE_HUECO[tipo];
  const vigentes = periodos.filter((p) => vigenteEl(p, diaDeReferencia(r)));
  const desde = r.clase === "instante" ? r.dia : r.desde;
  const hasta = r.clase === "instante" ? r.dia : r.hasta;
  const total = r.clase === "instante" ? 1 : r.dias;

  const tocan = periodos.map((p) => ({ p, dias: diasEn(p, desde, hasta) })).filter((x) => x.dias > 0)
    .sort((a, b) => (a.p.desde < b.p.desde ? -1 : a.p.desde > b.p.desde ? 1 : 0));
  const reparto: TramoReparto[] = tocan.map(({ p, dias }) => tramo(p, dias, total));
  if (!superponible) {
    const sinPeriodo = total - tocan.reduce((s, x) => s + x.dias, 0);
    if (sinPeriodo > 0) {
      // El hueco va donde cae su primer día.
      let primero = desde;
      for (let t = ms(desde); t <= ms(hasta); t += DIA_MS) {
        if (!periodos.some((p) => vigenteEl(p, dia(t)))) { primero = dia(t); break; }
      }
      const tramoHueco: TramoReparto = { id: null, nombre: hueco, nombre_corto: hueco, dias: sinPeriodo, proporcion: sinPeriodo / total };
      const k = reparto.findIndex((t) => (periodos.find((p) => p.id === t.id)?.desde ?? "") > primero);
      reparto.splice(k < 0 ? reparto.length : k, 0, tramoHueco);
    }
  }
  const idsVigentes = new Set(vigentes.map((p) => p.id));
  const proporciones = vigentes.length
    ? vigentes.map((p) => reparto.find((t) => t.id === p.id)?.proporcion ?? 1)
    : [reparto.find((t) => t.id === null)?.proporcion ?? 1];
  const otros = reparto.filter((t) => (vigentes.length ? !idsVigentes.has(t.id ?? "") : t.id !== null));
  const mayoria = superponible || r.clase === "instante" || proporciones[0] > 0.5;
  return {
    referencia: r, vigentes, etiqueta: vigentes.length ? vigentes.map((p) => p.nombre).join("; ") : hueco,
    proporciones, mayoria, reparto, otros,
  };
}

/** Ubica todas las observaciones de una vista (fechas del export con la frecuencia de cada una). */
export function ubicarFechas(fechas: string[], frecuencias: Array<Frecuencia | string>, contexto: ContextoUbicacion,
  periodos: Periodo[], tipo: TipoPeriodo): Ubicacion[] {
  return fechas.map((f, k) => ubicar(referenciaDe(f, frecuencias[k], contexto), periodos, tipo));
}

/** Un porcentaje legible: «23 %», «<1 %». */
export function porcentaje(x: number): string {
  if (x > 0 && x < 0.005) return "<1 %";
  return `${Math.round(x * 100)} %`;
}

/** La celda `periodo`: el nombre, con «(sin mayoría)» cuando el del punto medio no pasa del 50 %. */
export const textoPeriodo = (u: Ubicacion): string => (u.mayoria ? u.etiqueta : `${u.etiqueta} (sin mayoría)`);

/** La celda `periodo_proporcion`: un número (0,774) o, con varios vigentes, la lista separada por «; ». */
export function proporcionDe(u: Ubicacion): number | string {
  const r = u.proporciones.map((x) => Math.round(x * 1000) / 1000);
  return r.length === 1 ? r[0] : r.join("; ");
}

/** La celda `otros_periodos`: «Alfonsín (23 %)»; «Puerta (1 %); Rodríguez Saá (2 %); Camaño (1 %)». */
export const textoOtros = (u: Ubicacion): string => u.otros.map((t) => `${t.nombre_corto} (${porcentaje(t.proporcion)})`).join("; ");

/** El reparto en una línea, para el tooltip y el lector del gráfico: «Menem 77 % · Alfonsín 23 %». Vacío si no cruza. */
export function textoReparto(u: Ubicacion): string {
  if (u.referencia.clase === "instante" || u.reparto.length < 2) return "";
  return [...u.reparto].sort((a, b) => b.proporcion - a.proporcion).map((t) => `${t.nombre_corto} ${porcentaje(t.proporcion)}`).join(" · ");
}

/** La regla, en el texto que llevan la hoja de metadatos del XLSX, el aviso del gráfico y la SPEC. */
export const REGLA_UBICACION =
  "Cada dato se ubica en el período vigente a mitad de su intervalo (mes, trimestre o año; en las semestrales de la EPH, " +
  "el mes de la onda). Los saldos a fin de período en nivel (reservas, deuda, base monetaria) se ubican el último día. " +
  "Si ningún período cubre más de la mitad del intervalo, la columna del período dice «sin mayoría»; " +
  "«otros_periodos» da el resto del reparto por días. Límite: una variación interanual compara con 12 meses antes " +
  "(y una media móvil promedia meses anteriores), pero se asigna al período de la observación.";
