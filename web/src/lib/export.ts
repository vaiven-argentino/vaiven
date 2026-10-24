// Lectura del export en el build (las páginas son estáticas). El navegador no pide nada aparte:
// cada ficha lleva dentro los datos de su variante.
import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Advertencia, Excluido, SerieExportada, Tramo } from "@vaiven/transformaciones";
import { ESQUEMAS_SOPORTADOS } from "@vaiven/transformaciones";

export const RAIZ = join(process.cwd(), "..");
export const EXPORT = join(RAIZ, "export");
export const URL_SITIO = "https://vaiven.argentino.workers.dev";

export interface VarianteCatalogo {
  id: string;
  nombre: string;
  estado: "publicada" | "pendiente" | "pendiente_licencia";
  frecuencia: string;
  cobertura: { desde: string; hasta: string } | null;
  archivo: string | null;
  nota?: string;
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
  empalme: "encadenar_tasas" | "yuxtaponer";
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

const leer = <T>(ruta: string): T => JSON.parse(readFileSync(join(EXPORT, ruta), "utf-8")) as T;

export function catalogo(): Catalogo {
  return leer<Catalogo>("catalogo.json");
}

export function documento(archivo: string): DocumentoSerie {
  const doc = leer<DocumentoSerie>(archivo);
  if (!(ESQUEMAS_SOPORTADOS as readonly string[]).includes(doc.esquema)) {
    throw new Error(`${archivo}: esquema ${doc.esquema} sin soporte en la web (soportados: ${ESQUEMAS_SOPORTADOS.join(", ")}).`);
  }
  return doc;
}

export function quiebres(): Map<string, Quiebre> {
  return new Map(leer<Quiebre[]>("quiebres.json").map((q) => [q.id, q]));
}

export function urlFicha(serie: string, variante: string, porDefecto: boolean): string {
  return porDefecto ? `/series/${serie}/` : `/series/${serie}/${variante}/`;
}

/** Tamaño de un archivo del export, para mostrar junto a la descarga («12 KB»). */
export function tamano(rutaExport: string): string | null {
  const ruta = join(EXPORT, rutaExport);
  if (!existsSync(ruta)) return null;
  const kb = statSync(ruta).size / 1024;
  return kb < 1000 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** La descarga completa vigente (export/descargas/vaiven_<versión>.<ext>), si se generó. */
export function descargaCompleta(ext: "zip" | "parquet"): { archivo: string; tamano: string | null } | null {
  const dir = join(EXPORT, "descargas");
  if (!existsSync(dir)) return null;
  const archivo = readdirSync(dir).filter((n) => n.startsWith("vaiven_") && n.endsWith(`.${ext}`)).sort().at(-1);
  return archivo ? { archivo, tamano: tamano(`descargas/${archivo}`) } : null;
}
