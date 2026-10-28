// Las cuatro herramientas como funciones, contra el export real.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apa, bibtex, nombreTransformacion, textoCita } from "@vaiven/cita";
import { describe, expect, it } from "vitest";
import { ErrorHerramienta } from "../src/datos";
import { buscarSeries } from "../src/herramientas/buscar";
import { citar } from "../src/herramientas/citar";
import { LIMITE_OBSERVACIONES } from "../src/herramientas/comun";
import { describirSerie } from "../src/herramientas/describir";
import { leerBase, obtenerSerie } from "../src/herramientas/obtener";
import { transformar } from "@vaiven/transformaciones";
import { EXPORT, repoCon, repoReal } from "./ayuda";

const repo = repoReal();
const documento = (s: string, v: string) => JSON.parse(readFileSync(join(EXPORT, "series", s, `${v}.json`), "utf-8"));
const ids = (r: { series: Array<{ id: string }> }) => r.series.map((s) => s.id);
// Los datos de una serie sin dimensión país (en las de país, `datos` es un objeto por país).
type Pares = Array<[string, number | null]>;
const pares = (r: { datos: unknown }) => r.datos as Pares;
const porPais = (r: { datos: unknown }) => r.datos as Record<string, Pares>;
// El catálogo crece por fases: lo esperado se calcula con el catálogo publicado, no con un número fijo.
const catalogo = JSON.parse(readFileSync(join(EXPORT, "catalogo.json"), "utf-8")) as { series: Array<{ id: string; bloque: string; prioridad: string }> };
const deBloque = (b: string) => catalogo.series.filter((s) => s.bloque === b).map((s) => s.id).sort();

describe("buscar_series", () => {
  it("sin filtros lista las series publicadas, con la versión de datos y la nota del catálogo", async () => {
    const r = await buscarSeries(repo, {});
    expect(r.total).toBe(catalogo.series.length);
    expect(r.version_datos).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.notas[0]).toContain("39");
  });
  it("encuentra por sinónimo, sin tildes ni mayúsculas", async () => {
    expect(ids(await buscarSeries(repo, { texto: "Desempleo" }))[0]).toBe("desocupacion");
    expect(ids(await buscarSeries(repo, { texto: "inflación" }))[0]).toBe("ipc");
    expect(ids(await buscarSeries(repo, { texto: "dólar oficial" }))[0]).toBe("tc-oficial");
    expect(ids(await buscarSeries(repo, { texto: "EXT-06" }))).toEqual(["reservas"]);
    expect(ids(await buscarSeries(repo, { texto: "exportación" }))[0]).toBe("exportaciones");
  });
  it("filtra por bloque, prioridad y período", async () => {
    expect(ids(await buscarSeries(repo, { bloque: "sector externo" })).sort()).toEqual(deBloque("Sector externo"));
    expect(deBloque("Sector externo")).toContain("reservas");
    expect((await buscarSeries(repo, { prioridad: "B" })).total).toBe(catalogo.series.filter((s) => s.prioridad === "B").length);
    // La desocupación arranca en 1974: no tiene datos en 1970–1973.
    expect(ids(await buscarSeries(repo, { desde: "1970", hasta: "1973" }))).not.toContain("desocupacion");
  });
  it("informa las variantes pendientes con su estado y su nota", async () => {
    const ipc = (await buscarSeries(repo, { texto: "ipc" })).series[0];
    const cb = ipc.variantes.find((v) => v.id === "cavallo-bertolotto")!;
    expect(cb.estado).toBe("pendiente_licencia");
    expect(cb.nota).toBeTruthy();
  });
  it("sinónimos de la fase 4a y búsqueda por país", async () => {
    expect(ids(await buscarSeries(repo, { texto: "pbi" }))[0]).toBe("pib");
    expect(ids(await buscarSeries(repo, { texto: "déficit" }))[0]).toBe("resultado-fiscal");
    expect(ids(await buscarSeries(repo, { texto: "emisión" }))).toContain("base-monetaria");
    expect(ids(await buscarSeries(repo, { texto: "tcr" })).slice(0, 2).sort()).toEqual(["tcr-bilateral", "tcr-multilateral"]);
    expect(ids(await buscarSeries(repo, { texto: "sueldos" }))[0]).toBe("salario-real");
    const brasil = await buscarSeries(repo, { texto: "Brasil" });
    expect(ids(brasil).sort()).toEqual(["int-pib", "int-pib-per-capita"]);
    expect(brasil.series[0].paises!.map((e) => e.id)).toContain("BRA");
    expect(brasil.series[0].paises_por_defecto![0]).toBe("ARG");
  });
  it("sin coincidencias, lista todo y lo avisa", async () => {
    const r = await buscarSeries(repo, { texto: "soja" });
    expect(r.total).toBe(catalogo.series.length);
    expect(r.notas.at(-1)).toContain("soja");
  });
});

describe("describir_serie", () => {
  it("acepta el código y el id de variante", async () => {
    expect((await describirSerie(repo, { id: "TRA-01" })).id).toBe("desocupacion");
    const r = await describirSerie(repo, { id: "ipc.provincias" });
    expect(r.id).toBe("ipc");
    expect(r.variante_pedida).toBe("provincias");
  });
  it("trae variantes, quiebres, fuentes, bibliografía y cita", async () => {
    const r = await describirSerie(repo, { id: "desocupacion" });
    const total = r.variantes.find((v) => v.id === "total-urbano")! as Record<string, unknown>;
    expect(total.tramos).toHaveLength(2);
    expect(total.transformaciones).toEqual(["nivel", "base_100"]);
    expect((total.cita as { bibtex: string }).bibtex).toContain("@misc{vaiven_desocupacion_total-urbano".replace("-", "_"));
    expect(r.variantes.find((v) => v.id === "empalmada")!.estado).toBe("pendiente");
    expect(r.quiebres.map((q) => q.id)).toContain("q.desocupacion.eph-2003");
    expect(r.fuentes.length).toBeGreaterThan(0);
    expect(r.bibliografia.map((b) => b.id)).toEqual(["OS2006-G3"]);
  });
  it("informa medidas, deflactores, pesos actuales y países", async () => {
    const salario = await describirSerie(repo, { id: "salario-real" });
    const ripte = salario.variantes.find((v) => v.id === "ripte")! as Record<string, unknown>;
    expect(ripte.medidas).toEqual(["real", "en_dolares"]);
    expect(ripte.deflactores).toEqual(["ipc.oficial", "ipc.provincias"]);
    expect(ripte.vista_inicial).toEqual({ transformacion: "nivel", medida: "real" });
    const tc = await describirSerie(repo, { id: "tc-oficial" });
    const epoca = tc.variantes.find((v) => v.id === "moneda-de-epoca")! as Record<string, unknown>;
    expect(epoca.transformaciones).toEqual(["nivel"]);
    expect((epoca.con_pesos_actuales as { transformaciones: string[] }).transformaciones).toContain("var_interanual");
    const int = await describirSerie(repo, { id: "INT-01" });
    expect(int.paises!.length).toBeGreaterThan(5);
    expect((int.variantes[0] as Record<string, unknown>).transformaciones).toEqual(["nivel", "indice_desde_tasas"]);
  });
  it("una serie inexistente da un error que lista las publicadas", async () => {
    await expect(describirSerie(repo, { id: "pbi" })).rejects.toThrow(/No hay ninguna serie «pbi».*ipc \(PRE-01\)/);
  });
});

describe("obtener_serie", () => {
  it("IPC: inflación interanual de diciembre de 2023 (211,4 % según el INDEC)", async () => {
    const r = await obtenerSerie(repo, { id: "ipc", transformacion: "var_interanual", desde: "2023-12", hasta: "2023-12" });
    expect(r.datos).toEqual([["2023-12", 211.408]]);
    expect(r.unidad).toBe("variación % interanual");
    expect(r.cita).toMatch(/Transformación: variación interanual \(%\) \(calculada por Vaivén\)\.$/);
    for (const k of ["advertencias", "version_datos", "fuentes", "cita"]) expect(r).toHaveProperty(k);
  });
  it("IPC 2007–2015: avisa la intervención del INDEC", async () => {
    const r = await obtenerSerie(repo, { id: "ipc", transformacion: "var_interanual", desde: "2007", hasta: "2015" });
    expect(r.advertencias.map((a) => a.id)).toContain("q.ipc.2007-2015");
  });
  it("sin quiebres en el rango no hay advertencias de quiebres", async () => {
    const r = await obtenerSerie(repo, { id: "ipc", transformacion: "var_interanual", desde: "1993", hasta: "2001" });
    expect(r.advertencias).toEqual([]);
  });
  it("reservas: el dato excluido de marzo de 1979 va como null, con su motivo", async () => {
    const r = await obtenerSerie(repo, { id: "reservas", desde: "1979-01", hasta: "1979-06" });
    expect(pares(r).find(([f]) => f === "1979-03")).toEqual(["1979-03", null]);
    expect(r.excluidos[0].motivo).toContain("675,8");
    expect(r.notas.join(" ")).toContain("no los interpola");
  });
  it("desocupación: frecuencia mixta y cambio de encuesta", async () => {
    const r = await obtenerSerie(repo, { id: "desocupacion", desde: "2001", hasta: "2004" });
    expect(r.frecuencias).toEqual([
      { desde: "2001-05", hasta: "2003-05", frecuencia: "semestral" },
      { desde: "2003-07", hasta: "2004-10", frecuencia: "trimestral" },
    ]);
    expect(r.advertencias.map((a) => a.id)).toContain("q.desocupacion.eph-2003");
    expect(pares(r).find(([f]) => f === "2002-05")![1]).toBe(21.5);
  });
  it("desocupación anual: 2003 mezcla frecuencias y queda sin dato", async () => {
    const r = await obtenerSerie(repo, { id: "desocupacion", frecuencia: "anual", desde: "2002", hasta: "2004" });
    expect(r.datos).toEqual([["2002", 19.65], ["2003", null], ["2004", 13.5209]]);
    expect(r.notas.join(" ")).toContain("2003");
  });
  it("base 100 con el promedio de un año", async () => {
    const r = await obtenerSerie(repo, { id: "exportaciones", transformacion: "base_100", base: "1993", desde: "1993", hasta: "1994" });
    expect(r.datos).toEqual([["1993", 100], ["1994", 120.746]]);
    expect(r.unidad).toBe("índice, promedio 1993 = 100");
  });
  it("una variante pendiente da error con su estado, su nota y las publicadas", async () => {
    await expect(obtenerSerie(repo, { id: "ipc", variante: "cavallo-bertolotto" }))
      .rejects.toThrow(/pendiente de licencia.*Variantes publicadas: oficial, provincias\./);
  });
  it("una transformación que la variante no admite da error con las que sí", async () => {
    await expect(obtenerSerie(repo, { id: "desocupacion", transformacion: "var_mensual" }))
      .rejects.toThrow(/no admite «var_mensual».*transformaciones nivel, base_100/);
  });
  it("base sin base_100, base inválida y período invertido dan error", async () => {
    await expect(obtenerSerie(repo, { id: "ipc", base: "2004" })).rejects.toThrow(ErrorHerramienta);
    expect(() => leerBase("enero")).toThrow(ErrorHerramienta);
    await expect(obtenerSerie(repo, { id: "ipc", desde: "2005", hasta: "2001" })).rejects.toThrow(/invertido/);
  });
  it("medida real: carga el IPC elegido y da lo mismo que la librería", async () => {
    const r = await obtenerSerie(repo, { id: "salario-real", medida: "real", deflactor: "provincias", base_real: "2016", desde: "2017", hasta: "2017" });
    const doc = documento("salario-real", "ripte");
    const esperado = transformar(doc, { medida: "real", deflactor: "ipc.provincias", baseReal: "2016", desde: "2017", hasta: "2017" },
      { series: { "ipc.provincias": documento("ipc", "provincias") } });
    expect(pares(r)).toEqual(esperado.datos.map(([f, v]) => [f, v === null ? null : Number(v.toPrecision(6))]));
    expect(r.unidad).toBe("pesos de 2016");
    expect(r.deflactor).toBe("ipc.provincias");
    expect(r.cita).toContain("a precios constantes de 2016, deflactada con el IPC «ipc.provincias»");
  });
  it("% del PIB y dólares: unidad, advertencias del insumo y reglas de los stocks", async () => {
    const cc = await obtenerSerie(repo, { id: "cuenta-corriente", medida: "pct_pib", desde: "2001", hasta: "2002" });
    expect(cc.unidad).toBe("% del PIB");
    const [d2001, d2002] = pares(cc).map(([, v]) => v!);
    expect(d2001).toBeLessThan(0);   // déficit en 2001, superávit tras la devaluación de 2002
    expect(d2002).toBeGreaterThan(0);
    expect(cc.advertencias.map((a) => a.id)).toContain("q.pib-dolares.tipo-de-cambio");
    await expect(obtenerSerie(repo, { id: "reservas", medida: "pct_pib" })).rejects.toThrow(/frecuencia anual/);
    const usd = await obtenerSerie(repo, { id: "resultado-fiscal", medida: "en_dolares", frecuencia: "anual", desde: "2018", hasta: "2018" });
    expect(usd.unidad).toBe("millones de US$");
  });
  it("pesos actuales: 10.000 australes son 1 peso", async () => {
    const r = await obtenerSerie(repo, { id: "tc-oficial.moneda-de-epoca", pesos_actuales: true, desde: "1991-04", hasta: "1991-04" });
    expect(pares(r)[0][1]).toBeCloseTo(0.981, 3);
    expect(r.unidad).toBe("pesos actuales por dólar");
    await expect(obtenerSerie(repo, { id: "tc-oficial.moneda-de-epoca", transformacion: "var_interanual" }))
      .rejects.toThrow(/Primero pasala a pesos actuales.*con pesos_actuales: transformaciones nivel, var_mensual, var_interanual/);
  });
  it("países: selección inicial por defecto, ISO3 sin distinguir mayúsculas e índice desde tasas", async () => {
    const def = await obtenerSerie(repo, { id: "int-pib", desde: "2020", hasta: "2020" });
    const doc = documento("int-pib", "banco-mundial");
    expect(Object.keys(porPais(def))).toEqual(doc.entidades_por_defecto);
    expect(def.n_observaciones).toBe(doc.entidades_por_defecto.length);
    const r = await obtenerSerie(repo, { id: "int-pib", paises: ["arg", "BRA"], transformacion: "indice_desde_tasas", base: "2000", desde: "2000", hasta: "2002" });
    expect(porPais(r).ARG[0]).toEqual(["2000", 100]);
    expect(r.paises).toEqual([{ id: "ARG", nombre: "Argentina" }, { id: "BRA", nombre: "Brasil" }]);
    expect(r.unidad).toBe("índice, 2000 = 100");
    expect(r.cita).toContain("entidades ARG y BRA, índice desde las tasas");
    await expect(obtenerSerie(repo, { id: "int-pib", paises: ["XXX"] })).rejects.toThrow(/no tiene XXX.*ARG \(Argentina\)/);
    await expect(obtenerSerie(repo, { id: "ipc", paises: ["ARG"] })).rejects.toThrow(/no tiene dimensión país/);
  });
  it("deflactor sin medida real y medida que la variante no admite dan error", async () => {
    await expect(obtenerSerie(repo, { id: "salario-real", deflactor: "provincias" })).rejects.toThrow(/solo se usan con medida «real»/);
    await expect(obtenerSerie(repo, { id: "salario-real", medida: "real", deflactor: "cavallo" })).rejects.toThrow(/Deflactores: ipc.oficial, ipc.provincias/);
    await expect(obtenerSerie(repo, { id: "ipc", medida: "real" })).rejects.toThrow(/no admite la medida «real».*ninguna medida/);
  });
  it(`el límite de ${LIMITE_OBSERVACIONES} observaciones suma todos los países`, async () => {
    const real = documento("int-pib", "banco-mundial");
    const largos = Object.fromEntries(Object.keys(real.datos).map((p) => [p, Array.from({ length: 600 }, (_, i) => [String(1400 + i), 1])]));
    const grande = repoCon({ "series/int-pib/banco-mundial.json": { ...real, datos: largos } });
    await expect(obtenerSerie(grande, { id: "int-pib", paises: Object.keys(largos) })).rejects.toThrow(/límite es 10000.*pedí menos países/);
    expect((await obtenerSerie(grande, { id: "int-pib", paises: ["ARG"] })).n_observaciones).toBe(600);
  });
  it(`más de ${LIMITE_OBSERVACIONES} observaciones pide acotar`, async () => {
    const real = documento("reservas", "brutas");
    const datos: Array<[string, number]> = [];
    for (let i = 0; i < LIMITE_OBSERVACIONES + 12; i++) datos.push([`${1000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, 1]);
    const grande = repoCon({ "series/reservas/brutas.json": { ...real, datos, excluidos: [] } });
    await expect(obtenerSerie(grande, { id: "reservas" })).rejects.toThrow(/límite es 10000/);
    expect((await obtenerSerie(grande, { id: "reservas", desde: "1900" })).n_observaciones).toBeLessThan(LIMITE_OBSERVACIONES);
  });
});

describe("citar", () => {
  it("devuelve lo mismo que la ficha de la web (@vaiven/cita sobre el mismo documento)", async () => {
    const doc = documento("reservas", "brutas");
    const r = await citar(repo, { id: "reservas" });
    expect(r.texto).toBe(textoCita(doc));
    expect(r.apa).toBe(apa(doc));
    expect(r.bibtex).toBe(bibtex(doc));
    expect(r.url).toBe("https://vaiven.argentino.workers.dev/series/reservas/");
  });
  it("con transformación, la nombra igual que la ficha; con formato, solo ese", async () => {
    const doc = documento("ipc", "provincias");
    const r = await citar(repo, { id: "ipc.provincias", formato: "apa", transformacion: "var_interanual", frecuencia: "anual" });
    expect(r.apa).toBe(apa(doc, nombreTransformacion({ frecuencia: "anual", transformacion: "var_interanual" })));
    expect(r).not.toHaveProperty("bibtex");
  });
  it("con medida y países, la cita los nombra", async () => {
    const r = await citar(repo, { id: "salario-real", medida: "real", deflactor: "provincias", formato: "texto" });
    expect(r.texto).toContain("deflactada con el IPC «ipc.provincias»");
    const int = await citar(repo, { id: "int-pib", paises: ["arg", "bra"], formato: "texto" });
    expect(int.texto).toContain("entidades ARG y BRA");
  });
  it("una variante pendiente no se cita", async () => {
    await expect(citar(repo, { id: "desocupacion", variante: "empalmada" })).rejects.toThrow(/pendiente/);
  });
});
