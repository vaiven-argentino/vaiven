// citar (SPEC 7.2): la misma cita que muestra la ficha de la web (@vaiven/cita), con la versión de datos.
import { apa, bibtex, nombreTransformacion, textoCita, urlDeCita } from "@vaiven/cita";
import { exigirPublicada, type Repositorio } from "../datos";

export interface ArgsCitar {
  id: string;
  variante?: string;
  formato?: "texto" | "apa" | "bibtex";
  transformacion?: string;
  frecuencia?: "trimestral" | "anual";
}

export async function citar(repo: Repositorio, args: ArgsCitar) {
  const { serie, variante } = await repo.resolver(args.id, args.variante);
  exigirPublicada(serie, variante);
  const doc = await repo.documento(variante);
  const tr = nombreTransformacion({ frecuencia: args.frecuencia, transformacion: args.transformacion });
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
