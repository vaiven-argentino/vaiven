// Comparación de hasta 4 series (SPEC 4.1). Combina series ya transformadas: cada una aplica su propia cadena
// (`transformar`, en el orden fijo de la sección 4) y la combinación solo agrupa, alinea y avisa. Lo usan el explorador,
// las descargas de la vista, `comparar_series` y `especificacion_grafico`: no hay una segunda implementación.
// Como `transformar`, es síncrona y no lee archivos: los documentos y sus insumos los carga quien llama.
// Nunca se interpola: una fecha sin dato da null.

import { PASO, etiqueta, indiceMes } from "./fechas";
import { ErrorTransformacion, serieDeEntidad, tienePais, transformar } from "./transformar";
import type { DocumentoExportado, Frecuencia, InsumosCargados, Opciones, Resultado, Valor } from "./tipos";

/** Límites por pedido (SPEC 7.3): hasta 4 series y 10.000 observaciones, sumando las series y los países. */
export const LIMITE_SERIES = 4;
export const LIMITE_OBSERVACIONES = 10_000;
/** Países de la serie internacional en una comparación (SPEC 4.1 y 6.2). */
export const LIMITE_PAISES = 8;

/** Un pedido que no se puede combinar (dos internacionales, más de 4 series, demasiadas observaciones). */
export class ErrorComparacion extends Error {}

export type Ejes = "auto" | "paneles" | "doble";
export type FrecuenciaComun = "mensual" | "trimestral" | "anual";

export interface PedidoSerie {
  documento: DocumentoExportado;
  /** Su cadena de transformaciones. `desde` y `hasta` no se usan: son comunes (`PedidoComparacion`). */
  opciones?: Opciones;
  insumos?: InsumosCargados;
  /** Solo la serie internacional: los países (por defecto, la selección inicial; hasta 8). */
  paises?: string[];
  /** Escala logarítmica pedida para esta serie (vale la de la primera serie de cada eje o panel). */
  log?: boolean;
}

export interface PedidoComparacion {
  series: PedidoSerie[];
  desde?: string;
  hasta?: string;
  /** `auto` sigue la regla de 4.1; `paneles` y `doble` fuerzan la disposición cuando hay dos unidades. */
  ejes?: Ejes;
  /** Pantalla de menos de 600 px: con dos unidades, paneles por defecto (SPEC 6.5). */
  angosto?: boolean;
}

/** Un aviso de la combinación (los de cada serie vienen en su resultado). `series`: números de serie, desde 1. */
export interface AdvertenciaCombinacion {
  id: string;
  descripcion: string;
  series?: number[];
}

export interface SerieComparada {
  /** Posición en el pedido, desde 0. */
  indice: number;
  id: string;
  unidad: string;
  internacional: boolean;
  /** Las entidades que se ven: los países en la internacional y `""` en las demás. */
  entidades: string[];
  /** El resultado de su cadena, por entidad (`""` en las argentinas), en su propia frecuencia. */
  resultados: Record<string, Resultado>;
  /** La frecuencia más baja de sus datos en el rango (null, sin datos). La diaria cuenta como mensual. */
  frecuencia: Frecuencia | null;
  log: boolean;
}

export interface Panel {
  unidad: string;
  /** Las series del panel (o del eje), por su índice desde 0. */
  series: number[];
  log: boolean;
  internacional: boolean;
}

/**
 * La disposición del gráfico (SPEC 4.1). En `doble_eje`, el primer panel es el eje izquierdo (la unidad de la primera
 * serie) y el segundo, el derecho.
 */
export interface Disposicion {
  tipo: "unico" | "doble_eje" | "paneles";
  paneles: Panel[];
}

export interface Comparacion {
  series: SerieComparada[];
  disposicion: Disposicion;
  advertencias: AdvertenciaCombinacion[];
  observaciones: number;
}

export interface Columna {
  /** Número de serie, desde 1. */
  serie: number;
  id: string;
  pais?: string;
  unidad: string;
  /** Notas de la serie a la frecuencia común (por ejemplo, los períodos incompletos). */
  notas: string[];
}

export interface Alineada {
  frecuencia: FrecuenciaComun;
  columnas: Columna[];
  /** `[fecha, v1, v2…]`, una por período de la frecuencia común, del primero al último con dato de alguna serie. */
  filas: Array<[string, ...Valor[]]>;
  advertencias: AdvertenciaCombinacion[];
}

const ORDEN: Record<string, number> = { diaria: 1, mensual: 1, trimestral: 3, semestral: 6, anual: 12 };
const NOMBRE_TRANSFORMACION: Record<string, string> = {
  var_mensual: "la variación mensual", acumulada_anio: "la variación acumulada en el año",
};
const VARIACIONES = new Set(["var_mensual", "var_interanual", "var_dic_dic", "acumulada_anio"]);

// ── Combinar ───────────────────────────────────────────────────────────────────

/** Cada serie con su cadena, en su frecuencia, y la disposición del gráfico. */
export function comparar(p: PedidoComparacion): Comparacion {
  if (!p.series.length) throw new ErrorComparacion("Pedí al menos una serie.");
  if (p.series.length > LIMITE_SERIES) {
    throw new ErrorComparacion(`Se pueden comparar hasta ${LIMITE_SERIES} series a la vez (se pidieron ${p.series.length}).`);
  }
  const internacionales = p.series.map((s, k) => (tienePais(s.documento) ? k : -1)).filter((k) => k >= 0);
  if (internacionales.length > 1) {
    throw new ErrorComparacion(`Hay una serie internacional como máximo por vista (se pidieron ${internacionales.length}: ${internacionales.map((k) => p.series[k].documento.id).join(" y ")}).`);
  }
  const advertencias: AdvertenciaCombinacion[] = [];
  let observaciones = 0;
  const series = p.series.map((s, indice): SerieComparada => {
    const doc = s.documento;
    const internacional = tienePais(doc);
    const entidades = internacional ? (s.paises?.length ? s.paises : doc.entidades_por_defecto) : [""];
    if (entidades.length > LIMITE_PAISES) {
      throw new ErrorComparacion(`La serie internacional lleva hasta ${LIMITE_PAISES} países en una comparación (se pidieron ${entidades.length}).`);
    }
    const opciones = { ...(s.opciones ?? {}), desde: p.desde, hasta: p.hasta };
    if (opciones.desde === undefined) delete opciones.desde;
    if (opciones.hasta === undefined) delete opciones.hasta;
    const resultados = Object.fromEntries(entidades.map((e) => [e, transformar(serieDeEntidad(doc, e || undefined), opciones, s.insumos ?? {})]));
    const todos = Object.values(resultados);
    observaciones += todos.reduce((n, r) => n + r.datos.length, 0);
    const conDato = todos.some((r) => r.datos.some((d) => d[1] !== null));
    if (!conDato) {
      advertencias.push({ id: "c.sin-datos", series: [indice + 1], descripcion: `La serie ${indice + 1} (${doc.id}) no tiene datos en el rango pedido.` });
    }
    return {
      indice, id: doc.id, unidad: todos[0]?.unidad ?? doc.unidad, internacional, entidades, resultados,
      frecuencia: conDato ? frecuenciaMasBaja(todos) : null, log: s.log ?? false,
    };
  });
  if (observaciones > LIMITE_OBSERVACIONES) {
    throw new ErrorComparacion(`La comparación tiene ${observaciones.toLocaleString("es-AR")} observaciones, más que el límite de ${LIMITE_OBSERVACIONES.toLocaleString("es-AR")} (sumando las series y los países): acotá el período, la cantidad de series o de países, o pasá alguna serie a una frecuencia más baja.`);
  }
  const { disposicion: d, advertencias: avisos } = disposicion(series.map((s) => s.unidad), internacionales[0] ?? null,
    series.map((s) => s.log), p.ejes ?? "auto", p.angosto ?? false);
  const agregadas = avisoAgregaciones(p.series.map((s, k) => (s.opciones?.frecuencia ? k : -1)).filter((k) => k >= 0), p);
  return { series, disposicion: d, advertencias: [...advertencias, ...avisos, ...(agregadas ? [agregadas] : [])], observaciones };
}

/** La frecuencia más baja (la de períodos más largos) de los datos de una serie. */
function frecuenciaMasBaja(resultados: Resultado[]): Frecuencia | null {
  let mejor: Frecuencia | null = null;
  for (const r of resultados.filter((x) => x.datos.some((d) => d[1] !== null))) {
    for (const f of r.frecuencias) if (!mejor || ORDEN[f] > ORDEN[mejor]) mejor = f;
  }
  return mejor;
}

/**
 * La disposición según las unidades resultantes (SPEC 4.1): una unidad, un gráfico; dos, doble eje (o paneles a
 * pedido, o en pantallas angostas); tres o cuatro, o una internacional junto con otra serie, paneles sin alternativa.
 * Los paneles van en el orden en que aparece la primera serie de cada unidad; la internacional va en uno propio.
 */
export function disposicion(unidades: string[], internacional: number | null, logs: boolean[], ejes: Ejes, angosto: boolean):
  { disposicion: Disposicion; advertencias: AdvertenciaCombinacion[] } {
  const advertencias: AdvertenciaCombinacion[] = [];
  const paneles: Panel[] = [];
  unidades.forEach((unidad, k) => {
    const propio = k === internacional;
    const panel = propio ? undefined : paneles.find((x) => !x.internacional && x.unidad === unidad);
    if (panel) panel.series.push(k);
    else paneles.push({ unidad, series: [k], log: logs[k] ?? false, internacional: propio });
  });
  let tipo: Disposicion["tipo"];
  if (paneles.length === 1) {
    tipo = "unico";
    if (ejes === "paneles") {
      advertencias.push({ id: "c.ejes-ignorado", descripcion: "Todas las series tienen la misma unidad: van en un solo gráfico, sin paneles." });
    }
  } else if (paneles.length === 2 && internacional === null) {
    tipo = ejes === "paneles" || (angosto && ejes !== "doble") ? "paneles" : "doble_eje";
  } else {
    tipo = "paneles";
    if (ejes === "doble") {
      advertencias.push({
        id: "c.ejes-ignorado",
        descripcion: internacional === null
          ? `Hay ${paneles.length} unidades distintas: un doble eje no las puede mostrar, así que van en paneles.`
          : "Con una serie internacional junto con otra serie, la vista va en paneles: el doble eje no se ofrece.",
      });
    }
  }
  for (const panel of paneles) {
    const distintas = panel.series.filter((k) => (logs[k] ?? false) !== panel.log);
    if (distintas.length) {
      advertencias.push({
        id: "c.log-distinto", series: panel.series.map((k) => k + 1),
        descripcion: `Las series ${panel.series.map((k) => k + 1).join(" y ")} comparten ${tipo === "doble_eje" ? "eje" : "panel"} y piden escalas distintas: vale la de la serie ${panel.series[0] + 1} (${panel.log ? "logarítmica" : "lineal"}).`,
      });
    }
  }
  return { disposicion: { tipo, paneles }, advertencias };
}

const NOMBRE_AGREGACION: Record<string, string> = { promedio: "promedio", suma: "suma", fin_de_periodo: "valor de fin de período" };

/**
 * Si se agregan a una frecuencia más baja series con agregaciones distintas (por ejemplo, el IPC en promedio y las
 * reservas a fin de período), un aviso: la agregación la fija cada serie y no se elige (ajustes tras la prueba, B2).
 */
function avisoAgregaciones(indices: number[], p: PedidoComparacion): AdvertenciaCombinacion | null {
  const agregacion = (k: number) => p.series[k].documento.agregacion;
  if (new Set(indices.map(agregacion)).size < 2) return null;
  const lista = indices.map((k) => `serie ${k + 1}, ${NOMBRE_AGREGACION[agregacion(k)] ?? agregacion(k)}`).join("; ");
  return {
    id: "c.agregaciones-distintas", series: indices.map((k) => k + 1),
    descripcion: `Las series agregadas a una frecuencia más baja usan agregaciones distintas (${lista}): cada serie usa la suya, que no se elige. Por ejemplo, un IPC anual es el promedio del año y unas reservas anuales, el saldo de fin de año.`,
  };
}

// ── Frecuencia común ───────────────────────────────────────────────────────────

/**
 * La frecuencia común (SPEC 4.1): la más baja de los datos del conjunto dentro del rango, con mensual < trimestral <
 * anual. Una serie semestral (EPH puntual) la lleva a anual, porque la onda no es un semestre calendario; una diaria
 * cuenta como mensual. Null si ninguna serie tiene datos.
 */
export function frecuenciaComun(c: Pick<Comparacion, "series">): { frecuencia: FrecuenciaComun | null; semestral: boolean } {
  const frecs = c.series.map((s) => s.frecuencia).filter((f): f is Frecuencia => f !== null);
  if (!frecs.length) return { frecuencia: null, semestral: false };
  const maximo = Math.max(...frecs.map((f) => ORDEN[f]));
  const semestral = frecs.includes("semestral");
  return { frecuencia: maximo >= 6 ? "anual" : maximo === 3 ? "trimestral" : "mensual", semestral };
}

/**
 * Las series a la frecuencia común (tabla de la vista, XLSX ancho, `comparar_series` por defecto). Cada serie que no
 * está en esa frecuencia vuelve a pasar por su cadena con `frecuencia` (con su `agregacion` y solo períodos completos),
 * así que la medida y la variación se aplican después: una variación interanual alineada a anual es la del promedio
 * anual. Si su transformación no existe a esa frecuencia, la columna queda en null, con un aviso.
 */
export function alinear(p: PedidoComparacion, c: Comparacion = comparar(p)): Alineada {
  const { frecuencia, semestral } = frecuenciaComun(c);
  const comun: FrecuenciaComun = frecuencia ?? "anual";
  const advertencias: AdvertenciaCombinacion[] = [];
  const convertidas: number[] = [];
  const conVariacion: number[] = [];
  const columnas: Columna[] = [];
  const valores: Array<Map<number, Valor>> = [];

  c.series.forEach((s) => {
    const pedido = p.series[s.indice];
    const opciones = pedido.opciones ?? {};
    const igual = s.frecuencia === null || ORDEN[s.frecuencia] === ORDEN[comun] ||
      (s.frecuencia === "diaria" && comun === "mensual");
    const sinEquivalente = igual ? null : motivoSinEquivalente(opciones, comun);
    if (!igual && !sinEquivalente) convertidas.push(s.indice + 1);
    if (!igual && !sinEquivalente && VARIACIONES.has(opciones.transformacion ?? "nivel")) conVariacion.push(s.indice + 1);
    let motivo = sinEquivalente;
    for (const e of s.entidades) {
      let r: Resultado | null = s.resultados[e];
      if (!igual && !motivo) {
        const o: Opciones = { ...opciones, frecuencia: comun === "mensual" ? undefined : comun };
        // Con la medida real y sin base pedida, los mismos precios que la serie en su frecuencia («julio de 2026»), y no
        // los del último período completo de la frecuencia común («2.º trimestre de 2026»): ajustes, B4.
        if (o.medida === "real" && !o.baseReal && s.resultados[e]?.baseReal) o.baseReal = s.resultados[e].baseReal;
        if (o.frecuencia === undefined) delete o.frecuencia;
        if (p.desde !== undefined) o.desde = p.desde; else delete o.desde;
        if (p.hasta !== undefined) o.hasta = p.hasta; else delete o.hasta;
        try {
          r = transformar(serieDeEntidad(pedido.documento, e || undefined), o, pedido.insumos ?? {});
        } catch (err) {
          if (!(err instanceof ErrorTransformacion)) throw err;
          motivo = err.message;
          r = null;
        }
      } else if (motivo) r = null;
      columnas.push({ serie: s.indice + 1, id: s.id, ...(e ? { pais: e } : {}), unidad: r?.unidad ?? s.unidad, notas: r && !igual ? r.notas : [] });
      valores.push(new Map(r ? r.datos.map(([f, v]) => [indiceMes(f), v] as [number, Valor]) : []));
    }
    if (motivo) {
      // Si un país falló después de que otros se convirtieron, toda la serie queda sin equivalente (una sola regla).
      const desdeCol = columnas.length - s.entidades.length;
      for (let k = desdeCol; k < columnas.length; k++) { valores[k] = new Map(); columnas[k].notas = []; }
      const conv = convertidas.indexOf(s.indice + 1);
      if (conv >= 0) convertidas.splice(conv, 1);
      const cv = conVariacion.indexOf(s.indice + 1);
      if (cv >= 0) conVariacion.splice(cv, 1);
      advertencias.push({
        id: "c.sin-equivalente", series: [s.indice + 1],
        descripcion: `La serie ${s.indice + 1} (${s.id}) no tiene equivalente a frecuencia ${comun}: ${motivo} Su columna queda vacía; para verla en su frecuencia, pedí las series sin alinear.`,
      });
    }
  });

  if (convertidas.length) {
    advertencias.unshift({
      id: "c.frecuencia-comun", series: convertidas,
      descripcion: `Las series se llevaron a frecuencia ${comun}, la más baja del conjunto${semestral ? " (una serie semestral de la EPH puntual la lleva a anual, porque la onda no es un semestre calendario)" : ""}, con la agregación de cada una y solo con períodos completos.`,
    });
  }
  if (conVariacion.length) {
    advertencias.push({
      id: "c.variacion-promedio", series: conVariacion,
      descripcion: `Con frecuencia común ${comun}, la variación de ${conVariacion.length > 1 ? "las series" : "la serie"} ${conVariacion.join(" y ")} se calcula sobre los valores ya agregados (por ejemplo, la interanual es la del promedio ${comun === "anual" ? "anual" : "trimestral"}), no es el promedio de las variaciones ${frecuenciasDeOrigen(conVariacion, c)}.`,
    });
  }

  // Las agregadas: por su propia `frecuencia` o por la frecuencia común.
  const agregadas = avisoAgregaciones(p.series.map((s, k) => (s.opciones?.frecuencia || convertidas.includes(k + 1) ? k : -1)).filter((k) => k >= 0), p);
  if (agregadas) advertencias.push(agregadas);

  const indices = valores.flatMap((m) => [...m.keys()]);
  const filas: Alineada["filas"] = [];
  if (indices.length) {
    const paso = PASO[comun];
    const ini = Math.min(...indices), fin = Math.max(...indices);
    for (let i = ini - (ini % paso); i <= fin; i += paso) {
      filas.push([etiqueta(i, comun), ...valores.map((m) => m.get(i) ?? null)]);
    }
  }
  return { frecuencia: comun, columnas, filas, advertencias };
}

/** «mensuales» o «trimestrales», según la frecuencia propia de las series convertidas. */
function frecuenciasDeOrigen(numeros: number[], c: Comparacion): string {
  const frecs = new Set(numeros.map((n) => c.series[n - 1].frecuencia));
  return frecs.size === 1 && frecs.has("trimestral") ? "trimestrales" : frecs.has("semestral") ? "de cada período" : "mensuales";
}

/** Por qué una cadena no se puede llevar a otra frecuencia (null si se puede). */
function motivoSinEquivalente(o: Opciones, comun: FrecuenciaComun): string | null {
  const t = o.transformacion ?? "nivel";
  if (comun !== "mensual" && (t === "var_mensual" || t === "acumulada_anio")) {
    return `${NOMBRE_TRANSFORMACION[t]} solo existe en datos mensuales.`;
  }
  if (o.mediaMovil !== undefined) {
    return `una media móvil de ${o.mediaMovil} períodos cambiaría de sentido al cambiar la frecuencia.`;
  }
  if (o.base && "fecha" in o.base && comun !== "mensual" && /^\d{4}-\d{2}$/.test(o.base.fecha)) {
    return `la base 100 en un mes (${o.base.fecha}) no existe a frecuencia ${comun}.`;
  }
  return null;
}

// ── Doble eje ──────────────────────────────────────────────────────────────────

/**
 * Ceros alineados en el doble eje (SPEC 4.1): si los dos rangos incluyen el 0, se amplía uno de los dos (el que menos
 * cambia) para que el 0 quede a la misma altura en los dos ejes. Así una serie no parece negativa cuando la otra cruza
 * el 0. Si alguno no incluye el 0, los rangos quedan como están.
 */
export function cerosAlineados(izq: [number, number], der: [number, number]): { izq: [number, number]; der: [number, number]; alineados: boolean } {
  const incluye = ([a, b]: [number, number]) => a <= 0 && b >= 0 && b > a;
  if (!incluye(izq) || !incluye(der)) return { izq, der, alineados: false };
  const fr = ([a, b]: [number, number]) => -a / (b - a); // altura del 0 desde abajo, de 0 a 1
  const p1 = fr(izq), p2 = fr(der);
  if (Math.abs(p1 - p2) < 1e-12) return { izq, der, alineados: true };
  // El que tiene el 0 más abajo baja su mínimo, o el otro sube su máximo: se elige la ampliación relativa menor.
  const [bajo, alto, invertido] = p1 < p2 ? [izq, der, false] : [der, izq, true];
  const pAlto = fr(alto), pBajo = fr(bajo);
  const candidatos: Array<{ b: [number, number]; a: [number, number]; factor: number }> = [];
  if (pAlto < 1) {
    const min = (-pAlto * bajo[1]) / (1 - pAlto);
    candidatos.push({ b: [min, bajo[1]], a: alto, factor: (bajo[1] - min) / (bajo[1] - bajo[0]) });
  }
  if (pBajo > 0) {
    const max = (-alto[0] * (1 - pBajo)) / pBajo;
    candidatos.push({ b: bajo, a: [alto[0], max], factor: (max - alto[0]) / (alto[1] - alto[0]) });
  }
  const mejor = candidatos.sort((x, y) => x.factor - y.factor)[0];
  return invertido ? { izq: mejor.a, der: mejor.b, alineados: true } : { izq: mejor.b, der: mejor.a, alineados: true };
}
