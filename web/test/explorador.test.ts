// Explorador: sombreado, eventos y países con color en la especificación; descargas de la vista.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { periodosDe, serieDeEntidad, transformar, ubicarFechas, type DocumentoPeriodos, type SeriePorPais } from "@vaiven/transformaciones";
import { columnasDe } from "../src/lib/periodos";
import { describe, expect, it } from "vitest";
import { especificacion, filasFranja, separarRotulos, type BandaPeriodo, type Tema } from "../src/graficos/espec";
import { csvDeVista, hojasXlsx, type VistaDescarga } from "../src/lib/descarga";
import { numerarQuiebres } from "../src/lib/ficha";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const leer = <T>(r: string): T => JSON.parse(readFileSync(join(EXPORT, r), "utf-8"));
const tema: Tema = {
  fondo: "#fff", texto: "#000", secundario: "#555", linea: "#ddd", banda: "#eee", borde: "#777", serie: "#00f", fuente: "sans-serif",
  periodoA: "#f1f1f1", periodoB: "#e5e5e5", periodoFacto: "#d0d0d0", paleta: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
};
type Capa = { mark: { type: string; text?: string; color?: string }; data: { values: Array<Record<string, unknown>> }; encoding: Record<string, unknown> };
const periodos = leer<DocumentoPeriodos>("periodos.json");
const bandas = (tipo: "gobierno" | "plan", mandato = false): BandaPeriodo[] => periodosDe(periodos, tipo, mandato)
  .map((p) => ({ desde: p.desde, hasta: p.hasta, nombre: p.nombre, nombre_corto: p.nombre_corto, facto: p.caracter === "de_facto" }));

function capas(opciones: Partial<Parameters<typeof especificacion>[0]> & { serie?: string; variante?: string; t?: Record<string, unknown> }) {
  const doc = leer<never>(`series/${opciones.serie ?? "ipc"}/${opciones.variante ?? "oficial"}.json`) as never as Parameters<typeof transformar>[0] & { tramos: never; empalme: never };
  const resultado = transformar(doc, (opciones.t ?? {}) as never);
  return (especificacion({
    resultado, tramos: doc.tramos, empalme: doc.empalme, quiebres: numerarQuiebres(doc), tema, esVariacion: false, log: false,
    alto: 300, ancho: 900, descripcion: "prueba", ...opciones,
  }) as { layer: Capa[] }).layer;
}

describe("sombreado por períodos", () => {
  it("las bandas de gobierno alternan dos grises y los de facto van más oscuros", () => {
    const layer = capas({ sombreado: { bandas: bandas("gobierno") }, t: { desde: "1970", hasta: "1990" } });
    const rect = layer[0];
    expect(rect.mark.type).toBe("rect");
    const colores = rect.data.values.map((v) => v.color);
    expect(new Set(colores)).toEqual(new Set(["#f1f1f1", "#e5e5e5", "#d0d0d0"]));
    const videla = rect.data.values.find((v) => v.nombre === "Jorge Rafael Videla")!;
    expect(videla.color).toBe("#d0d0d0");
    expect(rect.data.values[0].desde).toBe("1970-01-01"); // Onganía, recortado al inicio de lo visible
  });
  it("con sombreado, los quiebres no llevan relleno (van como barra punteada)", () => {
    const sin = capas({ t: { transformacion: "var_interanual" } }).filter((c) => c.mark.type === "rect");
    const con = capas({ t: { transformacion: "var_interanual" }, sombreado: { bandas: bandas("gobierno") } }).filter((c) => c.mark.type === "rect");
    expect(sin).toHaveLength(1);
    expect(con).toHaveLength(1); // solo el de los períodos
    expect(con[0].data.values.some((v) => "n" in v)).toBe(false);
  });
  it("por mandato, Menem va en dos bandas", () => {
    const nombres = capas({ sombreado: { bandas: bandas("gobierno", true) }, t: { desde: "1989", hasta: "2000" } })[0].data.values.map((v) => v.nombre);
    expect(nombres.filter((n) => String(n).includes("Menem"))).toHaveLength(2);
  });
  it("los planes van en una franja arriba, con filas si se superponen", () => {
    expect(filasFranja([{ a: 0, b: 10 }, { a: 5, b: 8 }, { a: 10, b: 12 }])).toEqual([0, 1, 0]);
    const layer = capas({ sombreado: { bandas: bandas("plan"), franja: true }, t: { desde: "1976", hasta: "1982" } });
    const franja = layer[0].data.values;
    expect(new Set(franja.map((v) => v.y))).toEqual(new Set([3, 16])); // Martínez de Hoz y el programa de 1978 se superponen
  });
});

describe("eventos", () => {
  it("una regla y una letra por evento dentro del período; las cercanas se escalonan", () => {
    const eventos = [
      { letra: "A", fecha: "2001-12-01", nombre: "Corralito" }, { letra: "B", fecha: "2001-12-23", nombre: "Default" },
      { letra: "C", fecha: "2002-01-06", nombre: "Ley 25.561" }, { letra: "D", fecha: "1960-01-01", nombre: "Fuera de rango" },
    ];
    const layer = capas({ eventos, t: { desde: "1995", hasta: "2005" } });
    const letras = layer.find((c) => c.mark.type === "text" && c.data.values.some((v) => v.letra === "A"))!.data.values;
    expect(letras.map((v) => v.letra)).toEqual(["A", "B", "C"]);
    expect(new Set(letras.map((v) => v.y)).size).toBeGreaterThan(1);
  });
});

describe("países con color", () => {
  const doc = leer<SeriePorPais>("series/int-pib/banco-mundial.json");
  const ids = ["ARG", "BRA", "CHL", "URY", "USA", "WLD", "LCN", "EUU"];
  const resultado = (id: string) => transformar(serieDeEntidad(doc, id), { desde: "2001", hasta: "2011" });
  it("cada país lleva su color de la paleta y su nombre al final de la línea", () => {
    const layer = (especificacion({
      resultado: resultado("ARG"), tramos: serieDeEntidad(doc, "ARG").tramos, empalme: "yuxtaponer", quiebres: [], tema, esVariacion: true,
      log: false, alto: 300, ancho: 900, descripcion: "", nombre: "Argentina", colores: true,
      otras: ids.slice(1).map((id) => ({ nombre: id, resultado: resultado(id) })),
    }) as { layer: Capa[] }).layer;
    const lineas = layer.find((c) => c.mark.type === "line" && c.data.values.some((v) => v.pais === "BRA"))!;
    expect(new Set(lineas.data.values.map((v) => v.color))).toEqual(new Set(tema.paleta!.slice(1)));
    const rotulos = layer.find((c) => c.mark.type === "text" && c.data.values.some((v) => v.pais === "Argentina"))!.data.values;
    expect(rotulos).toHaveLength(8);
    expect(rotulos.find((v) => v.pais === "Argentina")!.color).toBe("#111");
  });
  it("los rótulos se separan para no pisarse", () => {
    expect(separarRotulos([10, 10.2, 3], 1)).toEqual([9.2, 10.2, 3]); // el más alto queda; el de abajo baja
  });
});

describe("descargas de la vista", () => {
  const gobiernos = periodosDe(periodos, "gobierno");
  const fechas = ["1989-06", "1989-07", "2001-12"];
  const us = ubicarFechas(fechas, ["mensual", "mensual", "mensual"], { agregacion: "promedio", transformacion: "var_mensual" }, gobiernos, "gobierno");
  const vista: VistaDescarga = {
    unidad: "variación % mensual", conPais: false, periodo: "Gobierno",
    filas: fechas.map((f, k) => ({ fecha: f, valor: k === 1 ? null : 1.5 * (k + 1), ...columnasDe(us[k]) })),
    metadatos: [["Serie", "Inflación minorista (IPC)"]], cita: { texto: "T", apa: "A", bibtex: "B" },
    periodos: gobiernos.slice(0, 2).map((p) => ({ nombre: p.nombre, desde: p.desde, hasta: p.hasta, confianza: "inicio: alta", fuentes: "x" })),
  };
  it("cada fila va al período vigente a mitad del mes, con su reparto", () => {
    expect(us.map((u) => u.vigentes[0]?.id)).toEqual(["p.gobierno.alfonsin", "p.gobierno.menem", "p.gobierno.de-la-rua"]);
    expect(columnasDe(us[1])).toEqual({ periodo: "Carlos Saúl Menem", periodo_proporcion: 0.774, otros_periodos: "Alfonsín (23 %)" });
    // Diciembre de 2001: De la Rúa gobernó 20 de 31 días; los otros tres, el resto.
    expect(columnasDe(us[2]).otros_periodos).toBe("Puerta (6 %); Rodríguez Saá (23 %); Camaño (6 %)");
  });
  it("CSV con las tres columnas del período y celdas vacías sin dato", () => {
    const csv = csvDeVista(vista).split("\n");
    expect(csv[0]).toBe("fecha,valor,periodo,periodo_proporcion,otros_periodos");
    expect(csv[2]).toBe("1989-07,,Carlos Saúl Menem,0.774,Alfonsín (23 %)");
  });
  it("XLSX: Datos, Metadatos, Cita y Períodos", () => {
    const hojas = hojasXlsx(vista);
    expect(hojas.map((h) => h.sheet)).toEqual(["Datos", "Metadatos", "Cita", "Períodos"]);
    expect(hojas[0].data[0].map((c) => c?.value)).toEqual(["Fecha", "variación % mensual", "Gobierno", "Proporción del período", "Otros períodos"]);
    expect(hojas[0].data[2][3]).toEqual({ value: 0.774 });
    expect(hojas[0].data[2][1]).toBeNull();
    expect(hojasXlsx({ ...vista, periodo: undefined, periodos: undefined }).map((h) => h.sheet)).toEqual(["Datos", "Metadatos", "Cita"]);
  });
});
