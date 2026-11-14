// obtener_serie (SPEC 7.2 y 7.3): datos de una variante publicada, con transformaciones livianas de
// @vaiven/transformaciones. Toda respuesta lleva advertencias, version_datos, fuentes y cita.
import { nombreTransformacion, textoCita } from "@vaiven/cita";
import {
  ErrorFecha, ErrorTransformacion, atraso, indiceMes, serieDeEntidad, tienePais, transformar,
  type Advertencia, type Base, type Excluido, type Frecuencia, type InsumosCargados, type Opciones, type Resultado, type Transformacion,
} from "@vaiven/transformaciones";
import { ErrorHerramienta, exigirPublicada, type Repositorio } from "../datos";
import type { DocumentoSerie } from "../tipos";
import { LIMITE_OBSERVACIONES, frecuenciaUtil, redondear } from "./comun";
import { transformacionesDe } from "./describir";

export type MedidaPedida = "real" | "en_dolares" | "pct_pib";

export interface ArgsObtener {
  id: string;
  variante?: string;
  desde?: string;
  hasta?: string;
  pesos_actuales?: boolean;
  frecuencia?: "trimestral" | "anual";
  medida?: MedidaPedida;
  deflactor?: string;
  base_real?: string;
  denominador?: "cada-base" | "retropolado" | "banco-mundial";
  transformacion?: Transformacion;
  base?: string;
  paises?: string[];
}

/** «2004-01» (esa observación), «2004» (promedio del año) o «2004-01/2004-12» (promedio del período). */
export function leerBase(base: string): Base {
  const partes = base.split("/").map((p) => p.trim());
  const valida = (p: string) => /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(p);
  if (partes.length > 2 || !partes.every(valida)) {
    throw new ErrorHerramienta(`La base «${base}» no se entiende: usá AAAA-MM, AAAA o AAAA-MM/AAAA-MM.`);
  }
  if (partes.length === 2) return { desde: partes[0], hasta: partes[1] };
  return /^\d{4}$/.test(partes[0]) ? { desde: partes[0], hasta: partes[0] } : { fecha: partes[0] };
}

/** Tramos seguidos de igual frecuencia: en la desocupación, semestral hasta 2003 y trimestral después. */
function tramosDeFrecuencia(datos: Array<[string, unknown]>, frecuencias: Frecuencia[]) {
  const salida: Array<{ desde: string; hasta: string; frecuencia: Frecuencia }> = [];
  datos.forEach(([fecha], k) => {
    const ultimo = salida.at(-1);
    if (ultimo && ultimo.frecuencia === frecuencias[k]) ultimo.hasta = fecha;
    else salida.push({ desde: fecha, hasta: fecha, frecuencia: frecuencias[k] });
  });
  return salida;
}

/** El deflactor pedido, como id completo: acepta «ipc.provincias» o solo «provincias». */
export function leerDeflactor(doc: DocumentoSerie, pedido: string): string {
  const opciones = doc.insumos?.real?.opciones ?? [];
  const p = pedido.trim().toLowerCase();
  const o = opciones.find((x) => x.id === p || x.id.endsWith(`.${p}`));
  if (!o) {
    const lista = opciones.length ? `Deflactores: ${opciones.map((x) => x.id).join(", ")}.` : "Esta variante no admite la medida real.";
    throw new ErrorHerramienta(`«${pedido}» no es un deflactor de esta variante. ${lista}`);
  }
  return o.id;
}

/** Los países pedidos, en ISO3 y sin repetir; por defecto, la selección inicial de la serie. */
function leerPaises(doc: DocumentoSerie, pedidos?: string[]): string[] {
  if (!tienePais(doc)) {
    if (pedidos?.length) throw new ErrorHerramienta(`La serie ${doc.id} no tiene dimensión país: no lleva \`paises\`.`);
    return [];
  }
  if (!pedidos?.length) return doc.entidades_por_defecto;
  const ids = [...new Set(pedidos.map((p) => p.trim().toUpperCase()))];
  const faltan = ids.filter((id) => !(id in doc.datos));
  if (faltan.length) {
    const lista = doc.entidades.map((e) => `${e.id} (${e.nombre})`).join(", ");
    throw new ErrorHerramienta(`La serie ${doc.id} no tiene ${faltan.join(", ")}. Países y agregados: ${lista}.`);
  }
  return ids;
}

/**
 * Nota fija cuando el resultado está en pesos actuales (la variante en pesos actuales o `pesos_actuales: true`, sin otra
 * medida): la conversión no es un ajuste por inflación (segunda revisión externa de la 4b, 4.7). Las equivalencias son las
 * de `metadatos/signos_monetarios.yaml` (lo controla una prueba).
 */
export const NOTA_PESOS_ACTUALES = "Pesos actuales es una equivalencia entre signos monetarios (1 peso = 10.000 australes = " +
  "10⁷ pesos argentinos = 10¹¹ pesos ley 18.188 = 10¹³ pesos moneda nacional), no un ajuste por inflación.";
/** La última frase de la nota, solo si la variante admite la medida real (ajustes de la 4b, A2). */
export const NOTA_PESOS_ACTUALES_REAL = "Para precios constantes, pedí `medida: real`.";

/**
 * El sustantivo de una serie cuyo nombre termina en «real» (ajustes de la 4b, A1): «Salario real» → «salario». Sale del
 * nombre, no de una lista escrita a mano (decidido con Camilo el 14/11/2026). Sin «real» al final, null.
 */
export function sustantivoNominal(nombre: string): string | null {
  const m = /^(.+?)\s+real$/i.exec(nombre.trim());
  return m ? `${m[1].charAt(0).toLowerCase()}${m[1].slice(1)}` : null;
}

/**
 * La unidad de una serie cuya ficha arranca en `medida: real`, cuando se pide sin medida: dice que es nominal
 * («pesos corrientes (salario nominal)»; con base 100, «índice del salario nominal, 2017-12 = 100»). Si no, la de siempre.
 * La usan la respuesta de cada serie y las columnas de comparar_series.
 */
export function unidadNominal(doc: Pick<DocumentoSerie, "nombre" | "vista_inicial">, medidaPedida: string | undefined, unidad: string): string {
  if (doc.vista_inicial?.medida !== "real" || medidaPedida) return unidad;
  const s = sustantivoNominal(doc.nombre);
  const nominal = s ? `${s} nominal` : "nominal";
  return unidad.startsWith("índice, ") ? `índice del ${nominal}, ${unidad.slice("índice, ".length)}` : `${unidad} (${nominal})`;
}

const NOMBRE_MEDIDA_NOTA: Record<string, string> = { real: "a precios constantes", en_dolares: "en dólares", pct_pib: "en % del PIB" };

/**
 * Si la ficha arranca con una medida y el pedido no trae ninguna, una nota primera que dice en qué está la respuesta y
 * cómo pedir lo que muestra la ficha (ajustes de la 4b, A1): un modelo podía leer el salario nominal como real.
 */
export function notaMedidaInicial(doc: Pick<DocumentoSerie, "nombre" | "unidad" | "vista_inicial">, medidaPedida: string | undefined): string | null {
  const m = doc.vista_inicial?.medida;
  if (!m || medidaPedida) return null;
  const f = (doc.vista_inicial as { frecuencia?: string } | undefined)?.frecuencia;
  const pedir = `\`medida: ${m}\`${f ? ` (con \`frecuencia: ${f}\`)` : ""}`;
  const s = m === "real" ? sustantivoNominal(doc.nombre) : null;
  if (s) return `Esta respuesta es el ${s} nominal (${doc.unidad}). El ${s} real, como lo muestra la ficha, se pide con ${pedir}.`;
  return `Esta respuesta está en ${doc.unidad}, sin la medida con que arranca la ficha. ${NOMBRE_MEDIDA_NOTA[m] ? `${NOMBRE_MEDIDA_NOTA[m][0].toUpperCase()}${NOMBRE_MEDIDA_NOTA[m].slice(1)}` : `Con la medida ${m}`}, como lo muestra la ficha, se pide con ${pedir}.`;
}

const unicasPorId = (xs: Advertencia[]) => xs.filter((a, k) => xs.findIndex((b) => b.id === a.id) === k);

/** Una serie pedida, ya validada, con sus opciones de la librería y sus insumos (la comparten las herramientas con datos). */
export interface SeriePreparada {
  args: ArgsObtener;
  /** Las variantes publicadas de la serie (la por defecto, primero) y si se pidió una (ajustes, B6). */
  variantes: { porDefecto: { id: string; nombre: string }; otras: string[]; pedida: boolean };
  /** El día del último cambio de signo monetario, si la respuesta puede estar en pesos actuales (A2). */
  cambioDeSigno?: string;
  doc: DocumentoSerie;
  transformacion: Transformacion;
  paises: string[];
  frecuencia: "trimestral" | "anual" | undefined;
  deflactor: string | undefined;
  opciones: Opciones;
  insumos: InsumosCargados;
}

/** Valida una serie pedida (con las reglas de obtener_serie) y carga sus insumos. */
export async function prepararSerie(repo: Repositorio, args: ArgsObtener): Promise<SeriePreparada> {
  const { serie, variante } = await repo.resolver(args.id, args.variante);
  exigirPublicada(serie, variante);
  const doc = await repo.documento(variante);
  const transformacion = args.transformacion ?? "nivel";
  if (args.base && transformacion !== "base_100" && transformacion !== "indice_desde_tasas") {
    throw new ErrorHerramienta("`base` solo se usa con transformacion «base_100» o «indice_desde_tasas».");
  }
  if ((args.deflactor || args.base_real) && args.medida !== "real") {
    throw new ErrorHerramienta("`deflactor` y `base_real` solo se usan con medida «real».");
  }
  if (args.denominador && args.medida !== "pct_pib") {
    throw new ErrorHerramienta("`denominador` solo se usa con medida «pct_pib».");
  }
  if (args.desde && args.hasta && args.desde > args.hasta) {
    throw new ErrorHerramienta(`El período está invertido: desde ${args.desde} es posterior a hasta ${args.hasta}.`);
  }
  const paises = leerPaises(doc, args.paises);
  // Una frecuencia igual a la de la variante se ignora (con una nota) en lugar de dar error.
  const frecuencia = frecuenciaUtil(doc, args.frecuencia);
  const deflactor = args.deflactor ? leerDeflactor(doc, args.deflactor) : undefined;
  const opciones: Opciones = {
    pesosActuales: args.pesos_actuales || undefined,
    frecuencia,
    medida: args.medida,
    deflactor,
    baseReal: args.base_real,
    denominador: args.denominador,
    transformacion,
    base: args.base ? leerBase(args.base) : undefined,
    desde: args.desde,
    hasta: args.hasta,
  };
  const insumos = await repo.insumos(doc, opciones);
  const publicadas = serie.variantes.filter((v) => v.estado === "publicada" && v.archivo);
  const porDefecto = publicadas.find((v) => v.id === serie.variante_por_defecto) ?? publicadas[0];
  const variantes = {
    porDefecto: { id: porDefecto.id, nombre: porDefecto.nombre },
    otras: publicadas.filter((v) => v.id !== porDefecto.id).map((v) => v.id),
    pedida: !!args.variante,
  };
  const cambioDeSigno = args.pesos_actuales || doc.moneda === "pesos_actuales" ? await repo.ultimoCambioDeSigno() : undefined;
  return { args, doc, variantes, cambioDeSigno, transformacion, paises, frecuencia, deflactor, opciones, insumos };
}

/** Un error de la librería, con lo que la variante sí admite (para que el agente pueda corregir el pedido). */
export function errorDeTransformacion(e: unknown, doc: DocumentoSerie): unknown {
  if (e instanceof ErrorTransformacion || e instanceof ErrorFecha) {
    const d = transformacionesDe(doc);
    return new ErrorHerramienta(`${e.message} Esta variante admite: transformaciones ${d.transformaciones.join(", ")}` +
      `${d.frecuencias.length ? `; frecuencias ${d.frecuencias.join(", ")}` : "; no se puede cambiar de frecuencia"}` +
      `${d.medidas.length ? `; medidas ${d.medidas.join(", ")}` : "; ninguna medida"}` +
      `${d.deflactores ? ` (deflactores: ${d.deflactores.join(", ")})` : ""}` +
      `${d.denominadores ? ` (PIB para % del PIB: ${d.denominadores.join(", ")})` : ""}` +
      `${d.con_pesos_actuales ? `; con pesos_actuales: transformaciones ${d.con_pesos_actuales.transformaciones.join(", ")}` : ""}.`);
  }
  return e;
}

/** La cadena de la serie, por país (o una sola, sin clave, en las series sin dimensión país). */
export function transformarPreparada(p: SeriePreparada): Resultado[] {
  const claves = p.paises.length ? p.paises : [""];
  try {
    return claves.map((pais) => transformar(serieDeEntidad(p.doc, pais || undefined), p.opciones, p.insumos));
  } catch (e) {
    throw errorDeTransformacion(e, p.doc);
  }
}

/** ¿Vaivén calculó algo (y los valores van redondeados)? */
export const esTransformada = (p: SeriePreparada) =>
  p.transformacion !== "nivel" || p.frecuencia !== undefined || p.args.medida !== undefined || !!p.args.pesos_actuales;

export async function obtenerSerie(repo: Repositorio, args: ArgsObtener) {
  const p = await prepararSerie(repo, args);
  const resultados = transformarPreparada(p);
  const total = resultados.reduce((n, r) => n + r.datos.length, 0);
  if (total > LIMITE_OBSERVACIONES) {
    const pista = p.paises.length > 1 ? ", pedí menos países" : "";
    throw new ErrorHerramienta(`El pedido da ${total} observaciones y el límite es ${LIMITE_OBSERVACIONES}. Acotá desde y hasta${pista} o pasá a una frecuencia más baja.`);
  }
  return respuestaSerie(p, resultados);
}

/**
 * La respuesta de una serie: datos, unidad, advertencias, notas, último dato y su atraso, fuentes,
 * licencia, versión de datos y cita. La usan obtener_serie y, por serie, comparar_series y especificacion_grafico.
 */
export function respuestaSerie(p: SeriePreparada, resultados: Resultado[], opciones: { sinDatos?: boolean } = {}) {
  // Con `sinDatos` (comparar_series a la frecuencia común), las notas no hablan de `datos` ni de `frecuencias` de la serie.
  const { args, doc, transformacion, paises, frecuencia, deflactor } = p;
  const total = resultados.reduce((n, r) => n + r.datos.length, 0);
  const transformada = esTransformada(p);
  const listas = resultados.map((r) => r.datos.map(([fecha, v]) => [fecha, transformada ? redondear(v) : v] as [string, number | null]));
  const conDatos = listas.findIndex((l) => l.length);
  const frecuencias = conDatos === -1 ? [] : tramosDeFrecuencia(listas[conDatos], resultados[conDatos].frecuencias);
  const fechas = listas.flat().map(([f]) => f).sort();
  const advertencias = unicasPorId(resultados.flatMap((r) => r.advertencias));
  const excluidos: Excluido[] = resultados.flatMap((r) => r.excluidos);
  const notas = [...new Set(resultados.flatMap((r) => r.notas))];
  if (!fechas.length) notas.push("No hay datos en el período pedido.");
  // Pesos actuales: la nota, solo si algún dato es anterior al último cambio de signo (antes, la conversión no cambia
  // nada), y la sugerencia de la medida real, solo si la variante la admite (ajustes de la 4b, A2).
  if ((args.pesos_actuales || doc.moneda === "pesos_actuales") && !args.medida && p.cambioDeSigno &&
    fechas.some((f) => indiceMes(f) < indiceMes(p.cambioDeSigno!.slice(0, 7)))) {
    notas.push(doc.insumos?.real ? `${NOTA_PESOS_ACTUALES} ${NOTA_PESOS_ACTUALES_REAL}` : NOTA_PESOS_ACTUALES);
  }
  // Sin `variante`, cuál se usó y cuáles hay (ajustes, B6): «resultado fiscal» a secas no tiene por qué ser el primario.
  if (!p.variantes.pedida && p.variantes.otras.length) {
    notas.push(`Sin \`variante\`, se usa «${p.variantes.porDefecto.id}» (${p.variantes.porDefecto.nombre}); otras publicadas: ${p.variantes.otras.join(", ")}. Elegí la que corresponda a la pregunta con \`variante\`.`);
  }
  const medidaInicial = notaMedidaInicial(doc, args.medida);
  if (medidaInicial) notas.unshift(medidaInicial);
  if (args.frecuencia && !frecuencia) notas.push(`La variante ya es ${args.frecuencia}: se ignoró \`frecuencia\`.`);
  if (excluidos.length) {
    notas.push("Los datos excluidos van como null en `datos`, con su motivo en `excluidos`: Vaivén no los interpola ni los corrige.");
  }
  if (frecuencias.length > 1 && !opciones.sinDatos) {
    notas.push("Frecuencia mixta: cada tramo de `frecuencias` dice la frecuencia de sus observaciones. Las variaciones comparan solo observaciones de la misma frecuencia.");
  }
  if (resultados.some((r) => r.frecuencias.includes("semestral"))) {
    notas.push("Las fechas semestrales son las de cada onda o semestre, tal como las fecha la fuente (ver advertencias).");
  }
  if (paises.length && !opciones.sinDatos) notas.push("`datos` va por país (ISO3 o código del agregado del Banco Mundial), cada uno con sus observaciones.");
  if (transformada) notas.push("Los valores transformados se redondean a 6 cifras significativas.");
  // Fuentes de descarga manual (Bruegel): qué versión usa Vaivén; avisar si tiene más de 3 meses.
  const manuales = doc.fuentes.filter((f) => f.descarga === "manual" && f.version);
  for (const f of manuales) {
    notas.push(`${f.organismo} se actualiza a mano (su sitio no deja descargar desde los servidores de Vaivén): la versión que usa Vaivén es del ${f.version}.`);
  }
  if (doc.licencia !== "CC-BY-4.0") {
    const propias = doc.fuentes.filter((f) => f.licencia !== "CC-BY-4.0");
    notas.push(`Licencia «${doc.licencia}»: los datos son de ${propias.map((f) => f.organismo).join(" y ")}, con sus propios términos (${propias.map((f) => f.licencia).join("; ")}), no CC BY.${propias.some((f) => f.cita) ? " Citá también la fuente como recomienda (fuentes[].cita)." : ""}`);
  }
  if (doc.desactualizada_desde) {
    notas.push(manuales.length
      ? `La versión de la fuente tiene más de 3 meses (desactualizada desde ${doc.desactualizada_desde}): puede haber una más nueva.`
      : `La serie no se pudo actualizar desde ${doc.desactualizada_desde}: la fuente no respondió o los datos nuevos no pasaron los controles. Los datos son los anteriores.`);
  }

  const pctPib = doc.insumos?.pct_pib;
  const denominadorUsado = args.medida === "pct_pib"
    ? args.denominador ?? pctPib?.opciones.find((o) => o.id === pctPib.por_defecto)?.denominador : undefined;
  const nombres = tienePais(doc) ? new Map(doc.entidades.map((e) => [e.id, e.nombre])) : new Map<string, string>();
  const cita = nombreTransformacion({
    pesosActuales: args.pesos_actuales,
    frecuencia,
    medida: args.medida,
    deflactor: args.medida === "real" ? (deflactor ?? doc.insumos?.real?.por_defecto) : undefined,
    baseReal: args.base_real,
    denominador: denominadorUsado,
    transformacion,
  });

  return {
    id: doc.id,
    serie: doc.serie,
    variante: doc.variante,
    nombre: doc.nombre,
    nombre_variante: doc.nombre_variante,
    unidad: unidadNominal(doc, args.medida, resultados[0].unidad),
    transformacion,
    ...(args.pesos_actuales ? { pesos_actuales: true } : {}),
    ...(frecuencia ? { frecuencia_pedida: frecuencia } : {}),
    ...(args.medida ? { medida: args.medida } : {}),
    ...(args.medida === "real" ? { deflactor: deflactor ?? doc.insumos?.real?.por_defecto } : {}),
    ...(denominadorUsado ? { denominador: denominadorUsado } : {}),
    ...(args.base ? { base: args.base } : {}),
    ...(paises.length ? { paises: paises.map((id) => ({ id, nombre: nombres.get(id) ?? id })) } : {}),
    desde: fechas[0] ?? null,
    hasta: fechas.at(-1) ?? null,
    n_observaciones: total,
    ultimo_dato: doc.cobertura.hasta,
    // Contra el calendario de la fuente y la fecha de hoy (segunda revisión de la 4a, 3.5); null si está al día.
    atraso: atraso(doc, new Date().toISOString()),
    datos: paises.length ? Object.fromEntries(paises.map((x, k) => [x, listas[k]])) : listas[0],
    frecuencias,
    advertencias,
    excluidos,
    notas,
    fuentes: doc.fuentes,
    licencia: doc.licencia,
    version_datos: doc.version_datos,
    desactualizada_desde: doc.desactualizada_desde,
    cita: textoCita(doc, cita, paises.length ? paises.map((id) => nombres.get(id) ?? id) : undefined),
  };
}
