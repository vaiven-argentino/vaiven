// El export desde una carpeta local (variante stdio y pruebas). Va aparte porque usa node:fs, que el Worker no carga.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FuenteDatos } from "./datos";

export function fuenteCarpeta(dir: string): FuenteDatos {
  return {
    async leer(ruta) {
      return JSON.parse(await readFile(join(dir, ruta), "utf-8"));
    },
  };
}
