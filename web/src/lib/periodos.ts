// Períodos y eventos en la web: qué se sombrea en un gráfico (ficha y explorador), cómo se nombra y qué accesos al
// explorador ofrece la página /periodos/. Funciones puras (se prueban con Vitest).
import {
  diasDe, periodosDe, seCruzan, type DocumentoEventos, type DocumentoPeriodos, type Periodo, type Resultado, type TipoPeriodo,
} from "@vaiven/transformaciones";
import type { BandaPeriodo, MarcaEvento } from "../graficos/espec";

/** Opciones de sombreado (el valor va en el parámetro `sh` de la URL). */
export const OPCIONES_SOMBREADO = ["catedra", "gobierno", "mandato", "ministro", "plan", "regimen_cambiario"] as const;
export type OpcionSombreado = (typeof OPCIONES_SOMBREADO)[number];

const NOMBRE: Record<OpcionSombreado, string> = {
  catedra: "Etapas de la política económica (curso)", gobierno: "Gobiernos", mandato: "Gobiernos, por mandato",
  ministro: "Ministros de Economía", plan: "Planes de estabilización", regimen_cambiario: "Regímenes cambiarios",
};
const COLUMNA: Record<OpcionSombreado, string> = {
  catedra: "Etapa", gobierno: "Gobierno", mandato: "Gobierno (mandato)", ministro: "Ministro de Economía", plan: "Plan",
  regimen_cambiario: "Régimen cambiario",
};

/** Nombre de una opción para el selector; el de las etapas sale del registro (nombre público, SPEC 12). */
export function nombreSombreado(sh: OpcionSombreado, tipos?: Array<{ id: string; nombre: string }>): string {
  return sh === "catedra" ? (tipos?.find((t) => t.id === "catedra")?.nombre ?? NOMBRE.catedra) : NOMBRE[sh];
}
export const columnaPeriodo = (sh: OpcionSombreado) => COLUMNA[sh];
export const esSombreado = (x: string | null): x is OpcionSombreado => (OPCIONES_SOMBREADO as readonly string[]).includes(x ?? "");

/** Primer y último día que cubre un resultado (para saber qué períodos y eventos se cruzan con lo que se ve). */
function rangoDe(r: Resultado): { desde: string; hasta: string } | null {
  if (!r.datos.length) return null;
  return { desde: diasDe(r.datos[0][0], r.frecuencias[0]).desde, hasta: diasDe(r.datos[r.datos.length - 1][0], r.frecuencias[r.frecuencias.length - 1]).hasta };
}

/** Los períodos del tipo elegido que se cruzan con lo que se ve (por mandato: los gobiernos de dos mandatos, partidos). */
export function periodosEnRango(registro: DocumentoPeriodos, sh: OpcionSombreado, r: Resultado): Periodo[] {
  const rango = rangoDe(r);
  if (!rango) return [];
  const tipo = (sh === "mandato" ? "gobierno" : sh) as TipoPeriodo;
  return seCruzan(periodosDe(registro, tipo, sh === "mandato"), rango.desde, rango.hasta);
}

export const letraEvento = (k: number) => (k < 26 ? String.fromCharCode(65 + k)
  : `${String.fromCharCode(64 + Math.floor(k / 26))}${String.fromCharCode(65 + (k % 26))}`);

/** Los eventos dentro de lo que se ve, con su letra (A, B…) en orden de fecha. */
export function eventosEnRango(registro: DocumentoEventos, r: Resultado): MarcaEvento[] {
  const rango = rangoDe(r);
  if (!rango) return [];
  return registro.eventos.filter((e) => e.fecha >= rango.desde && e.fecha <= rango.hasta)
    .map((e, k) => ({ letra: letraEvento(k), fecha: e.fecha, nombre: e.nombre }));
}

/** Las bandas que dibuja el gráfico (los gobiernos de facto, en el gris más oscuro). */
export function bandasDe(periodos: Periodo[]): BandaPeriodo[] {
  return periodos.map((p) => ({ desde: p.desde, hasta: p.hasta, nombre: p.nombre, nombre_corto: p.nombre_corto, facto: p.caracter === "de_facto" }));
}

/** Una línea sobre el sombreado para el resumen textual del gráfico. */
export function textoSombreado(sh: OpcionSombreado, periodos: Periodo[], eventos: MarcaEvento[], tipos?: Array<{ id: string; nombre: string }>): string {
  let t = "";
  if (periodos.length) {
    t += ` Sombreado por ${nombreSombreado(sh, tipos).toLowerCase()}: ${periodos.length === 1 ? "un período" : `${periodos.length} períodos`}, de ${periodos[0].nombre} a ${periodos[periodos.length - 1].nombre}.`;
  }
  if (eventos.length) t += ` ${eventos.length === 1 ? "Un evento marcado" : `${eventos.length} eventos marcados`} (lista debajo del gráfico).`;
  return t;
}

// ---- Accesos al explorador desde /periodos/ ----

export interface Acceso {
  texto: string;
  url: string;
}

/** Las series que se ofrecen por tipo de período: id de la serie, rótulo y parámetros de la vista. */
const VISTAS_LARGAS: Array<[string, string, Record<string, string>]> = [
  ["ipc", "Inflación (interanual)", {}], // es la vista inicial del IPC
  ["pib", "PIB real (interanual)", {}],
  ["desocupacion", "Desocupación", {}],
  ["tcr-multilateral", "Tipo de cambio real", {}],
  ["reservas", "Reservas", {}],
  ["resultado-fiscal", "Resultado fiscal (% del PIB)", {}],
];
const VISTAS_CORTAS: Array<[string, string, Record<string, string>]> = [
  ["ipc", "Inflación (mensual)", { t: "var_mensual" }],
  ["tc-oficial", "Tipo de cambio oficial", {}],
  ["tcr-multilateral", "Tipo de cambio real", {}],
  ["reservas", "Reservas", {}],
];

/**
 * Accesos al explorador para un período: las series del tipo, de un año antes del inicio a un año después del fin
 * (vigente: hasta el último dato), con el sombreado de ese tipo. Solo las series publicadas (`publicadas`).
 */
export function accesosDe(p: { tipo: TipoPeriodo | "mandato"; desde: string; hasta: string | null }, publicadas: Set<string>, hoy: number): Acceso[] {
  const largas = p.tipo === "gobierno" || p.tipo === "mandato" || p.tipo === "catedra";
  const desde = String(Number(p.desde.slice(0, 4)) - 1);
  const hastaAnio = p.hasta ? Number(p.hasta.slice(0, 4)) + 1 : null;
  const sh = p.tipo;
  return (largas ? VISTAS_LARGAS : VISTAS_CORTAS).filter(([s]) => publicadas.has(s)).map(([s, texto, extra]) => {
    const q = new URLSearchParams();
    if (s !== "ipc") q.set("s", s);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    q.set("desde", desde);
    if (hastaAnio && hastaAnio < hoy) q.set("hasta", String(hastaAnio));
    q.set("sh", sh);
    return { texto, url: `/explorador/?${q}` };
  });
}

/** Acceso desde un evento: la inflación mensual un año antes y después, con los eventos marcados. */
export function accesoEvento(fecha: string, hoy: number): Acceso {
  const anio = Number(fecha.slice(0, 4));
  const q = new URLSearchParams({ t: "var_mensual", desde: String(anio - 1) });
  if (anio + 1 < hoy) q.set("hasta", String(anio + 1));
  q.set("ev", "1");
  return { texto: "Inflación mensual alrededor del evento", url: `/explorador/?${q}` };
}

// ---- Línea de tiempo de /periodos/ ----

export interface TramoLinea {
  id: string;
  nombre: string;
  corto: string;
  rango: string;
  x: number;
  ancho: number;
  fila: number;
  clase: "a" | "b" | "facto";
  rotulo: boolean;
}

export interface CarrilLinea {
  tipo: TipoPeriodo | "evento";
  nombre: string;
  filas: number;
  tramos: TramoLinea[];
}

/** Posición horizontal de un día AAAA-MM-DD entre el 1/1 de `inicio` y el 1/1 de `fin`, en un ancho dado. */
export function posicion(dia: string, inicio: number, fin: number, ancho: number): number {
  const [a, m, d] = dia.split("-").map(Number);
  const anios = a + (m - 1) / 12 + (d - 1) / 365 - inicio;
  return Math.max(0, Math.min(ancho, (anios / (fin - inicio)) * ancho));
}

/**
 * Los carriles de la línea de tiempo: uno por tipo de período (los planes, con filas si se superponen) y uno de eventos.
 * `hoy` (AAAA-MM-DD) cierra los períodos vigentes.
 */
export function lineaDeTiempo(registro: DocumentoPeriodos, eventos: DocumentoEventos, ancho: number, inicio: number, fin: number, hoy: string): CarrilLinea[] {
  const carriles: CarrilLinea[] = [];
  const nombres = new Map(registro.tipos.map((t) => [t.id, t.nombre]));
  for (const tipo of ["catedra", "gobierno", "ministro", "plan", "regimen_cambiario"] as TipoPeriodo[]) {
    const lista = periodosDe(registro, tipo);
    const x = (d: string) => posicion(d, inicio, fin, ancho);
    const geom = lista.map((p) => ({ p, a: x(p.desde), b: x(p.hasta ?? hoy) })).filter((g) => g.b > g.a);
    const filas = tipo === "plan" ? filasSuperpuestas(geom) : geom.map(() => 0);
    carriles.push({
      tipo, nombre: nombres.get(tipo) ?? tipo, filas: Math.max(0, ...filas) + 1,
      tramos: geom.map(({ p, a, b }, k) => ({
        id: p.id, nombre: p.nombre, corto: p.nombre_corto, rango: rangoCorto(p), x: a, ancho: Math.max(b - a, 1.5), fila: filas[k],
        clase: p.caracter === "de_facto" ? "facto" : k % 2 ? "b" : "a", rotulo: b - a >= p.nombre_corto.length * 6.6 + 8,
      })),
    });
  }
  carriles.push({
    tipo: "evento", nombre: "Eventos", filas: 1,
    tramos: eventos.eventos.map((e) => ({
      id: e.id, nombre: e.nombre, corto: e.nombre_corto, rango: fechaLarga(e.fecha), x: posicion(e.fecha, inicio, fin, ancho), ancho: 0,
      fila: 0, clase: "a" as const, rotulo: false,
    })),
  });
  return carriles;
}

function filasSuperpuestas(geom: Array<{ a: number; b: number }>): number[] {
  const finDeFila: number[] = [];
  return geom.map(({ a, b }) => {
    let fila = finDeFila.findIndex((f) => f <= a);
    if (fila === -1) fila = finDeFila.length;
    finDeFila[fila] = b;
    return fila;
  });
}

const fechaLarga = (d: string) => { const [a, m, dd] = d.split("-"); return `${Number(dd)}/${Number(m)}/${a}`; };
const rangoCorto = (p: { desde: string; hasta: string | null }) => (p.hasta ? `${fechaLarga(p.desde)}–${fechaLarga(p.hasta)}` : `desde el ${fechaLarga(p.desde)}`);
