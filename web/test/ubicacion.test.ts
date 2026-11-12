// Coherencia entre el gráfico y la tabla (correcciones de la revisión externa de la 4b): en todas las series y variantes
// publicadas, con cada frecuencia, cada tipo de sombreado y episodios, en nivel y en una variación, la banda donde se
// dibuja cada punto es el período que dice la tabla. Las dos salen de la misma regla (ubicacion.ts de la librería).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  disponibles, periodosDe, serieDeEntidad, tienePais, transformar, ubicarFechas, type DocumentoPeriodos, type Opciones,
  type Resultado, type SerieExportada,
} from "@vaiven/transformaciones";
import { describe, expect, it } from "vitest";
import { especificacion, type Tema } from "../src/graficos/espec";
import { numerarQuiebres } from "../src/lib/ficha";
import { OPCIONES_SOMBREADO, bandasDe, columnasDe, contextoDe, episodiosEnRango, periodosEnRango, tipoDe } from "../src/lib/periodos";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const leer = <T>(r: string): T => JSON.parse(readFileSync(join(EXPORT, r), "utf-8"));
const registro = leer<DocumentoPeriodos>("periodos.json");
const tema: Tema = {
  fondo: "#fff", texto: "#000", secundario: "#555", linea: "#ddd", banda: "#eee", borde: "#777", serie: "#00f", fuente: "sans-serif",
  periodoA: "#f1f1f1", periodoB: "#e5e5e5", periodoFacto: "#d0d0d0",
};
type Capa = { mark: { type: string; color?: string }; data: { values: Array<Record<string, string>> } };

const variantes = readdirSync(join(EXPORT, "series"), { withFileTypes: true }).filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(join(EXPORT, "series", d.name)).map((v) => `${d.name}/${v}`));

/** Las vistas a probar de una variante: cada frecuencia que admite, en nivel y en su primera variación. */
function vistas(serie: SerieExportada): Opciones[] {
  const disp = disponibles(serie, {});
  const variacion = disp.transformaciones.find((t) => t.startsWith("var_"));
  const frecuencias: Array<Opciones["frecuencia"]> = [undefined, ...(disp.frecuencias as Array<Opciones["frecuencia"]>)];
  return frecuencias.flatMap((f) => [{ frecuencia: f }, ...(variacion ? [{ frecuencia: f, transformacion: variacion }] : [])]);
}

const contiene = (b: Record<string, string>, t: string) => b.desde <= t && t < b.hasta;

describe("la banda de cada punto es el período de la tabla", () => {
  it.each(variantes)("%s", (ruta) => {
    const doc = leer<SerieExportada>(`series/${ruta}`);
    const serie = tienePais(doc) ? serieDeEntidad(doc) : doc;
    let puntos = 0;
    for (const o of vistas(serie)) {
      let r: Resultado;
      try { r = transformar(serie, o); } catch { continue; }
      if (!r.datos.some((d) => d[1] !== null)) continue;
      const contexto = contextoDe(serie.agregacion, o);
      const base = {
        resultado: r, tramos: serie.tramos, empalme: (doc as never as { empalme: "yuxtaponer" }).empalme, quiebres: numerarQuiebres(serie as never),
        tema, esVariacion: false, log: false, alto: 300, ancho: 900, descripcion: "", ubicacion: contexto,
      };
      const conDato = r.datos.map((d, k) => ({ d, k })).filter(({ d }) => d[1] !== null);

      for (const sh of OPCIONES_SOMBREADO) {
        const periodos = periodosEnRango(registro, sh, r);
        if (!periodos.length) continue;
        const spec = especificacion({ ...base, sombreado: { bandas: bandasDe(periodos), franja: sh === "plan" }, asignacion: { periodos, tipo: tipoDe(sh) } }) as { layer: Capa[] };
        const linea = spec.layer.find((c) => c.mark.type === "line" && c.mark.color === tema.serie)!.data.values;
        const bandas = spec.layer.find((c) => c.mark.type === "rect" && c.data.values[0]?.rango)!.data.values;
        const us = ubicarFechas(r.datos.map((d) => d[0]), r.frecuencias, contexto, periodos, tipoDe(sh));
        conDato.forEach(({ k }, n) => {
          const t = linea[n].t;
          const dibujadas = bandas.filter((b) => contiene(b, t)).map((b) => b.nombre).sort();
          const tabla = us[k].vigentes.map((p) => p.nombre).sort();
          expect(dibujadas, `${ruta} ${JSON.stringify(o)} ${sh} ${r.datos[k][0]}`).toEqual(tabla);
          // La columna de la tabla nombra lo mismo (con «(sin mayoría)» si corresponde).
          expect(columnasDe(us[k]).periodo.replace(" (sin mayoría)", "")).toBe(us[k].etiqueta);
          puntos += 1;
        });
      }

      // Episodios: la franja de debajo del eje.
      const episodios = episodiosEnRango(registro, r);
      if (episodios.length) {
        const spec = especificacion({ ...base, episodios }) as { layer: Capa[] };
        const linea = spec.layer.find((c) => c.mark.type === "line" && c.mark.color === tema.serie)!.data.values;
        const franja = spec.layer.find((c) => c.mark.type === "rule" && c.data.values[0]?.episodio)!.data.values;
        const lista = periodosDe(registro, "episodio");
        const us = ubicarFechas(r.datos.map((d) => d[0]), r.frecuencias, contexto, lista, "episodio");
        conDato.forEach(({ k }, n) => {
          const t = linea[n].t;
          const dibujados = [...new Set(franja.filter((b) => contiene(b, t)).map((b) => b.episodio))].sort();
          expect(dibujados, `${ruta} episodios ${r.datos[k][0]}`).toEqual(us[k].vigentes.map((p) => p.nombre).sort());
        });
      }
    }
    expect(puntos).toBeGreaterThan(0);
  });
});
