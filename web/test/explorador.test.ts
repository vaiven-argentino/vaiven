// Explorador: sombreado, eventos y países con color en la especificación; descargas de la vista.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { periodosDe, serieDeEntidad, transformar, ubicarFechas, type DocumentoPeriodos, type SeriePorPais } from "@vaiven/transformaciones";
import { columnasDe, episodiosEnRango, textoLectura } from "../src/lib/periodos";
import { describe, expect, it } from "vitest";
import { conDatos } from "./datos-compartidos";
import { ALTO_CINTA, ALTO_LETRAS, agruparEventos, especificacion, filasFranja, separarRotulos, type BandaPeriodo, type Tema } from "../src/graficos/espec";
import { csvDeVista, type VistaDescarga } from "../src/lib/descarga";
import { numerarQuiebres } from "../src/lib/ficha";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const leer = <T>(r: string): T => JSON.parse(readFileSync(join(EXPORT, r), "utf-8"));
const tema: Tema = {
  fondo: "#fff", texto: "#000", secundario: "#555", linea: "#ddd", banda: "#eee", borde: "#777", serie: "#00f", fuente: "sans-serif",
  periodoA: "#f1f1f1", periodoB: "#e5e5e5", periodoFacto: "#d0d0d0", periodoCintaFacto: "#c0c0c0", paleta: ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888"],
};
type Capa = { mark: { type: string; text?: string; color?: string }; data: { values: Array<Record<string, unknown>> }; encoding: Record<string, unknown>; transform?: unknown[] };
const periodos = leer<DocumentoPeriodos>("periodos.json");
const bandas = (tipo: "gobierno" | "plan", mandato = false): BandaPeriodo[] => periodosDe(periodos, tipo, mandato)
  .map((p) => ({ desde: p.desde, hasta: p.hasta, nombre: p.nombre, nombre_corto: p.nombre_corto, facto: p.caracter === "de_facto" }));

function capas(opciones: Partial<Parameters<typeof especificacion>[0]> & { serie?: string; variante?: string; t?: Record<string, unknown> }) {
  const doc = leer<never>(`series/${opciones.serie ?? "ipc"}/${opciones.variante ?? "oficial"}.json`) as never as Parameters<typeof transformar>[0] & { tramos: never; empalme: never };
  const resultado = transformar(doc, (opciones.t ?? {}) as never);
  return conDatos(especificacion({
    resultado, tramos: doc.tramos, empalme: doc.empalme, quiebres: numerarQuiebres(doc), tema, esVariacion: false, log: false,
    alto: 300, ancho: 900, descripcion: "prueba", ...opciones,
  }) as { layer: Capa[] }).layer;
}

describe("sombreado por períodos", () => {
  it("los gobiernos van en una cinta debajo del eje, que alterna dos tonos y lleva los de facto en el más oscuro", () => {
    const layer = capas({ sombreado: { bandas: bandas("gobierno") }, t: { desde: "1970", hasta: "1990" } });
    const rect = layer[0];
    expect(rect.mark.type).toBe("rect");
    // Debajo del eje X (el área va de 0 a 300 px), no en el fondo del gráfico (sonda 3 de la 4e).
    expect(rect.encoding.y).toEqual({ value: 307 });
    expect(rect.encoding.y2).toEqual({ value: 307 + ALTO_CINTA });
    const colores = rect.data.values.map((v) => v.color);
    expect(new Set(colores)).toEqual(new Set(["#e5e5e5", "#d0d0d0", "#c0c0c0"]));
    const videla = rect.data.values.find((v) => v.nombre === "Jorge Rafael Videla")!;
    expect(videla.color).toBe("#c0c0c0");
    expect(videla.rotulo).toBe("Videla");
    expect(rect.data.values[0].desde).toBe("1970-01-01"); // Onganía, recortado al inicio de lo visible
    // El nombre va adentro, con su tooltip; los años, debajo de la cinta.
    const nombres = layer.find((c) => c.mark.type === "text" && c.data.values === rect.data.values)!;
    expect(nombres.transform).toEqual([{ filter: "datum.rotulo" }]);
  });
  it("los años bajan para dejar lugar a la cinta, y un panel sin eje X no la lleva", () => {
    const eje = (spec: unknown) => ((spec as { config: { axisX: { labelPadding: number } } }).config.axisX.labelPadding);
    const doc = leer<never>("series/ipc/oficial.json") as never as Parameters<typeof transformar>[0] & { tramos: never; empalme: never };
    const base = { resultado: transformar(doc, { desde: "1970", hasta: "1990" } as never), tramos: doc.tramos, empalme: doc.empalme, quiebres: [], tema, esVariacion: false, log: false, alto: 300, ancho: 900, descripcion: "" };
    expect(eje(especificacion({ ...base, sombreado: { bandas: bandas("gobierno") } })) - eje(especificacion(base))).toBe(ALTO_CINTA + 8);
    const arriba = conDatos(especificacion({ ...base, sombreado: { bandas: bandas("gobierno") }, sinEjeX: true }) as { layer: Capa[] }).layer;
    expect(arriba.some((c) => c.data.values?.some((v) => v.nombre === "Jorge Rafael Videla"))).toBe(false);
  });
  it("con la cinta, los quiebres conservan su relleno", () => {
    const sin = capas({ t: { transformacion: "var_interanual" } }).filter((c) => c.mark.type === "rect");
    const con = capas({ t: { transformacion: "var_interanual" }, sombreado: { bandas: bandas("gobierno") } }).filter((c) => c.mark.type === "rect");
    expect(sin).toHaveLength(1);
    expect(con).toHaveLength(2); // la de los períodos y la del quiebre
    expect(con.some((c) => c.data.values.some((v) => "n" in v))).toBe(true);
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
  const juntos = [
    { letra: "A", fecha: "2001-12-01", nombre: "Corralito" }, { letra: "B", fecha: "2001-12-23", nombre: "Default" },
    { letra: "C", fecha: "2002-01-06", nombre: "Ley 25.561" }, { letra: "D", fecha: "1960-01-01", nombre: "Fuera de rango" },
  ];
  const separados = [
    { letra: "A", fecha: "1996-06-01", nombre: "Uno" }, { letra: "B", fecha: "2001-12-23", nombre: "Default" },
    { letra: "C", fecha: "1960-01-01", nombre: "Fuera de rango" },
  ];
  const letrasDe = (layer: Capa[]) => layer.filter((c) => c.mark.type === "text" && c.data.values.some((v) => "etiqueta" in v));
  const reglas = (layer: Capa[]) => layer.filter((c) => c.mark.type === "rule" && (c.mark as { strokeDash?: number[] }).strokeDash?.join() === "1,3");
  it("una regla por evento dentro del período y una letra por fecha arriba del área, en una sola fila", () => {
    const layer = capas({ eventos: separados, t: { desde: "1995", hasta: "2005" } });
    const letras = letrasDe(layer)[0].data.values;
    expect(letras.map((v) => v.etiqueta)).toEqual(["A", "B"]);
    expect(new Set(letras.map((v) => v.y))).toEqual(new Set([10]));
    // La regla empieza debajo de las letras; el nombre y la fecha, en el tooltip.
    const [regla] = reglas(layer);
    expect(regla.encoding.y).toEqual({ value: ALTO_LETRAS - 2 });
    expect(regla.data.values.map((v) => v.nombre)).toEqual(["Uno", "Default"]);
    expect(JSON.stringify(regla.encoding.tooltip)).toContain("nombre");
  });
  it("los eventos pegados van juntos en una marca («A–C»), con los nombres de todos en el tooltip (no hay rayitas)", () => {
    const layer = capas({ eventos: juntos, t: { desde: "1995", hasta: "2005" } });
    const [grupo] = letrasDe(layer)[0].data.values;
    expect(letrasDe(layer)[0].data.values).toHaveLength(1);
    expect(grupo.etiqueta).toBe("A–C");
    expect(String(grupo.forma)).toMatch(/^M-[\d.]+,-1H[\d.]+V1H-[\d.]+Z$/);
    expect(grupo.texto).toBe("A: Corralito (1/12/2001) · B: Default (23/12/2001) · C: Ley 25.561 (6/1/2002)");
    expect(reglas(layer)[0].data.values.find((v) => v.nombre === "Corralito")!.dia).toBe("1/12/2001");
    expect(reglas(layer)[0].data.values.some((v) => v.nombre === "Fuera de rango")).toBe(false);
  });
  it("los paneles de abajo llevan solo las reglas, desde arriba, y los eventos van una vez para todo el gráfico", () => {
    const spec = especificacion({
      ...(() => { const doc = leer<never>("series/ipc/oficial.json") as never as Parameters<typeof transformar>[0] & { tramos: never; empalme: never };
        return { resultado: transformar(doc, { desde: "1995", hasta: "2005" } as never), tramos: doc.tramos, empalme: doc.empalme }; })(),
      quiebres: [], tema, esVariacion: false, log: false, alto: 300, ancho: 900, descripcion: "", eventos: separados, sinLetrasEventos: true, prefijoDatos: "p2_",
    }) as { layer: Capa[]; datasets: Record<string, unknown[]> };
    expect(Object.keys(spec.datasets)).toContain("eventos");
    const layer = conDatos(spec).layer;
    expect(letrasDe(layer)).toHaveLength(0);
    expect(reglas(layer)[0].encoding.y).toEqual({ value: 0 });
  });
  it("agruparEventos: separa las marcas que entran y junta las que se pisarían", () => {
    // 120 meses en 1275 px (1200 de área): 10 px por mes. Dos círculos de 15 px necesitan 17 px entre centros.
    const ev = (letra: string, fecha: string) => ({ letra, fecha, nombre: letra });
    expect(agruparEventos([ev("A", "2000-01-01"), ev("B", "2000-03-01")], 2000 * 12, 2010 * 12, 1275).map((g) => g.etiqueta)).toEqual(["A", "B"]); // 20 px
    expect(agruparEventos([ev("A", "2000-01-01"), ev("B", "2000-02-15")], 2000 * 12, 2010 * 12, 1275).map((g) => g.etiqueta)).toEqual(["A–B"]); // 14,5 px
    expect(agruparEventos([], 2000 * 12, 2010 * 12, 1275)).toEqual([]);
  });
});

describe("lector del gráfico: banda, episodio y eventos", () => {
  const gobiernos = periodosDe(periodos, "gobierno");
  const contexto = { agregacion: "promedio" as const, transformacion: "var_mensual" as const };
  // El episodio publicado, con sus tres fases (segunda revisión externa de la 4b: la tregua del Plan Bunge y Born se
  // separa del primer brote).
  const ipc = leer<never>("series/ipc/oficial.json") as never as Parameters<typeof transformar>[0];
  const [episodio] = episodiosEnRango(periodos, transformar(ipc, { transformacion: "var_mensual", desde: "1989", hasta: "1990" } as never));
  it("el episodio publicado tiene tres fases: primer brote, tregua y segundo brote", () => {
    expect(episodio.fases?.map((f) => [f.nombre_corto, f.desde, f.hasta])).toEqual([
      ["Primer brote", "1989-02-06", "1989-08-01"],
      ["Tregua del Plan Bunge y Born", "1989-08-01", "1989-12-12"],
      ["Segundo brote", "1989-12-12", "1990-04-01"],
    ]);
  });
  it("julio de 1989: Menem con sus fechas, el reparto, el primer brote y sin eventos", () => {
    const [u] = ubicarFechas(["1989-07"], ["mensual"], contexto, gobiernos, "gobierno");
    const t = textoLectura({ fecha: "1989-07", frecuencia: "mensual", valor: "196,6 %", contexto, columna: "Gobierno", ubicacion: u, episodios: [episodio] });
    expect(t).toContain("Carlos Saúl Menem (8/7/1989–");
    expect(t).toContain("reparto:");
    expect(t).toContain("episodio: Hiperinflación de 1989–1990, primer brote (6/2/1989–1/8/1989)");
    expect(t).not.toContain("evento");
  });
  it("octubre de 1989: la tregua del Plan Bunge y Born, con la mayúscula del nombre propio", () => {
    const t = textoLectura({ fecha: "1989-10", frecuencia: "mensual", valor: "5,6 %", contexto, episodios: [episodio] });
    expect(t).toContain("episodio: Hiperinflación de 1989–1990, tregua del Plan Bunge y Born (1/8/1989–12/12/1989)");
  });
  it("un dato sin mayoría lo dice, y la banda lleva sus fechas igual", () => {
    const [u] = ubicarFechas(["1983-12"], ["mensual"], contexto, gobiernos, "gobierno");
    const t = textoLectura({ fecha: "1983-12", frecuencia: "mensual", valor: "1", contexto, columna: "Gobierno", ubicacion: u });
    expect(t).toMatch(/Gobierno: .+ \(\d+\/\d+\/\d{4}–\d+\/\d+\/\d{4}\)/);
  });
  it("los eventos marcados del intervalo del dato, con su letra", () => {
    const eventos = [{ letra: "A", fecha: "1990-01-03", nombre: "Plan Bonex" }, { letra: "B", fecha: "1991-03-27", nombre: "Convertibilidad" }];
    const base = { frecuencia: "mensual", valor: "1", contexto, eventos };
    expect(textoLectura({ ...base, fecha: "1990-01" })).toContain("evento: A. Plan Bonex (3/1/1990)");
    expect(textoLectura({ ...base, fecha: "1990-02" })).not.toContain("Bonex");
    expect(textoLectura({ ...base, fecha: "1990", frecuencia: "anual" })).toContain("Plan Bonex");
  });
});

describe("países con color", () => {
  const doc = leer<SeriePorPais>("series/int-pib/banco-mundial.json");
  const ids = ["ARG", "BRA", "CHL", "URY", "USA", "WLD", "LCN", "EUU"];
  const resultado = (id: string) => transformar(serieDeEntidad(doc, id), { desde: "2001", hasta: "2011" });
  it("cada país lleva su color de la paleta y su nombre al final de la línea", () => {
    const layer = (conDatos(especificacion({
      resultado: resultado("ARG"), tramos: serieDeEntidad(doc, "ARG").tramos, empalme: "yuxtaponer", quiebres: [], tema, esVariacion: true,
      log: false, alto: 300, ancho: 900, descripcion: "", nombre: "Argentina", colores: true,
      otras: ids.slice(1).map((id) => ({ nombre: id, resultado: resultado(id) })),
    })) as { layer: Capa[] }).layer;
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
});
