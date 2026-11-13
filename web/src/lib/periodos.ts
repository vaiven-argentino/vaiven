// Períodos y eventos en la web: qué se sombrea en un gráfico (ficha y explorador), cómo se nombra y qué accesos al
// explorador ofrece la página /periodos/. Funciones puras (se prueban con Vitest).
import {
  diaDeReferencia, diasDe, extremosDudosos, fasesDe, periodosDe, proporcionDe, rangoLegible, referenciaDe, seCruzan,
  textoOtros, textoPeriodo, textoReparto, ubicarFechas,
  type Agregacion, type ContextoUbicacion, type DocumentoEventos, type DocumentoPeriodos, type Opciones, type Periodo,
  type Resultado, type TipoPeriodo, type Ubicacion,
} from "@vaiven/transformaciones";
import type { BandaEpisodio, BandaPeriodo, MarcaEvento, ModoEventos } from "../graficos/espec";
import { fechaLegible } from "./formato";

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

/** El tipo de período de una opción de sombreado (los mandatos son gobiernos). */
export const tipoDe = (sh: OpcionSombreado): TipoPeriodo => (sh === "mandato" ? "gobierno" : sh);

/** Lo que hace falta para ubicar los datos de una vista: la agregación de la variante y la transformación pedida. */
export function contextoDe(agregacion: Agregacion, o: Pick<Opciones, "transformacion" | "mediaMovil">): ContextoUbicacion {
  return { agregacion, transformacion: o.transformacion, mediaMovil: o.mediaMovil };
}

/** Las tres columnas del período de cada fila (SPEC 6.2): `periodo`, `periodo_proporcion` y `otros_periodos`. */
export interface ColumnasPeriodo {
  periodo: string;
  periodo_proporcion: number | string;
  otros_periodos: string;
}

/** Dónde cae cada dato de un resultado entre los períodos que se ven (una sola regla para el gráfico y las descargas). */
export function ubicacionesDe(periodos: Periodo[], sh: OpcionSombreado, r: Resultado, contexto: ContextoUbicacion): Ubicacion[] {
  return ubicarFechas(r.datos.map((d) => d[0]), r.frecuencias, contexto, periodos, tipoDe(sh));
}

export const columnasDe = (u: Ubicacion): ColumnasPeriodo =>
  ({ periodo: textoPeriodo(u), periodo_proporcion: proporcionDe(u), otros_periodos: textoOtros(u) });

/** Aviso de las fechas de confianza baja de un período («fecha a confirmar»), o vacío. */
export function avisoConfianza(p: Pick<Periodo, "confianza">): string {
  const dudosos = extremosDudosos(p);
  if (!dudosos.length) return "";
  return dudosos.length === 2 ? "fechas a confirmar" : dudosos[0] === "desde" ? "fecha de inicio a confirmar" : "fecha de fin a confirmar";
}

/** La confianza de las fechas de un período en una línea: «inicio: alta; fin: media». */
export function textoConfianza(p: Pick<Periodo, "confianza">): string {
  const c = p.confianza;
  if (!c) return "";
  return `inicio: ${c.desde}${c.hasta ? `; fin: ${c.hasta}` : ""}`;
}

/**
 * La regla de ubicación en una línea, debajo del gráfico con sombreado (segunda revisión externa de la 4b, 2.2). El texto
 * completo (`REGLA_UBICACION`, de la librería) va en un desplegable «Cómo se asigna».
 */
export const REGLA_CORTA = "Cada dato se asigna al período vigente a mitad de su intervalo; los saldos a fin de período, al último día.";

/** Aclaración que acompaña a las etapas del curso fuera de /periodos/ (CSV, XLSX, pie de las imágenes). */
export const ACLARACION_ETAPAS = "etapas según la periodización de un curso universitario";

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

// ---- Filtro de eventos (parámetro `ev`, SPEC 6.2) ----

/** La categoría de los episodios en el filtro de eventos (no está en eventos.json: los episodios son períodos). */
export const EPISODIO = "episodio";

/** Las categorías del filtro, en orden canónico: las de eventos.json y, al final, los episodios. */
export const categoriasEv = (registro: Pick<DocumentoEventos, "categorias">): string[] => [...registro.categorias.map((c) => c.id), EPISODIO];

/**
 * Lee `ev` de la URL: sin valor, nada; `1`, todas las categorías (con los episodios); si no, la lista separada por
 * comas, en orden canónico. Lo que no es una categoría se ignora con un aviso.
 */
export function leerEv(valor: string | null, categorias: readonly string[]): { ev: string[]; avisos: string[] } {
  if (!valor) return { ev: [], avisos: [] };
  if (valor === "1") return { ev: [...categorias], avisos: [] };
  const pedidas = valor.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const desconocidas = pedidas.filter((x) => !categorias.includes(x));
  const avisos = desconocidas.length
    ? [`La URL pedía ${desconocidas.length === 1 ? "una categoría de eventos que no existe" : "categorías de eventos que no existen"} («${desconocidas.join(", ")}»): se ${desconocidas.length === 1 ? "ignoró" : "ignoraron"}.`]
    : [];
  return { ev: categorias.filter((c) => pedidas.includes(c)), avisos };
}

/** El valor canónico de `ev`: vacío sin eventos, `1` con todas las categorías, si no la lista en orden canónico. */
export function escribirEv(ev: readonly string[], categorias: readonly string[]): string {
  const elegidas = categorias.filter((c) => ev.includes(c));
  if (!elegidas.length) return "";
  return elegidas.length === categorias.length ? "1" : elegidas.join(",");
}

/** Si el filtro deja eventos afuera: «Se muestran 12 de 30 eventos (filtro: cambiario, deuda)». Vacío si no. */
export function avisoFiltroEventos(mostrados: number, total: number, ev: readonly string[], categorias: Array<{ id: string; nombre: string }>): string {
  const todas = [...categorias.map((c) => c.id), EPISODIO];
  if (!ev.length || todas.every((c) => ev.includes(c))) return "";
  const nombres = todas.filter((c) => ev.includes(c))
    .map((c) => (c === EPISODIO ? "episodios" : (categorias.find((x) => x.id === c)?.nombre ?? c).toLowerCase()));
  return `Se ${mostrados === 1 ? "muestra" : "muestran"} ${mostrados} de ${total} ${total === 1 ? "evento" : "eventos"} (filtro: ${nombres.join(", ")}).`;
}

export const letraEvento = (k: number) => (k < 26 ? String.fromCharCode(65 + k)
  : `${String.fromCharCode(64 + Math.floor(k / 26))}${String.fromCharCode(65 + (k % 26))}`);

/**
 * Los eventos dentro de lo que se ve, con su letra (A, B…) en orden de fecha. Con `ev`, solo los de esas categorías
 * (las letras se asignan después de filtrar).
 */
export function eventosEnRango(registro: DocumentoEventos, r: Resultado, ev?: readonly string[]): MarcaEvento[] {
  const rango = rangoDe(r);
  if (!rango) return [];
  return registro.eventos.filter((e) => e.fecha >= rango.desde && e.fecha <= rango.hasta && (!ev || ev.includes(e.categoria)))
    .map((e, k) => ({ letra: letraEvento(k), fecha: e.fecha, nombre: e.nombre }));
}

/** Los episodios que se cruzan con lo que se ve, con sus fases (para la franja de debajo del eje). */
export function episodiosEnRango(registro: DocumentoPeriodos, r: Resultado): BandaEpisodio[] {
  const rango = rangoDe(r);
  if (!rango) return [];
  return seCruzan(periodosDe(registro, "episodio"), rango.desde, rango.hasta).map((p) => ({
    desde: p.desde, hasta: p.hasta, nombre: p.nombre, nombre_corto: p.nombre_corto,
    ...(p.fases?.length ? { fases: fasesDe(p).map((f) => ({ desde: f.desde, hasta: f.hasta, nombre: f.nombre, nombre_corto: f.nombre_corto })) } : {}),
  }));
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
    t += " Cada dato se asigna al período vigente a mitad de su intervalo (los saldos en nivel, el último día).";
  }
  if (eventos.length) t += ` ${eventos.length === 1 ? "Un evento marcado" : `${eventos.length} eventos marcados`} (lista debajo del gráfico).`;
  return t;
}

// ---- Lector del gráfico ----

/**
 * El nombre corto de una fase dentro de una frase: solo la primera letra en minúscula («tregua del Plan Bunge y Born»;
 * antes se pasaba todo a minúsculas y salía «tregua del plan bunge y born»).
 */
export const enFrase = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** El día AAAA-MM-DD en forma corta: «3/1/1990». */
const diaCorto = (d: string) => { const [a, m, dd] = d.split("-"); return `${Number(dd)}/${Number(m)}/${a}`; };

/**
 * Lo que dice el lector del gráfico de un dato (revisión externa de la 4b, 9.4): fecha y valor; con sombreado, la
 * banda donde se dibuja (o las superpuestas) con sus fechas, y el reparto si cruza un cambio; el episodio y la fase en
 * que cae el día de referencia; y los eventos marcados cuya fecha cae dentro de la observación (con su letra, si el
 * gráfico las muestra).
 */
export function textoLectura(d: {
  fecha: string; frecuencia: string; valor: string; contexto: ContextoUbicacion;
  columna?: string; ubicacion?: Ubicacion; episodios?: BandaEpisodio[]; eventos?: MarcaEvento[]; modo?: ModoEventos;
}): string {
  const partes = [`${fechaLegible(d.fecha, d.frecuencia)}: ${d.valor}`];
  const u = d.ubicacion;
  if (u && d.columna) {
    const banda = u.vigentes.length ? u.vigentes.map((p) => `${p.nombre} (${rangoLegible(p)})`).join("; ") : u.etiqueta;
    partes.push(`${d.columna}: ${banda}${u.mayoria ? "" : " (sin mayoría)"}`);
    const reparto = textoReparto(u);
    if (reparto) partes.push(`reparto: ${reparto}`);
  }
  const dia = diaDeReferencia(referenciaDe(d.fecha, d.frecuencia, d.contexto));
  const dentro = (p: { desde: string; hasta: string | null }) => p.desde <= dia && (!p.hasta || dia < p.hasta);
  for (const ep of (d.episodios ?? []).filter(dentro)) {
    const fase = ep.fases?.find(dentro);
    partes.push(fase ? `episodio: ${ep.nombre}, ${enFrase(fase.nombre_corto)} (${rangoLegible(fase)})` : `episodio: ${ep.nombre} (${rangoLegible(ep)})`);
  }
  const { desde, hasta } = diasDe(d.fecha, d.frecuencia);
  const eventos = (d.eventos ?? []).filter((e) => e.fecha >= desde && e.fecha <= hasta);
  if (eventos.length) {
    const letra = d.modo !== "rayitas";
    partes.push(`${eventos.length === 1 ? "evento" : "eventos"}: ${eventos.map((e) => `${letra ? `${e.letra}. ` : ""}${e.nombre} (${diaCorto(e.fecha)})`).join("; ")}`);
  }
  return partes.join(" · ");
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
  // Los episodios no son un sombreado: se ven con «Marcar eventos».
  const marca: [string, string] = p.tipo === "episodio" ? ["ev", "1"] : ["sh", p.tipo];
  const desde = String(Number(p.desde.slice(0, 4)) - 1);
  const hastaAnio = p.hasta ? Number(p.hasta.slice(0, 4)) + 1 : null;
  return (largas ? VISTAS_LARGAS : VISTAS_CORTAS).filter(([s]) => publicadas.has(s)).map(([s, texto, extra]) => {
    const q = new URLSearchParams();
    if (s !== "ipc") q.set("s", s);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    q.set("desde", desde);
    if (hastaAnio && hastaAnio < hoy) q.set("hasta", String(hastaAnio));
    q.set(...marca);
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
  /** Gris del tramo: A y B se alternan, los gobiernos de facto en el más oscuro; planes y episodios, en el de la franja. */
  clase: "a" | "b" | "facto" | "franja";
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
  for (const tipo of ["catedra", "gobierno", "ministro", "plan", "regimen_cambiario", "episodio"] as TipoPeriodo[]) {
    const lista = periodosDe(registro, tipo);
    const x = (d: string) => posicion(d, inicio, fin, ancho);
    const geom = lista.map((p) => ({ p, a: x(p.desde), b: x(p.hasta ?? hoy) })).filter((g) => g.b > g.a);
    const filas = tipo === "plan" || tipo === "episodio" ? filasSuperpuestas(geom) : geom.map(() => 0);
    carriles.push({
      tipo, nombre: nombres.get(tipo) ?? tipo, filas: Math.max(0, ...filas) + 1,
      tramos: geom.map(({ p, a, b }, k) => ({
        id: p.id, nombre: p.nombre, corto: p.nombre_corto, rango: rangoCorto(p), x: a, ancho: Math.max(b - a, 1.5), fila: filas[k],
        clase: tipo === "plan" || tipo === "episodio" ? "franja" : p.caracter === "de_facto" ? "facto" : k % 2 ? "b" : "a",
        rotulo: b - a >= p.nombre_corto.length * 6.6 + 8,
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
