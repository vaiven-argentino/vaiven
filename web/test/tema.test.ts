// El tema fijo que usa el MCP (TEMA_CLARO, paquetes/grafico) es el del modo claro de global.css, el mismo que lee
// tema() en el navegador: así la especificación del MCP y la del explorador en modo claro son iguales (SPEC 10).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { TEMA_CLARO } from "@vaiven/grafico";

it("TEMA_CLARO coincide con las variables del modo claro de global.css", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "src", "estilos", "global.css"), "utf-8");
  const raiz = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const v = (n: string) => new RegExp(`--${n}:\\s*([^;]+);`).exec(raiz)![1].trim();
  expect(TEMA_CLARO).toEqual({
    fondo: v("fondo"), texto: v("texto"), secundario: v("secundario"), linea: v("linea"), banda: v("banda"), borde: v("borde"),
    serie: v("graf-1"), fuente: "Inter Variable, system-ui, sans-serif",
    periodoA: v("periodo-a"), periodoB: v("periodo-b"), periodoFacto: v("periodo-facto"), periodoFranja: v("periodo-franja"),
    paleta: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => v(`graf-${k}`)),
  });
});
