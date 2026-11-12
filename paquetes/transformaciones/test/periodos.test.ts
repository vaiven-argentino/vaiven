import { describe, expect, it } from "vitest";
import { diasDe, periodoDeCadaFecha, periodosDe, rangoLegible, seCruzan, vigenteEl, type DocumentoPeriodos } from "../src";

const fuente = [{ para: "ambas" as const, tipo: "norma" as const, referencia: "D" }];
const doc: DocumentoPeriodos = {
  esquema: "periodos-1.0", version_datos: "v", descripcion: "", licencia: "CC-BY-4.0", tipos: [],
  periodos: [
    { id: "p.gobierno.alfonsin", tipo: "gobierno", nombre: "Alfonsín", nombre_corto: "Alfonsín", desde: "1983-12-10", hasta: "1989-07-08",
      caracter: "constitucional", cortes: { desde: "hecho", hasta: "hecho" }, fuentes: fuente },
    { id: "p.gobierno.menem", tipo: "gobierno", nombre: "Menem", nombre_corto: "Menem", desde: "1989-07-08", hasta: "1999-12-10",
      caracter: "constitucional", cortes: { desde: "hecho", hasta: "hecho" }, fuentes: fuente,
      mandatos: [
        { id: "p.gobierno.menem-1989", nombre: "Menem I", nombre_corto: "Menem I", desde: "1989-07-08", hasta: "1995-07-08", fuentes: fuente },
        { id: "p.gobierno.menem-1995", nombre: "Menem II", nombre_corto: "Menem II", desde: "1995-07-08", hasta: "1999-12-10", fuentes: fuente },
      ] },
    { id: "p.plan.austral", tipo: "plan", nombre: "Austral", nombre_corto: "Austral", desde: "1985-06-14", hasta: null,
      cortes: { desde: "hecho" }, fuentes: fuente },
  ],
};

describe("períodos", () => {
  it("separa los gobiernos por mandato solo si se pide", () => {
    expect(periodosDe(doc, "gobierno").map((p) => p.id)).toEqual(["p.gobierno.alfonsin", "p.gobierno.menem"]);
    const porMandato = periodosDe(doc, "gobierno", true);
    expect(porMandato.map((p) => p.id)).toEqual(["p.gobierno.alfonsin", "p.gobierno.menem-1989", "p.gobierno.menem-1995"]);
    expect(porMandato[1]).toMatchObject({ padre: "p.gobierno.menem", caracter: "constitucional", tipo: "gobierno" });
  });

  it("usa intervalos semiabiertos: el día del traspaso es del que entra", () => {
    const [alfonsin, menem] = periodosDe(doc, "gobierno");
    expect(vigenteEl(alfonsin, "1989-07-07")).toBe(true);
    expect(vigenteEl(alfonsin, "1989-07-08")).toBe(false);
    expect(vigenteEl(menem, "1989-07-08")).toBe(true);
    expect(vigenteEl(doc.periodos[2], "2026-11-11")).toBe(true);
  });

  it("da el primer y el último día de cada fecha del export", () => {
    expect(diasDe("1989-07", "mensual")).toEqual({ desde: "1989-07-01", hasta: "1989-07-31" });
    expect(diasDe("1989-04", "trimestral")).toEqual({ desde: "1989-04-01", hasta: "1989-06-30" });
    expect(diasDe("1988", "anual")).toEqual({ desde: "1988-01-01", hasta: "1988-12-31" });
    expect(diasDe("2000-02")).toEqual({ desde: "2000-02-01", hasta: "2000-02-29" });
  });

  it("asigna a cada observación el período vigente su último día", () => {
    const gob = periodosDe(doc, "gobierno");
    const r = periodoDeCadaFecha(gob, ["1989-06", "1989-07", "1989", "1980"], ["mensual", "mensual", "anual", "anual"]);
    expect(r.map((p) => p?.id ?? null)).toEqual(["p.gobierno.alfonsin", "p.gobierno.menem", "p.gobierno.menem", null]);
  });

  it("encuentra los períodos que tocan un rango", () => {
    expect(seCruzan(periodosDe(doc, "gobierno"), "1989-07-08", "1989-12-31").map((p) => p.id)).toEqual(["p.gobierno.menem"]);
    expect(seCruzan(periodosDe(doc, "gobierno"), "1989-07-07", "1989-07-07").map((p) => p.id)).toEqual(["p.gobierno.alfonsin"]);
  });

  it("escribe el rango legible", () => {
    expect(rangoLegible(doc.periodos[0])).toBe("10/12/1983–8/7/1989");
    expect(rangoLegible(doc.periodos[2])).toBe("desde el 14/6/1985");
  });
});
