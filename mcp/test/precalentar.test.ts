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
  it("un parámetro mal escrito da error en lugar de ignorarse (segunda revisión de la 4a)", async () => {
    const validar = (args: unknown) => ESQUEMAS.obtener_serie["~standard"].validate(args) as { issues?: Array<{ message: string }> };
    expect(validar({ id: "int-pib", paises: ["ARG"] }).issues).toBeUndefined();
    const mal = validar({ id: "int-pib", entidades: ["ARG"] });
    expect(mal.issues?.length).toBeGreaterThan(0);
    const json = ESQUEMAS.citar["~standard"].jsonSchema.input({ target: "draft-2020-12" }) as { additionalProperties?: boolean };
    expect(json.additionalProperties).toBe(false);
  });
});
