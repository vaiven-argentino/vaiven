// citar (SPEC 7.2): la misma cita que muestra la ficha de la web (@vaiven/cita), con la versión de datos.
import { apa, bibtex, nombreTransformacion, textoCita, urlDeCita } from "@vaiven/cita";
import { exigirPublicada, type Repositorio } from "../datos";
import { leerDeflactor } from "./obtener";

export interface ArgsCitar {
  id: string;
  variante?: string;
  formato?: "texto" | "apa" | "bibtex";
  transformacion?: string;
  frecuencia?: "trimestral" | "anual";
  pesos_actuales?: boolean;
  medida?: "real" | "en_dolares" | "pct_pib";
  deflactor?: string;
  base_real?: string;
  paises?: string[];
}

export async function citar(repo: Repositorio, args: ArgsCitar) {
  const { serie, variante } = await repo.resolver(args.id, args.variante);
  exigirPublicada(serie, variante);
  const doc = await repo.documento(variante);
  const deflactor = args.medida === "real" ? (args.deflactor ? leerDeflactor(doc, args.deflactor) : doc.insumos?.real?.por_defecto) : undefined;
  const tr = nombreTransformacion({
    entidad: args.paises?.length ? [...new Set(args.paises.map((p) => p.trim().toUpperCase()))] : undefined,
    pesosActuales: args.pesos_actuales,
    frecuencia: args.frecuencia,
    medida: args.medida,
    deflactor,
    baseReal: args.base_real,
    transformacion: args.transformacion,
  });
  const formatos = {
    texto: () => textoCita(doc, tr),
    apa: () => apa(doc, tr),
    bibtex: () => bibtex(doc, tr),
  };
  const pedidos = args.formato ? [args.formato] : (["texto", "apa", "bibtex"] as const);
  const citas: Partial<Record<"texto" | "apa" | "bibtex", string>> = Object.fromEntries(pedidos.map((f) => [f, formatos[f]()]));
  return {
    id: doc.id,
    serie: doc.serie,
    variante: doc.variante,
    version_datos: doc.version_datos,
    url: urlDeCita(doc.cita),
    licencia: doc.licencia,
    ...citas,
  };
}
