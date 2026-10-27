// Transformaciones de la SPEC (sección 4) sobre una variante ya armada por el pipeline.
// Nunca se interpola: un dato faltante o excluido da null en todo lo que lo usa.

import { PASO, esRegular, etiqueta, frecuenciasPorFecha, indiceFin, indiceMes, type FrecuenciaRegular } from "./fechas";
import type {
  Advertencia, Base, DocumentoExportado, InsumosCargados, Medida, OpcionInsumo, Opciones, Resultado, SerieExportada,
  SeriePorPais, SignosMonetarios, Transformacion, Valor,
} from "./tipos";

export class ErrorTransformacion extends Error {}

interface Punto {
  i: number; // índice de meses del comienzo del período
  f: FrecuenciaRegular;
  v: Valor;
}

const NOMBRE_FRECUENCIA: Record<FrecuenciaRegular, string> = {
  mensual: "mensual", trimestral: "trimestral", semestral: "semestral", anual: "anual",
};

const UNIDAD_VARIACION: Record<string, string> = {
  var_mensual: "variación % mensual",
  var_interanual: "variación % interanual",
  var_dic_dic: "variación % diciembre–diciembre",
  acumulada_anio: "variación % acumulada en el año",
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
  "noviembre", "diciembre"];

/** Las transformaciones que implementa esta versión (SPEC 4). */
export const IMPLEMENTADAS = ["nivel", "var_mensual", "var_interanual", "var_dic_dic", "acumulada_anio", "base_100",
  "frecuencia", "media_movil", "real", "en_dolares", "pct_pib", "pesos_actuales", "indice_desde_tasas"] as const;

// ── Dimensión pais ─────────────────────────────────────────────────────────────

export function tienePais(doc: DocumentoExportado): doc is SeriePorPais {
  return !Array.isArray(doc.datos);
}

/** La serie de una entidad (por defecto, la primera de la selección inicial), lista para transformar. */
export function serieDeEntidad(doc: DocumentoExportado, entidad?: string): SerieExportada {
  if (!tienePais(doc)) return doc;
  const id = entidad ?? doc.entidades_por_defecto[0];
  if (!(id in doc.datos)) {
    throw new ErrorTransformacion(`La serie ${doc.id} no tiene la entidad «${id}». Entidades: ${Object.keys(doc.datos).join(", ")}.`);
  }
  const { datos, entidades: _e, entidades_por_defecto: _d, dimensiones: _x, ...resto } = doc;
  return { ...resto, datos: datos[id], excluidos: doc.excluidos.filter((e) => !e.pais || e.pais === id) };
}

/** Transforma varias entidades con las mismas opciones. */
export function transformarEntidades(doc: DocumentoExportado, entidades: string[], opciones: Opciones = {},
  insumos: InsumosCargados = {}): Record<string, Resultado> {
  return Object.fromEntries(entidades.map((e) => [e, transformar(serieDeEntidad(doc, e), opciones, insumos)]));
}

// ── Qué se puede ofrecer ───────────────────────────────────────────────────────

export interface Disponibles {
  transformaciones: Transformacion[];
  frecuencias: Array<"trimestral" | "anual">;
  mediaMovil: boolean;
  /** Medidas con sus insumos declarados (real, en_dolares, pct_pib, pesos_actuales). */
  medidas: Medida[];
  /** Variantes del IPC para la medida real. */
  deflactores: OpcionInsumo[];
}

/**
 * Qué se le puede ofrecer a una variante: lo que declaran sus metadatos, si su frecuencia y su moneda lo permiten.
 * En moneda de cada época, sin pasar a pesos actuales solo queda el nivel: las variaciones y los promedios
 * cruzarían los cambios de signo monetario.
 */
export function disponibles(serie: SerieExportada, opciones: { pesosActuales?: boolean } = {}): Disponibles {
  const insumos = serie.insumos ?? {};
  const medidas = (["real", "en_dolares", "pct_pib", "pesos_actuales"] as const).filter((m) => insumos[m]);
  const deflactores = insumos.real?.opciones ?? [];
  if (serie.moneda === "moneda_de_epoca" && !opciones.pesosActuales) {
    return { transformaciones: ["nivel"], frecuencias: [], mediaMovil: false, medidas, deflactores };
  }
  const declaradas = new Set(serie.transformaciones);
  const puntos = puntosDe(serie);
  const frecs = new Set(puntos.map((p) => p.f));
  const soloMensual = frecs.size === 1 && frecs.has("mensual");
  const transformaciones: Transformacion[] = ["nivel"];
  if (declaradas.has("var_mensual") && soloMensual) transformaciones.push("var_mensual");
  if (declaradas.has("var_interanual")) transformaciones.push("var_interanual");
  if (declaradas.has("var_dic_dic") && soloMensual) transformaciones.push("var_dic_dic");
  if (declaradas.has("acumulada_anio") && soloMensual) transformaciones.push("acumulada_anio");
  if (declaradas.has("base_100")) transformaciones.push("base_100");
  if (declaradas.has("indice_desde_tasas") && serie.tipo === "tasa_de_variacion" && frecs.size === 1 && frecs.has("anual")) {
    transformaciones.push("indice_desde_tasas");
  }
  const masGruesa = Math.max(...puntos.map((p) => PASO[p.f]));
  const frecuencias = declaradas.has("frecuencia")
    ? (["trimestral", "anual"] as const).filter((a) => PASO[a] > masGruesa && !(a === "trimestral" && frecs.has("semestral")))
    : [];
  return { transformaciones, frecuencias: [...frecuencias], mediaMovil: declaradas.has("media_movil"), medidas, deflactores };
}

// ── Transformar ────────────────────────────────────────────────────────────────

export function transformar(serie: SerieExportada, opciones: Opciones = {}, insumos: InsumosCargados = {}): Resultado {
  const transformacion = opciones.transformacion ?? "nivel";
  const disp = disponibles(serie, { pesosActuales: opciones.pesosActuales });
  if (opciones.pesosActuales && !disp.medidas.includes("pesos_actuales")) {
    throw new ErrorTransformacion(`La variante ${serie.id} no está en moneda de cada época: no hace falta pasarla a pesos actuales.`);
  }
  if (!disp.transformaciones.includes(transformacion)) {
    const pista = serie.moneda === "moneda_de_epoca" && !opciones.pesosActuales ? " Primero pasala a pesos actuales." : "";
    throw new ErrorTransformacion(`La variante ${serie.id} no admite «${transformacion}».${pista}`);
  }
  if (opciones.frecuencia && !disp.frecuencias.includes(opciones.frecuencia)) {
    throw new ErrorTransformacion(`La variante ${serie.id} no se puede pasar a frecuencia ${opciones.frecuencia}.`);
  }
  if (opciones.mediaMovil !== undefined && !disp.mediaMovil) {
    throw new ErrorTransformacion(`La variante ${serie.id} no admite media móvil.`);
  }
  if (opciones.medida && !disp.medidas.includes(opciones.medida)) {
    throw new ErrorTransformacion(`La variante ${serie.id} no admite la medida «${opciones.medida}».`);
  }
  const notas: string[] = [];
  const extra: Advertencia[] = [];
  let puntos = puntosDe(serie);
  let unidad = serie.unidad;

  // 1. Pesos actuales (antes que la frecuencia, para no promediar signos monetarios distintos).
  if (opciones.pesosActuales) {
    if (!insumos.signos) throw new ErrorTransformacion("Para pasar a pesos actuales hacen falta los signos monetarios.");
    puntos = aPesosActuales(puntos, insumos.signos);
    unidad = serie.insumos!.pesos_actuales!.unidad;
    notas.push("Convertida a pesos actuales con el signo monetario vigente al último día de cada período.");
  }

  // 2. Frecuencia.
  if (opciones.frecuencia) {
    puntos = agregar(puntos, opciones.frecuencia, serie.agregacion, notas);
    unidad = `${unidad} (${descripcionAgregacion(serie.agregacion, opciones.frecuencia)})`;
  }

  // 3. Medida: real, en dólares o % del PIB.
  if (opciones.medida) {
    [puntos, unidad] = aplicarMedida(serie, puntos, opciones, insumos, notas, extra);
  }

  // 4. Base 100, variación o índice desde tasas (son excluyentes).
  if (transformacion === "base_100") {
    if (!opciones.base) throw new ErrorTransformacion("Para base 100 hace falta elegir una fecha o un período.");
    const [valores, descripcion] = base100(puntos, opciones.base, notas);
    puntos = valores;
    unidad = `índice, ${descripcion} = 100`;
  } else if (transformacion === "indice_desde_tasas") {
    const [valores, anio] = indiceDesdeTasas(puntos, opciones.base, notas);
    puntos = valores;
    unidad = `índice, ${anio} = 100`;
  } else if (transformacion !== "nivel") {
    puntos = variacion(puntos, transformacion);
    unidad = UNIDAD_VARIACION[transformacion];
  }

  // 5. Media móvil.
  if (opciones.mediaMovil !== undefined) {
    const n = opciones.mediaMovil;
    if (!Number.isInteger(n) || n < 2 || n > 60) throw new ErrorTransformacion("La media móvil va de 2 a 60 períodos.");
    puntos = mediaMovil(puntos, n);
    unidad = `${unidad}, media móvil de ${n} períodos`;
  }

  // 6. Período elegido, sin nulos en los extremos.
  const desde = opciones.desde ? indiceMes(opciones.desde) : Number.NEGATIVE_INFINITY;
  const hasta = opciones.hasta ? indiceFin(opciones.hasta) : Number.POSITIVE_INFINITY;
  puntos = puntos.filter((p) => p.i >= desde && p.i <= hasta);
  const primero = puntos.findIndex((p) => p.v !== null);
  const ultimo = puntos.findLastIndex((p) => p.v !== null);
  puntos = primero === -1 ? [] : puntos.slice(primero, ultimo + 1);

  const inicio = puntos[0]?.i;
  const fin = puntos.length ? puntos[puntos.length - 1].i + PASO[puntos[puntos.length - 1].f] - 1 : undefined;
  const todas = [...serie.advertencias, ...extra.filter((a) => !serie.advertencias.some((b) => b.id === a.id))];
  return {
    datos: puntos.map((p) => [etiqueta(p.i, p.f), p.v]),
    frecuencias: puntos.map((p) => p.f),
    unidad,
    advertencias: inicio === undefined || fin === undefined ? [] : cruzadas(unicas(todas), inicio, fin),
    excluidos: inicio === undefined || fin === undefined ? [] : serie.excluidos.filter((e) => {
      const i = indiceMes(e.fecha);
      return i >= inicio && i <= fin;
    }),
    notas,
  };
}

function unicas(advertencias: Advertencia[]): Advertencia[] {
  const vistos = new Set<string>();
  return advertencias.filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true)));
}

/** Datos de la variante más los excluidos (como null), en orden y con la frecuencia de cada observación. */
function puntosDe(serie: SerieExportada): Punto[] {
  if (!Array.isArray(serie.datos)) {
    throw new ErrorTransformacion(`La serie ${serie.id} tiene dimensión pais: elegí una entidad con serieDeEntidad().`);
  }
  const filas: Array<[string, Valor]> = [...serie.datos, ...serie.excluidos.map((e) => [e.fecha, null] as [string, Valor])];
  filas.sort((a, b) => indiceMes(a[0]) - indiceMes(b[0]));
  const frecuencias = frecuenciasPorFecha(filas.map((f) => f[0]), serie.tramos, serie.frecuencia);
  return filas.map(([fecha, v], k) => {
    const f = frecuencias[k];
    if (!esRegular(f)) throw new ErrorTransformacion(`Las series diarias todavía no se transforman (${serie.id}).`);
    return { i: indiceMes(fecha), f, v };
  });
}

function descripcionAgregacion(agregacion: string, a: "trimestral" | "anual"): string {
  const periodo = a === "anual" ? "anual" : "trimestral";
  if (agregacion === "suma") return `suma ${periodo}`;
  if (agregacion === "fin_de_periodo") return a === "anual" ? "fin de año" : "fin de trimestre";
  return `promedio ${periodo}`;
}

/** Cómo se nombra un período en las unidades: «abril de 2026», «2.º trimestre de 2026», «2026». */
function nombrePeriodo(i: number, f: FrecuenciaRegular): string {
  const anio = Math.floor(i / 12);
  if (f === "anual") return String(anio);
  if (f === "trimestral") return `${Math.floor((i % 12) / 3) + 1}.º trimestre de ${anio}`;
  if (f === "semestral") return `${MESES[i % 12]} de ${anio}`;
  return `${MESES[i % 12]} de ${anio}`;
}

// ── Pesos actuales ─────────────────────────────────────────────────────────────

function aPesosActuales(puntos: Punto[], signos: SignosMonetarios): Punto[] {
  const tabla = signos.signos.map((s) => ({ desde: s.desde, factor: s.unidades_por_peso_actual }))
    .sort((a, b) => a.desde.localeCompare(b.desde));
  return puntos.map((p) => {
    if (p.v === null) return p;
    // Signo vigente el último día del período (por ejemplo, junio de 1985 ya está en australes).
    const fin = p.i + PASO[p.f] - 1;
    const anio = Math.floor(fin / 12), mes = (fin % 12) + 1;
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
    const vigente = tabla.filter((s) => s.desde <= ultimoDia).at(-1);
    if (!vigente) throw new ErrorTransformacion(`No hay signo monetario vigente en ${ultimoDia}.`);
    return { ...p, v: p.v / vigente.factor };
  });
}

// ── Medidas ────────────────────────────────────────────────────────────────────

function insumo(insumos: InsumosCargados, id: string): SerieExportada {
  const s = insumos.series?.[id];
  if (!s) throw new ErrorTransformacion(`Falta cargar el insumo «${id}».`);
  return s;
}

/**
 * Valor del insumo en cada período de `puntos`: el promedio de sus observaciones dentro del período, solo si el
 * período está completo (un IPC mensual en un año sin diciembre da null). Si el insumo tiene la misma frecuencia,
 * es su valor.
 */
function enPeriodos(ins: SerieExportada, puntos: Punto[]): Map<number, Valor> {
  const propios = puntosDe(ins);
  const paso = Math.max(...propios.map((p) => PASO[p.f]));
  const porIndice = new Map(propios.map((p) => [p.i, p]));
  const salida = new Map<number, Valor>();
  for (const p of puntos) {
    const largo = PASO[p.f];
    if (paso > largo) {
      salida.set(p.i, null);
      continue;
    }
    const valores: Valor[] = [];
    for (let i = p.i; i < p.i + largo; i += paso) valores.push(porIndice.get(i)?.v ?? null);
    salida.set(p.i, valores.includes(null) ? null : (valores as number[]).reduce((s, x) => s + x, 0) / valores.length);
  }
  return salida;
}

function aplicarMedida(serie: SerieExportada, puntos: Punto[], opciones: Opciones, insumos: InsumosCargados,
  notas: string[], extra: Advertencia[]): [Punto[], string] {
  const medida = opciones.medida!;
  const declarado = serie.insumos![medida]!;
  const frecs = new Set(puntos.map((p) => p.f));
  if (frecs.size > 1) throw new ErrorTransformacion("Las medidas no se aplican a series de frecuencia mixta.");

  if (medida === "real") {
    const id = opciones.deflactor ?? declarado.por_defecto;
    const opcion = declarado.opciones.find((o) => o.id === id);
    if (!opcion) {
      throw new ErrorTransformacion(`«${id}» no es un deflactor de esta variante. Opciones: ${declarado.opciones.map((o) => o.id).join(", ")}.`);
    }
    const ipc = insumo(insumos, id);
    const valores = enPeriodos(ipc, puntos);
    let ipcBase: Valor;
    let nombre: string;
    if (opciones.baseReal) {
      // «AAAA»: el IPC promedio de ese año; «AAAA-MM»: el de ese mes.
      const anual = /^\d{4}$/.test(opciones.baseReal);
      const ib = indiceMes(opciones.baseReal);
      ipcBase = enPeriodos(ipc, [{ i: ib, f: anual ? "anual" : "mensual", v: 1 }]).get(ib) ?? null;
      nombre = nombrePeriodo(ib, anual ? "anual" : "mensual");
      if (ipcBase === null) throw new ErrorTransformacion(`No hay IPC (completo) en ${opciones.baseReal} para usar como base.`);
    } else {
      const base = [...puntos].reverse().find((p) => p.v !== null && valores.get(p.i) != null);
      if (!base) throw new ErrorTransformacion("No hay un período con dato de la serie y del IPC para usar como base.");
      ipcBase = valores.get(base.i)!;
      nombre = nombrePeriodo(base.i, base.f);
    }
    notas.push(notaReal(opcion, nombre));
    extra.push(...ipc.advertencias);
    return [deflactar(puntos, valores, ipcBase), declarado.unidad.replace("{base}", nombre)];
  }

  if (medida === "en_dolares") {
    const tc = insumo(insumos, declarado.por_defecto);
    const valores = enPeriodos(tc, puntos);
    notas.push("Convertida a dólares con el promedio de los valores de fin de mes del tipo de cambio oficial de cada período.");
    extra.push(...tc.advertencias);
    return [puntos.map((p) => {
      const x = valores.get(p.i);
      return { ...p, v: p.v === null || x == null || x === 0 ? null : p.v / x };
    }), declarado.unidad];
  }

  // % del PIB: el PIB tiene que tener la frecuencia de la serie; en los stocks, solo anual.
  const f = puntos[0]?.f;
  if (f !== "anual" && f !== "trimestral") {
    throw new ErrorTransformacion("Para % del PIB, primero pasá la serie a frecuencia anual (o trimestral, en los flujos).");
  }
  if (serie.tipo === "stock" && f !== "anual") {
    throw new ErrorTransformacion("En un stock, el % del PIB se calcula con el valor de fin de año y el PIB del año: pasá la serie a frecuencia anual.");
  }
  const opcion = declarado.opciones.find((o) => o.frecuencia === f);
  if (!opcion) throw new ErrorTransformacion(`No hay PIB ${f} para calcular el % del PIB.`);
  const pib = insumo(insumos, opcion.id);
  const valores = enPeriodos(pib, puntos);
  notas.push(`Dividida por el PIB ${f} («${opcion.id}») del mismo período.`);
  extra.push(...pib.advertencias);
  return [puntos.map((p) => {
    const x = valores.get(p.i);
    return { ...p, v: p.v === null || x == null || x === 0 ? null : (p.v / x) * 100 };
  }), declarado.unidad];
}

function deflactar(puntos: Punto[], ipc: Map<number, Valor>, ipcBase: number): Punto[] {
  return puntos.map((p) => {
    const x = ipc.get(p.i);
    return { ...p, v: p.v === null || x == null || x === 0 ? null : (p.v * ipcBase) / x };
  });
}

function notaReal(opcion: OpcionInsumo, base: string): string {
  return `Deflactada con el IPC «${opcion.nombre ?? opcion.id}» (${opcion.id}), a precios de ${base}.`;
}

// ── Frecuencia, variaciones, base 100 y media móvil ────────────────────────────

function agregar(puntos: Punto[], a: "trimestral" | "anual", agregacion: string, notas: string[]): Punto[] {
  const largo = PASO[a];
  const grupos = new Map<number, Punto[]>();
  for (const p of puntos) {
    if (PASO[p.f] > largo || (a === "trimestral" && p.f === "semestral")) {
      throw new ErrorTransformacion(`No se puede pasar de frecuencia ${NOMBRE_FRECUENCIA[p.f]} a ${a}.`);
    }
    const inicio = p.i - (p.i % largo);
    if (!grupos.has(inicio)) grupos.set(inicio, []);
    grupos.get(inicio)!.push(p);
  }
  const salida: Punto[] = [];
  const incompletos: string[] = [];
  for (const [inicio, grupo] of grupos) {
    const frecs = new Set(grupo.map((p) => p.f));
    const f = grupo[0].f;
    const valores = grupo.map((p) => p.v);
    let v: Valor = null;
    if (frecs.size === 1) {
      if (agregacion === "fin_de_periodo") {
        const ultimo = grupo[grupo.length - 1];
        // Vale el dato del último subperíodo (diciembre, el cuarto trimestre, la segunda onda), si está.
        if (ultimo.i + PASO[f] > inicio + largo - 1) v = ultimo.v;
      } else if (!valores.includes(null) && grupo.length === largo / PASO[f]) {
        const suma = (valores as number[]).reduce((s, x) => s + x, 0);
        v = agregacion === "suma" ? suma : suma / valores.length;
      }
    }
    if (v === null) incompletos.push(etiqueta(inicio, a));
    salida.push({ i: inicio, f: a, v });
  }
  if (incompletos.length) {
    const lista = incompletos.length > 8 ? `${incompletos.slice(0, 8).join(", ")} y ${incompletos.length - 8} más` : incompletos.join(", ");
    notas.push(`Sin dato en los períodos incompletos (les faltan observaciones o mezclan frecuencias): ${lista}.`);
  }
  return salida;
}

function variacion(puntos: Punto[], tipo: Exclude<Transformacion, "nivel" | "base_100" | "indice_desde_tasas">): Punto[] {
  const porIndice = new Map(puntos.map((p) => [p.i, p]));
  const tasa = (x: Valor, x0: Valor): Valor => (x === null || x0 === null || x0 === 0 ? null : (x / x0 - 1) * 100);
  const anterior = (i: number, f: FrecuenciaRegular): Valor => {
    const p = porIndice.get(i);
    return p && p.f === f ? p.v : null;
  };
  switch (tipo) {
    case "var_mensual":
      return puntos.map((p) => ({ ...p, v: tasa(p.v, anterior(p.i - 1, p.f)) }));
    case "var_interanual":
      // Misma fecha del año anterior, con la misma frecuencia: sirve también para la frecuencia mixta.
      return puntos.map((p) => ({ ...p, v: tasa(p.v, anterior(p.i - 12, p.f)) }));
    case "acumulada_anio":
      return puntos.map((p) => ({ ...p, v: tasa(p.v, anterior(p.i - (p.i % 12) - 1, p.f)) }));
    case "var_dic_dic":
      return puntos
        .filter((p) => p.i % 12 === 11)
        .map((p) => ({ i: p.i - 11, f: "anual" as const, v: tasa(p.v, anterior(p.i - 12, p.f)) }));
  }
}

function base100(puntos: Punto[], base: Base, notas: string[]): [Punto[], string] {
  let referencia: number;
  let descripcion: string;
  if ("fecha" in base) {
    const i = indiceMes(base.fecha);
    const p = puntos.find((q) => q.i === i);
    if (!p || p.v === null || p.v === 0) throw new ErrorTransformacion(`No hay dato en ${base.fecha} para usar como base.`);
    referencia = p.v;
    descripcion = base.fecha;
  } else {
    const desde = indiceMes(base.desde), hasta = indiceFin(base.hasta);
    const enRango = puntos.filter((q) => q.i >= desde && q.i <= hasta);
    const validos = enRango.map((q) => q.v).filter((v): v is number => v !== null);
    if (!validos.length) throw new ErrorTransformacion(`No hay datos entre ${base.desde} y ${base.hasta} para usar como base.`);
    if (validos.length < enRango.length) notas.push(`El promedio base deja afuera ${enRango.length - validos.length} períodos sin dato.`);
    referencia = validos.reduce((s, x) => s + x, 0) / validos.length;
    if (referencia === 0) throw new ErrorTransformacion("El promedio base da cero: elegí otro período.");
    descripcion = base.desde === base.hasta ? `promedio ${base.desde}` : `promedio ${base.desde}–${base.hasta}`;
  }
  return [puntos.map((p) => ({ ...p, v: p.v === null ? null : (p.v / referencia) * 100 })), descripcion];
}

/**
 * Encadena tasas de variación anuales en un índice (SPEC 4): Iₜ = Iₜ₋₁ × (1 + gₜ/100), con I = 100 en el año base
 * (por defecto, el primero con dato). Hacia atrás, Iₜ₋₁ = Iₜ ÷ (1 + gₜ/100). Un año sin dato corta la cadena.
 */
function indiceDesdeTasas(puntos: Punto[], base: Base | undefined, notas: string[]): [Punto[], string] {
  const conDato = puntos.filter((p) => p.v !== null);
  if (!conDato.length) throw new ErrorTransformacion("No hay tasas para encadenar.");
  let ib: number;
  if (!base) ib = conDato[0].i;
  else if ("fecha" in base) ib = indiceMes(base.fecha);
  else if (base.desde === base.hasta) ib = indiceMes(base.desde);
  else throw new ErrorTransformacion("Para el índice desde tasas, la base es un año (AAAA).");
  ib -= ib % 12;
  const k = puntos.findIndex((p) => p.i === ib);
  if (k === -1) throw new ErrorTransformacion(`No hay dato en ${Math.floor(ib / 12)} para usar como base del índice.`);
  const salida: Punto[] = puntos.map((p) => ({ ...p, v: null }));
  salida[k].v = 100;
  let corte = false;
  for (let j = k + 1; j < puntos.length; j++) {
    const g = puntos[j].v, previo = salida[j - 1].v;
    if (g === null || previo === null || puntos[j].i - puntos[j - 1].i !== 12) { corte = true; break; }
    salida[j].v = previo * (1 + g / 100);
  }
  for (let j = k; j > 0; j--) {
    const g = puntos[j].v, actual = salida[j].v;
    if (g === null || actual === null || puntos[j].i - puntos[j - 1].i !== 12) { corte = true; break; }
    salida[j - 1].v = actual / (1 + g / 100);
  }
  if (corte) notas.push("Un año sin dato corta el índice: no se encadena más allá de ese año.");
  return [salida, String(Math.floor(ib / 12))];
}

function mediaMovil(puntos: Punto[], n: number): Punto[] {
  return puntos.map((p, k) => {
    if (k < n - 1) return { ...p, v: null };
    const ventana = puntos.slice(k - n + 1, k + 1);
    // Tienen que ser n períodos seguidos, de la misma frecuencia y con dato.
    const seguidos = ventana.every((q, j) => q.f === p.f && q.v !== null && (j === 0 || q.i - ventana[j - 1].i === PASO[p.f]));
    return { ...p, v: seguidos ? (ventana as Array<Punto & { v: number }>).reduce((s, q) => s + q.v, 0) / n : null };
  });
}

/** Quiebres cuyo rango toca el período [inicio, fin] (índices de meses). Un `hasta` vacío sigue abierto. */
export function cruzadas(advertencias: Advertencia[], inicio: number, fin: number): Advertencia[] {
  return advertencias.filter((a) => {
    const desde = a.desde ? indiceMes(a.desde) : Number.NEGATIVE_INFINITY;
    const hasta = a.hasta ? indiceFin(a.hasta) : Number.POSITIVE_INFINITY;
    return desde <= fin && hasta >= inicio;
  });
}
