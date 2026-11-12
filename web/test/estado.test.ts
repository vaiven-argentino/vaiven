// Estado del explorador en la URL: abrir una URL reproduce la vista, y una vista se vuelve a escribir igual.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoDesdeUrl, opcionesDe, porDefecto, serieDeUrl, serieVista, urlDesdeEstado, type Documento, type IndiceSerie } from "../src/lib/estado";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const catalogo = JSON.parse(readFileSync(join(EXPORT, "catalogo.json"), "utf-8")) as {
  series: Array<{ id: string; codigo: string; nombre: string; bloque: string; variante_por_defecto: string; variantes: Array<{ id: string; nombre: string; estado: string; archivo: string | null }> }>;
};
const indice: IndiceSerie[] = catalogo.series.map((s) => ({
  id: s.id, codigo: s.codigo, nombre: s.nombre, bloque: s.bloque, variante_por_defecto: s.variante_por_defecto,
  variantes: s.variantes.filter((v) => v.estado === "publicada" && v.archivo).map((v) => ({ id: v.id, nombre: v.nombre, archivo: v.archivo! })),
}));
const doc = (s: string, v: string): Documento => JSON.parse(readFileSync(join(EXPORT, "series", s, `${v}.json`), "utf-8"));

/** De una URL a un estado y de vuelta. */
function idaYVuelta(url: string) {
  const q = new URLSearchParams(url);
  const { serie, variante } = serieDeUrl(q, indice);
  const d = doc(serie.id, variante);
  const { estado, avisos } = estadoDesdeUrl(q, serie.id, variante, d);
  return { estado, avisos, url: urlDesdeEstado(estado, d, indice), d };
}

describe("ida y vuelta de la URL", () => {
  const canonicas = [
    "",
    "?t=var_mensual&desde=1985-06&hasta=1988-08&sh=plan&ev=1",
    "?s=pib&t=nivel&log=1&sh=gobierno",
    "?s=resultado-fiscal&v=financiero&desde=1993&sh=mandato",
    "?s=int-pib&p=ARG%2CBRA%2CCHL%2CURY%2CUSA%2CWLD&t=indice_desde_tasas&base=2001&desde=2001&hasta=2011",
    "?s=tc-oficial&v=moneda-de-epoca&pa=1&t=var_interanual&sh=regimen_cambiario",
    "?s=salario-real&m=&mm=12",
    "?s=reservas&f=anual&desde=1983&sh=ministro",
    "?s=desocupacion&sh=catedra&ev=1",
  ];
  it.each(canonicas)("%s", (url) => {
    const r = idaYVuelta(url);
    expect(r.avisos).toEqual([]);
    expect(r.url).toBe(url);
    // Y el estado que sale de la URL canónica es el mismo.
    expect(idaYVuelta(r.url).estado).toEqual(r.estado);
  });

  it("sin parámetros, la inflación con su vista inicial", () => {
    const r = idaYVuelta("");
    expect(r.estado).toMatchObject({ s: "ipc", v: "oficial", t: "var_interanual", sh: "", ev: false });
    expect(r.estado).toEqual(porDefecto("ipc", "oficial", r.d));
  });

  it("los países: el resaltado va primero y a lo sumo 8", () => {
    const r = idaYVuelta("?s=int-pib&p=ARG,BRA,CHL,URY,USA,WLD,LCN,EUU,EMU,MEX&e=BRA");
    expect(r.estado.p).toHaveLength(8);
    expect(r.estado.p[0]).toBe("BRA");
    expect(r.avisos.join(" ")).toMatch(/pasan de 8/);
    expect(serieVista(r.d, r.estado.p).datos.length).toBeGreaterThan(50);
  });
});

describe("lo que la serie no admite se descarta con aviso", () => {
  it("serie y variante inexistentes", () => {
    const q = new URLSearchParams("?s=no-existe&v=otra");
    const r = serieDeUrl(q, indice);
    expect(r.serie.id).toBe("ipc");
    expect(r.avisos[0]).toMatch(/No hay una serie «no-existe»/);
  });
  it("transformación, medida, frecuencia, sombreado y fechas mal escritas", () => {
    const r = idaYVuelta("?s=reservas&t=var_dic_dic&m=real&f=semanal&sh=papas&desde=83&mm=5");
    expect(r.avisos).toHaveLength(6);
    expect(r.avisos.join(" ")).toMatch(/el inicio mal escrito/);
    expect(r.url).toBe("?s=reservas");
  });
});

describe("opciones para la librería", () => {
  it("base 100 sin base elegida usa el primer año con dato", () => {
    const d = doc("reservas", "brutas");
    const { estado } = estadoDesdeUrl(new URLSearchParams("?s=reservas&t=base_100"), "reservas", "brutas", d);
    expect(opcionesDe(estado, serieVista(d, [])).base).toEqual({ desde: "1970", hasta: "1970" });
  });
  it("% del PIB toma el PIB por defecto de los insumos", () => {
    const d = doc("cuenta-corriente", "larga");
    const { estado } = estadoDesdeUrl(new URLSearchParams("?s=cuenta-corriente&m=pct_pib"), "cuenta-corriente", "larga", d);
    expect(opcionesDe(estado, serieVista(d, [])).denominador).toBe("cada-base");
  });
});
