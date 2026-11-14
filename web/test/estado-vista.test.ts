// URL con varias series (SPEC 6.2, fase 4c/4d): parámetros con sufijo, comunes sin número, renumeración, avisos y
// forma canónica. Las URL de una sola serie las cubre regresion-4b.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seriesDeUrl, urlDesdeVista, vistaDesdeUrl, type Documento, type IndiceSerie } from "../src/lib/estado";
import { categoriasEv } from "../src/lib/periodos";

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
  const { pedidas, avisos } = seriesDeUrl(q, indice);
  const r = vistaDesdeUrl(q, pedidas, pedidas.map((p) => doc(p.serie.id, p.variante)), CATEGORIAS);
  return { ...r, avisos: [...avisos, ...r.avisos], url: urlDesdeVista(r.estado, r.docs, indice, CATEGORIAS) };
}

describe("ida y vuelta con varias series", () => {
  const canonicas = [
    "?s2=pib",
    "?s=pib&desde=1995&hasta=2010&s2=desocupacion",
    "?t=var_mensual&desde=1988&hasta=1991&sh=gobierno&ev=1&s2=tc-oficial&t2=var_mensual",
    "?s=reservas&s2=ipc&s3=desocupacion&s4=pib&ejes=paneles",
    "?s=pib&s2=int-pib&p2=ARG,BRA",
    "?s=salario-real&s2=ipc&t2=nivel&log2=0&ejes=doble",
  ];
  it.each(canonicas)("%s", (url) => {
    const r = leer(url);
    expect(r.avisos).toEqual([]);
    expect(r.url).toBe(url);
    expect(leer(r.url).estado).toEqual(r.estado);
  });

  it("el período, el sombreado y los eventos son los de la serie 1 en todas", () => {
    const { estado } = leer("?s=pib&s2=ipc&desde=1995&sh=gobierno&ev=1");
    expect(estado.series.map((e) => [e.s, e.desde, e.sh, e.ev.length > 0])).toEqual([["pib", "1995", "gobierno", true], ["ipc", "1995", "gobierno", true]]);
  });

  it("sin `desde`, el período por defecto es el de la vista inicial de la serie 1", () => {
    const { estado } = leer("?s2=pib");
    expect(estado.series[0].s).toBe("ipc");
    expect(estado.series[1].desde).toBe(estado.series[0].desde);
    expect(estado.series[0].desde).not.toBe("");
  });

  it("cada serie arranca con su propia vista inicial: lo que coincide no se escribe", () => {
    const { estado, url } = leer("?s=pib&s2=ipc");
    expect(estado.series[1].t).toBe("var_interanual");
    expect(url).toBe("?s=pib&s2=ipc");
  });
});

describe("avisos y renumeración", () => {
  it("un índice sin su `s` se ignora con un aviso", () => {
    const r = leer("?s=pib&t3=nivel&v3=oficial");
    expect(r.estado.series).toHaveLength(1);
    expect(r.avisos).toEqual(["La URL tiene parámetros de la serie 3 (v3, t3) sin `s3`: se ignoraron."]);
    expect(r.url).toBe("?s=pib");
  });
  it("si falta un índice intermedio, las series se renumeran", () => {
    const r = leer("?s=pib&s3=reservas&f3=anual");
    expect(r.avisos).toEqual([]);
    expect(r.estado.series.map((e) => [e.s, e.f])).toEqual([["pib", ""], ["reservas", "anual"]]);
    expect(r.url).toBe("?s=pib&s2=reservas&f2=anual");
  });
  it("una segunda serie internacional se ignora con un aviso", () => {
    const r = leer("?s=int-pib&s2=int-pib-per-capita&s3=ipc");
    expect(r.estado.series.map((e) => e.s)).toEqual(["int-pib", "ipc"]);
    expect(r.avisos).toEqual([expect.stringMatching(/^La serie 2 \(.*\) es internacional, y hay una como máximo por vista: se ignoró\.$/)]);
    expect(r.url).toBe("?s=int-pib&s2=ipc");
  });
  it("más de 4 series: se ignoran las que sobran", () => {
    const r = leer("?s2=pib&s3=reservas&s4=desocupacion&s5=tc-oficial");
    expect(r.estado.series).toHaveLength(4);
    expect(r.avisos).toEqual(["Se comparan hasta 4 series: se ignoraron las series 5 de la URL."]);
  });
  it("un parámetro que la serie no admite se ignora con un aviso que nombra la serie", () => {
    const r = leer("?s2=reservas&t2=var_dic_dic");
    expect(r.avisos).toEqual(["Serie 2: La URL pedía una transformación («var_dic_dic»), que esta serie no admite: se ignoró."]);
  });
  it("una disposición que no existe se ignora con un aviso", () => {
    const r = leer("?s2=pib&ejes=triple");
    expect(r.estado.ejes).toBe("");
    expect(r.avisos).toEqual(["La URL pedía una disposición que no existe («triple»; usá `ejes=paneles` o `ejes=doble`): se ignoró."]);
  });
  it("una serie que no existe en el lugar 2: se muestra la inicial, con un aviso que nombra la serie", () => {
    const r = leer("?s=pib&s2=no-existe");
    expect(r.avisos).toEqual(["Serie 2: No hay una serie «no-existe»: se muestra la inflación (IPC)."]);
  });
});
