// Períodos y eventos (SPEC 2.4; export/periodos.json y export/eventos.json, esquemas periodos-1.1 y eventos-1.0).
// Los usan la web (sombreado, marcas, página /periodos/) y el MCP (listar_periodos, periodo_en_fecha).
// Convención: intervalos semiabiertos [desde, hasta), con fechas AAAA-MM-DD; el día del traspaso es del período que
// empieza y `hasta: null` quiere decir vigente.
import { PASO, anioDe, indiceFin, indiceMes, mesDe } from "./fechas";
import type { Frecuencia } from "./tipos";

export const ESQUEMA_PERIODOS = "periodos-1.1";
/** Versiones de periodos.json que entiende la librería (la 1.1 suma episodios, fases y confianza; la 1.0 sigue publicada). */
export const ESQUEMAS_PERIODOS = ["periodos-1.0", "periodos-1.1"] as const;
export const ESQUEMA_EVENTOS = "eventos-1.0";

export const TIPOS_PERIODO = ["gobierno", "ministro", "plan", "regimen_cambiario", "catedra", "episodio"] as const;
/** Los tipos que pueden superponerse (los demás son una sucesión sin superposiciones). */
export const SUPERPONIBLES: readonly TipoPeriodo[] = ["plan", "episodio"];

export type Confianza = "alta" | "media" | "baja";
/** Cuán firme es cada extremo con fecha (SPEC 2.4). */
export interface ConfianzaExtremos { desde: Confianza; hasta?: Confianza }
export type TipoPeriodo = (typeof TIPOS_PERIODO)[number];

export interface FuentePeriodo {
  para?: "desde" | "hasta" | "ambas";
  tipo: "norma" | "comunicacion_bcra" | "oficial" | "secundaria" | "periodistica" | "convencional";
  referencia?: string;
  publicado?: string;
  url?: string;
  pagina?: string | number;
  nota?: string;
}

/** Un mandato de un gobierno o una fase de un episodio (la misma estructura). */
export interface Mandato {
  id: string;
  nombre: string;
  nombre_corto: string;
  desde: string;
  hasta: string | null;
  descripcion?: string;
  notas?: string;
  confianza?: ConfianzaExtremos;
  fuentes: FuentePeriodo[];
}

export interface Periodo {
  id: string;
  tipo: TipoPeriodo;
  nombre: string;
  nombre_corto: string;
  desde: string;
  hasta: string | null;
  caracter?: "constitucional" | "de_facto" | "interino";
  cargo?: string;
  orden?: number;
  descripcion?: string;
  notas?: string;
  cortes: { desde: "hecho" | "convencional"; hasta?: "hecho" | "convencional" };
  /** Desde periodos-1.1. */
  confianza?: ConfianzaExtremos;
  fuentes: FuentePeriodo[];
  mandatos?: Mandato[];
  /** Episodios: sus fases (desde periodos-1.1). */
  fases?: Mandato[];
  /** En las entradas armadas desde un mandato o una fase: el gobierno o el episodio al que pertenece. */
  padre?: string;
}

export interface DocumentoPeriodos {
  esquema: string;
  version_datos: string;
  descripcion: string;
  licencia: string;
  tipos: Array<{ id: TipoPeriodo; nombre: string; cantidad: number }>;
  periodos: Periodo[];
}

export interface Evento {
  id: string;
  fecha: string;
  vigencia?: string;
  nombre: string;
  nombre_corto: string;
  categoria: string;
  descripcion: string;
  notas?: string;
  fuentes: FuentePeriodo[];
}

export interface DocumentoEventos {
  esquema: string;
  version_datos: string;
  descripcion: string;
  licencia: string;
  categorias: Array<{ id: string; nombre: string }>;
  eventos: Evento[];
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Los períodos de un tipo, ordenados. Con `porMandato`, los gobiernos de más de un mandato (Menem, Fernández de
 * Kirchner) se reemplazan por sus mandatos, que heredan el carácter y llevan `padre`.
 */
export function periodosDe(doc: DocumentoPeriodos, tipo: TipoPeriodo, porMandato = false): Periodo[] {
  const lista = doc.periodos.filter((p) => p.tipo === tipo);
  if (!porMandato || tipo !== "gobierno") return lista;
  return lista.flatMap((p) => (p.mandatos?.length ? subtramosDe(p, p.mandatos) : [p]));
}

/** Las fases de un episodio como períodos (heredan el tipo y llevan `padre`); sin fases, el episodio entero. */
export function fasesDe(p: Periodo): Periodo[] {
  return p.fases?.length ? subtramosDe(p, p.fases) : [p];
}

function subtramosDe(p: Periodo, tramos: Mandato[]): Periodo[] {
  return tramos.map((m) => ({
    ...m, tipo: p.tipo, ...(p.caracter ? { caracter: p.caracter } : {}), padre: p.id,
    cortes: { desde: "hecho" as const, ...(m.hasta ? { hasta: "hecho" as const } : {}) },
  }));
}

/** Los extremos de confianza baja de un período («fecha a confirmar»). */
export function extremosDudosos(p: { confianza?: ConfianzaExtremos }): Array<"desde" | "hasta"> {
  return (["desde", "hasta"] as const).filter((e) => p.confianza?.[e] === "baja");
}

/** ¿El período está vigente el día `dia` (AAAA-MM-DD)? */
export function vigenteEl(p: { desde: string; hasta: string | null }, dia: string): boolean {
  return p.desde <= dia && (p.hasta === null || dia < p.hasta);
}

/** Los períodos que tocan el rango [desde, hasta] (días AAAA-MM-DD, los dos incluidos). */
export function seCruzan<T extends { desde: string; hasta: string | null }>(periodos: T[], desde: string, hasta: string): T[] {
  return periodos.filter((p) => p.desde <= hasta && (p.hasta === null || p.hasta > desde));
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** Último día del mes de un índice de meses. */
function finDeMes(indice: number): string {
  const anio = anioDe(indice), mes = mesDe(indice);
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dias)}`;
}

/**
 * Primer y último día de una fecha del export (AAAA o AAAA-MM) con su frecuencia, o de un día AAAA-MM-DD. Las
 * semestrales (EPH puntual, 1974–2003) cubren el mes de la onda: la encuesta se relevaba en mayo y en octubre.
 */
export function diasDe(fecha: string, frecuencia?: Frecuencia | string): { desde: string; hasta: string } {
  if (DIA.test(fecha)) return { desde: fecha, hasta: fecha };
  const ini = indiceMes(fecha);
  const paso = frecuencia === "semestral" ? 1
    : frecuencia && frecuencia in PASO ? PASO[frecuencia as keyof typeof PASO] : (/^\d{4}$/.test(fecha) ? 12 : 1);
  const fin = frecuencia ? ini + paso - 1 : indiceFin(fecha);
  return { desde: `${anioDe(ini)}-${dosDigitos(mesDe(ini))}-01`, hasta: finDeMes(fin) };
}

/**
 * El período vigente el último día de cada observación.
 * @deprecated Desde la v1.4 de la SPEC, cada dato se ubica con `ubicarFechas` (ubicacion.ts): el último día solo en los
 * saldos en nivel, el punto medio en lo demás. Se mantiene por compatibilidad.
 */
export function periodoDeCadaFecha(periodos: Periodo[], fechas: string[], frecuencias: Array<Frecuencia | string>): Array<Periodo | null> {
  return fechas.map((f, k) => {
    const dia = diasDe(f, frecuencias[k]).hasta;
    return periodos.find((p) => vigenteEl(p, dia)) ?? null;
  });
}

/** Fechas legibles de un período: «10/12/1983–8/7/1989» o «desde el 10/12/2023». */
export function rangoLegible(p: { desde: string; hasta: string | null }): string {
  const f = (d: string) => { const [a, m, dd] = d.split("-"); return `${Number(dd)}/${Number(m)}/${a}`; };
  return p.hasta ? `${f(p.desde)}–${f(p.hasta)}` : `desde el ${f(p.desde)}`;
}
