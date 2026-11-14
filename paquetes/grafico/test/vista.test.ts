// armarVista (SPEC 4.1, 6.2 y 10): con una serie, la misma especificación que armaba el explorador de la 4b; con
// varias, un gráfico, doble eje o paneles, con la guía común y el sombreado y los eventos sobre todos los paneles.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "vega-lite";
import { describe, expect, it } from "vitest";
import {
  serieDeEntidad, tienePais, transformar, type DocumentoEventos, type DocumentoPeriodos, type InsumosCargados, type Resultado,
  type SerieExportada,
} from "@vaiven/transformaciones";
import {
  AVISO_DOBLE_EJE, armarVista, bandasDe, categoriasEv, episodiosEnRango, especificacion, esVariacion, eventosEnRango,
  lecturasGuia, nombreSombreadoEnFrase, numerarQuiebres, opcionesDe, periodosEnRango, resumen, serieVista, seriesDeUrl, contextoDe, tipoDe,
  vistaDesdeUrl, EPISODIO, type Documento, type IndiceSerie, type Tema,
} from "../src/index";

const EXPORT = join(import.meta.dirname, "..", "..", "..", "export");
const leer = <T>(ruta: string): T => JSON.parse(readFileSync(join(EXPORT, ruta), "utf-8")) as T;
const catalogo = leer<{ series: Array<{ id: string; codigo: string; nombre: string; bloque: string; variante_por_defecto: string; variantes: Array<{ id: string; nombre: string; estado: string; archivo: string | null }> }> }>("catalogo.json");
const indice: IndiceSerie[] = catalogo.series.map((s) => ({
  id: s.id, codigo: s.codigo, nombre: s.nombre, bloque: s.bloque, variante_por_defecto: s.variante_por_defecto,
  variantes: s.variantes.filter((v) => v.estado === "publicada" && v.archivo).map((v) => ({ id: v.id, nombre: v.nombre, archivo: v.archivo! })),
}));
const PERIODOS = leer<DocumentoPeriodos>("periodos.json");
const EVENTOS = leer<DocumentoEventos>("eventos.json");
const CATEGORIAS = categoriasEv(EVENTOS);
const TEMA: Tema = {
  fondo: "#fff", texto: "#111", secundario: "#666", linea: "#eee", banda: "#ddd", borde: "#999", serie: "#00a", fuente: "sans-serif",
  periodoA: "#fafafa", periodoB: "#f0f0f0", periodoFacto: "#e0e0e0", periodoFranja: "#d0d0d0",
  paleta: ["#00a", "#a00", "#0a0", "#aa0", "#0aa", "#a0a", "#333", "#888"],
};

/** Todos los insumos que declara una variante (la librería toma los que necesita). */
function insumosDe(docs: Documento[]): InsumosCargados {
  const series: Record<string, SerieExportada> = {};
  let signos: InsumosCargados["signos"];
  for (const d of docs) {
    for (const [medida, insumo] of Object.entries(d.insumos ?? {})) {
      for (const o of insumo!.opciones) {
        if (medida === "pesos_actuales") signos = leer(o.archivo);
        else series[o.id] ??= leer(o.archivo);
      }
    }
  }
  return { series, ...(signos ? { signos } : {}) };
}

function vistaDe(url: string) {
  const q = new URLSearchParams(url);
  const { pedidas } = seriesDeUrl(q, indice);
  const docs = pedidas.map((p) => leer<Documento>(`series/${p.serie.id}/${p.variante}.json`));
  const r = vistaDesdeUrl(q, pedidas, docs, CATEGORIAS);
  return { estado: r.estado, docs: r.docs, insumos: insumosDe(r.docs) };
}

/** El gráfico como lo armaba el explorador de la 4b (web/src/graficos/explorador.ts, `entrada` y `textoResumen`). */
function especificacion4b(url: string, ancho: number, alto: number) {
  const { estado: { series: [estado] }, docs: [doc], insumos } = vistaDe(url);
  const serie = serieVista(doc, estado.p);
  const o = opcionesDe(estado, serie);
  const r = transformar(serie, o, insumos);
  const nombrePais = (id: string) => (tienePais(doc) ? doc.entidades.find((e) => e.id === id)?.nombre : undefined) ?? id;
  const otras = tienePais(doc) ? estado.p.slice(1).map((id) => ({ nombre: nombrePais(id), resultado: transformar(serieDeEntidad(doc, id), o, insumos) })) : [];
  const periodos = estado.sh ? periodosEnRango(PERIODOS, estado.sh, r) : [];
  const eventos = estado.ev.length ? eventosEnRango(EVENTOS, r, estado.ev) : [];
  const episodios = estado.ev.includes(EPISODIO) ? episodiosEnRango(PERIODOS, r) : [];
  const quiebres = numerarQuiebres({ ...serie, advertencias: doc.advertencias });
  const positivos = r.datos.every((d) => d[1] === null || d[1] > 0) && otras.every((x) => x.resultado.datos.every((d) => d[1] === null || d[1] > 0));
  let t = resumen(r, r.unidad, esVariacion(estado.t), quiebres);
  if (periodos.length) {
    // El explorador de la 4b decía el tipo en minúscula («Sombreado por ministros de Economía»).
    t += ` Sombreado por ${nombreSombreadoEnFrase(estado.sh as never, PERIODOS.tipos)}: ${periodos.length === 1 ? "un período" : `${periodos.length} períodos`}, de ${periodos[0].nombre} a ${periodos[periodos.length - 1].nombre}.`;
    t += " Cada dato se asigna al período vigente a mitad de su intervalo (los saldos en nivel, el último día).";
  }
  if (episodios.length) t += ` ${episodios.length === 1 ? "Un episodio marcado" : `${episodios.length} episodios marcados`}: ${episodios.map((x) => x.nombre).join("; ")}.`;
  if (eventos.length) t += ` ${eventos.length === 1 ? "Un evento marcado" : `${eventos.length} eventos marcados`} (lista debajo del gráfico).`;
  const bandas = bandasDe(periodos);
  return especificacion({
    resultado: r, tramos: serie.tramos, empalme: (doc as Documento & { empalme: "yuxtaponer" }).empalme, quiebres, tema: TEMA, esVariacion: esVariacion(estado.t),
    log: estado.log && positivos, alto, ancho, descripcion: t,
    nombre: tienePais(doc) ? nombrePais(estado.p[0]) : undefined, otras: otras.map((x) => ({ nombre: x.nombre, resultado: x.resultado })),
    colores: tienePais(doc), sombreado: bandas.length ? { bandas, franja: estado.sh === "plan" } : undefined, eventos,
    ubicacion: contextoDe(serie.agregacion, o), asignacion: bandas.length && estado.sh ? { periodos, tipo: tipoDe(estado.sh as never) } : undefined, episodios,
  });
}

const armar = (url: string, ancho = 800, alto = 400) => armarVista({ ...vistaDe(url), periodos: PERIODOS, eventos: EVENTOS, tema: TEMA, ancho, alto });

describe("con una serie, el gráfico de la 4b", () => {
  const urls = (JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "web", "test", "regresion", "urls-4b.json"), "utf-8")) as { fijas: string[]; accesos: string[]; fichas: string[] });
  const muestra = [...urls.fijas, ...urls.fichas, ...urls.accesos.filter((_, k) => k % 6 === 0)];
  it.each(muestra)("%s", (url) => {
    for (const [ancho, alto] of [[790, 420], [358, 260]]) {
      expect(armar(url, ancho, alto).especificacion).toEqual(especificacion4b(url, ancho, alto));
    }
  });
});

/** Las capas de un panel o de un eje que dibujan líneas, con su color. */
const lineas = (capas: Array<Record<string, unknown>>) => capas.filter((c) => (c.mark as { type: string }).type === "line");
const valido = (spec: Record<string, unknown>) => expect(() => compile(spec as never)).not.toThrow();

describe("con varias series", () => {
  it("una unidad: un solo gráfico, con una línea por serie en su color y la guía común", () => {
    const v = armar("?s=ipc&s2=ipc&v2=provincias&desde=2007&hasta=2015");
    expect(v.comparacion.disposicion.tipo).toBe("unico");
    const spec = v.especificacion as { layer: Array<Record<string, unknown>>; datasets: { guia: Array<Record<string, string>> } };
    expect(spec.datasets.guia.length).toBeGreaterThan(90);
    expect(Object.keys(spec.datasets.guia[0])).toEqual(["t", "fecha", "s1", "s2"]);
    expect(lineas(spec.layer).length).toBe(2);
    valido(v.especificacion);
  });

  it("dos unidades: doble eje con el aviso fijo, el eje derecho y los ceros alineados", () => {
    const v = armar("?t=var_interanual&desde=2000&hasta=2005&s2=reservas");
    expect(v.comparacion.disposicion.tipo).toBe("doble_eje");
    const spec = v.especificacion as { layer: Array<{ layer: Array<Record<string, unknown>> }>; resolve: unknown; title: { text: string } };
    expect((spec.title.text as unknown as string[]).join(" ")).toBe(AVISO_DOBLE_EJE);
    expect(spec.resolve).toEqual({ scale: { y: "independent" }, axis: { y: "independent" } });
    expect(spec.layer).toHaveLength(2);
    const y = (capas: Array<Record<string, unknown>>) => (lineas(capas)[0].encoding as { y: { scale: { domain?: number[] }; axis: { orient?: string } } }).y;
    expect(y(spec.layer[1].layer).axis.orient).toBe("right");
    // IPC interanual (cruza el 0 en 2002? no: es positivo) y reservas (positivas): los dos rangos incluyen el 0.
    const [a, b] = [y(spec.layer[0].layer).scale.domain!, y(spec.layer[1].layer).scale.domain!];
    expect(-a[0] / (a[1] - a[0])).toBeCloseTo(-b[0] / (b[1] - b[0]), 9);
    valido(v.especificacion);
  });

  it("con ejes=paneles, dos paneles con el eje de fechas solo en el último", () => {
    const v = armar("?t=var_interanual&desde=2000&hasta=2005&s2=reservas&ejes=paneles");
    const spec = v.especificacion as { vconcat: Array<{ layer: Array<{ encoding?: { x?: { axis?: unknown } } }>; height: number }> };
    expect(spec.vconcat).toHaveLength(2);
    // Las capas de la guía común no declaran eje: lo dibujan (o no) las de la serie.
    const deSerie = (c: { data?: { name?: string } }) => c.data?.name !== "guia";
    expect(spec.vconcat[0].layer.filter((c) => c.encoding?.x && deSerie(c as never)).every((c) => c.encoding!.x!.axis === null)).toBe(true);
    expect(spec.vconcat[1].layer.some((c) => c.encoding?.x && c.encoding.x.axis === undefined)).toBe(true);
    expect(spec.vconcat.every((p) => p.height >= 180)).toBe(true);
    valido(v.especificacion);
  });

  it("en pantallas angostas, dos unidades van en paneles salvo con ejes=doble", () => {
    const base = { ...vistaDe("?t=var_interanual&desde=2000&hasta=2005&s2=reservas"), periodos: PERIODOS, eventos: EVENTOS, tema: TEMA, ancho: 350, alto: 400, angosto: true };
    expect(armarVista(base).comparacion.disposicion.tipo).toBe("paneles");
    const doble = { ...vistaDe("?t=var_interanual&desde=2000&hasta=2005&s2=reservas&ejes=doble"), periodos: PERIODOS, eventos: EVENTOS, tema: TEMA, ancho: 350, alto: 400, angosto: true };
    expect(armarVista(doble).comparacion.disposicion.tipo).toBe("doble_eje");
  });

  it("tres unidades con sombreado y eventos: el sombreado en todos los paneles, la franja de episodios y las letras abajo", () => {
    const v = armar("?t=var_mensual&desde=1988&hasta=1991&sh=gobierno&ev=1&s2=reservas&s3=tc-oficial&t3=var_mensual&v3=moneda-de-epoca&pa3=1&s4=pib");
    expect(v.comparacion.disposicion.tipo).toBe("paneles");
    const spec = v.especificacion as { vconcat: Array<{ layer: Array<{ mark: { type: string }; encoding?: { color?: unknown } }> }> };
    const conBandas = spec.vconcat.map((p) => p.layer.some((c) => c.mark.type === "rect" && c.encoding?.color));
    expect(conBandas.every(Boolean)).toBe(true);
    expect(v.periodos.length).toBeGreaterThan(0);
    expect(v.episodios.length).toBe(1);
    expect(v.descripcionesPaneles.length).toBe(spec.vconcat.length);
    valido(v.especificacion);
  });

  it("una internacional con otra serie: paneles, con los países en la paleta de 8 de su panel", () => {
    const v = armar("?s=pib&t=var_interanual&f=anual&desde=2000&hasta=2015&s2=int-pib&p2=ARG,BRA,USA");
    expect(v.comparacion.disposicion.paneles.map((p) => p.internacional)).toEqual([false, true]);
    const spec = v.especificacion as { vconcat: Array<{ layer: Array<Record<string, unknown>> }> };
    const ultimo = spec.vconcat[1].layer;
    const principal = lineas(ultimo).find((c) => (c.mark as { color?: string }).color);
    expect((principal!.mark as { color: string }).color).toBe(TEMA.paleta![0]);
    valido(v.especificacion);
  });

  it("la guía da, en cada fecha, el valor de la observación que la contiene, con su fecha si es otra", () => {
    const v = armar("?desde=2004&hasta=2004&s2=pib");
    const filas = (v.especificacion as { datasets: { guia: Array<Record<string, string>> } }).datasets.guia;
    expect(filas).toHaveLength(12);
    expect(filas[0].s2).toMatch(/^2004, 1\.er trimestre \(trimestral\): /);
    expect(filas[0].s1).not.toContain("(");
  });

  it("con sombreado, la guía dice el período y el reparto de cada fecha, y el lector los lee", () => {
    const v = armar("?desde=1989-01&hasta=1989-12&sh=gobierno&ev=1&s2=pib");
    const filas = (v.especificacion as { datasets: { guia: Array<Record<string, string>> } }).datasets.guia;
    // Julio de 1989: el mes del cambio de gobierno (Alfonsín → Menem, el 8/7), con su reparto.
    const julio = filas[6];
    expect(julio.periodo).toMatch(/Menem/);
    expect(julio.reparto).toMatch(/Menem \d+ % · Alfonsín \d+ %/);
    // La capa de la guía es la de los puntos invisibles con la selección («guia»).
    const tooltip = ((v.especificacion as { layer: Array<{ params?: unknown[]; encoding?: { tooltip?: Array<{ title: string }> } }> }).layer
      .find((c) => c.params && c.encoding?.tooltip)!.encoding!.tooltip!).map((t) => t.title);
    expect(tooltip.slice(-2)).toEqual(["Período", "Reparto"]);
    const lecturas = lecturasGuia(v.guia!, { sh: "gobierno", episodios: v.episodios, eventos: v.eventos });
    expect(lecturas).toHaveLength(12);
    expect(lecturas[6].texto).toMatch(/^jul\. 1989: 1\. .+; 2\. .+ · Gobierno: .*Menem.* · reparto: Menem/);
    // Sin sombreado, ni el tooltip ni la guía llevan el período.
    const sin = armar("?desde=1989-01&hasta=1989-12&s2=pib");
    expect(Object.keys((sin.especificacion as { datasets: { guia: Array<Record<string, string>> } }).datasets.guia[0])).toEqual(["t", "fecha", "s1", "s2"]);
  });

  it("con dos series de la misma frecuencia, la guía y el lector siguen a la de índice más bajo", () => {
    const v = armar("?s=reservas&desde=2004&hasta=2004&s2=ipc");
    expect(v.guia!.origen.map((o) => o.f)).toEqual(v.comparacion.series[0].resultados[""].datos.map((d) => d[0]));
    expect(v.guia!.contexto).toEqual(v.contextos[0]);
  });

  it("cada disposición dibuja un solo eje de fechas (la guía común no lo apaga)", () => {
    const ejesX = (spec: Record<string, unknown>) => {
      const escalas: string[] = [];
      const recorrer = (n: unknown): void => {
        if (!n || typeof n !== "object") return;
        const o = n as Record<string, unknown>;
        if (Array.isArray(o.axes)) escalas.push(...o.axes.map((x) => (x as { scale: string }).scale));
        Object.values(o).forEach(recorrer);
      };
      recorrer(compile(spec as never).spec);
      return escalas.filter((x) => x === "x").length;
    };
    for (const url of ["?t=var_mensual&desde=1988&hasta=1991&s2=tc-oficial&t2=var_mensual", "?t=var_interanual&desde=1995&s2=reservas",
      "?t=var_interanual&desde=1995&s2=reservas&ejes=paneles", "?s=pib&s2=int-pib&p2=ARG,BRA", "?s=reservas&s2=ipc&s3=desocupacion&s4=pib"]) {
      expect(ejesX(armar(url).especificacion), url).toBe(1);
    }
  });

  it("el texto alternativo tiene uno por panel", () => {
    const v = armar("?s=reservas&s2=ipc&s3=desocupacion&ejes=paneles");
    expect(v.descripcionesPaneles).toHaveLength(3);
    expect(v.descripcionesPaneles[2]).toContain("Serie 3:");
  });
});

void ({} as Resultado);
