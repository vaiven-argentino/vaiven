// Contrato del export (SPEC, sección 10): si el esquema cambia sin subir de versión, o el export usa una versión
// que esta librería no conoce, las pruebas fallan.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { ESQUEMAS_SOPORTADOS, disponibles, transformar } from "../src/index";
import type { SerieExportada } from "../src/index";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
const EXPORT = join(RAIZ, "export");
const CONTRATO = join(RAIZ, "tests", "contrato");

const leer = (ruta: string) => JSON.parse(readFileSync(ruta, "utf-8"));
const archivos = readdirSync(join(EXPORT, "series")).flatMap((s) =>
  readdirSync(join(EXPORT, "series", s)).map((v) => join(EXPORT, "series", s, v)));

describe("contrato del export", () => {
  it("hay un esquema por cada versión soportada", () => {
    for (const v of ESQUEMAS_SOPORTADOS) expect(leer(join(CONTRATO, `serie-${v}.schema.json`)).properties.esquema).toEqual({ const: v });
  });

  it.each(archivos.map((a) => [a.split("/series/")[1], a]))("%s cumple el esquema y se puede transformar", (_, ruta) => {
    const doc = leer(ruta);
    expect(ESQUEMAS_SOPORTADOS).toContain(doc.esquema);
    const validar = new Ajv2020({ allErrors: true, strict: false }).compile(leer(join(CONTRATO, `serie-${doc.esquema}.schema.json`)));
    expect(validar(doc), JSON.stringify(validar.errors)).toBe(true);
    const serie = doc as SerieExportada;
    for (const t of disponibles(serie).transformaciones) {
      if (t === "base_100") continue;
      expect(transformar(serie, { transformacion: t }).datos.length).toBeGreaterThan(0);
    }
  });
});
