import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { frecuenciaInicial, medidaInicial } from "../src/lib/ficha";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const doc = (s: string, v: string) => JSON.parse(readFileSync(join(EXPORT, "series", s, `${v}.json`), "utf-8"));

describe("vista inicial", () => {
  it("el resultado fiscal arranca en % del PIB; el mensual, en frecuencia anual", () => {
    const mensual = doc("resultado-fiscal", "financiero");
    expect(medidaInicial(mensual)).toBe("pct_pib");
    expect(frecuenciaInicial(mensual)).toBe("anual");
    const anual = doc("resultado-fiscal", "financiero-devengado");
    expect(medidaInicial(anual)).toBe("pct_pib");
    expect(frecuenciaInicial(anual)).toBeUndefined();
  });
  it("sin % del PIB inicial, la frecuencia es la de la serie", () => {
    expect(frecuenciaInicial(doc("salario-real", "ripte"))).toBeUndefined();
    expect(frecuenciaInicial(doc("ipc", "oficial"))).toBeUndefined();
  });
});
