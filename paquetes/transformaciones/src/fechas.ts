// Fechas del export (SPEC 2.5): «AAAA» en anuales y «AAAA-MM» en el resto (en trimestrales, el primer mes del
// trimestre; en semestrales de la EPH puntual, el mes de la onda). Internamente se trabaja con un índice de meses.

import type { Frecuencia, Tramo } from "./tipos";

export type FrecuenciaRegular = Exclude<Frecuencia, "diaria">;

/** Meses entre dos observaciones consecutivas de cada frecuencia. */
export const PASO: Record<FrecuenciaRegular, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };

const PATRON = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

export class ErrorFecha extends Error {}

/** Índice de meses (año × 12 + mes − 1) del comienzo del período. */
export function indiceMes(fecha: string): number {
  const m = PATRON.exec(fecha);
  if (!m) throw new ErrorFecha(`Fecha con formato desconocido: «${fecha}» (se espera AAAA o AAAA-MM).`);
  const mes = m[2] ? Number(m[2]) : 1;
  if (mes < 1 || mes > 12) throw new ErrorFecha(`Mes fuera de rango en «${fecha}».`);
  return Number(m[1]) * 12 + mes - 1;
}

/** Índice del último mes que cubre una fecha usada como fin de rango: «2003» llega hasta diciembre de 2003. */
export function indiceFin(fecha: string): number {
  return /^\d{4}$/.test(fecha) ? indiceMes(fecha) + 11 : indiceMes(fecha);
}

export const anioDe = (indice: number): number => Math.floor(indice / 12);
export const mesDe = (indice: number): number => (indice % 12) + 1;

export function etiqueta(indice: number, frecuencia: Frecuencia): string {
  const anio = String(anioDe(indice));
  return frecuencia === "anual" ? anio : `${anio}-${String(mesDe(indice)).padStart(2, "0")}`;
}

export function esRegular(f: string): f is FrecuenciaRegular {
  return f in PASO;
}

/** Frecuencia de cada fecha según el tramo que la contiene (la desocupación es semestral hasta 2003 y trimestral después). */
export function frecuenciasPorFecha(fechas: string[], tramos: Tramo[], frecuenciaSerie: string): Frecuencia[] {
  const rangos = tramos.map((t) => ({
    desde: indiceMes(t.desde),
    hasta: t.hasta === "hoy" ? Number.POSITIVE_INFINITY : indiceFin(t.hasta),
    frecuencia: t.frecuencia,
  }));
  const porDefecto = esRegular(frecuenciaSerie) ? frecuenciaSerie : rangos.at(-1)?.frecuencia;
  return fechas.map((f) => {
    const i = indiceMes(f);
    const tramo = rangos.find((r) => r.desde <= i && i <= r.hasta);
    const frecuencia = tramo?.frecuencia ?? porDefecto;
    if (!frecuencia) throw new ErrorFecha(`No se puede saber la frecuencia de «${f}».`);
    return frecuencia;
  });
}
