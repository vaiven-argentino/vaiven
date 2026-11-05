// Tipos del export (esquemas 1.1 y 1.2) que lee el MCP: catalogo.json, quiebres.json y el JSON de cada variante.
// El contrato completo está en tests/contrato/.
import type { Advertencia, DocumentoExportado, Entidad } from "@vaiven/transformaciones";

export type EstadoVariante = "publicada" | "pendiente" | "pendiente_licencia";

export interface VarianteCatalogo {
  id: string;
  nombre: string;
  estado: EstadoVariante;
  frecuencia: string;
  cobertura: { desde: string; hasta: string } | null;
  archivo: string | null;
  nota?: string;
}

/** Una ficha del inventario de la bibliografía que usa la serie (docs/planificacion/inventario_graficos.csv). */
export interface FichaBibliografia {
  id: string;
  referencia: string;
  pagina: string;
  tipo: string;
  titulo_original: string;
  periodo_cubierto: string;
}

export interface SerieCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  bloque: string;
  prioridad: string;
  definicion: string;
  unidad: string;
  tipo: string;
  agregacion: string;
  transformaciones: string[];
  frecuencia: string;
  variante_por_defecto: string;
  quiebres: string[];
  variantes: VarianteCatalogo[];
  /** Solo en las series con dimensión pais (SPEC 2.5). */
  dimensiones?: ["pais"];
  entidades?: Entidad[];
  entidades_por_defecto?: string[];
  bibliografia?: FichaBibliografia[];
}

export interface Catalogo {
  version_datos: string;
  series: SerieCatalogo[];
}

export interface Fuente {
  id: string;
  organismo: string;
  nombre: string;
  url: string;
  licencia: string;
  id_api: string | null;
}

/** Lo que el JSON de una variante suma a lo que transforma la librería. */
interface MetaDocumento {
  esquema: string;
  serie: string;
  codigo: string;
  nombre: string;
  variante: string;
  nombre_variante: string;
  es_variante_por_defecto: boolean;
  metodo: string;
  empalme: string;
  cobertura: { desde: string; hasta: string };
  fuentes: Fuente[];
  licencia: string;
  cita: string;
  version_datos: string;
  desactualizada_desde: string | null;
  /** Desde la 1.2: con qué transformación y medida arranca la ficha. */
  vista_inicial?: { transformacion?: string; medida?: string };
}

/** Una variante exportada: con una sola serie o con dimensión pais. */
export type DocumentoSerie = MetaDocumento & DocumentoExportado;

export interface Quiebre extends Advertencia {
  afecta: string[];
  fuente?: string;
}
