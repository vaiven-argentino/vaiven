// Una sola implementación (SPEC 10): para las mismas vistas, la especificación de especificacion_grafico es la del
// explorador salvo el tamaño. El explorador lee `url_explorador` con su parser (seriesDeUrl y vistaDesdeUrl), carga
// los JSON y arma la vista con armarVista y el tema de global.css (TEMA_CLARO, que web/test/tema.test.ts compara con el
// CSS). Con el mismo tamaño, las dos especificaciones tienen que ser idénticas; con otro, solo cambia lo que depende
// del tamaño (ancho, alto y, por eso, el modo de los eventos o las marcas del eje).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TEMA_CLARO, armarVista, categoriasEv, seriesDeUrl, vistaDesdeUrl, type Documento, type IndiceSerie,
} from "@vaiven/grafico";
import type { DocumentoEventos, DocumentoPeriodos, InsumosCargados, SerieExportada } from "@vaiven/transformaciones";
import { describe, expect, it } from "vitest";
import { ALTO_MCP, ANCHO_MCP, especificacionGrafico, type ArgsEspecificacion } from "../src/herramientas/comparar";
import { EXPORT, repoReal } from "./ayuda";

const repo = repoReal();
const leer = <T>(ruta: string): T => JSON.parse(readFileSync(join(EXPORT, ruta), "utf-8")) as T;
const catalogo = leer<{ series: Array<{ id: string; codigo: string; nombre: string; bloque: string; variante_por_defecto: string; variantes: Array<{ id: string; nombre: string; estado: string; archivo: string | null }> }> }>("catalogo.json");
const indice: IndiceSerie[] = catalogo.series.map((s) => ({
  id: s.id, codigo: s.codigo, nombre: s.nombre, bloque: s.bloque, variante_por_defecto: s.variante_por_defecto,
  variantes: s.variantes.filter((v) => v.estado === "publicada" && v.archivo).map((v) => ({ id: v.id, nombre: v.nombre, archivo: v.archivo! })),
}));
const PERIODOS = leer<DocumentoPeriodos>("periodos.json");
const EVENTOS = leer<DocumentoEventos>("eventos.json");

/** Lo que hace el explorador con una URL: leerla, bajar los JSON y sus insumos, y armar la vista. */
function explorador(url: string, ancho: number, alto: number) {
  const q = new URLSearchParams(new URL(url).search);
  const { pedidas, avisos } = seriesDeUrl(q, indice);
  const docs = pedidas.map((p) => leer<Documento>(`series/${p.serie.id}/${p.variante}.json`));
  const r = vistaDesdeUrl(q, pedidas, docs, categoriasEv(EVENTOS));
  expect([...avisos, ...r.avisos]).toEqual([]);
  const series: Record<string, SerieExportada> = {};
  let signos: InsumosCargados["signos"];
  for (const d of r.docs) {
    for (const [m, insumo] of Object.entries(d.insumos ?? {})) {
      for (const o of insumo!.opciones) {
        if (m === "pesos_actuales") signos = leer(o.archivo);
        else series[o.id] ??= leer(o.archivo);
      }
    }
  }
  return armarVista({ estado: r.estado, docs: r.docs, insumos: { series, ...(signos ? { signos } : {}) }, periodos: PERIODOS, eventos: EVENTOS, tema: TEMA_CLARO, ancho, alto });
}

const VISTAS: Array<[string, ArgsEspecificacion]> = [
  ["una serie", { series: [{ id: "ipc", transformacion: "var_interanual" }], desde: "2000", hasta: "2010" }],
  ["una serie, toda la historia", { series: [{ id: "reservas" }] }],
  ["doble eje", { series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "reservas" }], desde: "1995", hasta: "2010" }],
  ["doble eje pedido en paneles", { series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "reservas" }], desde: "1995", hasta: "2010", ejes: "paneles" }],
  ["tres unidades con sombreado y eventos", {
    series: [{ id: "ipc", transformacion: "var_mensual" }, { id: "tc-oficial", transformacion: "var_mensual" }, { id: "reservas" }, { id: "pib", transformacion: "var_interanual" }],
    desde: "1988", hasta: "1991", sombreado: "gobierno", eventos: true,
  }],
  ["internacional con otra serie", { series: [{ id: "pib", transformacion: "var_interanual", frecuencia: "anual" }, { id: "int-pib", paises: ["ARG", "BRA", "USA"] }], desde: "2000", hasta: "2015" }],
  ["frecuencias mixtas y una medida", { series: [{ id: "desocupacion" }, { id: "salario-real", variante: "ripte", medida: "real" }], desde: "1995", hasta: "2020", sombreado: "plan" }],
  ["dos variantes de la misma serie, con un filtro de eventos", { series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "ipc", variante: "provincias", transformacion: "var_interanual" }], desde: "2007", hasta: "2015", eventos: ["cambiario", "episodio"] }],
];

describe("la especificación del MCP es la del explorador", () => {
  it.each(VISTAS)("%s", async (_, args) => {
    const r = await especificacionGrafico(repo, args);
    expect(r.especificacion).toEqual(explorador(r.url_explorador, ANCHO_MCP, ALTO_MCP).especificacion);
    // Con otro tamaño, como en la pantalla, la vista es la misma: las mismas series y la misma disposición.
    const enPantalla = explorador(r.url_explorador, 1100, 520);
    expect(enPantalla.comparacion.disposicion.tipo).toBe(r.disposicion.tipo);
    expect(enPantalla.descripcion.length).toBeGreaterThan(0);
  });
});
