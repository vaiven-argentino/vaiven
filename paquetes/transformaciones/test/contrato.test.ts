// Contrato del export (SPEC, sección 10): si el esquema cambia sin subir de versión, o el export usa una versión
// que esta librería no conoce, las pruebas fallan.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { ESQUEMAS_SOPORTADOS, disponibles, serieDeEntidad, transformar } from "../src/index";
import type { DocumentoExportado, SerieExportada } from "../src/index";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
const EXPORT = join(RAIZ, "export");
const CONTRATO = join(RAIZ, "tests", "contrato");

const leer = (ruta: string) => JSON.parse(readFileSync(ruta, "utf-8"));
const archivos = ["series", "auxiliares"].flatMap((c) => readdirSync(join(EXPORT, c), { withFileTypes: true })
  .filter((d) => d.isDirectory()).flatMap((d) => readdirSync(join(EXPORT, c, d.name)).map((v) => join(EXPORT, c, d.name, v))));

describe("contrato del export", () => {
  it("hay un esquema por cada versión soportada", () => {
    for (const v of ESQUEMAS_SOPORTADOS) expect(leer(join(CONTRATO, `serie-${v}.schema.json`)).properties.esquema).toEqual({ const: v });
  });

  it.each(archivos.map((a) => [a.split("/export/")[1], a]))("%s cumple el esquema y se puede transformar", (_, ruta) => {
    const doc = leer(ruta);
    expect(ESQUEMAS_SOPORTADOS).toContain(doc.esquema);
    const validar = new Ajv2020({ allErrors: true, strict: false }).compile(leer(join(CONTRATO, `serie-${doc.esquema}.schema.json`)));
    expect(validar(doc), JSON.stringify(validar.errors)).toBe(true);
    // En las series con dimensión pais se transforma la primera entidad de la selección inicial.
    const serie = serieDeEntidad(doc as DocumentoExportado);
    for (const t of disponibles(serie).transformaciones) {
      if (t === "base_100") continue;
      expect(transformar(serie, { transformacion: t }).datos.length).toBeGreaterThan(0);
    }
  });

  it("un JSON 1.1 (contrato anterior) se sigue leyendo y transformando", () => {
    const doc = leer(join(CONTRATO, "ejemplos", "serie-1.1.json"));
    expect(doc.esquema).toBe("1.1");
    expect(ESQUEMAS_SOPORTADOS).toContain("1.1");
    const validar = new Ajv2020({ allErrors: true, strict: false }).compile(leer(join(CONTRATO, "serie-1.1.schema.json")));
    expect(validar(doc), JSON.stringify(validar.errors)).toBe(true);
    const serie = doc as SerieExportada;
    expect(disponibles(serie).transformaciones).toContain("base_100");
    expect(transformar(serie, { frecuencia: "anual" }).datos.length).toBeGreaterThan(0);
  });
});
