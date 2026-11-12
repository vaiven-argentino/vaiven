// Estado del explorador en la URL: abrir una URL reproduce la vista, y una vista se vuelve a escribir igual.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoDesdeUrl, opcionesDe, porDefecto, serieDeUrl, serieVista, urlDesdeEstado, type Documento, type IndiceSerie } from "../src/lib/estado";
import { avisoFiltroEventos, categoriasEv, escribirEv, leerEv } from "../src/lib/periodos";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const catalogo = JSON.parse(readFileSync(join(EXPORT, "catalogo.json"), "utf-8")) as {
  series: Array<{ id: string; codigo: string; nombre: string; bloque: string; variante_por_defecto: string; variantes: Array<{ id: string; nombre: string; estado: string; archivo: string | null }> }>;
};
const indice: IndiceSerie[] = catalogo.series.map((s) => ({
  id: s.id, codigo: s.codigo, nombre: s.nombre, bloque: s.bloque, variante_por_defecto: s.variante_por_defecto,
  variantes: s.variantes.filter((v) => v.estado === "publicada" && v.archivo).map((v) => ({ id: v.id, nombre: v.nombre, archivo: v.archivo! })),
}));
const doc = (s: string, v: string): Documento => JSON.parse(readFileSync(join(EXPORT, "series", s, `${v}.json`), "utf-8"));
const registroEventos = JSON.parse(readFileSync(join(EXPORT, "eventos.json"), "utf-8")) as { categorias: Array<{ id: string; nombre: string }> };
const CATEGORIAS = categoriasEv(registroEventos);

/** De una URL a un estado y de vuelta. */
function idaYVuelta(url: string) {
  const q = new URLSearchParams(url);
  const { serie, variante } = serieDeUrl(q, indice);
  const d = doc(serie.id, variante);
  const { estado, avisos } = estadoDesdeUrl(q, serie.id, variante, d, CATEGORIAS);
  return { estado, avisos, url: urlDesdeEstado(estado, d, indice, CATEGORIAS), d };
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
    "?desde=1970&ev=cambiario%2Cdeuda",
    "?s=pib&sh=gobierno&ev=deuda%2Cepisodio",
    "?t=var_mensual&desde=1988&hasta=1991&ev=episodio",
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
    expect(r.estado).toMatchObject({ s: "ipc", v: "oficial", t: "var_interanual", sh: "", ev: [] });
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
    const { estado } = estadoDesdeUrl(new URLSearchParams("?s=reservas&t=base_100"), "reservas", "brutas", d, CATEGORIAS);
    expect(opcionesDe(estado, serieVista(d, [])).base).toEqual({ desde: "1970", hasta: "1970" });
  });
  it("% del PIB toma el PIB por defecto de los insumos", () => {
    const d = doc("cuenta-corriente", "larga");
    const { estado } = estadoDesdeUrl(new URLSearchParams("?s=cuenta-corriente&m=pct_pib"), "cuenta-corriente", "larga", d, CATEGORIAS);
    expect(opcionesDe(estado, serieVista(d, [])).denominador).toBe("cada-base");
  });
});

describe("filtro de eventos (parámetro ev)", () => {
  it("las categorías son las de eventos.json más los episodios, al final", () => {
    expect(CATEGORIAS).toEqual(["cambiario", "monetario", "financiero", "fiscal", "deuda", "crisis", "institucional", "episodio"]);
  });
  it("ev=1 marca todo, episodios incluidos, y todo se vuelve a escribir como 1", () => {
    expect(leerEv("1", CATEGORIAS).ev).toEqual(CATEGORIAS);
    expect(escribirEv(CATEGORIAS, CATEGORIAS)).toBe("1");
    expect(escribirEv([...CATEGORIAS].reverse(), CATEGORIAS)).toBe("1");
  });
  it("sin ev o vacío, nada", () => {
    expect(leerEv(null, CATEGORIAS)).toEqual({ ev: [], avisos: [] });
    expect(leerEv("", CATEGORIAS)).toEqual({ ev: [], avisos: [] });
    expect(escribirEv([], CATEGORIAS)).toBe("");
  });
  it("una lista se ordena en la forma canónica, sin repetidos ni mayúsculas", () => {
    const { ev, avisos } = leerEv("deuda, Cambiario,deuda", CATEGORIAS);
    expect(ev).toEqual(["cambiario", "deuda"]);
    expect(avisos).toEqual([]);
    expect(escribirEv(ev, CATEGORIAS)).toBe("cambiario,deuda");
  });
  it("lo que no es una categoría se ignora con un aviso", () => {
    const r = leerEv("deuda,politico", CATEGORIAS);
    expect(r.ev).toEqual(["deuda"]);
    expect(r.avisos).toEqual(["La URL pedía una categoría de eventos que no existe («politico»): se ignoró."]);
    const nada = idaYVuelta("?ev=x,y");
    expect(nada.estado.ev).toEqual([]);
    expect(nada.avisos.join(" ")).toContain("«x, y»");
    expect(nada.url).toBe("");
  });
  it("el aviso dice cuántos eventos quedan afuera, solo con un filtro parcial", () => {
    const cats = registroEventos.categorias;
    expect(avisoFiltroEventos(12, 30, ["cambiario", "deuda"], cats)).toBe("Se muestran 12 de 30 eventos (filtro: cambiario, deuda).");
    expect(avisoFiltroEventos(1, 4, ["deuda", "episodio"], cats)).toBe("Se muestra 1 de 4 eventos (filtro: deuda, episodios).");
    expect(avisoFiltroEventos(30, 30, CATEGORIAS, cats)).toBe("");
    expect(avisoFiltroEventos(0, 0, [], cats)).toBe("");
  });
});
