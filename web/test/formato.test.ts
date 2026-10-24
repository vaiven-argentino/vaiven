import { describe, expect, it } from "vitest";
import { fechaLegible, numero } from "../src/lib/formato";

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
