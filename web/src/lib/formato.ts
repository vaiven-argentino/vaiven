// Formato para la interfaz, en español rioplatense: números con coma decimal y punto de miles, y fechas
// según la frecuencia de cada observación («mar. 1979», «2004, 3.er trimestre», «1990, 1.ª onda»).
import type { Frecuencia } from "@vaiven/transformaciones";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
  "noviembre", "diciembre"];
const MESES_CORTOS = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];
const TRIMESTRES = ["1.er", "2.º", "3.er", "4.º"];

export function fechaLegible(fecha: string, frecuencia: Frecuencia | string, larga = false): string {
  const [anio, mes] = fecha.split("-");
  if (!mes || frecuencia === "anual") return anio;
  const m = Number(mes);
  if (frecuencia === "trimestral") {
    const t = TRIMESTRES[Math.floor((m - 1) / 3)];
    return larga ? `el ${t} trimestre de ${anio}` : `${anio}, ${t} trimestre`;
  }
  if (frecuencia === "semestral") {
    const o = m <= 6 ? "1.ª" : "2.ª";
    return larga ? `la ${o} onda de ${anio}` : `${anio}, ${o} onda`;
  }
  return larga ? `${MESES[m - 1]} de ${anio}` : `${MESES_CORTOS[m - 1]} ${anio}`;
}

/** Fecha corta de la cobertura o de un quiebre, sin saber la frecuencia: «1970-01» → «ene. 1970». */
export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "hoy";
  if (fecha === "hoy") return "hoy";
  const [anio, mes] = fecha.split("-");
  return mes ? `${MESES_CORTOS[Number(mes) - 1]} ${anio}` : anio;
}

const formatos = new Map<string, Intl.NumberFormat>();
function formato(opciones: Intl.NumberFormatOptions): Intl.NumberFormat {
  const clave = JSON.stringify(opciones);
  if (!formatos.has(clave)) formatos.set(clave, new Intl.NumberFormat("es-AR", opciones));
  return formatos.get(clave)!;
}

/** Un valor con los decimales que tienen sentido para su tamaño. Las variaciones van con un decimal, como el INDEC. */
export function numero(valor: number | null, esVariacion = false): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  const abs = Math.abs(valor);
  if (esVariacion) return formato({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(valor);
  if (abs === 0) return "0";
  if (abs >= 1000) return formato({ maximumFractionDigits: 1 }).format(valor);
  if (abs >= 1) return formato({ maximumFractionDigits: 2 }).format(valor);
  if (abs >= 0.001) return formato({ maximumSignificantDigits: 3 }).format(valor);
  // Valores muy chicos (el IPC de 1970 en base 2016 es 6e-11): notación científica.
  const [m, e] = valor.toExponential(2).split("e");
  return `${m.replace(".", ",")} × 10${superindice(Number(e))}`;
}

function superindice(n: number): string {
  const s: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return String(n).split("").map((c) => s[c] ?? c).join("");
}

/** «2026-10-24T07:40:29Z» → «24/10/2026». */
export function diaDeVersion(version: string): string {
  const [a, m, d] = version.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// Los nombres de las transformaciones viven con la cita, porque la cita los usa (web y MCP).
export { NOMBRE_MEDIDA, NOMBRE_TRANSFORMACION } from "@vaiven/cita";

export const NOMBRE_TIPO_QUIEBRE: Record<string, string> = {
  cambio_de_base: "Cambio de base",
  cobertura: "Cobertura",
  intervencion: "Intervención",
  metodologia: "Metodología",
  signo_monetario: "Signo monetario",
};

export const NOMBRE_ESTADO: Record<string, string> = {
  pendiente_licencia: "Sin datos · pendiente de licencia",
  pendiente: "En preparación",
};
