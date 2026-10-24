// obtener_serie (SPEC 7.2 y 7.3): datos de una variante publicada, con transformaciones livianas de
// @vaiven/transformaciones. Toda respuesta lleva advertencias, version_datos, fuentes y cita.
import { nombreTransformacion, textoCita } from "@vaiven/cita";
import { ErrorFecha, ErrorTransformacion, transformar, type Base, type Frecuencia, type Transformacion } from "@vaiven/transformaciones";
import { ErrorHerramienta, exigirPublicada, type Repositorio } from "../datos";
import { LIMITE_OBSERVACIONES, redondear } from "./comun";
import { transformacionesDe } from "./describir";

export interface ArgsObtener {
  id: string;
  variante?: string;
  desde?: string;
  hasta?: string;
  frecuencia?: "trimestral" | "anual";
  transformacion?: Transformacion;
  base?: string;
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

export async function obtenerSerie(repo: Repositorio, args: ArgsObtener) {
  const { serie, variante } = await repo.resolver(args.id, args.variante);
  exigirPublicada(serie, variante);
  const doc = await repo.documento(variante);
  const transformacion = args.transformacion ?? "nivel";
  if (args.base && transformacion !== "base_100") {
    throw new ErrorHerramienta("`base` solo se usa con transformacion «base_100».");
  }
  if (args.desde && args.hasta && args.desde > args.hasta) {
    throw new ErrorHerramienta(`El período está invertido: desde ${args.desde} es posterior a hasta ${args.hasta}.`);
  }

  let resultado;
  try {
    resultado = transformar(doc, {
      transformacion,
      frecuencia: args.frecuencia,
      base: args.base ? leerBase(args.base) : undefined,
      desde: args.desde,
      hasta: args.hasta,
    });
  } catch (e) {
    if (e instanceof ErrorTransformacion || e instanceof ErrorFecha) {
      const d = transformacionesDe(doc);
      throw new ErrorHerramienta(`${e.message} Esta variante admite: transformaciones ${d.transformaciones.join(", ")}` +
        `${d.frecuencias.length ? `; frecuencias ${d.frecuencias.join(", ")}` : "; no se puede cambiar de frecuencia"}.`);
    }
    throw e;
  }

  if (resultado.datos.length > LIMITE_OBSERVACIONES) {
    throw new ErrorHerramienta(`El pedido da ${resultado.datos.length} observaciones y el límite es ${LIMITE_OBSERVACIONES}. Acotá desde y hasta, o pasá a una frecuencia más baja.`);
  }

  const transformada = transformacion !== "nivel" || args.frecuencia !== undefined;
  const datos = resultado.datos.map(([fecha, v]) => [fecha, transformada ? redondear(v) : v] as [string, number | null]);
  const frecuencias = tramosDeFrecuencia(datos, resultado.frecuencias);
  const notas = [...resultado.notas];
  if (!datos.length) notas.push("No hay datos en el período pedido.");
  if (resultado.excluidos.length) {
    notas.push("Los datos excluidos van como null en `datos`, con su motivo en `excluidos`: Vaivén no los interpola ni los corrige.");
  }
  if (frecuencias.length > 1) {
    notas.push("Frecuencia mixta: cada tramo de `frecuencias` dice la frecuencia de sus observaciones. Las variaciones comparan solo observaciones de la misma frecuencia.");
  }
  if (resultado.frecuencias.includes("semestral")) {
    notas.push("Las fechas semestrales son las de cada onda o semestre, tal como las fecha la fuente (ver advertencias).");
  }
  if (transformada) notas.push("Los valores transformados se redondean a 6 cifras significativas.");
  if (doc.desactualizada_desde) notas.push(`La serie está desactualizada desde ${doc.desactualizada_desde}: la fuente no respondió.`);

  return {
    id: doc.id,
    serie: doc.serie,
    variante: doc.variante,
    nombre: doc.nombre,
    nombre_variante: doc.nombre_variante,
    unidad: resultado.unidad,
    transformacion,
    ...(args.frecuencia ? { frecuencia_pedida: args.frecuencia } : {}),
    ...(args.base ? { base: args.base } : {}),
    desde: datos[0]?.[0] ?? null,
    hasta: datos.at(-1)?.[0] ?? null,
    n_observaciones: datos.length,
    datos,
    frecuencias,
    advertencias: resultado.advertencias,
    excluidos: resultado.excluidos,
    notas,
    fuentes: doc.fuentes,
    licencia: doc.licencia,
    version_datos: doc.version_datos,
    desactualizada_desde: doc.desactualizada_desde,
    cita: textoCita(doc, nombreTransformacion({ frecuencia: args.frecuencia, transformacion })),
  };
}
