import { describe, expect, it } from "vitest";
import { apa, bibtex, textoCita, urlDeCita } from "../src/lib/cita";
import { fechaLegible, numero } from "../src/lib/formato";

const d = {
  serie: "ipc", variante: "provincias", nombre: "Inflación minorista (IPC)", version_datos: "2026-10-24T07:40:29Z",
  cita: "Vaivén (2026). Inflación minorista (IPC), variante «provincias». Versión de datos 2026-10-24. https://vaiven.argentino.workers.dev/series/ipc/provincias/",
};

describe("cita", () => {
  it("toma la URL de la cita del export", () => {
    expect(urlDeCita(d.cita)).toBe("https://vaiven.argentino.workers.dev/series/ipc/provincias/");
  });
  it("agrega la transformación cuando la hay", () => {
    expect(textoCita(d)).toBe(d.cita);
    expect(textoCita(d, "variación interanual (%)")).toMatch(/Transformación: variación interanual \(%\) \(calculada por Vaivén\)\.$/);
  });
  it("APA y BibTeX llevan la versión de datos y la URL", () => {
    expect(apa(d)).toBe("Vaivén. (2026). Inflación minorista (IPC), variante «provincias» (versión de datos 2026-10-24) [Conjunto de datos]. https://vaiven.argentino.workers.dev/series/ipc/provincias/");
    const b = bibtex(d);
    expect(b).toContain("@misc{vaiven_ipc_provincias_20261024,");
    expect(b).toContain("url = {https://vaiven.argentino.workers.dev/series/ipc/provincias/}");
  });
});

describe("formato", () => {
  it("fechas según la frecuencia", () => {
    expect(fechaLegible("1979-03", "mensual")).toBe("mar. 1979");
    expect(fechaLegible("2004-07", "trimestral")).toBe("2004, 3.er trimestre");
    expect(fechaLegible("1990-11", "semestral")).toBe("1990, 2.ª onda");
    expect(fechaLegible("1990-05", "semestral", true)).toBe("la 1.ª onda de 1990");
    expect(fechaLegible("2025", "anual")).toBe("2025");
  });
  it("números en es-AR", () => {
    expect(numero(12276.766)).toBe("12.276,8");
    expect(numero(211.4076, true)).toBe("211,4");
    expect(numero(6.137836334e-11)).toBe("6,14 × 10⁻¹¹");
    expect(numero(null)).toBe("—");
  });
});
