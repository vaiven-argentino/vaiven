// Explorador con varias series (SPEC 6.2, PR B de la 4c/4d): agregar y quitar series con su color, la serie repetida,
// los nombres de archivo, el CSV largo y las hojas del XLSX. Las reglas de la vista (URL, disposición, alineación) las
// prueban estado-vista.test.ts, paquetes/grafico y paquetes/transformaciones.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLUMNAS_LARGO, csvLargo, hojasVista, type VistaDescargaVarias } from "../src/lib/descarga";
import { porDefecto, seriesDeUrl, urlDesdeVista, vistaDesdeUrl, type Documento, type IndiceSerie } from "../src/lib/estado";
import { categoriasEv } from "../src/lib/periodos";
import { agregarSerie, colorLibre, igualarComunes, nombreArchivoVista, puedeAgregar, quitarSerie, repetida } from "../src/lib/vista";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const catalogo = JSON.parse(readFileSync(join(EXPORT, "catalogo.json"), "utf-8")) as {
  series: Array<{ id: string; codigo: string; nombre: string; bloque: string; variante_por_defecto: string; variantes: Array<{ id: string; nombre: string; estado: string; archivo: string | null }> }>;
};
const indice: IndiceSerie[] = catalogo.series.map((s) => ({
  id: s.id, codigo: s.codigo, nombre: s.nombre, bloque: s.bloque, variante_por_defecto: s.variante_por_defecto,
  variantes: s.variantes.filter((v) => v.estado === "publicada" && v.archivo).map((v) => ({ id: v.id, nombre: v.nombre, archivo: v.archivo! })),
}));
const doc = (s: string, v: string): Documento => JSON.parse(readFileSync(join(EXPORT, "series", s, `${v}.json`), "utf-8"));
const CATEGORIAS = categoriasEv(JSON.parse(readFileSync(join(EXPORT, "eventos.json"), "utf-8")));

function leer(url: string) {
  const q = new URLSearchParams(url);
  const { pedidas } = seriesDeUrl(q, indice);
  return vistaDesdeUrl(q, pedidas, pedidas.map((p) => doc(p.serie.id, p.variante)), CATEGORIAS);
}
const url = (r: ReturnType<typeof leer>) => urlDesdeVista(r.estado, r.docs, indice, CATEGORIAS);

describe("agregar y quitar series", () => {
  it("la serie agregada entra con su vista inicial, salvo el período, el sombreado y los eventos", () => {
    const r = leer("?desde=1995&hasta=2010&sh=gobierno&ev=1");
    const reservas = doc("reservas", "brutas");
    const { vista, colores } = agregarSerie(r.estado, [0], porDefecto("reservas", "brutas", reservas));
    expect(colores).toEqual([0, 1]);
    expect(vista.series[1]).toMatchObject({ s: "reservas", desde: "1995", hasta: "2010", sh: "gobierno", ev: r.estado.series[0].ev });
    expect(urlDesdeVista(vista, [...r.docs, reservas], indice, CATEGORIAS)).toBe("?desde=1995&hasta=2010&sh=gobierno&ev=1&s2=reservas");
  });

  it("al quitar una serie, las siguientes suben y conservan su color", () => {
    const r = leer("?s=reservas&s2=ipc&s3=desocupacion&s4=pib");
    const q = quitarSerie(r.estado, [0, 1, 2, 3], 1);
    expect(q.vista.series.map((e) => e.s)).toEqual(["reservas", "desocupacion", "pib"]);
    expect(q.colores).toEqual([0, 2, 3]);
    // La serie nueva toma el primer color libre: el de la serie quitada.
    expect(colorLibre(q.colores)).toBe(1);
  });

  it("al quitar la serie 1, el período se conserva y la 2 pasa a ser la 1", () => {
    const r = leer("?desde=1990&hasta=2000&sh=ministro&s2=reservas");
    const q = quitarSerie(r.estado, [0, 1], 0);
    expect(q.vista.series).toHaveLength(1);
    expect(q.vista.series[0]).toMatchObject({ s: "reservas", desde: "1990", hasta: "2000", sh: "ministro" });
    expect(urlDesdeVista(q.vista, r.docs.slice(1), indice, CATEGORIAS)).toBe("?s=reservas&desde=1990&hasta=2000&sh=ministro");
  });

  it("con una sola serie no se quita nada, y hasta 4 se puede agregar", () => {
    const r = leer("");
    expect(quitarSerie(r.estado, [0], 0).vista).toBe(r.estado);
    expect(puedeAgregar(r.estado)).toBe(true);
    expect(puedeAgregar(leer("?s2=pib&s3=reservas&s4=desocupacion").estado)).toBe(false);
    expect(() => agregarSerie(leer("?s2=pib&s3=reservas&s4=desocupacion").estado, [0, 1, 2, 3], r.estado.series[0])).toThrow(/hasta 4/);
  });

  it("lo común editado en cualquier serie pasa a todas", () => {
    const r = leer("?s2=reservas");
    const editada = { ...r.estado.series[1], desde: "2001", sh: "plan" as const };
    const v = igualarComunes(r.estado, editada);
    expect(v.series.map((e) => [e.desde, e.sh])).toEqual([["2001", "plan"], ["2001", "plan"]]);
    expect(url({ ...r, estado: v })).toBe("?desde=2001&sh=plan&s2=reservas");
  });
});

describe("serie repetida", () => {
  it("misma serie, variante y transformación: repetida; con otra transformación o variante, no", () => {
    expect(repetida(leer("?t=var_interanual&s2=ipc&t2=var_interanual").estado.series, 1)).toBe(0);
    expect(repetida(leer("?t=var_interanual&s2=ipc&t2=var_mensual").estado.series, 1)).toBe(-1);
    expect(repetida(leer("?t=var_interanual&s2=ipc&v2=provincias&t2=var_interanual").estado.series, 1)).toBe(-1);
  });
});

describe("nombres de archivo con varias series", () => {
  const def = (s: string) => indice.find((x) => x.id === s)?.variante_por_defecto;
  it("las series con «_y_», el período y el sombreado", () => {
    expect(nombreArchivoVista(leer("?desde=1995&hasta=2010&sh=gobierno&s2=reservas").estado.series, def)).toBe("vaiven_ipc_y_reservas_1995_2010_sombreado_gobierno");
  });
  it("la variante, solo si no es la de por defecto o si la serie se repite", () => {
    expect(nombreArchivoVista(leer("?s2=ipc&v2=provincias").estado.series, def)).toBe("vaiven_ipc-oficial_y_ipc-provincias_1993_hoy");
    expect(nombreArchivoVista(leer("?s=resultado-fiscal&v=financiero&s2=pib").estado.series, def)).toBe("vaiven_resultado-fiscal-financiero_y_pib");
  });
});

describe("CSV largo y XLSX de la vista", () => {
  const v: VistaDescargaVarias = {
    filas: [
      { fecha: "1989-07", serie: "ipc", variante: "oficial", transformacion: "variación mensual (%)", unidad: "variación % mensual", valor: 196.6, periodo: "Carlos Saúl Menem", periodo_proporcion: 0.774, otros_periodos: "Alfonsín (23 %)" },
      { fecha: "1989-08", serie: "ipc", variante: "oficial", transformacion: "variación mensual (%)", unidad: "variación % mensual", valor: null, periodo: "Carlos Saúl Menem", periodo_proporcion: 1, otros_periodos: "" },
      { fecha: "1989", serie: "int-pib", variante: "banco-mundial", pais: "ARG", transformacion: "nivel", unidad: "variación % anual, con comas", valor: -7.0, periodo: "Carlos Saúl Menem", periodo_proporcion: 0.5, otros_periodos: "Alfonsín (50 %)" },
    ],
    conPais: true,
    ancha: {
      frecuencia: "anual", columnas: [{ titulo: "1. Inflación minorista (IPC)", unidad: "variación % mensual" }, { titulo: "2. Crecimiento del PIB · Argentina", unidad: "variación % anual" }],
      filas: [["1989", 197.4, -7], ["1990", null, -2.4]], periodos: [{ periodo: "Carlos Saúl Menem (sin mayoría)", periodo_proporcion: 0.476, otros_periodos: "Alfonsín (52 %)" }, { periodo: "Carlos Saúl Menem", periodo_proporcion: 1, otros_periodos: "" }],
    },
    columnaPeriodo: "Gobierno",
    metadatos: [["Vista en el explorador", "https://ejemplo/explorador/?s2=int-pib"]],
    citas: [{ serie: "1. Inflación minorista (IPC)", texto: "T1", apa: "A1", bibtex: "B1" }, { serie: "2. Crecimiento del PIB", texto: "T2", apa: "A2", bibtex: "B2" }],
    periodos: [{ nombre: "Carlos Saúl Menem", desde: "1989-07-08", hasta: "1999-12-10", confianza: "alta", fuentes: "x" }],
  };

  it("CSV: las columnas de la SPEC, con `pais` después de `variante`; celdas vacías sin dato", () => {
    const csv = csvLargo(v).split("\n");
    expect(csv[0]).toBe("fecha,serie,variante,pais,transformacion,unidad,valor,periodo,periodo_proporcion,otros_periodos");
    expect(csv[1]).toBe("1989-07,ipc,oficial,,variación mensual (%),variación % mensual,196.6,Carlos Saúl Menem,0.774,Alfonsín (23 %)");
    expect(csv[2]).toBe("1989-08,ipc,oficial,,variación mensual (%),variación % mensual,,Carlos Saúl Menem,1,");
    expect(csv[3]).toBe('1989,int-pib,banco-mundial,ARG,nivel,"variación % anual, con comas",-7,Carlos Saúl Menem,0.5,Alfonsín (50 %)');
  });

  it("CSV sin serie internacional: sin la columna `pais`; las del período van siempre", () => {
    const solo = csvLargo({ filas: [{ fecha: "2001", serie: "pib", variante: "base-2004", transformacion: "nivel", unidad: "millones", valor: 1 }], conPais: false }).split("\n");
    expect(solo[0]).toBe(COLUMNAS_LARGO.filter((c) => c !== "pais").join(","));
    expect(solo[1]).toBe("2001,pib,base-2004,nivel,millones,1,,,");
  });

  it("XLSX: hoja larga igual al CSV, hoja ancha a la frecuencia común, metadatos, una cita por serie y períodos", () => {
    const hojas = hojasVista(v);
    expect(hojas.map((h) => h.sheet)).toEqual(["Datos (largo)", "Datos (frecuencia común)", "Metadatos", "Cita", "Períodos"]);
    expect(hojas.every((h) => h.sheet.length <= 31)).toBe(true);
    expect(hojas[0].data[0].map((c) => c?.value)).toEqual([...COLUMNAS_LARGO]);
    expect(hojas[0].data[2][6]).toBeNull();
    const ancha = hojas[1].data;
    expect(ancha[0].map((c) => c?.value)).toEqual(["Fecha (anual)", "1. Inflación minorista (IPC)", "2. Crecimiento del PIB · Argentina", "Gobierno", "Proporción del período", "Otros períodos"]);
    expect(ancha[1].map((c) => c?.value ?? null)).toEqual(["Unidad", "variación % mensual", "variación % anual", null, null, null]);
    expect(ancha[3].map((c) => c?.value ?? null)).toEqual(["1990", null, -2.4, "Carlos Saúl Menem", 1, null]);
    expect(hojas[3].data.slice(1).map((f) => f[0]?.value)).toEqual(["1. Inflación minorista (IPC)", "1. Inflación minorista (IPC)", "1. Inflación minorista (IPC)", "2. Crecimiento del PIB", "2. Crecimiento del PIB", "2. Crecimiento del PIB"]);
    // Sin sombreado: ni las columnas del período en la hoja ancha ni la hoja de períodos.
    const sin = hojasVista({ ...v, columnaPeriodo: undefined, periodos: undefined, ancha: { ...v.ancha, periodos: undefined } });
    expect(sin.map((h) => h.sheet)).toEqual(["Datos (largo)", "Datos (frecuencia común)", "Metadatos", "Cita"]);
    expect(sin[1].data[0]).toHaveLength(3);
  });
});
