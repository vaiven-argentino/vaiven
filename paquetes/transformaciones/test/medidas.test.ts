// Medidas (real, en dólares, % del PIB, pesos actuales), índice desde tasas y dimensión pais (fase 4a).
// Además de casos sintéticos, se comparan con el export y con valores publicados por el Banco Mundial (CC BY 4.0).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ErrorTransformacion, disponibles, serieDeEntidad, transformar, transformarEntidades, type DocumentoExportado,
  type InsumosCargados, type SerieExportada, type SignosMonetarios,
} from "../src/index";

const EXPORT = join(import.meta.dirname, "..", "..", "..", "export");
const leer = <T>(ruta: string): T => JSON.parse(readFileSync(join(EXPORT, ruta), "utf-8")) as T;
const doc = (ruta: string) => leer<SerieExportada>(ruta);
const comoMapa = (d: Array<[string, number | null]>) => new Map(d);

function serie(datos: [string, number][], extra: Partial<SerieExportada> = {}): SerieExportada {
  return {
    id: "prueba.base", unidad: "millones de pesos", tipo: "flujo", agregacion: "suma", frecuencia: "mensual",
    transformaciones: ["var_interanual", "frecuencia", "real", "en_dolares", "pct_pib"],
    tramos: [{ fuente: "f.x.y", desde: datos[0][0], hasta: "hoy", frecuencia: "mensual" }],
    advertencias: [], excluidos: [], moneda: "pesos_actuales", insumos: {}, ...extra, datos,
  };
}

const ipcSintetico = serie([["2000-01", 100], ["2000-02", 110], ["2000-03", 121]], {
  id: "ipc.oficial", tipo: "precio", agregacion: "promedio", unidad: "índice",
  advertencias: [{ id: "q.ipc.prueba", desde: "2000-02", hasta: "2000-02", tipo: "intervencion", descripcion: "Prueba." }],
});
const insumoReal = {
  real: { opciones: [{ id: "ipc.oficial", archivo: "series/ipc/oficial.json", nombre: "Oficial" }], por_defecto: "ipc.oficial",
    unidad: "millones de pesos de {base}" },
};

describe("real", () => {
  const s = serie([["2000-01", 100], ["2000-02", 110], ["2000-03", 121]], { insumos: insumoReal });
  const insumos: InsumosCargados = { series: { "ipc.oficial": ipcSintetico } };

  it("deflacta con el IPC elegido, a precios del último período por defecto", () => {
    const r = transformar(s, { medida: "real" }, insumos);
    expect(r.datos.map((d) => d[1])).toEqual([121, 121, 121]);
    expect(r.unidad).toBe("millones de pesos de marzo de 2000");
    expect(r.notas.join(" ")).toContain("ipc.oficial");
  });
  it("acepta otra base y suma los quiebres del IPC que cruza el rango", () => {
    const r = transformar(s, { medida: "real", baseReal: "2000-01" }, insumos);
    expect(r.datos.map((d) => d[1])).toEqual([100, 100, 100]);
    expect(r.advertencias.map((a) => a.id)).toEqual(["q.ipc.prueba"]);
    expect(transformar(s, { medida: "real", desde: "2000-03" }, insumos).advertencias).toEqual([]);
  });
  it("sin el insumo cargado, o con un deflactor ajeno, avisa", () => {
    expect(() => transformar(s, { medida: "real" })).toThrow(/Falta cargar/);
    expect(() => transformar(s, { medida: "real", deflactor: "ipc.otra" }, insumos)).toThrow(ErrorTransformacion);
  });
  it("solo se ofrece si la variante declara sus insumos", () => {
    expect(disponibles(s).medidas).toEqual(["real"]);
    expect(disponibles(serie([["2000-01", 1]])).medidas).toEqual([]);
  });

  it("coincide con el tipo de cambio real bilateral del pipeline (CAM-04)", () => {
    // TCR = TC × IPC EE.UU. ÷ IPC, con dic. 2015 = 100. Con real(TC) a precios de dic. 2015, sale lo mismo.
    const tc = { ...doc("series/tc-oficial/pesos-actuales.json"), transformaciones: ["real"], insumos: insumoReal };
    const ipc = doc("series/ipc/oficial.json");
    const eeuu = comoMapa(doc("auxiliares/ipc-eeuu/ocde.json").datos);
    const tcr = comoMapa(doc("series/tcr-bilateral/oficial.json").datos);
    const real = comoMapa(transformar(tc, { medida: "real", baseReal: "2015-12" }, { series: { "ipc.oficial": ipc } }).datos);
    const tcBase = comoMapa(tc.datos).get("2015-12")!;
    for (const f of ["1975-06", "1989-07", "2001-12", "2002-06", "2023-12"]) {
      const esperado = ((real.get(f)! * eeuu.get(f)!) / eeuu.get("2015-12")! / tcBase) * 100;
      expect(tcr.get(f)! / esperado - 1).toBeCloseTo(0, 6);
    }
  });
});

describe("en dólares", () => {
  const pib = doc("auxiliares/pib-nominal/anual.json");
  const tc = doc("series/tc-oficial/pesos-actuales.json");
  const conInsumos: SerieExportada = {
    ...pib, transformaciones: ["en_dolares"],
    insumos: { en_dolares: { opciones: [{ id: "tc-oficial.pesos-actuales", archivo: "x" }], por_defecto: "tc-oficial.pesos-actuales", unidad: "millones de US$" } },
  };
  const r = comoMapa(transformar(conInsumos, { medida: "en_dolares" }, { series: { "tc-oficial.pesos-actuales": tc } }).datos);

  it("da lo mismo que el PIB en dólares del pipeline", () => {
    for (const [f, v] of doc("auxiliares/pib-dolares/anual.json").datos) expect(r.get(f)! / v - 1).toBeCloseTo(0, 8);
  });
  it("coincide con el PIB en dólares del Banco Mundial en 2004–2010 (NY.GDP.MKTP.CD, tolerancia 0,5 %)", () => {
    // Millones de US$ corrientes, consultados el 27/10/2026 en la API del Banco Mundial.
    const bm: Record<string, number> = { 2004: 164657.9, 2005: 198737.1, 2006: 232557.3, 2007: 287530.5, 2008: 361558.0,
      2009: 332976.5, 2010: 423627.4 };
    for (const [anio, v] of Object.entries(bm)) expect(Math.abs(r.get(anio)! / v - 1)).toBeLessThan(0.005);
  });
  it("suma los quiebres del tipo de cambio", () => {
    const res = transformar(conInsumos, { medida: "en_dolares", hasta: "1980" }, { series: { "tc-oficial.pesos-actuales": tc } });
    expect(res.advertencias.map((a) => a.id)).toContain("q.tc.mercados-desdoblados");
  });
});

describe("% del PIB", () => {
  const pibAnual = serie([["2000", 1000], ["2001", 2000]], { id: "pib-nominal.anual", frecuencia: "anual",
    tramos: [{ fuente: "f.x.y", desde: "2000", hasta: "hoy", frecuencia: "anual" }] });
  const insumoPib = { pct_pib: { opciones: [{ id: "pib-nominal.anual", archivo: "x", frecuencia: "anual" as const }],
    por_defecto: "pib-nominal.anual", unidad: "% del PIB" } };
  const insumos: InsumosCargados = { series: { "pib-nominal.anual": pibAnual } };
  const meses = (anio: number, v: number): [string, number][] =>
    Array.from({ length: 12 }, (_, k) => [`${anio}-${String(k + 1).padStart(2, "0")}`, v]);

  it("pide la frecuencia del PIB y divide por el PIB del período", () => {
    const flujo = serie([...meses(2000, 10), ...meses(2001, 10)], { insumos: insumoPib });
    expect(() => transformar(flujo, { medida: "pct_pib" }, insumos)).toThrow(/frecuencia anual/);
    const r = transformar(flujo, { medida: "pct_pib", frecuencia: "anual" }, insumos);
    expect(r.datos).toEqual([["2000", 12], ["2001", 6]]);
    expect(r.unidad).toBe("% del PIB");
  });
  it("en un stock, usa el valor de fin de año", () => {
    const stock = serie([...meses(2000, 50)], { tipo: "stock", agregacion: "fin_de_periodo", insumos: insumoPib });
    expect(transformar(stock, { medida: "pct_pib", frecuencia: "anual" }, insumos).datos).toEqual([["2000", 5]]);
  });
  it("con el export: exportaciones en % del PIB = exportaciones ÷ PIB en dólares", () => {
    const expo = doc("series/exportaciones/oficial.json");
    const pd = doc("auxiliares/pib-dolares/anual.json");
    const r = comoMapa(transformar(expo, { medida: "pct_pib" }, { series: { "pib-dolares.anual": pd } }).datos);
    const e = comoMapa(expo.datos), p = comoMapa(pd.datos);
    expect(r.get("2010")).toBeCloseTo((e.get("2010")! / p.get("2010")!) * 100, 9);
  });
});

describe("pesos actuales", () => {
  const signos = leer<SignosMonetarios>("auxiliares/signos-monetarios.json");
  const insumoPesos = { pesos_actuales: { opciones: [{ id: "signos-monetarios", archivo: "x" }], por_defecto: "signos-monetarios",
    unidad: "pesos actuales por dólar" } };

  it("10.000 australes por dólar en abril de 1991 son 1 peso", () => {
    const s = serie([["1991-04", 10000]], { moneda: "moneda_de_epoca", tipo: "precio", insumos: insumoPesos });
    expect(transformar(s, { pesosActuales: true }, { signos }).datos).toEqual([["1991-04", 1]]);
  });
  it("usa el signo vigente el último día del período: junio de 1985 ya está en australes", () => {
    const s = serie([["1985-05", 1000], ["1985-06", 1]], { moneda: "moneda_de_epoca", tipo: "precio", insumos: insumoPesos });
    const r = transformar(s, { pesosActuales: true }, { signos });
    expect(r.datos[0][1]).toBeCloseTo(1e-4, 15);        // 1.000 pesos argentinos = 1 austral = 0,0001 pesos
    expect(r.datos[1][1]).toBeCloseTo(1e-4, 15);
  });
  it("devuelve la serie del BCRA en pesos equivalentes, mes por mes", () => {
    const epoca = doc("series/tc-oficial/moneda-de-epoca.json");
    const actuales = comoMapa(doc("series/tc-oficial/pesos-actuales.json").datos);
    const r = transformar(epoca, { pesosActuales: true }, { signos });
    for (const [f, v] of r.datos) expect(v! / actuales.get(f)! - 1).toBeCloseTo(0, 9);
  });
  it("sin pasar a pesos actuales, en moneda de época solo queda el nivel", () => {
    const epoca = doc("series/tc-oficial/moneda-de-epoca.json");
    expect(disponibles(epoca).transformaciones).toEqual(["nivel"]);
    expect(disponibles(epoca, { pesosActuales: true }).transformaciones).toContain("var_interanual");
    expect(() => transformar(epoca, { transformacion: "var_interanual" })).toThrow(/pesos actuales/);
    expect(transformar(epoca, { pesosActuales: true, transformacion: "var_interanual" }, { signos }).datos.length).toBeGreaterThan(0);
  });
});

describe("índice desde tasas y dimensión pais", () => {
  const intPib = leer<DocumentoExportado>("series/int-pib/banco-mundial.json");

  it("encadena el crecimiento del Banco Mundial y reproduce sus niveles (NY.GDP.MKTP.KD, tolerancia 0,1 %)", () => {
    // PIB en US$ constantes, consultado el 27/10/2026: el cociente entre años tiene que dar el del índice.
    const kd: Record<string, Record<string, number>> = {
      ARG: { 1970: 220734180309.322, 2000: 395646066535.875, 2025: 609232576079.322 },
      BRA: { 1970: 342966154504.399, 2000: 1186419100640.61, 2025: 2074494382804.15 },
      WLD: { 1970: 18270953231134.0, 2000: 48550490166230.6, 2025: 99658553419775.2 },
    };
    const r = transformarEntidades(intPib, ["ARG", "BRA", "WLD"], { transformacion: "indice_desde_tasas", base: { fecha: "1970" } });
    for (const [ent, niveles] of Object.entries(kd)) {
      const indice = comoMapa(r[ent].datos);
      expect(indice.get("1970")).toBe(100);
      for (const anio of ["2000", "2025"]) {
        expect(Math.abs(indice.get(anio)! / 100 / (niveles[anio] / niveles[1970]) - 1)).toBeLessThan(0.001);
      }
      expect(r[ent].unidad).toBe("índice, 1970 = 100");
    }
  });
  it("hacia atrás de la base también encadena, y un hueco corta la cadena", () => {
    const s = serie([["2000", 10], ["2001", 10], ["2002", 10]], { tipo: "tasa_de_variacion", frecuencia: "anual",
      transformaciones: ["indice_desde_tasas"], tramos: [{ fuente: "f.x.y", desde: "2000", hasta: "hoy", frecuencia: "anual" }] });
    const r = transformar(s, { transformacion: "indice_desde_tasas", base: { fecha: "2001" } });
    expect(r.datos[0][1]).toBeCloseTo(100 / 1.1, 9);
    expect(r.datos[2][1]).toBeCloseTo(110, 9);
    const conHueco = { ...s, datos: [["2000", 10], ["2002", 10]] as [string, number][] };
    const r2 = transformar(conHueco, { transformacion: "indice_desde_tasas" });
    expect(r2.datos).toEqual([["2000", 100]]);
    expect(r2.notas.join(" ")).toContain("corta");
  });
  it("una serie con pais se transforma por entidad", () => {
    expect(serieDeEntidad(intPib).datos[0][0]).toBe("1961");                        // ARG, la primera de la selección
    expect(() => serieDeEntidad(intPib, "XXX")).toThrow(ErrorTransformacion);
    expect(() => transformar(intPib as unknown as SerieExportada)).toThrow(/dimensión pais/);
  });
});
