// Tipos del export (esquemas 1.1 y 1.2) que usan las transformaciones. El contrato completo está en tests/contrato/.

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
  /** En las series con dimensión pais, la entidad del dato excluido. */
  pais?: string;
}

export type Moneda = "pesos_actuales" | "moneda_de_epoca" | "dolares";
/** Medidas que cambian la unidad de la serie (SPEC 4: real, en dólares, % del PIB y pesos actuales). */
export type Medida = "real" | "en_dolares" | "pct_pib" | "pesos_actuales";

/** Una serie publicada que sirve de insumo a una medida (esquema 1.2). */
export interface OpcionInsumo {
  id: string;
  archivo: string;
  nombre?: string;
  frecuencia?: "mensual" | "trimestral" | "anual";
}

export interface Insumo {
  opciones: OpcionInsumo[];
  por_defecto: string;
  /** Unidad del resultado; «{base}» se reemplaza por la fecha base de la medida real. */
  unidad: string;
}

export interface Entidad {
  id: string;
  nombre: string;
}

/** Campos comunes a todas las variantes exportadas. */
interface Comun {
  id: string;
  unidad: string;
  tipo: TipoSerie;
  agregacion: Agregacion;
  frecuencia: string;
  transformaciones: string[];
  tramos: Tramo[];
  advertencias: Advertencia[];
  excluidos: Excluido[];
  /** Desde la 1.2. En los JSON 1.1 no está: se toma como null. */
  moneda?: Moneda | null;
  /** Desde la 1.2. En los JSON 1.1 no está: se toma como {}. */
  insumos?: Partial<Record<Medida, Insumo>>;
}

/** Una variante con una sola serie: lo que transforma la librería. */
export interface SerieExportada extends Comun {
  datos: [string, number][];
}

/** Una variante con dimensión pais (SPEC 2.5): `datos` es un objeto por entidad. */
export interface SeriePorPais extends Comun {
  dimensiones: ["pais"];
  entidades: Entidad[];
  entidades_por_defecto: string[];
  datos: Record<string, [string, number][]>;
}

export type DocumentoExportado = SerieExportada | SeriePorPais;

/** `export/auxiliares/signos-monetarios.json`. */
export interface SignosMonetarios {
  signos: Array<{ id: string; nombre: string; desde: string; unidades_por_peso_actual: number }>;
}

/** Los insumos ya leídos, por id («ipc.oficial», «pib-nominal.anual»), y los signos monetarios. */
export interface InsumosCargados {
  series?: Record<string, SerieExportada>;
  signos?: SignosMonetarios;
}

export type Variacion = "var_mensual" | "var_interanual" | "var_dic_dic" | "acumulada_anio";
export type Transformacion = "nivel" | Variacion | "base_100" | "indice_desde_tasas";

export type Base = { fecha: string } | { desde: string; hasta: string };

/**
 * Orden fijo (SPEC 4, con pesos actuales primero; ver docs/NOTAS_FASE4.md):
 * pesos actuales → frecuencia → medida (real, en dólares o % del PIB) → base 100, variación o índice desde tasas →
 * media móvil → período.
 */
export interface Opciones {
  pesosActuales?: boolean;
  frecuencia?: "trimestral" | "anual";
  medida?: "real" | "en_dolares" | "pct_pib";
  /** Variante del IPC para la medida real (por ejemplo, «ipc.provincias»). Por defecto, la de los insumos. */
  deflactor?: string;
  /** Precios de qué período (AAAA-MM o AAAA) en la medida real. Por defecto, el último con dato en las dos series. */
  baseReal?: string;
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
  /** Quiebres de la variante (y de los insumos de la medida) que se cruzan con el rango del resultado. */
  advertencias: Advertencia[];
  /** Observaciones excluidas por el pipeline que caen dentro del rango. */
  excluidos: Excluido[];
  notas: string[];
}
