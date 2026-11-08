// Atraso de una serie mensual respecto de lo que se espera según el calendario de su fuente (segunda revisión de la
// 4a, 3.5). Lo usan la ficha y el MCP, para que digan lo mismo.

import { etiqueta, indiceMes } from "./fechas";

/** Lo mínimo del JSON de una variante que hace falta para calcular el atraso. */
export interface DocumentoAtraso {
  cobertura: { hasta: string };
  tramos: Array<{ hasta: string; frecuencia: string }>;
  fuentes: Array<{ url: string; desfase_esperado?: number; descarga?: "manual" }>;
}

export type Atraso =
  /** Más atrasada que lo normal: con el calendario de la fuente ya debería estar `esperado`. */
  | { tipo: "atrasada"; meses: number; esperado: string; intermediario?: "datos.gob.ar" }
  /** Más de un año sin datos nuevos (serie discontinuada o detenida), o fuente sin desfase declarado. */
  | { tipo: "sin_datos_nuevos"; meses: number };

/** Más de esto, ya no es un atraso de publicación: la serie dejó de actualizarse. */
const MAX_MESES_ATRASO = 12;
/** Sin `desfase_esperado` declarado, la regla de antes: avisar desde 3 meses sin datos nuevos. */
const SIN_DESFASE = 3;

/**
 * El atraso de la variante a la fecha `referencia` (AAAA-MM-DD; la web usa la última actualización del sitio y el MCP,
 * el día de la consulta), o null si está al día, si no es mensual o si el último tramo se cortó a propósito
 * (por ejemplo, la base monetaria promedio hasta mayo de 2026).
 *
 * Con `desfase_esperado: d` (un dato del mes M sale durante el mes M + d), en el mes V ya debería estar seguro el dato
 * de V − d − 1. Si el último dato es anterior, la serie está atrasada.
 */
export function atraso(doc: DocumentoAtraso, referencia: string): Atraso | null {
  const ultimoTramo = doc.tramos.at(-1);
  if (!ultimoTramo || ultimoTramo.frecuencia !== "mensual" || (ultimoTramo.hasta && ultimoTramo.hasta !== "hoy")) return null;
  const ultimo = indiceMes(doc.cobertura.hasta.slice(0, 7));
  const total = indiceMes(referencia.slice(0, 7)) - ultimo;
  const desfases = doc.fuentes.map((f) => f.desfase_esperado).filter((d): d is number => typeof d === "number");
  if (!desfases.length) return total >= SIN_DESFASE ? { tipo: "sin_datos_nuevos", meses: total } : null;
  const faltan = total - (Math.max(...desfases) + 1);
  if (faltan < 1) return null;
  if (faltan > MAX_MESES_ATRASO) return { tipo: "sin_datos_nuevos", meses: total };
  // El intermediario solo se nombra si la serie se toma de datos.gob.ar (no en las fuentes de descarga manual).
  const deDatosGobAr = doc.fuentes.some((f) => f.url.includes("datos.gob.ar") && f.descarga !== "manual");
  return { tipo: "atrasada", meses: faltan, esperado: etiqueta(ultimo + faltan, "mensual"), ...(deDatosGobAr ? { intermediario: "datos.gob.ar" as const } : {}) };
}
