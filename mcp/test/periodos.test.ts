// listar_periodos y periodo_en_fecha, con un registro sintético (los datos reales se prueban cuando estén publicados).
import { describe, expect, it } from "vitest";
import { ErrorHerramienta, Repositorio } from "../src/datos";
import { listarPeriodos, periodoEnFecha } from "../src/herramientas/periodos";
import { ESQUEMAS } from "../src/servidor";
import { repoCon, repoReal } from "./ayuda";

const f = (para: string, referencia = "Decreto X") => ({ para, tipo: "norma", referencia, publicado: "1983-12-12" });
const gob = (id: string, nombre: string, desde: string, hasta: string | null, caracter = "constitucional", extra = {}) => ({
  id, tipo: "gobierno", nombre, nombre_corto: nombre, desde, hasta, caracter, cortes: { desde: "hecho", ...(hasta ? { hasta: "hecho" } : {}) },
  fuentes: [f("ambas")], ...extra,
});
const PERIODOS = {
  esquema: "periodos-1.0", version_datos: "2026-11-11T21:00:00Z", descripcion: "", fuente: "", licencia: "CC-BY-4.0",
  tipos: [
    { id: "gobierno", nombre: "Gobiernos", cantidad: 5 }, { id: "ministro", nombre: "Ministros de Economía", cantidad: 2 },
    { id: "plan", nombre: "Planes de estabilización", cantidad: 1 }, { id: "regimen_cambiario", nombre: "Regímenes cambiarios", cantidad: 1 },
    { id: "catedra", nombre: "Etapas de la política económica (curso)", cantidad: 1 },
  ],
  periodos: [
    gob("p.gobierno.de-la-rua", "Fernando de la Rúa", "1999-12-10", "2001-12-21"),
    gob("p.gobierno.puerta", "Ramón Puerta", "2001-12-21", "2001-12-23", "interino"),
    gob("p.gobierno.rodriguez-saa", "Adolfo Rodríguez Saá", "2001-12-23", "2001-12-31", "interino"),
    gob("p.gobierno.duhalde", "Eduardo Duhalde", "2001-12-31", "2003-05-25"),
    gob("p.gobierno.cfk", "Cristina Fernández de Kirchner", "2007-12-10", null, "constitucional", {
      mandatos: [
        { id: "p.gobierno.cfk-2007", nombre: "CFK (2007–2011)", nombre_corto: "CFK I", desde: "2007-12-10", hasta: "2011-12-10", fuentes: [f("ambas")] },
        { id: "p.gobierno.cfk-2011", nombre: "CFK (2011–)", nombre_corto: "CFK II", desde: "2011-12-10", hasta: null, fuentes: [f("desde")] },
      ],
    }),
    { id: "p.ministro.cavallo-2001", tipo: "ministro", nombre: "Domingo Cavallo", nombre_corto: "Cavallo", cargo: "Ministro de Economía",
      desde: "2001-03-20", hasta: "2001-12-20", cortes: { desde: "hecho", hasta: "hecho" }, fuentes: [f("ambas")] },
    { id: "p.ministro.frigeri", tipo: "ministro", nombre: "Rodolfo Frigeri", nombre_corto: "Frigeri", cargo: "Ministro de Economía",
      desde: "2001-12-23", hasta: "2002-01-03", cortes: { desde: "hecho", hasta: "hecho" }, fuentes: [f("ambas")] },
    { id: "p.plan.convertibilidad", tipo: "plan", nombre: "Convertibilidad", nombre_corto: "Convertibilidad", desde: "1991-04-01",
      hasta: "2002-01-07", cortes: { desde: "hecho", hasta: "convencional" },
      fuentes: [f("desde", "Ley 23.928"), { para: "hasta", tipo: "convencional", nota: "Fin con la Ley 25.561." }] },
    { id: "p.regimen.convertibilidad", tipo: "regimen_cambiario", nombre: "Convertibilidad", nombre_corto: "Convertibilidad",
      desde: "1991-04-01", hasta: null, cortes: { desde: "hecho" }, fuentes: [f("desde", "Ley 23.928")] },
    { id: "p.catedra.alianza", tipo: "catedra", nombre: "Alianza y crisis de la Convertibilidad", nombre_corto: "Alianza", orden: 6,
      desde: "1999-12-10", hasta: "2002-01-06", cortes: { desde: "hecho", hasta: "hecho" }, fuentes: [f("ambas")] },
  ],
};
const EVENTOS = {
  esquema: "eventos-1.0", version_datos: "2026-11-11T21:00:00Z", descripcion: "", fuente: "", licencia: "CC-BY-4.0", categorias: [],
  eventos: [
    { id: "e.2001-12-01.corralito", fecha: "2001-12-01", vigencia: "2001-12-03", nombre: "Corralito", nombre_corto: "Corralito",
      categoria: "financiero", descripcion: "Restricción a los retiros.", fuentes: [{ tipo: "norma", referencia: "Decreto 1570/2001" }] },
    { id: "e.2001-12-23.default", fecha: "2001-12-23", nombre: "Default", nombre_corto: "Default", categoria: "deuda",
      descripcion: "Anuncio de la suspensión de pagos.", fuentes: [{ tipo: "periodistica", referencia: "Diario" }] },
  ],
};
const repo = repoCon({ "periodos.json": PERIODOS, "eventos.json": EVENTOS });
const HOY = "2026-11-12";

describe("listar_periodos", () => {
  it("lista todo, con convención, advertencias de los cortes convencionales, versión, fuentes y cita", async () => {
    const r = await listarPeriodos(repo, {});
    expect(r.total).toBe(10);
    expect(r.convencion).toMatch(/semiabiertos/);
    expect(r.advertencias.join(" ")).toMatch(/Convertibilidad: el fin \(2002-01-07\) es un corte convencional.*Ley 25\.561/);
    expect(r.version_datos).toBe("2026-11-11T21:00:00Z");
    expect(r.cita).toMatch(/^Vaivén \(2026\)\. Períodos de la política económica argentina, 1970–hoy\. Versión de datos 2026-11-11\. https:\/\/.*\/periodos\/$/);
    expect(r.fuentes[0].licencia).toBe("CC-BY-4.0");
    expect(r.periodos.find((p) => p.id === "p.gobierno.cfk")).toMatchObject({ mandatos: ["p.gobierno.cfk-2007", "p.gobierno.cfk-2011"] });
    expect(r.nota).toMatch(/compacta/);
    expect(r.periodos.find((p) => p.id === "p.ministro.frigeri")).not.toHaveProperty("fuentes");
    const ministros = await listarPeriodos(repo, { tipo: "ministro" });
    expect(ministros.periodos.find((p) => p.id === "p.ministro.frigeri")).toMatchObject({ fuentes: ["norma: Decreto X, publicado 1983-12-12"] });
  });
  it("filtra por tipo y separa los mandatos si se pide", async () => {
    const r = await listarPeriodos(repo, { tipo: "gobierno", por_mandato: true });
    expect(r.periodos.map((p) => p.id)).toContain("p.gobierno.cfk-2011");
    expect(r.periodos.find((p) => p.id === "p.gobierno.cfk-2011")).toMatchObject({ gobierno: "p.gobierno.cfk", caracter: "constitucional", hasta: null });
    expect((await listarPeriodos(repo, { tipo: "catedra" })).tipos).toEqual([{ id: "catedra", nombre: "Etapas de la política económica (curso)" }]);
    await expect(listarPeriodos(repo, { tipo: "plan", por_mandato: true })).rejects.toThrow(ErrorHerramienta);
  });
});

describe("periodo_en_fecha", () => {
  it("un día: lo vigente ese día, con el día del traspaso para el que entra", async () => {
    const r = await periodoEnFecha(repo, { fecha: "2001-12-23" }, HOY);
    expect(r.alcance).toBe("dia");
    expect(r.gobierno.map((p) => p.id)).toEqual(["p.gobierno.rodriguez-saa"]);
    expect(r.ministro.map((p) => p.id)).toEqual(["p.ministro.frigeri"]);
    expect(r.regimen_cambiario[0].id).toBe("p.regimen.convertibilidad");
    expect(r.catedra[0].nombre).toBe("Alianza y crisis de la Convertibilidad");
    expect(r.eventos.map((e) => e.id)).toEqual(["e.2001-12-23.default"]);
    expect(r.nombres_tipos.catedra).toBe("Etapas de la política económica (curso)");
  });
  it("un mes: todo lo que estuvo vigente, con aviso de los varios gobiernos", async () => {
    const r = await periodoEnFecha(repo, { fecha: "2001-12" }, HOY);
    expect(r.rango).toEqual({ desde: "2001-12-01", hasta: "2001-12-31" });
    expect(r.gobierno.map((p) => p.id)).toEqual(["p.gobierno.de-la-rua", "p.gobierno.puerta", "p.gobierno.rodriguez-saa", "p.gobierno.duhalde"]);
    expect(r.advertencias.join(" ")).toMatch(/En ese mes hubo 4 gobiernos/);
    expect(r.eventos).toHaveLength(2);
  });
  it("informa el mandato y el día sin ministro titular", async () => {
    const r = await periodoEnFecha(repo, { fecha: "2012-03-01" }, HOY);
    expect(r.mandato).toEqual([{ id: "p.gobierno.cfk-2011", nombre: "CFK (2011–)", desde: "2011-12-10", hasta: null, gobierno: "p.gobierno.cfk" }]);
    expect(r.advertencias.join(" ")).toMatch(/no había un ministro de Economía titular/);
  });
  it("rechaza fechas inválidas, anteriores a 1970 o futuras", async () => {
    await expect(periodoEnFecha(repo, { fecha: "2001-02-30" }, HOY)).rejects.toThrow(/no existe/);
    await expect(periodoEnFecha(repo, { fecha: "1969-12-31" }, HOY)).rejects.toThrow(/desde 1970/);
    await expect(periodoEnFecha(repo, { fecha: "2027-01" }, HOY)).rejects.toThrow(/posterior a hoy/);
    await expect(periodoEnFecha(repo, { fecha: "1/12/2001" }, HOY)).rejects.toThrow(/AAAA-MM-DD/);
  });
  it("sin los registros publicados, un error que entiende el modelo", async () => {
    const repoSin = new Repositorio({ leer: async () => { throw new Error("404"); } });
    await expect(listarPeriodos(repoSin, {})).rejects.toThrow(/todavía no están publicados/);
  });
});

describe("parámetros estrictos", () => {
  it("rechazan campos desconocidos y fechas mal escritas", () => {
    expect(ESQUEMAS.listar_periodos["~standard"].validate({ tipos: "plan" })).toHaveProperty("issues");
    expect(ESQUEMAS.listar_periodos["~standard"].validate({ tipo: "regimen" })).toHaveProperty("issues");
    expect(ESQUEMAS.periodo_en_fecha["~standard"].validate({ fecha: "2001" })).toHaveProperty("issues");
    expect(ESQUEMAS.periodo_en_fecha["~standard"].validate({ fecha: "2001-12", dia: 1 })).toHaveProperty("issues");
    expect(ESQUEMAS.periodo_en_fecha["~standard"].validate({ fecha: "2001-12-23" })).not.toHaveProperty("issues");
  });
});

describe("con los períodos publicados", () => {
  const real = repoReal();
  it("el 15/6/1985 regían Alfonsín, Sourrouille, el Plan Austral y su tipo fijo", async () => {
    const r = await periodoEnFecha(real, { fecha: "1985-06-15" }, HOY);
    expect(r.gobierno.map((p) => p.id)).toEqual(["p.gobierno.alfonsin"]);
    expect(r.ministro.map((p) => p.id)).toEqual(["p.ministro.sourrouille"]);
    expect(r.plan.map((p) => p.id)).toEqual(["p.plan.austral"]);
    expect(r.regimen_cambiario.map((p) => p.id)).toEqual(["p.regimen.austral-fijo"]);
    expect(r.catedra.map((p) => p.id)).toEqual(["p.catedra.sourrouille"]);
  });
  it("en diciembre de 2001 hubo cuatro gobiernos y el corralito", async () => {
    const r = await periodoEnFecha(real, { fecha: "2001-12" }, HOY);
    expect(r.gobierno).toHaveLength(4);
    expect(r.eventos.map((e) => e.id)).toContain("e.2001-12-01.corralito");
  });
  it("la lista compacta entra en un pedido razonable y cada tipo trae sus fuentes", async () => {
    expect(JSON.stringify(await listarPeriodos(real, {})).length).toBeLessThan(40_000);
    const gob = await listarPeriodos(real, { tipo: "gobierno", por_mandato: true });
    expect(gob.periodos.map((p) => p.id)).toContain("p.gobierno.menem-1995");
    expect(gob.periodos.every((p) => "fuentes" in p && (p as { fuentes: string[] }).fuentes.length > 0)).toBe(true);
    expect(gob.periodos.at(-1)).toMatchObject({ id: "p.gobierno.milei", hasta: null });
  });
  it("las etapas del curso no nombran a la cátedra y aclaran que son de un curso", async () => {
    const r = await listarPeriodos(real, { tipo: "catedra" });
    expect(JSON.stringify(r)).not.toMatch(/cátedra|Cronograma/);
    expect(r.periodos).toHaveLength(11);
    expect(r.aclaracion_etapas).toMatch(/periodización de un curso universitario/);
  });
  it("lista los episodios con sus fases y su confianza", async () => {
    const r = await listarPeriodos(real, { tipo: "episodio" });
    expect(r.periodos.map((p) => p.id)).toEqual(["p.episodio.hiperinflacion-1989-1990"]);
    const hiper = r.periodos[0] as { confianza: unknown; fases: Array<{ id: string }> };
    expect(hiper.confianza).toEqual({ desde: "media", hasta: "alta" });
    expect(hiper.fases.map((x) => x.id)).toEqual(["p.episodio.hiperinflacion-1989", "p.episodio.hiperinflacion-1989-tregua", "p.episodio.hiperinflacion-1990"]);
  });
  it("julio de 1989: el dato mensual va a Menem (77 %) y la hiperinflación está vigente", async () => {
    const r = await periodoEnFecha(real, { fecha: "1989-07" }, HOY);
    expect(r.episodio.map((p) => p.id)).toEqual(["p.episodio.hiperinflacion-1989-1990"]);
    const gob = r.asignacion!.gobierno as { promedio_o_suma: string; saldo_fin_de_mes: string; reparto: Array<{ nombre: string; dias: number }> };
    expect(gob.promedio_o_suma).toBe("Carlos Saúl Menem");
    expect(gob.saldo_fin_de_mes).toBe("Carlos Saúl Menem");
    expect(gob.reparto.map((x) => [x.nombre, x.dias])).toEqual([["Raúl Ricardo Alfonsín", 7], ["Carlos Saúl Menem", 24]]);
  });
  it("diciembre de 2016: avisa los días sin ministro", async () => {
    const r = await periodoEnFecha(real, { fecha: "2016-12" }, HOY);
    expect(r.advertencias.join(" ")).toMatch(/sin ministro de Economía titular ni interino/);
  });
  it("avisa las fechas de confianza baja", async () => {
    const r = await periodoEnFecha(real, { fecha: "1981-12-15" }, HOY);
    expect(r.gobierno.map((p) => p.id)).toEqual(["p.gobierno.lacoste"]);
    expect(r.advertencias.join(" ")).toMatch(/Lacoste: la fecha de inicio \(1981-12-11\) es dudosa/);
    const lista = await listarPeriodos(real, {});
    expect(lista.periodos.find((p) => p.id === "p.gobierno.lacoste")).toMatchObject({ a_confirmar: ["desde"] });
  });
});
