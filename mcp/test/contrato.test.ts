// Contrato de comparar_series y especificacion_grafico (SPEC 10): las respuestas reales cumplen los esquemas de
// tests/contrato/ (versión 1.0, con la regla de versión de 2.5), en el texto y en structuredContent.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { compararSeries, especificacionGrafico, type ArgsComparar, type ArgsEspecificacion } from "../src/herramientas/comparar";
import { repoReal } from "./ayuda";

const repo = repoReal();
const CONTRATO = join(import.meta.dirname, "..", "..", "tests", "contrato");
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validar = (nombre: string) => ajv.compile(JSON.parse(readFileSync(join(CONTRATO, `${nombre}-1.0.schema.json`), "utf-8")));
const comparar = validar("comparar_series");
const grafico = validar("especificacion_grafico");

const COMPARAR: ArgsComparar[] = [
  { series: [{ id: "ipc" }, { id: "pib" }], desde: "2005", hasta: "2006" },
  { series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "exportaciones" }], desde: "2000", hasta: "2010" },
  { series: [{ id: "desocupacion" }, { id: "pib" }], desde: "1995", hasta: "2005" },
  { series: [{ id: "reservas" }, { id: "int-pib", paises: ["ARG", "BRA", "WLD"] }], desde: "2000", hasta: "2005" },
  { series: [{ id: "ipc", transformacion: "var_mensual" }, { id: "pib" }], desde: "2005", hasta: "2006" },
  { series: [{ id: "ipc" }, { id: "tc-oficial", variante: "moneda-de-epoca", pesos_actuales: true }, { id: "reservas" }, { id: "salario-real", medida: "real" }], desde: "2017", hasta: "2018", alinear: "ninguna" },
];
const GRAFICO: ArgsEspecificacion[] = [
  { series: [{ id: "ipc" }] },
  { series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "reservas" }], desde: "1995", hasta: "2010", sombreado: "gobierno", eventos: true },
  { series: [{ id: "ipc" }, { id: "reservas" }, { id: "pib" }], desde: "2000", hasta: "2005", sombreado: "plan", eventos: ["cambiario"] },
  { series: [{ id: "pib", transformacion: "var_interanual", frecuencia: "anual" }, { id: "int-pib" }], ejes: "paneles" },
];

describe("comparar_series cumple comparar_series-1.0", () => {
  it.each(COMPARAR.map((a, k) => [k + 1, a] as const))("caso %i", async (_, args) => {
    const r = await compararSeries(repo, args);
    expect(comparar(JSON.parse(JSON.stringify(r))), JSON.stringify(comparar.errors)).toBe(true);
  });
});

describe("especificacion_grafico cumple especificacion_grafico-1.0", () => {
  it.each(GRAFICO.map((a, k) => [k + 1, a] as const))("caso %i", async (_, args) => {
    const r = await especificacionGrafico(repo, args);
    expect(grafico(JSON.parse(JSON.stringify(r))), JSON.stringify(grafico.errors)).toBe(true);
  });
});
