import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crecimientoPorDecada, desdeInicial, frecuenciaInicial, medidaInicial } from "../src/lib/ficha";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const doc = (s: string, v: string) => JSON.parse(readFileSync(join(EXPORT, "series", s, `${v}.json`), "utf-8"));

describe("vista inicial", () => {
  it("el resultado fiscal arranca en % del PIB; el mensual, en frecuencia anual", () => {
    const mensual = doc("resultado-fiscal", "financiero");
    expect(medidaInicial(mensual)).toBe("pct_pib");
    expect(frecuenciaInicial(mensual)).toBe("anual");
  });
  it("sin % del PIB inicial, la frecuencia es la de la serie", () => {
    expect(frecuenciaInicial(doc("salario-real", "ripte"))).toBeUndefined();
    expect(frecuenciaInicial(doc("ipc", "oficial"))).toBeUndefined();
  });
});

describe("período inicial y tabla por década", () => {
  it("el IPC arranca en 1993; las series sin `desde` en la vista, en el primer dato", () => {
    expect(desdeInicial(doc("ipc", "oficial"))).toBe("1993");
    expect(desdeInicial(doc("reservas", "brutas"))).toBeUndefined();
  });
  it("crecimiento promedio geométrico por década, con la década incompleta rotulada con sus años", () => {
    const int = doc("int-pib", "banco-mundial");
    const t = crecimientoPorDecada(int, ["ARG", "BRA"]);
    expect(t.decadas[0]).toBe("1961–69");
    expect(t.decadas.at(-1)).toBe("2020–25");
    const arg = int.datos.ARG.filter(([f]: [string]) => f >= "1990" && f <= "1999").map(([, v]: [string, number]) => v);
    const esperado = (arg.reduce((p: number, g: number) => p * (1 + g / 100), 1) ** (1 / arg.length) - 1) * 100;
    const k = t.decadas.indexOf("1990–99");
    expect(t.filas[0].nombre).toBe("Argentina");
    expect(t.filas[0].valores[k]).toBe(esperado.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  });
});
