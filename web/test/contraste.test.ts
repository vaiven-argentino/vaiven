// Contraste del sombreado por períodos contra el fondo, en modo claro y oscuro (revisión externa de la 4b, 3.4 y 9.4).
// Lee los tokens de global.css: los grises A, B y de facto tienen que quedar en el mismo rango en los dos modos, y la
// franja de los planes (y los carriles de planes y episodios de /periodos/) en 1,47:1 o más.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(import.meta.dirname, "..", "src", "estilos", "global.css"), "utf-8");

/** Las variables de un bloque `selector { … }` (el primero que aparece después de `desde`). */
function tokens(desde: string): Record<string, string> {
  const inicio = css.indexOf(desde);
  expect(inicio, `no está el bloque ${desde}`).toBeGreaterThanOrEqual(0);
  const abre = css.indexOf("{", inicio);
  const cierra = css.indexOf("}", abre);
  const bloque = css.slice(abre + 1, cierra);
  return Object.fromEntries([...bloque.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2].toUpperCase()]));
}

const luminancia = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const claro = tokens(":root {");
const oscuroSistema = tokens(':root:not([data-theme="light"])');
const oscuroElegido = tokens(':root[data-theme="dark"]');

describe("contraste del sombreado contra el fondo", () => {
  it("los dos bloques del modo oscuro (sistema y elegido) son iguales", () => {
    expect(oscuroSistema).toEqual(oscuroElegido);
  });
  for (const [modo, t] of [["claro", claro], ["oscuro", oscuroElegido]] as const) {
    it(`modo ${modo}: A ≈ 1,12, B ≈ 1,25, de facto y franja ≥ 1,47`, () => {
      const c = (token: string) => contraste(t[token], t.fondo);
      expect(c("periodo-a")).toBeGreaterThanOrEqual(1.09);
      expect(c("periodo-a")).toBeLessThanOrEqual(1.15);
      expect(c("periodo-b")).toBeGreaterThanOrEqual(1.22);
      expect(c("periodo-b")).toBeLessThanOrEqual(1.28);
      expect(c("periodo-facto")).toBeGreaterThanOrEqual(1.47);
      expect(c("periodo-franja")).toBeGreaterThanOrEqual(1.47);
      // Que se distingan entre sí: cada gris, más oscuro (en el claro) o más claro (en el oscuro) que el anterior.
      expect(c("periodo-b")).toBeGreaterThan(c("periodo-a") + 0.08);
      expect(c("periodo-facto")).toBeGreaterThan(c("periodo-b") + 0.15);
    });
  }
});
