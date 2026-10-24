import { describe, expect, it } from "vitest";
import { ErrorTransformacion, disponibles, transformar } from "../src/index";
import type { SerieExportada, Tramo } from "../src/index";

function serie(datos: [string, number][], extra: Partial<SerieExportada> = {}): SerieExportada {
  const tramos: Tramo[] = extra.tramos ?? [{ fuente: "f.x.y", desde: datos[0][0], hasta: "hoy", frecuencia: "mensual" }];
  return {
    id: "prueba.base", unidad: "índice", tipo: "precio", agregacion: "promedio", frecuencia: tramos[0].frecuencia,
    transformaciones: ["var_mensual", "var_interanual", "var_dic_dic", "acumulada_anio", "base_100", "frecuencia", "media_movil"],
    advertencias: [], excluidos: [], ...extra, tramos, datos,
  };
}

/** Meses consecutivos desde `desde` (AAAA-MM) con los valores dados. */
function mensual(desde: string, valores: number[]): [string, number][] {
  const [a, m] = desde.split("-").map(Number);
  return valores.map((v, k) => {
    const i = a * 12 + m - 1 + k;
    return [`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, v];
  });
}

const cerca = (x: number | null, y: number) => expect(x).toBeCloseTo(y, 9);

describe("nivel", () => {
  it("devuelve los datos tal cual, con la unidad de la serie", () => {
    const r = transformar(serie(mensual("2000-01", [1, 2, 3])));
    expect(r.datos).toEqual([["2000-01", 1], ["2000-02", 2], ["2000-03", 3]]);
    expect(r.unidad).toBe("índice");
    expect(r.frecuencias).toEqual(["mensual", "mensual", "mensual"]);
  });
});

describe("variaciones", () => {
  it("var_mensual: (x_t / x_t−1 − 1) × 100, y hueco donde no hay mes anterior", () => {
    const s = serie([["2000-01", 100], ["2000-02", 110], ["2000-04", 121]]);
    const r = transformar(s, { transformacion: "var_mensual" });
    // El primero no tiene anterior y se recorta; marzo falta, así que abril no tiene mes anterior.
    expect(r.datos.map((d) => d[0])).toEqual(["2000-02"]);
    cerca(r.datos[0][1], 10);
    expect(r.unidad).toBe("variación % mensual");
  });

  it("var_interanual compara con la misma fecha del año anterior", () => {
    const valores = Array.from({ length: 24 }, (_, k) => 100 * 1.01 ** k);
    const r = transformar(serie(mensual("2000-01", valores)), { transformacion: "var_interanual" });
    expect(r.datos[0][0]).toBe("2001-01");
    expect(r.datos).toHaveLength(12);
    for (const [, v] of r.datos) cerca(v, (1.01 ** 12 - 1) * 100);
  });

  it("var_dic_dic da un valor anual por diciembre, y acumulada_anio parte del diciembre anterior", () => {
    const valores = Array.from({ length: 25 }, (_, k) => 100 * 1.02 ** k); // dic. 1999 a dic. 2001
    const s = serie(mensual("1999-12", valores));
    const dic = transformar(s, { transformacion: "var_dic_dic" });
    expect(dic.datos.map((d) => d[0])).toEqual(["2000", "2001"]);
    cerca(dic.datos[0][1], (1.02 ** 12 - 1) * 100);
    expect(dic.frecuencias).toEqual(["anual", "anual"]);
    const acum = transformar(s, { transformacion: "acumulada_anio" });
    expect(acum.datos[0][0]).toBe("2000-01");
    cerca(acum.datos[0][1], 2);
    cerca(acum.datos[2][1], (1.02 ** 3 - 1) * 100); // marzo de 2000
  });
});

describe("dato excluido", () => {
  const s = serie([["1979-01", 6023.1], ["1979-02", 6282.9], ["1979-04", 7270.3], ["1979-05", 7595.7]], {
    excluidos: [{ fecha: "1979-03", motivo: "Parece un dígito de menos." }],
  });

  it("aparece como null en el nivel y se informa", () => {
    const r = transformar(s);
    expect(r.datos).toContainEqual(["1979-03", null]);
    expect(r.excluidos).toEqual([{ fecha: "1979-03", motivo: "Parece un dígito de menos." }]);
  });

  it("deja sin variación el mes excluido y el siguiente: nunca se interpola", () => {
    const r = transformar(s, { transformacion: "var_mensual" });
    const v = Object.fromEntries(r.datos);
    expect(v["1979-03"]).toBeNull();
    expect(v["1979-04"]).toBeNull();
    cerca(v["1979-05"], (7595.7 / 7270.3 - 1) * 100);
  });
});

describe("frecuencia mixta (desocupación: semestral hasta 2003, trimestral después)", () => {
  const tramos: Tramo[] = [
    { fuente: "f.indec.eph-puntual-total", desde: "2001-05", hasta: "2003-05", frecuencia: "semestral" },
    { fuente: "f.indec.eph-continua-total", desde: "2003-07", hasta: "hoy", frecuencia: "trimestral" },
  ];
  const datos: [string, number][] = [
    ["2001-05", 16.4], ["2001-11", 18.3], ["2002-05", 21.5], ["2002-11", 17.8], ["2003-05", 15.6],
    ["2003-07", 16.1], ["2003-10", 14.4], ["2004-01", 14.3], ["2004-04", 14.7], ["2004-07", 13.1], ["2004-10", 12.0],
  ];
  const s = serie(datos, { tramos, tipo: "tasa", frecuencia: "semestral (1974–2003) y trimestral (2003–hoy)",
    transformaciones: ["var_interanual", "base_100", "frecuencia", "media_movil"] });

  it("asigna a cada observación la frecuencia de su tramo", () => {
    expect(transformar(s).frecuencias).toEqual([...Array(5).fill("semestral"), ...Array(6).fill("trimestral")]);
  });

  it("var_interanual compara onda con onda y trimestre con trimestre, y deja hueco donde no hay par", () => {
    const r = Object.fromEntries(transformar(s, { transformacion: "var_interanual" }).datos);
    cerca(r["2002-05"], (21.5 / 16.4 - 1) * 100);
    cerca(r["2003-05"], (15.6 / 21.5 - 1) * 100);
    expect(r["2003-07"]).toBeNull(); // no hay tercer trimestre de 2002
    cerca(r["2004-07"], (13.1 / 16.1 - 1) * 100);
  });

  it("solo ofrece el paso a anual, y el año que mezcla frecuencias queda sin dato", () => {
    expect(disponibles(s).frecuencias).toEqual(["anual"]);
    expect(disponibles(s).transformaciones).not.toContain("var_mensual");
    const r = transformar(s, { frecuencia: "anual" });
    const v = Object.fromEntries(r.datos);
    expect(Object.keys(v)).toEqual(["2001", "2002", "2003", "2004"]);
    cerca(v["2001"], 17.35);
    cerca(v["2002"], 19.65);
    expect(v["2003"]).toBeNull();
    cerca(v["2004"], (14.3 + 14.7 + 13.1 + 12) / 4);
    expect(r.notas.join(" ")).toContain("2003");
  });

  it("la media móvil no cruza el cambio de encuesta", () => {
    const r = Object.fromEntries(transformar(s, { mediaMovil: 2 }).datos);
    cerca(r["2001-11"], (16.4 + 18.3) / 2);
    expect(r["2003-07"]).toBeNull();
    cerca(r["2003-10"], (16.1 + 14.4) / 2);
  });

  it("rechaza pasar de semestral a trimestral", () => {
    expect(() => transformar(s, { frecuencia: "trimestral" })).toThrow(ErrorTransformacion);
  });
});

describe("frecuencia", () => {
  const anio = (valores: number[]) => mensual("2000-01", valores);
  it("promedio, suma y fin de período, solo con períodos completos", () => {
    const datos = [...anio(Array.from({ length: 12 }, (_, k) => k + 1)), ["2001-01", 5] as [string, number]];
    const prom = transformar(serie(datos), { frecuencia: "anual" });
    expect(prom.datos).toEqual([["2000", 6.5]]); // 2001 está incompleto y queda afuera del rango
    expect(prom.unidad).toBe("índice (promedio anual)");
    const suma = transformar(serie(datos, { agregacion: "suma" }), { frecuencia: "trimestral" });
    expect(suma.datos.slice(0, 2)).toEqual([["2000-01", 6], ["2000-04", 15]]);
    const fin = transformar(serie(datos, { agregacion: "fin_de_periodo" }), { frecuencia: "anual" });
    expect(fin.datos).toEqual([["2000", 12]]);
  });

  it("en fin de período alcanza con el dato del último subperíodo", () => {
    const s = serie(anio(Array.from({ length: 12 }, (_, k) => k + 1)).filter(([f]) => f !== "2000-03"),
      { agregacion: "fin_de_periodo", excluidos: [{ fecha: "2000-03", motivo: "prueba" }] });
    expect(transformar(s, { frecuencia: "anual" }).datos).toEqual([["2000", 12]]);
  });

  it("frecuencia y después variación, en el orden de la SPEC", () => {
    const datos = mensual("2000-01", Array.from({ length: 24 }, (_, k) => (k < 12 ? 100 : 110)));
    const r = transformar(serie(datos), { frecuencia: "anual", transformacion: "var_interanual" });
    expect(r.datos).toHaveLength(1);
    expect(r.datos[0][0]).toBe("2001");
    cerca(r.datos[0][1], 10);
  });
});

describe("base 100", () => {
  const s = serie(mensual("2000-01", [50, 100, 150, 200]));
  it("en una fecha", () => {
    const r = transformar(s, { transformacion: "base_100", base: { fecha: "2000-02" } });
    expect(r.datos.map((d) => d[1])).toEqual([50, 100, 150, 200]);
    expect(r.unidad).toBe("índice, 2000-02 = 100");
  });
  it("con el promedio de un período", () => {
    const r = transformar(s, { transformacion: "base_100", base: { desde: "2000-01", hasta: "2000-04" } });
    expect(r.datos.map((d) => d[1])).toEqual([40, 80, 120, 160]);
    expect(r.unidad).toBe("índice, promedio 2000-01–2000-04 = 100");
  });
  it("falla si no hay dato en la fecha base", () => {
    expect(() => transformar(s, { transformacion: "base_100", base: { fecha: "1999-12" } })).toThrow("No hay dato en 1999-12");
  });
});

describe("período y advertencias", () => {
  const s = serie(mensual("2005-01", Array.from({ length: 48 }, (_, k) => 100 + k)), {
    advertencias: [
      { id: "q.a.intervencion", desde: "2007-01", hasta: "2015-12", tipo: "intervencion", descripcion: "a" },
      { id: "q.a.abierto", desde: "2008-06", hasta: null, tipo: "metodologia", descripcion: "b" },
      { id: "q.a.viejo", desde: "1990-01", hasta: "1999-12", tipo: "cobertura", descripcion: "c" },
    ],
  });
  it("recorta al período y devuelve solo los quiebres que se cruzan", () => {
    const r = transformar(s, { desde: "2005", hasta: "2006" });
    expect(r.datos).toHaveLength(24);
    expect(r.advertencias).toEqual([]);
    const r2 = transformar(s, { desde: "2006-06" });
    expect(r2.advertencias.map((a) => a.id)).toEqual(["q.a.intervencion", "q.a.abierto"]);
  });
  it("un período anual sin hasta cubre todo el año", () => {
    const r = transformar(s, { desde: "2008", hasta: "2008" });
    expect(r.datos[r.datos.length - 1][0]).toBe("2008-12");
    expect(r.advertencias.map((a) => a.id)).toEqual(["q.a.intervencion", "q.a.abierto"]);
  });
});

describe("disponibles", () => {
  it("respeta lo que declara la variante", () => {
    expect(disponibles(serie(mensual("2000-01", [1, 2]), { transformaciones: [] }))).toEqual({
      transformaciones: ["nivel"], frecuencias: [], mediaMovil: false,
    });
    expect(() => transformar(serie(mensual("2000-01", [1, 2]), { transformaciones: [] }), { transformacion: "var_mensual" }))
      .toThrow(ErrorTransformacion);
  });
});

describe("moneda de cada época", () => {
  it("solo ofrece el nivel: las variaciones cruzarían los cambios de signo monetario", () => {
    const s = serie(mensual("1985-01", [1, 2, 3]), { moneda: "moneda_de_epoca" });
    expect(disponibles(s)).toEqual({ transformaciones: ["nivel"], frecuencias: [], mediaMovil: false });
    expect(() => transformar(s, { transformacion: "var_mensual" })).toThrow(ErrorTransformacion);
  });
});
