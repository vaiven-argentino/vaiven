// Atraso contra el calendario de la fuente (segunda revisión de la 4a, 3.5).
import { describe, expect, it } from "vitest";
import { atraso, type DocumentoAtraso } from "../src/index";

const datosGobAr = "https://apis.datos.gob.ar/series/api/series/?ids=x";
const doc = (hasta: string, desfase?: number, tramoHasta = "hoy", url = datosGobAr): DocumentoAtraso => ({
  cobertura: { hasta }, tramos: [{ hasta: tramoHasta, frecuencia: "mensual" }],
  fuentes: [{ url, ...(desfase === undefined ? {} : { desfase_esperado: desfase }) }],
});

describe("atraso", () => {
  it("IPC con agosto al 7 de noviembre: ya debería estar septiembre; el atraso es de datos.gob.ar", () => {
    expect(atraso(doc("2026-08", 1), "2026-11-07")).toEqual({ tipo: "atrasada", meses: 1, esperado: "2026-09", intermediario: "datos.gob.ar" });
  });
  it("al día con el desfase normal", () => {
    expect(atraso(doc("2026-09", 1), "2026-11-07")).toBeNull();
    expect(atraso(doc("2026-08", 2), "2026-11-07")).toBeNull();
  });
  it("reservas en abril: ya deberían estar los datos hasta septiembre", () => {
    expect(atraso(doc("2026-04", 1), "2026-11-07")).toMatchObject({ tipo: "atrasada", meses: 5, esperado: "2026-09" });
  });
  it("más de un año: ya no es atraso, la serie no tiene datos nuevos", () => {
    expect(atraso(doc("2021-05", 1), "2026-11-07")).toEqual({ tipo: "sin_datos_nuevos", meses: 66 });
  });
  it("un tramo cortado a propósito no avisa (base monetaria promedio hasta mayo de 2026)", () => {
    expect(atraso(doc("2026-05", 1, "2026-05"), "2026-11-07")).toBeNull();
  });
  it("sin desfase declarado, la regla de antes (3 meses o más)", () => {
    expect(atraso(doc("2026-08"), "2026-11-07")).toEqual({ tipo: "sin_datos_nuevos", meses: 3 });
    expect(atraso(doc("2026-09"), "2026-11-07")).toBeNull();
  });
  it("una fuente que no es de datos.gob.ar no nombra intermediario", () => {
    expect(atraso(doc("2026-06", 1, "hoy", "https://www.bruegel.org/x"), "2026-11-07")).toEqual({ tipo: "atrasada", meses: 3, esperado: "2026-09" });
  });
  it("las series no mensuales no tienen atraso", () => {
    expect(atraso({ ...doc("2026-04", 1), tramos: [{ hasta: "hoy", frecuencia: "trimestral" }] }, "2026-11-07")).toBeNull();
  });
});
