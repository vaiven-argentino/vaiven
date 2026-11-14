// Ajustes tras la prueba del MCP (incluye los de la 4b, NOTAS_FASE4 «4c/4d · Ajustes tras la prueba del MCP»):
// el salario nominal no se puede leer como real (A1), la nota de pesos actuales solo cuando cambia algo (A2) y la
// variante por defecto dicha (B6). Van en respuestaSerie, así llegan a las tres herramientas con datos.
import { describe, expect, it } from "vitest";
import { compararSeries, especificacionGrafico } from "../src/herramientas/comparar";
import { NOTA_PESOS_ACTUALES, NOTA_PESOS_ACTUALES_REAL, obtenerSerie, sustantivoNominal } from "../src/herramientas/obtener";
import { repoReal } from "./ayuda";

const repo = repoReal();
const NOTA_SALARIO = "Esta respuesta es el salario nominal (pesos corrientes). El salario real, como lo muestra la ficha, se pide con `medida: real`.";

describe("A1 · salario nominal", () => {
  it("el sustantivo sale del nombre de la serie", () => {
    expect(sustantivoNominal("Salario real")).toBe("salario");
    expect(sustantivoNominal("Tipo de cambio real multilateral")).toBeNull();
  });
  it("sin medida: la nota primero y la unidad dice nominal, en nivel y en base 100", async () => {
    const nivel = await obtenerSerie(repo, { id: "salario-real", desde: "2017-12", hasta: "2024-12" });
    expect(nivel.notas[0]).toBe(NOTA_SALARIO);
    expect(nivel.unidad).toBe("pesos corrientes (salario nominal)");
    const base = await obtenerSerie(repo, { id: "salario-real", transformacion: "base_100", base: "2017-12", desde: "2017-12", hasta: "2024-12" });
    expect(base.notas[0]).toBe(NOTA_SALARIO);
    expect(base.unidad).toBe("índice del salario nominal, 2017-12 = 100");
  });
  it("con medida real: sin la nota, y las cifras de la prueba manual", async () => {
    const base = await obtenerSerie(repo, { id: "salario-real", medida: "real", transformacion: "base_100", base: "2017-12", desde: "2017-12", hasta: "2024-12" });
    expect(base.notas).not.toContain(NOTA_SALARIO);
    expect((base.datos as Array<[string, number]>).at(-1)![1]).toBeCloseTo(74.1835, 3);
    const precios = await obtenerSerie(repo, { id: "salario-real", medida: "real", base_real: "2017", desde: "2017-12", hasta: "2024-12" });
    const d = precios.datos as Array<[string, number]>;
    expect(d[0][1]).toBeCloseTo(23791.6, 0);
    expect(d.at(-1)![1]).toBeCloseTo(17649.5, 0);
    expect((d.at(-1)![1] / d[0][1] - 1) * 100).toBeCloseTo(-25.82, 1);
  });
  it("resultado fiscal sin medida: la nota del % del PIB; el IPC, sin nota nueva", async () => {
    const r = await obtenerSerie(repo, { id: "resultado-fiscal", desde: "2010", hasta: "2010-12" });
    expect(r.notas[0]).toMatch(/^Esta respuesta está en millones de pesos corrientes, sin la medida con que arranca la ficha\. En % del PIB, como lo muestra la ficha, se pide con `medida: pct_pib` \(con `frecuencia: anual`\)\.$/);
    const ipc = await obtenerSerie(repo, { id: "ipc", desde: "2010-01", hasta: "2010-01" });
    expect(ipc.notas.join(" ")).not.toMatch(/sin la medida|nominal/);
  });
  it("la misma nota y la misma unidad en comparar_series y en especificacion_grafico", async () => {
    const c = await compararSeries(repo, { series: [{ id: "salario-real" }, { id: "desocupacion" }], desde: "2017", hasta: "2018" });
    expect(c.series[0].notas[0]).toBe(NOTA_SALARIO);
    expect(c.columnas![0].unidad).toBe("pesos corrientes (promedio trimestral) (salario nominal)");
    const g = await especificacionGrafico(repo, { series: [{ id: "salario-real" }, { id: "desocupacion" }], desde: "2017", hasta: "2018" });
    expect(g.series[0].notas[0]).toBe(NOTA_SALARIO);
  });
});

describe("A2 · nota de pesos actuales, solo cuando cambia algo", () => {
  it("tipo de cambio de 1975: la nota, sin la sugerencia de la medida real (la variante no la admite)", async () => {
    const r = await obtenerSerie(repo, { id: "tc-oficial", desde: "1975-01", hasta: "1975-01" });
    expect(r.notas).toContain(NOTA_PESOS_ACTUALES);
    expect(r.notas.join(" ")).not.toContain(NOTA_PESOS_ACTUALES_REAL);
  });
  it("tipo de cambio de 2026 y salario de 2017–2024: sin la nota (después de 1992 no cambia nada)", async () => {
    const tc = await obtenerSerie(repo, { id: "tc-oficial", desde: "2026-04", hasta: "2026-04" });
    expect(tc.notas.join(" ")).not.toContain("equivalencia entre signos monetarios");
    const salario = await obtenerSerie(repo, { id: "salario-real", desde: "2017", hasta: "2024" });
    expect(salario.notas.join(" ")).not.toContain("equivalencia entre signos monetarios");
  });
  it("una serie que admite la medida real, con datos anteriores a 1992: la nota completa", async () => {
    const r = await obtenerSerie(repo, { id: "agregados", variante: "m1", desde: "1985-01", hasta: "1985-03" });
    expect(r.notas).toContain(`${NOTA_PESOS_ACTUALES} ${NOTA_PESOS_ACTUALES_REAL}`);
  });
});

describe("B6 · la variante por defecto, dicha", () => {
  it("sin variante, la nota nombra la por defecto y las otras; con variante, no", async () => {
    const sin = await obtenerSerie(repo, { id: "resultado-fiscal", medida: "pct_pib", frecuencia: "anual", desde: "2010", hasta: "2010" });
    expect(sin.notas.join(" ")).toMatch(/Sin `variante`, se usa «primario» \(.+\); otras publicadas: financiero/);
    const con = await obtenerSerie(repo, { id: "resultado-fiscal", variante: "financiero", medida: "pct_pib", frecuencia: "anual", desde: "2010", hasta: "2010" });
    expect(con.notas.join(" ")).not.toContain("Sin `variante`");
  });
  it("una serie con una sola variante publicada no lleva la nota", async () => {
    const r = await obtenerSerie(repo, { id: "reservas", desde: "2010-01", hasta: "2010-01" });
    expect(r.notas.join(" ")).not.toContain("Sin `variante`");
  });
});

describe("B7 · la nota de una variante publicada", () => {
  it("describir_serie la incluye, como la ficha y buscar_series", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { repoCon, EXPORT } = await import("./ayuda");
    const { describirSerie } = await import("../src/herramientas/describir");
    const catalogo = JSON.parse(readFileSync(join(EXPORT, "catalogo.json"), "utf-8"));
    const tc = catalogo.series.find((s: { id: string }) => s.id === "tc-oficial");
    tc.variantes.find((v: { id: string }) => v.id === "pesos-actuales").nota = "Para variaciones, cualquiera de las dos.";
    const r = await describirSerie(repoCon({ "catalogo.json": catalogo }), { id: "tc-oficial" });
    const v = (r.variantes as Array<{ id: string; nota?: string }>).find((x) => x.id === "pesos-actuales")!;
    expect(v.nota).toBe("Para variaciones, cualquiera de las dos.");
  });
});
