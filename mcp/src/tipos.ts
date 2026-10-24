// Tipos del export (esquema 1.1) que lee el MCP: catalogo.json, quiebres.json y el JSON de cada variante.
// El contrato completo está en tests/contrato/.
import type { Advertencia, Excluido, SerieExportada, Tramo } from "@vaiven/transformaciones";

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

export interface DocumentoSerie extends SerieExportada {
  esquema: string;
  serie: string;
  codigo: string;
  nombre: string;
  variante: string;
  nombre_variante: string;
  es_variante_por_defecto: boolean;
  metodo: string;
  empalme: string;
  tramos: Tramo[];
  cobertura: { desde: string; hasta: string };
  advertencias: Advertencia[];
  excluidos: Excluido[];
  fuentes: Fuente[];
  licencia: string;
  cita: string;
  version_datos: string;
  desactualizada_desde: string | null;
}

export interface Quiebre extends Advertencia {
  afecta: string[];
  fuente?: string;
}
