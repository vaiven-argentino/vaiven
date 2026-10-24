import { describe, expect, it } from "vitest";
import { precalentar } from "../src/precalentar";
import { ESQUEMAS } from "../src/servidor";

describe("precalentamiento del Worker", () => {
  it("corre sin leer el export ni fallar", () => {
    expect(() => precalentar()).not.toThrow();
  });
  it("el JSON Schema de cada herramienta se arma una vez y no cambia", () => {
    for (const esquema of Object.values(ESQUEMAS)) {
      const opciones = { target: "draft-2020-12" } as const;
      const a = esquema["~standard"].jsonSchema.input(opciones);
      expect(esquema["~standard"].jsonSchema.input(opciones)).toBe(a);
      expect(a.type).toBe("object");
    }
    const obtener = ESQUEMAS.obtener_serie["~standard"].jsonSchema.input({ target: "draft-2020-12" }) as { properties: Record<string, { description?: string }> };
    expect(obtener.properties.transformacion.description).toContain("var_interanual");
    expect(obtener.properties.id.description).toContain("TRA-01");
  });
});
