// Regresión de las URL de la 4b (SPEC 10). Para cada URL guardada en la 4b (regresion/urls-4b.json: las fijas, los
// accesos de /periodos/ y los enlaces de las fichas al explorador), el parser tiene que dar la misma serie, el mismo
// estado, los mismos avisos, la misma URL canónica y las mismas opciones de transformación que daba el de la 4b
// (regresion/estados-4b.json, generado con el código de la 4b). La vista en el navegador la compara
// web/scripts/regresion-urls.mjs. Para regenerar (solo si un cambio de la vista se aprobó): GUARDAR_REGRESION=1.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoDesdeUrl, opcionesDe, serieDeUrl, serieVista, urlDesdeEstado, type Documento, type IndiceSerie } from "../src/lib/estado";
import { categoriasEv } from "../src/lib/periodos";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const DIR = join(import.meta.dirname, "regresion");
const catalogo = JSON.parse(readFileSync(join(EXPORT, "catalogo.json"), "utf-8")) as {
  series: Array<{ id: string; codigo: string; nombre: string; bloque: string; variante_por_defecto: string; variantes: Array<{ id: string; nombre: string; estado: string; archivo: string | null }> }>;
};
const indice: IndiceSerie[] = catalogo.series.map((s) => ({
  id: s.id, codigo: s.codigo, nombre: s.nombre, bloque: s.bloque, variante_por_defecto: s.variante_por_defecto,
  variantes: s.variantes.filter((v) => v.estado === "publicada" && v.archivo).map((v) => ({ id: v.id, nombre: v.nombre, archivo: v.archivo! })),
}));
const doc = (s: string, v: string): Documento => JSON.parse(readFileSync(join(EXPORT, "series", s, `${v}.json`), "utf-8"));
const CATEGORIAS = categoriasEv(JSON.parse(readFileSync(join(EXPORT, "eventos.json"), "utf-8")));

const urls = JSON.parse(readFileSync(join(DIR, "urls-4b.json"), "utf-8")) as { fijas: string[]; accesos: string[]; fichas: string[] };
const todas = [...new Set([...urls.fijas, ...urls.accesos, ...urls.fichas])];

/** Lo que la vista toma de la URL: serie, variante, estado, avisos, URL canónica y opciones de la librería. */
function vista(url: string) {
  const q = new URLSearchParams(url);
  const { serie, variante, avisos: avisosSerie } = serieDeUrl(q, indice);
  const d = doc(serie.id, variante);
  const { estado, avisos } = estadoDesdeUrl(q, serie.id, variante, d, CATEGORIAS);
  return {
    serie: serie.id, variante, estado, avisos: [...avisosSerie, ...avisos],
    canonica: urlDesdeEstado(estado, d, indice, CATEGORIAS), opciones: opcionesDe(estado, serieVista(d, estado.p)),
  };
}

const ARCHIVO = join(DIR, "estados-4b.json");
if (process.env.GUARDAR_REGRESION === "1" || !existsSync(ARCHIVO)) {
  writeFileSync(ARCHIVO, `${JSON.stringify(Object.fromEntries(todas.map((u) => [u, vista(u)])), null, 1)}\n`);
}
const guardados = JSON.parse(readFileSync(ARCHIVO, "utf-8")) as Record<string, ReturnType<typeof vista>>;

describe("las URL de la 4b dan la misma vista", () => {
  it("están todas guardadas", () => {
    expect(Object.keys(guardados).sort()).toEqual([...todas].sort());
    expect(todas.length).toBeGreaterThan(600);
  });
  it.each(todas)("%s", (url) => {
    expect(vista(url)).toEqual(guardados[url]);
  });
});

