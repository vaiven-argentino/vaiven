// Tipos del export (esquema 1.1) que usan las transformaciones. El contrato completo está en tests/contrato/.

export type Frecuencia = "diaria" | "mensual" | "trimestral" | "semestral" | "anual";
export type TipoSerie = "precio" | "flujo" | "stock" | "tasa" | "cociente" | "tasa_de_variacion";
export type Agregacion = "promedio" | "suma" | "fin_de_periodo";
export type Valor = number | null;
export type Observacion = [fecha: string, valor: Valor];

export interface Tramo {
  fuente: string;
  desde: string;
  hasta: string;
  frecuencia: Frecuencia;
  rol?: string;
}

export interface Advertencia {
  id: string;
  desde: string | null;
  hasta: string | null;
  tipo: string;
  descripcion: string;
}

export interface Excluido {
  fecha: string;
  motivo: string;
}

/** Lo mínimo de `export/series/<slug>/<variante>.json` que hace falta para transformar. */
export interface SerieExportada {
  id: string;
  unidad: string;
  tipo: TipoSerie;
  agregacion: Agregacion;
  frecuencia: string;
  transformaciones: string[];
  tramos: Tramo[];
  advertencias: Advertencia[];
  excluidos: Excluido[];
  datos: [string, number][];
}

export type Variacion = "var_mensual" | "var_interanual" | "var_dic_dic" | "acumulada_anio";
export type Transformacion = "nivel" | Variacion | "base_100";

export type Base = { fecha: string } | { desde: string; hasta: string };

/** Se aplican en el orden fijo de la SPEC (sección 4): frecuencia → base_100 o variación → media móvil → período. */
export interface Opciones {
  frecuencia?: "trimestral" | "anual";
  transformacion?: Transformacion;
  base?: Base;
  mediaMovil?: number;
  desde?: string;
  hasta?: string;
}

export interface Resultado {
  datos: Observacion[];
  /** Frecuencia de cada observación (en las series de frecuencia mixta no es la misma en toda la serie). */
  frecuencias: Frecuencia[];
  unidad: string;
  /** Quiebres de la variante que se cruzan con el rango del resultado. */
  advertencias: Advertencia[];
  /** Observaciones excluidas por el pipeline que caen dentro del rango. */
  excluidos: Excluido[];
  notas: string[];
}
