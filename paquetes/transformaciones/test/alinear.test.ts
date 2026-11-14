// Comparación de series (SPEC 4.1 y 10): disposición, ceros alineados, frecuencia común, serie sin datos, variación
// alineada a anual y límite de observaciones. Con datos del export y con casos sintéticos.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ErrorComparacion, LIMITE_OBSERVACIONES, alinear, cerosAlineados, comparar, disposicion, frecuenciaComun,
  type DocumentoExportado, type PedidoComparacion, type SerieExportada,
} from "../src/index";

const EXPORT = join(import.meta.dirname, "..", "..", "..", "export");
const doc = <T = DocumentoExportado>(ruta: string) => JSON.parse(readFileSync(join(EXPORT, "series", ruta), "utf-8")) as T;
const IPC = doc<SerieExportada>("ipc/oficial.json");
const PIB = doc<SerieExportada>("pib/retropolada.json");
const EXPO = doc<SerieExportada>("exportaciones/oficial.json");
const DESOC = doc<SerieExportada>("desocupacion/total-urbano.json");
const RESERVAS = doc<SerieExportada>("reservas/brutas.json");
const INT = doc("int-pib/banco-mundial.json");
const INT2 = doc("int-pib-per-capita/banco-mundial.json");

const promedio = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const valorEn = (s: SerieExportada, fecha: string) => s.datos.find((d) => d[0] === fecha)![1];

describe("disposición según las unidades", () => {
  const sin = (unidades: string[], ejes: "auto" | "paneles" | "doble" = "auto", angosto = false, internacional: number | null = null) =>
    disposicion(unidades, internacional, unidades.map(() => false), ejes, angosto);

  it("una unidad: un solo gráfico; con paneles, se ignora con un aviso", () => {
    expect(sin(["%", "%"]).disposicion).toMatchObject({ tipo: "unico", paneles: [{ unidad: "%", series: [0, 1] }] });
    const r = sin(["%", "%"], "paneles");
    expect(r.disposicion.tipo).toBe("unico");
    expect(r.advertencias.map((a) => a.id)).toEqual(["c.ejes-ignorado"]);
  });
  it("dos unidades: doble eje por defecto, el izquierdo con la unidad de la primera serie", () => {
    const r = sin(["índice", "%", "índice"]);
    expect(r.disposicion.tipo).toBe("doble_eje");
    expect(r.disposicion.paneles.map((p) => [p.unidad, p.series])).toEqual([["índice", [0, 2]], ["%", [1]]]);
    expect(r.advertencias).toEqual([]);
  });
  it("dos unidades: paneles a pedido, o en pantallas angostas salvo que se pida el doble eje", () => {
    expect(sin(["a", "b"], "paneles").disposicion.tipo).toBe("paneles");
    expect(sin(["a", "b"], "auto", true).disposicion.tipo).toBe("paneles");
    expect(sin(["a", "b"], "doble", true).disposicion.tipo).toBe("doble_eje");
  });
  it("tres o cuatro unidades: paneles sin alternativa, en el orden de la primera serie de cada unidad", () => {
    const r = sin(["c", "a", "c", "b"], "doble");
    expect(r.disposicion.tipo).toBe("paneles");
    expect(r.disposicion.paneles.map((p) => p.series)).toEqual([[0, 2], [1], [3]]);
    expect(r.advertencias.map((a) => a.id)).toEqual(["c.ejes-ignorado"]);
    expect(sin(["a", "b", "c", "d"]).disposicion.paneles).toHaveLength(4);
  });
  it("una internacional con otra serie: paneles, y la internacional en uno propio aunque comparta unidad", () => {
    const r = sin(["variación % anual", "variación % anual"], "auto", false, 1);
    expect(r.disposicion.tipo).toBe("paneles");
    expect(r.disposicion.paneles.map((p) => [p.series, p.internacional])).toEqual([[[0], false], [[1], true]]);
    expect(sin(["x", "y"], "doble", false, 0).advertencias.map((a) => a.id)).toEqual(["c.ejes-ignorado"]);
  });
  it("una internacional sola: un gráfico", () => {
    expect(sin(["variación % anual"], "auto", false, 0).disposicion.tipo).toBe("unico");
  });
  it("la escala logarítmica de un eje es la de su primera serie, con un aviso si no coinciden", () => {
    const r = disposicion(["a", "a", "b"], null, [true, false, false], "auto", false);
    expect(r.disposicion.paneles[0].log).toBe(true);
    expect(r.advertencias).toEqual([expect.objectContaining({ id: "c.log-distinto", series: [1, 2] })]);
  });
});

describe("ceros alineados en el doble eje", () => {
  const altura = ([a, b]: [number, number]) => -a / (b - a);
  it("si los dos rangos incluyen el 0, quedan a la misma altura y solo se amplían", () => {
    const izq: [number, number] = [-10, 30], der: [number, number] = [-1, 9];
    const r = cerosAlineados(izq, der);
    expect(r.alineados).toBe(true);
    expect(altura(r.izq)).toBeCloseTo(altura(r.der), 12);
    for (const [antes, despues] of [[izq, r.izq], [der, r.der]] as const) {
      expect(despues[0]).toBeLessThanOrEqual(antes[0]);
      expect(despues[1]).toBeGreaterThanOrEqual(antes[1]);
    }
  });
  it("con el 0 en el borde de un eje (una serie en nivel desde 0), el otro sigue entero", () => {
    const r = cerosAlineados([0, 100], [-5, 15]);
    expect(altura(r.izq)).toBeCloseTo(altura(r.der), 12);
    expect(r.der[0]).toBeLessThanOrEqual(-5);
    expect(r.der[1]).toBeGreaterThanOrEqual(15);
  });
  it("si un rango no incluye el 0, nada cambia", () => {
    expect(cerosAlineados([10, 30], [-1, 9])).toEqual({ izq: [10, 30], der: [-1, 9], alineados: false });
  });
});

describe("frecuencia común", () => {
  it("mensual con trimestral: trimestral, con el promedio de los tres meses", () => {
    const p: PedidoComparacion = { series: [{ documento: IPC }, { documento: PIB }], desde: "2005", hasta: "2006" };
    const a = alinear(p);
    expect(a.frecuencia).toBe("trimestral");
    expect(a.columnas.map((c) => c.serie)).toEqual([1, 2]);
    const t1 = a.filas.find((f) => f[0] === "2005-01")!;
    expect(t1[1]).toBeCloseTo(promedio(["2005-01", "2005-02", "2005-03"].map((m) => valorEn(IPC, m))), 9);
    expect(t1[2]).toBe(valorEn(PIB, "2005-01"));
    expect(a.advertencias.map((x) => x.id)).toEqual(["c.frecuencia-comun"]);
    expect(a.advertencias[0].series).toEqual([1]);
  });
  it("mensual con anual: anual", () => {
    const a = alinear({ series: [{ documento: IPC }, { documento: EXPO }], desde: "2004", hasta: "2006" });
    expect(a.frecuencia).toBe("anual");
    expect(a.filas.map((f) => f[0])).toEqual(["2004", "2005", "2006"]);
    expect(a.filas[1][1]).toBeCloseTo(promedio(IPC.datos.filter((d) => d[0].startsWith("2005")).map((d) => d[1])), 9);
  });
  it("la EPH semestral con el PIB trimestral: anual (la onda no es un semestre calendario)", () => {
    const c = comparar({ series: [{ documento: DESOC }, { documento: PIB }], desde: "1995", hasta: "2002" });
    expect(c.series[0].frecuencia).toBe("semestral");
    expect(frecuenciaComun(c)).toEqual({ frecuencia: "anual", semestral: true });
    const a = alinear({ series: [{ documento: DESOC }, { documento: PIB }], desde: "1995", hasta: "2002" });
    const ondas2000 = DESOC.datos.filter((d) => d[0].startsWith("2000")).map((d) => d[1]);
    expect(ondas2000).toHaveLength(2);
    expect(a.filas.find((f) => f[0] === "2000")![1]).toBeCloseTo(promedio(ondas2000), 9);
    expect(a.advertencias[0].descripcion).toContain("semestral de la EPH puntual");
  });
  it("la EPH con el PIB después de 2003: según el rango, trimestral", () => {
    const a = alinear({ series: [{ documento: DESOC }, { documento: PIB }], desde: "2004", hasta: "2010" });
    expect(a.frecuencia).toBe("trimestral");
    expect(a.advertencias).toEqual([]);
    expect(a.filas.find((f) => f[0] === "2004-10")![1]).toBe(valorEn(DESOC, "2004-10"));
  });
  it("nunca se interpola: un período incompleto da null", () => {
    // 2003 mezcla la onda de mayo de la EPH puntual con dos trimestres de la continua.
    const a = alinear({ series: [{ documento: DESOC }, { documento: EXPO }], desde: "2002", hasta: "2004" });
    expect(a.filas.find((f) => f[0] === "2003")![1]).toBeNull();
    expect(a.columnas[0].notas.join(" ")).toContain("2003");
  });
});

describe("una serie sin datos en el rango", () => {
  it("queda en la comparación, en null, con un aviso", () => {
    const tcr = doc<SerieExportada>("tcr-multilateral/bcra.json");
    const inicio = Number(tcr.datos[0][0].slice(0, 4));
    const p: PedidoComparacion = { series: [{ documento: IPC }, { documento: tcr }], desde: String(inicio - 6), hasta: String(inicio - 2) };
    const c = comparar(p);
    expect(c.advertencias).toEqual([expect.objectContaining({ id: "c.sin-datos", series: [2] })]);
    expect(c.series[1].frecuencia).toBeNull();
    const a = alinear(p, c);
    expect(a.frecuencia).toBe("mensual");
    expect(a.filas.every((f) => f[2] === null)).toBe(true);
  });
});

describe("variación interanual alineada a anual", () => {
  it("es la variación del promedio anual, no el promedio de las variaciones mensuales; se avisa", () => {
    const a = alinear({ series: [{ documento: IPC, opciones: { transformacion: "var_interanual" } }, { documento: EXPO }], desde: "2005", hasta: "2006" });
    const prom = (anio: string) => promedio(IPC.datos.filter((d) => d[0].startsWith(anio)).map((d) => d[1]));
    const esperado = (prom("2006") / prom("2005") - 1) * 100;
    expect(a.filas.find((f) => f[0] === "2006")![1]).toBeCloseTo(esperado, 9);
    const mensuales = IPC.datos.filter((d) => d[0].startsWith("2006")).map((d) => (d[1] / valorEn(IPC, `2005${d[0].slice(4)}`) - 1) * 100);
    expect(Math.abs(esperado - promedio(mensuales))).toBeGreaterThan(0.01);
    expect(a.advertencias.map((x) => x.id)).toEqual(["c.frecuencia-comun", "c.variacion-promedio"]);
    expect(a.columnas[0].unidad).toBe("variación % interanual");
  });
  it("una transformación sin equivalente a la frecuencia común deja la columna vacía, con un aviso", () => {
    const a = alinear({ series: [{ documento: IPC, opciones: { transformacion: "var_mensual" } }, { documento: PIB }], desde: "2005", hasta: "2006" });
    expect(a.frecuencia).toBe("trimestral");
    expect(a.filas.every((f) => f[1] === null)).toBe(true);
    expect(a.filas.some((f) => f[2] !== null)).toBe(true);
    expect(a.advertencias.map((x) => x.id)).toEqual(["c.sin-equivalente"]);
    expect(a.advertencias[0].descripcion).toContain("la variación mensual solo existe en datos mensuales");
  });
  it("la variación diciembre–diciembre ya es anual: no se vuelve a calcular", () => {
    const a = alinear({ series: [{ documento: IPC, opciones: { transformacion: "var_dic_dic" } }, { documento: EXPO }], desde: "2005", hasta: "2006" });
    expect(a.advertencias).toEqual([]);
    expect(a.filas.find((f) => f[0] === "2006")![1]).toBeCloseTo((valorEn(IPC, "2006-12") / valorEn(IPC, "2005-12") - 1) * 100, 9);
  });
});

describe("serie internacional y límites", () => {
  it("las columnas van por país, y la internacional cuenta como una serie", () => {
    const p: PedidoComparacion = { series: [{ documento: RESERVAS }, { documento: INT, paises: ["ARG", "BRA"] }], desde: "2000", hasta: "2002" };
    const a = alinear(p);
    expect(a.columnas.map((c) => [c.serie, c.pais])).toEqual([[1, undefined], [2, "ARG"], [2, "BRA"]]);
    expect(comparar(p).disposicion.tipo).toBe("paneles");
  });
  it("dos internacionales: error", () => {
    expect(() => comparar({ series: [{ documento: INT }, { documento: INT2 }] })).toThrow(ErrorComparacion);
  });
  it("más de 4 series: error", () => {
    expect(() => comparar({ series: Array.from({ length: 5 }, () => ({ documento: IPC })) })).toThrow(/hasta 4 series/);
  });
  it("el límite de observaciones suma las series y los países", () => {
    const larga = (n: number): SerieExportada => ({
      ...IPC, id: "prueba.larga", advertencias: [], excluidos: [],
      tramos: [{ fuente: "f.x.y", desde: "1700-01", hasta: "hoy", frecuencia: "mensual" }],
      datos: Array.from({ length: n }, (_, k) => [`${1700 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`, 100 + k] as [string, number]),
    });
    const ocho = ["ARG", "BRA", "USA", "LCN", "WLD", "CHL", "URY", "MEX"];
    const anios = (INT as { datos: Record<string, unknown[]> }).datos.ARG.length;
    const n = Math.floor((LIMITE_OBSERVACIONES - 5 * anios) / 3); // entra con 5 países, no con 8
    const pedido = (paises: string[]) => ({ series: [{ documento: larga(n) }, { documento: larga(n) }, { documento: larga(n) }, { documento: INT, paises }] });
    expect(comparar(pedido(ocho.slice(0, 5))).observaciones).toBeLessThanOrEqual(LIMITE_OBSERVACIONES);
    expect(() => comparar(pedido(ocho))).toThrow(/observaciones/);
  });
});
