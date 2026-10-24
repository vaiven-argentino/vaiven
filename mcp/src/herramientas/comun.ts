// Utilidades compartidas por las herramientas.
import { indiceFin, indiceMes } from "@vaiven/transformaciones";

/** Total de series del catálogo del MVP (SPEC, sección 3). */
export const SERIES_DEL_MVP = 39;

/** Límites por pedido (SPEC 7.3). El de series se usa desde la fase 4 (comparar_series). */
export const LIMITE_SERIES = 4;
export const LIMITE_OBSERVACIONES = 10_000;

export const PERIODO = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

/** Sin tildes ni mayúsculas. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** ¿El período [desde, hasta] de la cobertura se cruza con el pedido? Los extremos que faltan quedan abiertos. */
export function seCruza(cobertura: { desde: string; hasta: string }, desde?: string, hasta?: string): boolean {
  const ini = desde ? indiceMes(desde) : Number.NEGATIVE_INFINITY;
  const fin = hasta ? indiceFin(hasta) : Number.POSITIVE_INFINITY;
  return indiceMes(cobertura.desde) <= fin && indiceFin(cobertura.hasta) >= ini;
}

/** Valores transformados con 6 cifras significativas (alcanza y ahorra tokens); el nivel va tal cual se publica. */
export function redondear(v: number | null): number | null {
  return v === null ? null : Number(v.toPrecision(6));
}
