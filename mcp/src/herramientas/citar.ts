// citar (SPEC 7.2): la misma cita que muestra la ficha de la web (@vaiven/cita), con la versión de datos.
import { apa, bibtex, nombreTransformacion, textoCita, urlDeCita } from "@vaiven/cita";
import { tienePais } from "@vaiven/transformaciones";
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
  denominador?: "cada-base" | "retropolado" | "banco-mundial";
  paises?: string[];
}

export async function citar(repo: Repositorio, args: ArgsCitar) {
  const { serie, variante } = await repo.resolver(args.id, args.variante);
  exigirPublicada(serie, variante);
  const doc = await repo.documento(variante);
  const deflactor = args.medida === "real" ? (args.deflactor ? leerDeflactor(doc, args.deflactor) : doc.insumos?.real?.por_defecto) : undefined;
  // La cita nombra los países por su nombre, como la ficha (segunda revisión de la 4a): «Países: Argentina y Brasil».
  const nombres = new Map<string, string>(tienePais(doc) ? doc.entidades.map((e) => [e.id, e.nombre]) : []);
  const paises = args.paises?.length
    ? [...new Set(args.paises.map((p) => p.trim().toUpperCase()))].map((p) => nombres.get(p) ?? p) : undefined;
  const tr = nombreTransformacion({
    pesosActuales: args.pesos_actuales,
    frecuencia: args.frecuencia,
    medida: args.medida,
    deflactor,
    baseReal: args.base_real,
    denominador: args.medida === "pct_pib"
      ? args.denominador ?? doc.insumos?.pct_pib?.opciones.find((o) => o.id === doc.insumos?.pct_pib?.por_defecto)?.denominador : undefined,
    transformacion: args.transformacion,
  });
  const formatos = {
    texto: () => textoCita(doc, tr, paises),
    apa: () => apa(doc, tr, paises),
    bibtex: () => bibtex(doc, tr, paises),
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
