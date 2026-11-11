import { describe, expect, it } from "vitest";
import { fechaLegible, numero, textoAtraso, ultimoDato } from "../src/lib/formato";

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
    // Signo menos tipográfico, como en los ejes (tercera revisión de la 4a).
    expect(numero(-10.894)).toBe("−10,89");
    expect(numero(-2.04, true)).toBe("−2,0");
    expect(numero(-6.1e-11)).toBe("−6,10 × 10⁻¹¹");
  });
});

describe("último dato y atraso (segunda revisión de la 4a, 3.5)", () => {
  it("el último dato según la frecuencia del tramo", () => {
    expect(ultimoDato("2026-04", "trimestral")).toBe("2.º trimestre de 2026");
    expect(ultimoDato("2026-08", "mensual")).toBe("agosto de 2026");
    expect(ultimoDato("2025", "anual")).toBe("2025");
  });
  it("el atraso nombra al intermediario", () => {
    expect(textoAtraso({ tipo: "atrasada", meses: 1, esperado: "2026-09", intermediario: "datos.gob.ar" }))
      .toBe("con el calendario habitual de la fuente ya debería estar septiembre de 2026: datos.gob.ar todavía no lo cargó");
    expect(textoAtraso({ tipo: "atrasada", meses: 5, esperado: "2026-09", intermediario: "datos.gob.ar" }))
      .toBe("con el calendario habitual de la fuente ya deberían estar los datos hasta septiembre de 2026: datos.gob.ar todavía no los cargó");
    expect(textoAtraso({ tipo: "sin_datos_nuevos", meses: 66 })).toBe("66 meses sin datos nuevos");
    expect(textoAtraso(null)).toBeNull();
  });
});

describe("cobertura con la frecuencia de cada punta (tercera revisión de la 4a)", () => {
  it("trimestral, semestral, mensual y anual", async () => {
    const { cobertura } = await import("../src/lib/formato");
    expect(cobertura("1970-01", "trimestral", "2026-04", "trimestral")).toBe("1970, 1.er trimestre – 2026, 2.º trimestre");
    expect(cobertura("1974-05", "semestral", "2026-04", "trimestral")).toBe("1974, 1.ª onda – 2026, 2.º trimestre");
    expect(cobertura("1970-01", "mensual", "2026-08", "mensual")).toBe("ene. 1970 – ago. 2026");
    expect(cobertura("1970", "anual", "2025", "anual")).toBe("1970 – 2025");
  });
});
