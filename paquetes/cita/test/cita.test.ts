import { describe, expect, it } from "vitest";
import { apa, bibtex, nombreTransformacion, textoCita, urlDeCita } from "../src/index";

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
    expect(b).toContain("author = {{Vaivén}},");
    expect(b).toContain("url = {https://vaiven.argentino.workers.dev/series/ipc/provincias/}");
  });
});

describe("nombreTransformacion", () => {
  it("sin transformación (o en nivel) no agrega nada", () => {
    expect(nombreTransformacion({})).toBeUndefined();
    expect(nombreTransformacion({ transformacion: "nivel" })).toBeUndefined();
  });
  it("nombra frecuencia, transformación y media móvil en el orden de la SPEC", () => {
    expect(nombreTransformacion({ frecuencia: "anual", transformacion: "var_interanual", mediaMovil: 3 }))
      .toBe("frecuencia anual, variación interanual (%), media móvil de 3 períodos");
  });
});

describe("nombreTransformacion con medidas y entidades", () => {
  it("nombra en orden lo que se calculó", () => {
    expect(nombreTransformacion({ medida: "real", deflactor: "ipc.provincias", transformacion: "var_interanual" }))
      .toBe("a precios constantes, deflactada con el IPC «ipc.provincias», variación interanual (%)");
    expect(nombreTransformacion({ pesosActuales: true, frecuencia: "anual" })).toBe("en pesos actuales, frecuencia anual");
    expect(nombreTransformacion({ medida: "pct_pib", frecuencia: "anual" })).toBe("frecuencia anual, en % del PIB");
    expect(nombreTransformacion({ entidad: "BRA", transformacion: "indice_desde_tasas" }))
      .toBe("entidad BRA, índice desde las tasas (año base = 100)");
  });
});
