import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transformar } from "@vaiven/transformaciones";
import { describe, expect, it } from "vitest";
import { especificacion, filas, reservaSuperior, topeY, ubicarMarcadores, type Tema } from "../src/graficos/espec";
import type { SerieExportada } from "@vaiven/transformaciones";
import type { DocumentoSerie } from "../src/lib/export";

type Doc = DocumentoSerie & SerieExportada;
import { numerarQuiebres } from "../src/lib/ficha";

const leer = (s: string, v: string): Doc =>
  JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "export", "series", s, `${v}.json`), "utf-8"));
const tema: Tema = { fondo: "#fff", texto: "#000", secundario: "#555", linea: "#ddd", banda: "#eee", borde: "#777", serie: "#00f", fuente: "sans-serif" };

function capas(doc: Doc, opciones = {}) {
  const resultado = transformar(doc, opciones);
  const spec = especificacion({
    resultado, tramos: doc.tramos, empalme: doc.empalme, quiebres: numerarQuiebres(doc), tema, esVariacion: false,
    log: false, alto: 300, ancho: 800, descripcion: "prueba",
  }) as { layer: Array<{ mark: { type: string; text?: string }; data: { values: Array<Record<string, unknown>> } }> };
  return spec.layer;
}

describe("desocupación: frecuencia mixta y tramos sin empalmar", () => {
  const doc = leer("desocupacion", "total-urbano");
  const f = filas({ resultado: transformar(doc), tramos: doc.tramos, empalme: doc.empalme, esVariacion: false });
  const segmentoDe = (fecha: string) => f.find((x) => x.t === `${fecha}-01`)!.segmento;

  it("corta la línea en el cambio de encuesta (2003-05 → 2003-07)", () => {
    expect(segmentoDe("2003-05")).not.toBe(segmentoDe("2003-07"));
    expect(segmentoDe("2002-11")).toBe(segmentoDe("2003-05"));
  });

  it("corta la línea en el hueco de la emergencia estadística (2015-07 → 2016-04)", () => {
    expect(segmentoDe("2015-07")).not.toBe(segmentoDe("2016-04"));
  });

  it("muestra los puntos con una forma por tramo, en orden cronológico", () => {
    const puntos = capas(doc).find((c) => c.mark.type === "point" && (c as never as { encoding: { shape?: unknown } }).encoding.shape);
    const dominio = (puntos as never as { encoding: { shape: { scale: { domain: string[] } } } }).encoding.shape.scale.domain;
    expect(dominio).toHaveLength(2);
    expect(dominio[0]).toContain("1974");
  });
});

describe("IPC: quiebres", () => {
  const doc = leer("ipc", "oficial");
  it("dibuja las bandas de los quiebres con rango y numera sin pisar los números", () => {
    const layer = capas(doc, { transformacion: "var_interanual" });
    const rects = layer.filter((c) => c.mark.type === "rect");
    expect(rects[0].data.values.map((v) => v.n).sort()).toEqual([1, 2, 3]);
    const textos = layer.find((c) => c.mark.type === "text" && !c.mark.text)!.data.values;
    const filasUsadas = new Set(textos.map((t) => t.y));
    expect(filasUsadas.size).toBeGreaterThan(1); // 2015 y 2016 están muy cerca: van en filas distintas
  });
  it("sin quiebres en el período, no dibuja bandas", () => {
    const layer = capas(doc, { transformacion: "var_interanual", desde: "1991", hasta: "2001" });
    expect(layer.filter((c) => c.mark.type === "rect")).toHaveLength(0);
  });
});

describe("reservas: dato excluido", () => {
  const doc = leer("reservas", "brutas");
  it("corta la línea y marca la «×» en marzo de 1979", () => {
    const layer = capas(doc);
    const marca = layer.find((c) => c.mark.text === "×")!;
    expect(marca.data.values[0].t).toBe("1979-03-01");
    const f = filas({ resultado: transformar(doc), tramos: doc.tramos, empalme: doc.empalme, esVariacion: false });
    const feb = f.find((x) => x.t === "1979-02-01")!, abr = f.find((x) => x.t === "1979-04-01")!;
    expect(feb.segmento).not.toBe(abr.segmento);
  });
  it("el quiebre que cubre toda la serie no se dibuja", () => {
    expect(capas(doc).filter((c) => c.mark.type === "rect" || c.mark.type === "rule")).toHaveLength(0);
  });
});

describe("aire arriba del eje Y", () => {
  it("el pico de desocupación de 2002 queda debajo de los números de los quiebres", () => {
    const doc = leer("desocupacion", "total-urbano");
    const layer = capas(doc) as never as Array<{ mark: { type: string }; encoding?: { y?: { scale?: { domainMax?: number } } }; data: { values: Array<Record<string, unknown>> } }>;
    const linea = layer.find((c) => c.mark.type === "line")!;
    const tope = linea.encoding!.y!.scale!.domainMax!;
    const pico = Math.max(...doc.datos.map(([, v]) => v));
    expect(pico).toBeGreaterThan(20); // mayo de 2002
    const textos = layer.find((c) => c.mark.type === "text" && !(c.mark as { text?: string }).text)!.data.values;
    const reserva = reservaSuperior(textos as Array<{ y: number }>, true);
    const yPico = 300 * (1 - pico / tope); // escala lineal desde cero, en píxeles desde arriba
    expect(yPico).toBeGreaterThanOrEqual(reserva - 0.5);
  });
  it("sin marcas arriba no cambia el eje", () => {
    expect(topeY([1, 2, 3], 0, 300, false, true)).toBeUndefined();
  });
  it("en escala logarítmica reserva en logaritmos", () => {
    const tope = topeY([1, 1000], 60, 300, true, false)!;
    expect(Math.log10(tope)).toBeCloseTo(3 + 3 * (60 / 240));
  });
});

describe("ubicarMarcadores", () => {
  it("baja una fila los números que quedarían a menos de 20 px", () => {
    const m = ubicarMarcadores([{ n: 1, i: 100 }, { n: 2, i: 101 }, { n: 3, i: 200 }], 0, 400, 400);
    expect(m.map((x) => x.y)).toEqual([10, 28, 10]);
  });
});

describe("escala logarítmica", () => {
  it("rotula solo potencias de 10, a lo sumo 8", async () => {
    const { potenciasDeDiez } = await import("../src/graficos/espec");
    const v = potenciasDeDiez(3.5e-11, 1381);
    expect(v.length).toBeLessThanOrEqual(8);
    expect(v.every((x) => Number.isInteger(Math.log10(x)) || Math.abs(Math.log10(x) - Math.round(Math.log10(x))) < 1e-9)).toBe(true);
    expect(v[0]).toBeLessThanOrEqual(3.5e-11);
  });
});
