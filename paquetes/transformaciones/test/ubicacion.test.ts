// La regla única de ubicación (SPEC 2.4 y 6.2, v1.4), contra los períodos publicados (export/periodos.json).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  fechaDeDibujo, periodosDe, proporcionDe, referenciaDe, textoOtros, textoPeriodo, textoReparto, ubicar, ubicarFechas,
  type DocumentoPeriodos, type Periodo, type TipoPeriodo,
} from "../src";

const doc = JSON.parse(readFileSync(new URL("../../../export/periodos.json", import.meta.url), "utf-8")) as DocumentoPeriodos;
const promedio = { agregacion: "promedio" as const };
const saldo = { agregacion: "fin_de_periodo" as const };
const de = (tipo: TipoPeriodo): Periodo[] => periodosDe(doc, tipo);

describe("referencia de cada observación", () => {
  it("un promedio o una suma es un intervalo, con su punto medio", () => {
    expect(referenciaDe("1989-07", "mensual", promedio)).toEqual(
      { clase: "intervalo", desde: "1989-07-01", hasta: "1989-07-31", dias: 31, medio: "1989-07-16T12:00:00.000Z" });
    expect(referenciaDe("2001", "anual", { agregacion: "suma" })).toMatchObject({ dias: 365, medio: "2001-07-02T12:00:00.000Z" });
    expect(referenciaDe("1989-04", "trimestral", promedio)).toMatchObject({ desde: "1989-04-01", hasta: "1989-06-30", dias: 91 });
  });

  it("un saldo a fin de período en nivel es un instante, con cualquier medida", () => {
    expect(referenciaDe("1989-07", "mensual", saldo)).toEqual({ clase: "instante", dia: "1989-07-31" });
    expect(referenciaDe("1989-07", "mensual", { ...saldo, transformacion: "base_100" }).clase).toBe("instante");
    expect(fechaDeDibujo(referenciaDe("1989-07", "mensual", saldo))).toBe("1989-07-31T12:00:00.000Z");
  });

  it("la variación de un saldo y su media móvil son intervalos", () => {
    expect(referenciaDe("1989-07", "mensual", { ...saldo, transformacion: "var_mensual" }).clase).toBe("intervalo");
    expect(referenciaDe("1989-07", "mensual", { ...saldo, mediaMovil: 3 }).clase).toBe("intervalo");
  });

  it("las semestrales de la EPH puntual cubren el mes de la onda", () => {
    expect(referenciaDe("1989-05", "semestral", promedio)).toMatchObject({ desde: "1989-05-01", hasta: "1989-05-31" });
  });
});

describe("casos fijos de la revisión externa", () => {
  it("2001 en un promedio anual: De la Rúa, 97 %, con los interinos en otros_periodos", () => {
    const u = ubicar(referenciaDe("2001", "anual", promedio), de("gobierno"), "gobierno");
    expect(u.vigentes.map((p) => p.id)).toEqual(["p.gobierno.de-la-rua"]);
    expect(Math.round(u.proporciones[0] * 100)).toBe(97);
    expect(textoOtros(u)).toBe("Puerta (1 %); Rodríguez Saá (2 %); Camaño (1 %)");
    expect(u.mayoria).toBe(true);
  });

  it("julio de 1989 en un promedio: Menem 77 %, Alfonsín 23 %", () => {
    const u = ubicar(referenciaDe("1989-07", "mensual", promedio), de("gobierno"), "gobierno");
    expect(u.vigentes.map((p) => p.id)).toEqual(["p.gobierno.menem"]);
    expect(proporcionDe(u)).toBe(0.774);
    expect(textoOtros(u)).toBe("Alfonsín (23 %)");
    expect(textoReparto(u)).toBe("Menem 77 % · Alfonsín 23 %");
  });

  it("las reservas a fin de julio de 1989: Menem, en un instante", () => {
    const u = ubicar(referenciaDe("1989-07", "mensual", saldo), de("gobierno"), "gobierno");
    expect(u.vigentes.map((p) => p.id)).toEqual(["p.gobierno.menem"]);
    expect(u.otros).toEqual([]);
    expect(textoReparto(u)).toBe("");
  });

  it("diciembre de 2016 en ministros: Prat-Gay 97 %, «sin ministro titular» 3 %", () => {
    const u = ubicar(referenciaDe("2016-12", "mensual", promedio), de("ministro"), "ministro");
    expect(u.etiqueta).toBe("Alfonso de Prat-Gay");
    expect(Math.round(u.proporciones[0] * 100)).toBe(97);
    expect(textoOtros(u)).toBe("sin ministro titular (3 %)");
  });

  it("1980 en planes: los dos programas superpuestos", () => {
    const u = ubicar(referenciaDe("1980", "anual", promedio), de("plan"), "plan");
    expect(u.vigentes.map((p) => p.id)).toEqual(["p.plan.martinez-de-hoz", "p.plan.20-de-diciembre-1978"]);
    expect(u.proporciones).toEqual([1, 1]);
    expect(u.etiqueta.split("; ")).toHaveLength(2);
    expect(proporcionDe(u)).toBe("1; 1");
  });

  it("diciembre de 2001 en ministros: los dos encargados y los días sin ministro", () => {
    const u = ubicar(referenciaDe("2001-12", "mensual", promedio), de("ministro"), "ministro");
    expect(u.etiqueta).toBe("Domingo Felipe Cavallo");
    expect(u.reparto.map((t) => t.id)).toEqual(["p.ministro.cavallo-2001", "p.ministro.gallo", "p.ministro.capitanich", null]);
    expect(u.reparto.at(-1)).toMatchObject({ nombre: "sin ministro titular", dias: 10 });
  });

  it("sin mayoría: el del punto medio no pasa del 50 %", () => {
    // 1989 en ministros: el 2/7, punto medio del año, era ministro Jesús Rodríguez (42 de 365 días).
    const u = ubicar(referenciaDe("1989", "anual", promedio), de("ministro"), "ministro");
    expect(u.etiqueta).toBe("Jesús Rodríguez");
    expect(u.mayoria).toBe(false);
    expect(textoPeriodo(u)).toBe(`${u.etiqueta} (sin mayoría)`);
    expect(u.otros.length).toBeGreaterThan(1);
    expect(u.reparto.reduce((s, t) => s + t.proporcion, 0)).toBeCloseTo(1, 10);
  });

  it("el episodio de la hiperinflación con sus fases", () => {
    const [hiper] = de("episodio");
    expect(hiper.fases?.map((f) => f.id)).toEqual(["p.episodio.hiperinflacion-1989", "p.episodio.hiperinflacion-1989-tregua", "p.episodio.hiperinflacion-1990"]);
    const u = ubicarFechas(["1989-01", "1989-07", "1990-04"], ["mensual", "mensual", "mensual"], promedio, de("episodio"), "episodio");
    expect(u.map((x) => x.etiqueta)).toEqual(["sin episodio", "Hiperinflación de 1989–1990", "sin episodio"]);
  });
});
