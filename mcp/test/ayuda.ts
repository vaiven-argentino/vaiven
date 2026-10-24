import { join } from "node:path";
import { Repositorio, type FuenteDatos } from "../src/datos";
import { fuenteCarpeta } from "../src/fuente-carpeta";

export const EXPORT = join(import.meta.dirname, "..", "..", "export");
export const repoReal = () => new Repositorio(fuenteCarpeta(EXPORT));

/** El export real, con archivos de más o reemplazados (para casos sintéticos). */
export function repoCon(extra: Record<string, unknown>): Repositorio {
  const real = fuenteCarpeta(EXPORT);
  const fuente: FuenteDatos = { leer: async (ruta) => (ruta in extra ? structuredClone(extra[ruta]) : real.leer(ruta)) };
  return new Repositorio(fuente);
}
