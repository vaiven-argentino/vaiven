// Transformaciones de la SPEC (sección 4) sobre una variante ya armada por el pipeline.
// Nunca se interpola: un dato faltante o excluido da null en todo lo que lo usa.

import { PASO, esRegular, etiqueta, frecuenciasPorFecha, indiceFin, indiceMes, type FrecuenciaRegular } from "./fechas";
import type { Advertencia, Base, Opciones, Resultado, SerieExportada, Transformacion, Valor } from "./tipos";

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

/** Las transformaciones que implementa esta versión (las que necesitan series auxiliares llegan en la fase 4). */
export const IMPLEMENTADAS = ["nivel", "var_mensual", "var_interanual", "var_dic_dic", "acumulada_anio", "base_100",
  "frecuencia", "media_movil"] as const;

export interface Disponibles {
  transformaciones: Transformacion[];
  frecuencias: Array<"trimestral" | "anual">;
  mediaMovil: boolean;
}

/** Qué se le puede ofrecer a una variante: lo que declaran sus metadatos, si su frecuencia lo permite. */
export function disponibles(serie: SerieExportada): Disponibles {
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
  const masGruesa = Math.max(...puntos.map((p) => PASO[p.f]));
  const frecuencias = declaradas.has("frecuencia")
    ? (["trimestral", "anual"] as const).filter((a) => PASO[a] > masGruesa && !(a === "trimestral" && frecs.has("semestral")))
    : [];
  return { transformaciones, frecuencias: [...frecuencias], mediaMovil: declaradas.has("media_movil") };
}

export function transformar(serie: SerieExportada, opciones: Opciones = {}): Resultado {
  const transformacion = opciones.transformacion ?? "nivel";
  const disp = disponibles(serie);
  if (!disp.transformaciones.includes(transformacion)) {
    throw new ErrorTransformacion(`La variante ${serie.id} no admite «${transformacion}».`);
  }
  if (opciones.frecuencia && !disp.frecuencias.includes(opciones.frecuencia)) {
    throw new ErrorTransformacion(`La variante ${serie.id} no se puede pasar a frecuencia ${opciones.frecuencia}.`);
  }
  if (opciones.mediaMovil !== undefined && !disp.mediaMovil) {
    throw new ErrorTransformacion(`La variante ${serie.id} no admite media móvil.`);
  }
  const notas: string[] = [];
  let puntos = puntosDe(serie);
  let unidad = serie.unidad;

  // 1. Frecuencia.
  if (opciones.frecuencia) {
    puntos = agregar(puntos, opciones.frecuencia, serie.agregacion, notas);
    unidad = `${unidad} (${descripcionAgregacion(serie.agregacion, opciones.frecuencia)})`;
  }

  // 2. Base 100 o variación (son excluyentes).
  if (transformacion === "base_100") {
    if (!opciones.base) throw new ErrorTransformacion("Para base 100 hace falta elegir una fecha o un período.");
    const [valores, descripcion] = base100(puntos, opciones.base, notas);
    puntos = valores;
    unidad = `índice, ${descripcion} = 100`;
  } else if (transformacion !== "nivel") {
    puntos = variacion(puntos, transformacion);
    unidad = UNIDAD_VARIACION[transformacion];
  }

  // 3. Media móvil.
  if (opciones.mediaMovil !== undefined) {
    const n = opciones.mediaMovil;
    if (!Number.isInteger(n) || n < 2 || n > 60) throw new ErrorTransformacion("La media móvil va de 2 a 60 períodos.");
    puntos = mediaMovil(puntos, n);
    unidad = `${unidad}, media móvil de ${n} períodos`;
  }

  // 4. Período elegido, sin nulos en los extremos.
  const desde = opciones.desde ? indiceMes(opciones.desde) : Number.NEGATIVE_INFINITY;
  const hasta = opciones.hasta ? indiceFin(opciones.hasta) : Number.POSITIVE_INFINITY;
  puntos = puntos.filter((p) => p.i >= desde && p.i <= hasta);
  const primero = puntos.findIndex((p) => p.v !== null);
  const ultimo = puntos.findLastIndex((p) => p.v !== null);
  puntos = primero === -1 ? [] : puntos.slice(primero, ultimo + 1);

  const inicio = puntos[0]?.i;
  const fin = puntos.length ? puntos[puntos.length - 1].i + PASO[puntos[puntos.length - 1].f] - 1 : undefined;
  return {
    datos: puntos.map((p) => [etiqueta(p.i, p.f), p.v]),
    frecuencias: puntos.map((p) => p.f),
    unidad,
    advertencias: inicio === undefined || fin === undefined ? [] : cruzadas(serie.advertencias, inicio, fin),
    excluidos: inicio === undefined || fin === undefined ? [] : serie.excluidos.filter((e) => {
      const i = indiceMes(e.fecha);
      return i >= inicio && i <= fin;
    }),
    notas,
  };
}

/** Datos de la variante más los excluidos (como null), en orden y con la frecuencia de cada observación. */
function puntosDe(serie: SerieExportada): Punto[] {
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

function variacion(puntos: Punto[], tipo: Exclude<Transformacion, "nivel" | "base_100">): Punto[] {
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
    descripcion = `promedio ${base.desde}–${base.hasta}`;
  }
  return [puntos.map((p) => ({ ...p, v: p.v === null ? null : (p.v / referencia) * 100 })), descripcion];
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

