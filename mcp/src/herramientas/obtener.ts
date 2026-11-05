// obtener_serie (SPEC 7.2 y 7.3): datos de una variante publicada, con transformaciones livianas de
// @vaiven/transformaciones. Toda respuesta lleva advertencias, version_datos, fuentes y cita.
import { nombreTransformacion, textoCita } from "@vaiven/cita";
import {
  ErrorFecha, ErrorTransformacion, serieDeEntidad, tienePais, transformar,
  type Advertencia, type Base, type Excluido, type Frecuencia, type Resultado, type Transformacion,
} from "@vaiven/transformaciones";
import { ErrorHerramienta, exigirPublicada, type Repositorio } from "../datos";
import type { DocumentoSerie } from "../tipos";
import { LIMITE_OBSERVACIONES, redondear } from "./comun";
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

const unicasPorId = (xs: Advertencia[]) => xs.filter((a, k) => xs.findIndex((b) => b.id === a.id) === k);

export async function obtenerSerie(repo: Repositorio, args: ArgsObtener) {
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
  if (args.desde && args.hasta && args.desde > args.hasta) {
    throw new ErrorHerramienta(`El período está invertido: desde ${args.desde} es posterior a hasta ${args.hasta}.`);
  }
  const paises = leerPaises(doc, args.paises);
  const deflactor = args.deflactor ? leerDeflactor(doc, args.deflactor) : undefined;
  const opciones = {
    pesosActuales: args.pesos_actuales || undefined,
    frecuencia: args.frecuencia,
    medida: args.medida,
    deflactor,
    baseReal: args.base_real,
    transformacion,
    base: args.base ? leerBase(args.base) : undefined,
    desde: args.desde,
    hasta: args.hasta,
  };
  const insumos = await repo.insumos(doc, opciones);

  // Una entrada por país (o una sola, sin clave, en las series sin dimensión país).
  const claves = paises.length ? paises : [""];
  let resultados: Resultado[];
  try {
    resultados = claves.map((p) => transformar(serieDeEntidad(doc, p || undefined), opciones, insumos));
  } catch (e) {
    if (e instanceof ErrorTransformacion || e instanceof ErrorFecha) {
      const d = transformacionesDe(doc);
      throw new ErrorHerramienta(`${e.message} Esta variante admite: transformaciones ${d.transformaciones.join(", ")}` +
        `${d.frecuencias.length ? `; frecuencias ${d.frecuencias.join(", ")}` : "; no se puede cambiar de frecuencia"}` +
        `${d.medidas.length ? `; medidas ${d.medidas.join(", ")}` : "; ninguna medida"}` +
        `${d.deflactores ? ` (deflactores: ${d.deflactores.join(", ")})` : ""}` +
        `${d.con_pesos_actuales ? `; con pesos_actuales: transformaciones ${d.con_pesos_actuales.transformaciones.join(", ")}` : ""}.`);
    }
    throw e;
  }

  const total = resultados.reduce((n, r) => n + r.datos.length, 0);
  if (total > LIMITE_OBSERVACIONES) {
    const pista = paises.length > 1 ? ", pedí menos países" : "";
    throw new ErrorHerramienta(`El pedido da ${total} observaciones y el límite es ${LIMITE_OBSERVACIONES}. Acotá desde y hasta${pista} o pasá a una frecuencia más baja.`);
  }

  const transformada = transformacion !== "nivel" || args.frecuencia !== undefined || args.medida !== undefined || !!args.pesos_actuales;
  const listas = resultados.map((r) => r.datos.map(([fecha, v]) => [fecha, transformada ? redondear(v) : v] as [string, number | null]));
  const conDatos = listas.findIndex((l) => l.length);
  const frecuencias = conDatos === -1 ? [] : tramosDeFrecuencia(listas[conDatos], resultados[conDatos].frecuencias);
  const fechas = listas.flat().map(([f]) => f).sort();
  const advertencias = unicasPorId(resultados.flatMap((r) => r.advertencias));
  const excluidos: Excluido[] = resultados.flatMap((r) => r.excluidos);
  const notas = [...new Set(resultados.flatMap((r) => r.notas))];
  if (!fechas.length) notas.push("No hay datos en el período pedido.");
  if (excluidos.length) {
    notas.push("Los datos excluidos van como null en `datos`, con su motivo en `excluidos`: Vaivén no los interpola ni los corrige.");
  }
  if (frecuencias.length > 1) {
    notas.push("Frecuencia mixta: cada tramo de `frecuencias` dice la frecuencia de sus observaciones. Las variaciones comparan solo observaciones de la misma frecuencia.");
  }
  if (resultados.some((r) => r.frecuencias.includes("semestral"))) {
    notas.push("Las fechas semestrales son las de cada onda o semestre, tal como las fecha la fuente (ver advertencias).");
  }
  if (paises.length) notas.push("`datos` va por país (ISO3 o código del agregado del Banco Mundial), cada uno con sus observaciones.");
  if (transformada) notas.push("Los valores transformados se redondean a 6 cifras significativas.");
  if (doc.desactualizada_desde) notas.push(`La serie está desactualizada desde ${doc.desactualizada_desde}: la fuente no respondió.`);

  const nombres = tienePais(doc) ? new Map(doc.entidades.map((e) => [e.id, e.nombre])) : new Map<string, string>();
  const cita = nombreTransformacion({
    entidad: paises.length ? paises : undefined,
    pesosActuales: args.pesos_actuales,
    frecuencia: args.frecuencia,
    medida: args.medida,
    deflactor: args.medida === "real" ? (deflactor ?? doc.insumos?.real?.por_defecto) : undefined,
    baseReal: args.base_real,
    transformacion,
  });

  return {
    id: doc.id,
    serie: doc.serie,
    variante: doc.variante,
    nombre: doc.nombre,
    nombre_variante: doc.nombre_variante,
    unidad: resultados[0].unidad,
    transformacion,
    ...(args.pesos_actuales ? { pesos_actuales: true } : {}),
    ...(args.frecuencia ? { frecuencia_pedida: args.frecuencia } : {}),
    ...(args.medida ? { medida: args.medida } : {}),
    ...(args.medida === "real" ? { deflactor: deflactor ?? doc.insumos?.real?.por_defecto } : {}),
    ...(args.base ? { base: args.base } : {}),
    ...(paises.length ? { paises: paises.map((id) => ({ id, nombre: nombres.get(id) ?? id })) } : {}),
    desde: fechas[0] ?? null,
    hasta: fechas.at(-1) ?? null,
    n_observaciones: total,
    datos: paises.length ? Object.fromEntries(paises.map((p, k) => [p, listas[k]])) : listas[0],
    frecuencias,
    advertencias,
    excluidos,
    notas,
    fuentes: doc.fuentes,
    licencia: doc.licencia,
    version_datos: doc.version_datos,
    desactualizada_desde: doc.desactualizada_desde,
    cita: textoCita(doc, cita),
  };
}
