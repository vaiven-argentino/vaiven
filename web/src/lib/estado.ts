// Estado del explorador en la URL (SPEC 6.2): abrir una URL reproduce exactamente la vista. Funciones puras, para
// probar la ida y vuelta con Vitest. Los parámetros son los de la ficha (t, m, d, pib, pa, f, mm, base, desde, hasta,
// log, e) más s y v (serie y variante), p (países), sh (sombreado) y ev (eventos: `1`, todos, o categorías separadas
// por comas). Lo que coincide con la vista inicial de la serie no se escribe, así las URL quedan cortas y estables.
import { disponibles, serieDeEntidad, tienePais, type DocumentoExportado, type Opciones, type SerieExportada, type Transformacion } from "@vaiven/transformaciones";
import { desdeInicial, frecuenciaInicial, medidaInicial, transformacionInicial } from "./ficha";
import { escribirEv, leerEv } from "./periodos";

export const SOMBREADOS = ["", "catedra", "gobierno", "mandato", "ministro", "plan", "regimen_cambiario"] as const;
export type Sombreado = (typeof SOMBREADOS)[number];
export const MEDIAS = [2, 3, 4, 6, 12] as const;
export const MAX_PAISES = 8;
export const SERIE_INICIAL = "ipc";

type Medida3 = "real" | "en_dolares" | "pct_pib";

export interface Estado {
  s: string;
  v: string;
  t: Transformacion;
  m: "" | Medida3;
  d: string;
  pib: string;
  pa: boolean;
  f: "" | "trimestral" | "anual";
  mm: number;
  base: string;
  desde: string;
  hasta: string;
  log: boolean;
  /** Solo series internacionales: países que se ven (hasta 8) y el resaltado (el primero de la lista). */
  p: string[];
  sh: Sombreado;
  /** Categorías de eventos marcadas (con `episodio` para los episodios); vacío, sin eventos. */
  ev: string[];
}

/** Lo que el explorador sabe de cada serie antes de pedir sus datos (índice embebido en la página). */
export interface IndiceSerie {
  id: string;
  codigo: string;
  nombre: string;
  bloque: string;
  variante_por_defecto: string;
  variantes: Array<{ id: string; nombre: string; archivo: string }>;
}

export type Documento = DocumentoExportado & { vista_inicial?: { transformacion?: string; medida?: string; frecuencia?: string; desde?: string } };

const PERIODO = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const BASE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

/** Primera etapa: qué serie y qué variante pide la URL (para saber qué JSON bajar). */
export function serieDeUrl(q: URLSearchParams, indice: IndiceSerie[]): { serie: IndiceSerie; variante: string; avisos: string[] } {
  const avisos: string[] = [];
  let serie = indice.find((s) => s.id === q.get("s"));
  if (!serie) {
    if (q.get("s")) avisos.push(`No hay una serie «${q.get("s")}»: se muestra la inflación (IPC).`);
    serie = indice.find((s) => s.id === SERIE_INICIAL) ?? indice[0];
  }
  let variante = q.get("v") ?? serie.variante_por_defecto;
  if (!serie.variantes.some((v) => v.id === variante)) {
    if (q.get("v")) avisos.push(`La serie no tiene una variante publicada «${q.get("v")}»: se muestra la variante por defecto.`);
    variante = serie.variante_por_defecto;
  }
  return { serie, variante, avisos };
}

/** La serie que se grafica: en las internacionales, la del país resaltado. */
export function serieVista(doc: Documento, p: string[]): SerieExportada & { vista_inicial?: Documento["vista_inicial"] } {
  return { ...serieDeEntidad(doc, tienePais(doc) ? p[0] : undefined), vista_inicial: doc.vista_inicial };
}

/** Escala logarítmica inicial: en nivel, sin medida, con valores positivos que varían más de mil veces (como la ficha). */
export function logInicial(serie: SerieExportada, t: string, m: string): boolean {
  const v = serie.datos.map((d) => d[1]).filter((x): x is number => x !== null);
  return !m && t === "nivel" && v.length > 0 && v.every((x) => x > 0) && Math.max(...v) / Math.min(...v) > 1000;
}

/** La vista con que arranca una serie (lo que no se escribe en la URL). */
export function porDefecto(s: string, v: string, doc: Documento): Estado {
  const p = tienePais(doc) ? [...doc.entidades_por_defecto] : [];
  const serie = serieVista(doc, p);
  const t = transformacionInicial(serie);
  const m = medidaInicial(serie) ?? "";
  return {
    s, v, t, m, d: "", pib: "", pa: false, f: frecuenciaInicial(serie) ?? "", mm: 0, base: "",
    desde: desdeInicial(serie) ?? "", hasta: "", log: logInicial(serie, t, m), p, sh: "", ev: [],
  };
}

/**
 * Segunda etapa, con el JSON de la variante: el estado completo, sin nada que la serie no admita. Cada cosa descartada
 * deja un aviso para mostrar junto al gráfico. `categorias` son las del filtro de eventos (`categoriasEv`).
 */
export function estadoDesdeUrl(q: URLSearchParams, s: string, v: string, doc: Documento, categorias: readonly string[]): { estado: Estado; avisos: string[] } {
  const avisos: string[] = [];
  const def = porDefecto(s, v, doc);
  const e: Estado = { ...def };
  const descartar = (param: string, que: string) => avisos.push(`La URL pedía ${que} («${q.get(param)}»), que esta serie no admite: se ignoró.`);
  const malEscrito = (param: string, que: string, forma: string) => avisos.push(`La URL tiene ${que} mal escrito («${q.get(param)}»; usá ${forma}): se ignoró.`);

  if (tienePais(doc)) {
    const validos = new Set(doc.entidades.map((x) => x.id));
    const pedidos = q.get("p")?.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
    if (pedidos) {
      const p = [...new Set(pedidos.filter((x) => validos.has(x)))].slice(0, MAX_PAISES);
      if (p.length < new Set(pedidos).size) avisos.push(`Se ignoraron países que la serie no tiene o que pasan de ${MAX_PAISES}.`);
      if (p.length) e.p = p;
    }
    const resaltado = q.get("e")?.toUpperCase();
    if (resaltado) {
      if (validos.has(resaltado)) e.p = [resaltado, ...e.p.filter((x) => x !== resaltado)].slice(0, MAX_PAISES);
      else descartar("e", "un país");
    }
  }
  const serie = serieVista(doc, e.p);
  e.pa = q.get("pa") === "1" && disponibles(serie).medidas.includes("pesos_actuales");
  const disp = disponibles(serie, { pesosActuales: e.pa });

  if (q.has("m")) {
    const m = q.get("m") ?? "";
    if (m === "" || (disp.medidas as string[]).includes(m)) e.m = m as Estado["m"];
    else descartar("m", "una medida");
  }
  if (e.m === "real" && q.get("d")) {
    if (disp.deflactores.some((o) => o.id === q.get("d"))) e.d = q.get("d")!;
    else descartar("d", "un IPC");
  }
  if (e.m === "pct_pib" && q.get("pib")) {
    if (disp.denominadores.includes(q.get("pib")!)) e.pib = q.get("pib")!;
    else descartar("pib", "un PIB");
  }
  const t = q.get("t");
  if (t) {
    if (disp.transformaciones.includes(t as Transformacion)) e.t = t as Transformacion;
    else descartar("t", "una transformación");
  } else if (!disp.transformaciones.includes(e.t)) e.t = "nivel";

  // La frecuencia por defecto depende de la medida: sin `f`, la de la vista inicial solo si la medida es la inicial.
  const f = q.get("f");
  if (f === "original") e.f = "";
  else if (f) {
    if ((disp.frecuencias as string[]).includes(f)) e.f = f as Estado["f"];
    else { descartar("f", "una frecuencia"); e.f = e.m === def.m ? def.f : ""; }
  } else e.f = e.m === def.m ? def.f : "";
  if (e.f && !(disp.frecuencias as string[]).includes(e.f)) e.f = "";

  const mm = Number(q.get("mm"));
  if (q.get("mm")) {
    if (disp.mediaMovil && (MEDIAS as readonly number[]).includes(mm)) e.mm = mm;
    else descartar("mm", "una media móvil");
  }
  if (e.t === "base_100" || e.t === "indice_desde_tasas") {
    const base = q.get("base") ?? "";
    if (base && BASE.test(base)) e.base = base;
    else if (base) malEscrito("base", "una base", "AAAA o AAAA-MM");
  }
  const desde = q.get("desde");
  if (desde === "todo") e.desde = "";
  else if (desde !== null) {
    if (PERIODO.test(desde)) e.desde = desde;
    else malEscrito("desde", "el inicio", "AAAA o AAAA-MM");
  }
  const hasta = q.get("hasta");
  if (hasta) {
    if (PERIODO.test(hasta)) e.hasta = hasta;
    else malEscrito("hasta", "el fin", "AAAA o AAAA-MM");
  }
  const logDef = logInicial(serie, e.t, e.m);
  e.log = q.get("log") === null ? logDef : q.get("log") === "1";
  const sh = q.get("sh") ?? "";
  if ((SOMBREADOS as readonly string[]).includes(sh)) e.sh = sh as Sombreado;
  else descartar("sh", "un sombreado");
  const ev = leerEv(q.get("ev"), categorias);
  e.ev = ev.ev;
  avisos.push(...ev.avisos);
  return { estado: e, avisos };
}

/** La URL canónica de un estado: solo lo que difiere de la vista inicial, siempre en el mismo orden. */
export function urlDesdeEstado(e: Estado, doc: Documento, indice: IndiceSerie[], categorias: readonly string[]): string {
  const def = porDefecto(e.s, e.v, doc);
  const q = new URLSearchParams();
  if (e.s !== SERIE_INICIAL) q.set("s", e.s);
  const serieIndice = indice.find((x) => x.id === e.s);
  if (serieIndice && e.v !== serieIndice.variante_por_defecto) q.set("v", e.v);
  if (tienePais(doc) && e.p.join(",") !== def.p.join(",")) q.set("p", e.p.join(","));
  if (e.pa) q.set("pa", "1");
  if (e.m !== def.m) q.set("m", e.m);
  if (e.m === "real" && e.d) q.set("d", e.d);
  if (e.m === "pct_pib" && e.pib) q.set("pib", e.pib);
  if (e.t !== def.t) q.set("t", e.t);
  const fDef = e.m === def.m ? def.f : "";
  if (e.f !== fDef) q.set("f", e.f || "original");
  if (e.mm) q.set("mm", String(e.mm));
  if ((e.t === "base_100" || e.t === "indice_desde_tasas") && e.base) q.set("base", e.base);
  if (e.desde !== def.desde) q.set("desde", e.desde || "todo");
  if (e.hasta) q.set("hasta", e.hasta);
  if (e.log !== logInicial(serieVista(doc, e.p), e.t, e.m)) q.set("log", e.log ? "1" : "0");
  if (e.sh) q.set("sh", e.sh);
  const ev = escribirEv(e.ev, categorias);
  if (ev) q.set("ev", ev);
  const texto = q.toString();
  return texto ? `?${texto}` : "";
}

/** Las opciones de la librería de transformaciones para un estado (las mismas reglas que la ficha). */
export function opcionesDe(e: Estado, serie: SerieExportada): Opciones {
  const o: Opciones = { transformacion: e.t };
  if (e.pa) o.pesosActuales = true;
  if (e.m) o.medida = e.m;
  if (o.medida === "real" && e.d) o.deflactor = e.d;
  if (o.medida === "pct_pib") {
    const insumo = serie.insumos?.pct_pib;
    o.denominador = e.pib || insumo?.opciones.find((x) => x.id === insumo.por_defecto)?.denominador;
  }
  if (e.f) o.frecuencia = e.f;
  if (e.mm) o.mediaMovil = e.mm;
  // Base 100 necesita una base: sin elegir, el primer año con dato (como la ficha). El índice desde tasas toma por
  // defecto el primer año con dato.
  const base = e.base || (e.t === "base_100" ? serie.datos[0]?.[0].slice(0, 4) : "");
  if ((e.t === "base_100" || e.t === "indice_desde_tasas") && base) {
    o.base = /^\d{4}$/.test(base) ? { desde: base, hasta: base } : { fecha: base };
  }
  if (e.desde) o.desde = e.desde;
  if (e.hasta) o.hasta = e.hasta;
  return o;
}
