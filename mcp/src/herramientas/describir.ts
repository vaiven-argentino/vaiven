// describir_serie (SPEC 7.2): metadatos completos de una serie, sin los datos.
import { apa, bibtex, textoCita } from "@vaiven/cita";
import { disponibles, serieDeEntidad } from "@vaiven/transformaciones";
import type { Repositorio } from "../datos";
import type { DocumentoSerie, Fuente } from "../tipos";

export interface ArgsDescribir {
  id: string;
}

export interface Admite {
  transformaciones: string[];
  frecuencias: string[];
  /** real, en_dolares o pct_pib: las que tienen sus insumos publicados. */
  medidas: string[];
  /** Variantes del IPC para la medida real. */
  deflactores?: string[];
  /** Solo en moneda de cada época: lo que se habilita al pasar a pesos actuales. */
  con_pesos_actuales?: { transformaciones: string[]; frecuencias: string[] };
}

/** Transformaciones, frecuencias y medidas que admite la variante (las mismas que ofrece la ficha). */
export function transformacionesDe(doc: DocumentoSerie): Admite {
  try {
    // En las series con dimensión pais, todas las entidades admiten lo mismo: alcanza con la primera.
    const serie = serieDeEntidad(doc);
    const d = disponibles(serie);
    const salida: Admite = {
      transformaciones: d.transformaciones,
      frecuencias: d.frecuencias,
      medidas: d.medidas.filter((m) => m !== "pesos_actuales"),
    };
    if (d.deflactores.length) salida.deflactores = d.deflactores.map((o) => o.id);
    if (d.medidas.includes("pesos_actuales")) {
      const p = disponibles(serie, { pesosActuales: true });
      salida.con_pesos_actuales = { transformaciones: p.transformaciones, frecuencias: p.frecuencias };
    }
    return salida;
  } catch {
    // Las series diarias todavía no se transforman: solo se entregan tal cual.
    return { transformaciones: ["nivel"], frecuencias: [], medidas: [] };
  }
}

export function citasDe(doc: DocumentoSerie) {
  return { texto: textoCita(doc), apa: apa(doc), bibtex: bibtex(doc) };
}

export async function describirSerie(repo: Repositorio, args: ArgsDescribir) {
  const { serie, variante: pedida } = await repo.resolver(args.id);
  const [catalogo, quiebres] = await Promise.all([repo.catalogo(), repo.quiebres()]);
  const fuentes = new Map<string, Fuente>();
  let version: string | null = null;

  const variantes = await Promise.all(serie.variantes.map(async (v) => {
    const base = { id: v.id, nombre: v.nombre, estado: v.estado, es_por_defecto: v.id === serie.variante_por_defecto, frecuencia: v.frecuencia };
    if (v.estado !== "publicada" || !v.archivo) return { ...base, cobertura: null, ...(v.nota ? { nota: v.nota } : {}) };
    const doc = await repo.documento(v);
    for (const f of doc.fuentes) fuentes.set(f.id, f);
    if (!version || doc.version_datos > version) version = doc.version_datos;
    return {
      ...base,
      cobertura: doc.cobertura,
      ...(doc.moneda ? { moneda: doc.moneda } : {}),
      metodo: doc.metodo,
      empalme: doc.empalme,
      tramos: doc.tramos,
      ...transformacionesDe(doc),
      ...(doc.vista_inicial ? { vista_inicial: doc.vista_inicial } : {}),
      quiebres: doc.advertencias.map((a) => a.id),
      excluidos: doc.excluidos,
      fuentes: doc.fuentes.map((f) => f.id),
      desactualizada_desde: doc.desactualizada_desde,
      cita: citasDe(doc),
    };
  }));

  return {
    id: serie.id,
    codigo: serie.codigo,
    nombre: serie.nombre,
    bloque: serie.bloque,
    prioridad: serie.prioridad,
    definicion: serie.definicion,
    unidad: serie.unidad,
    tipo: serie.tipo,
    agregacion: serie.agregacion,
    frecuencia: serie.frecuencia,
    variante_por_defecto: serie.variante_por_defecto,
    ...(serie.entidades ? { paises: serie.entidades, paises_por_defecto: serie.entidades_por_defecto } : {}),
    ...(pedida.id !== serie.variante_por_defecto ? { variante_pedida: pedida.id } : {}),
    variantes,
    quiebres: serie.quiebres.map((id) => quiebres.get(id) ?? { id }),
    fuentes: [...fuentes.values()],
    bibliografia: serie.bibliografia ?? [],
    licencia: "CC-BY-4.0 (datos derivados de Vaivén); cada fuente conserva su licencia (ver fuentes).",
    version_datos: version ?? catalogo.version_datos,
    nota: "Las advertencias por quiebres de un período concreto las da obtener_serie junto con los datos.",
  };
}
