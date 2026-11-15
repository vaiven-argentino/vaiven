// La imagen que se descarga (PNG o SVG, 900 px): título, subtítulo, pie con las fuentes, la licencia y la URL, y el
// nombre del archivo. Se mudó del explorador (web/src/graficos/explorador.ts) en la 4e, para que el MCP dé la misma
// imagen con `imagen: true` (A3 de la prueba en Claude) sin una segunda implementación.
import { tienePais, type DocumentoPeriodos } from "@vaiven/transformaciones";
import { diaLegible, modoEventosDe } from "./espec";
import type { Documento, Estado, EstadoVista } from "./estado";
import { diaDeVersion, unidadVisible } from "./formato";
import { ACLARACION_ETAPAS, nombreSombreadoEnFrase, type OpcionSombreado } from "./periodos";
import { partirEnRenglones, type Vista } from "./vista";

/** Lo que la imagen usa de cada documento, además de lo que usa la vista. */
export type DocumentoImagen = Documento & {
  nombre: string; nombre_variante: string; variante: string; version_datos: string;
  fuentes: Array<{ organismo: string; licencia: string }>;
};

export interface EntradaImagen {
  estado: EstadoVista;
  docs: DocumentoImagen[];
  /** La vista ya armada (para los períodos, los eventos y la disposición que se ven). */
  vista: Vista;
  /** El nombre de la transformación de cada serie (`nombreTransformacion` de @vaiven/cita), o nada si va como se publica. */
  transformaciones: Array<string | undefined>;
  /** El registro de períodos (para nombrar el sombreado y su versión). */
  periodos?: DocumentoPeriodos;
  /** La URL de la vista en el explorador: va entera, al final del pie. */
  url: string;
}

export interface TextoImagen {
  titulo: string;
  subtitulo: string;
  pie: string[];
  /** El alto del gráfico en la imagen: 400 px, o 200 por panel (el alto mínimo es 180 px, SPEC 6.2). */
  alto: number;
}

/** El ancho de la imagen exportada. */
export const ANCHO_IMAGEN = 900;

/** Como en la cita: si una fuente tiene otros términos (Bruegel), se dice. */
export function licenciaImagen(fuentes: Array<{ organismo: string; licencia: string }>): string {
  const otras = [...new Set(fuentes.filter((f) => f.licencia !== "CC-BY-4.0").map((f) => f.organismo))];
  return otras.length ? `Licencia de Vaivén CC BY 4.0; los datos de ${otras.join(" y ")} conservan sus términos.` : "Licencia CC BY 4.0.";
}

/** El título, el subtítulo, el pie y el alto de la imagen de una vista. */
export function textoImagen(e: EntradaImagen): TextoImagen {
  const { estado, docs, vista: u } = e;
  const varias = estado.series.length > 1;
  const e0 = estado.series[0];
  const nombreEntidadDe = (k: number, id: string) => { const d = docs[k]; return (tienePais(d) ? d.entidades.find((x) => x.id === id)?.nombre : undefined) ?? id; };
  const paisesDe = (k: number) => (tienePais(docs[k]) ? estado.series[k].p.map((id) => nombreEntidadDe(k, id)) : undefined);
  const s0 = u.comparacion.series[0];
  const r = s0.resultados[s0.entidades[0]];
  const pie: string[] = [];
  if (!varias) {
    const d = docs[0];
    pie.push(`Fuentes: ${[...new Set(d.fuentes.map((f) => f.organismo))].join("; ")}.`);
    if (tienePais(d)) pie.push(`Países: ${paisesDe(0)!.join(", ")} (resaltado: ${nombreEntidadDe(0, e0.p[0])}).`);
    if (e.transformaciones[0]) pie.push(`Transformación: ${e.transformaciones[0]} (calculada por Vaivén).`);
  } else {
    // Una línea por serie: su variante, su transformación y sus fuentes.
    docs.forEach((d, k) => {
      const paises = paisesDe(k);
      pie.push(`${k + 1}. ${d.nombre} · ${d.nombre_variante} · ${e.transformaciones[k] ? `${e.transformaciones[k]} (calculada por Vaivén)` : "como se publica"}${paises ? ` · países: ${paises.join(", ")}` : ""} · fuentes: ${[...new Set(d.fuentes.map((f) => f.organismo))].join("; ")}.`);
    });
  }
  if (u.periodos.length && e.periodos) {
    const nombre = nombreSombreadoEnFrase(e0.sh as OpcionSombreado, e.periodos.tipos);
    pie.push(`Sombreado: ${nombre}${e0.sh === "catedra" ? ` (${ACLARACION_ETAPAS})` : ""}. Cada dato, en el período vigente a mitad de su intervalo (los saldos en nivel, el último día). Fuente: Vaivén, períodos, versión ${diaDeVersion(e.periodos.version_datos)}.`);
  }
  if (u.episodios.length) pie.push(`Episodios: ${u.episodios.map((x) => x.nombre).join("; ")}.`);
  if (u.eventos.length) {
    // En la imagen (900 px) los eventos pueden ir con letras aunque en la pantalla vayan como rayitas.
    const letras = modoEventosDe(varias && u.dominio ? u.dominio : r, u.eventos, ANCHO_IMAGEN) === "letras";
    pie.push(`Eventos: ${u.eventos.map((x) => (letras ? `${x.letra}. ${x.nombre}` : `${diaLegible(x.fecha)}, ${x.nombre}`)).join("; ")}.`);
  }
  const version = docs.map((d) => d.version_datos).sort().at(-1)!;
  const fuentes = docs.flatMap((d) => d.fuentes);
  pie.push(varias
    ? `Elaboración: Vaivén, versión de datos ${diaDeVersion(version)}. ${licenciaImagen(fuentes)}`
    : `Elaboración: Vaivén, variante «${docs[0].variante}», versión de datos ${diaDeVersion(docs[0].version_datos)}. ${licenciaImagen(docs[0].fuentes)}`);

  const d = u.comparacion.disposicion;
  const unidades = [...new Set(d.paneles.map((p) => p.unidad))];
  return {
    titulo: varias ? `Comparación: ${docs.map((x) => x.nombre).join(" · ")}` : `${docs[0].nombre} · ${docs[0].nombre_variante}`,
    subtitulo: varias ? (unidades.length === 1 ? unidadVisible(unidades[0]) : "Varias unidades: cada una en su eje o en su panel") : unidadVisible(r.unidad),
    // La imagen mide 900 px: cada línea larga se parte en renglones de unos 130 caracteres para que no se corte
    // (revisión visual del PR B). La URL va entera, al final.
    pie: [...pie.flatMap((l) => partirEnRenglones(l, 130)), e.url],
    alto: d.tipo === "paneles" ? Math.max(400, d.paneles.length * 200) : 400,
  };
}

/**
 * El nombre de los archivos de una vista con varias series (decisión del PR B):
 * `vaiven_<s1>_y_<s2>[_y_…]_<desde>_<hasta>[_sombreado_x]`. La variante va (`<s>-<variante>`) solo si no es la de por
 * defecto o si la serie se repite.
 */
export function nombreArchivoVista(series: ReadonlyArray<Pick<Estado, "s" | "v" | "desde" | "hasta" | "sh">>, porDefecto: (s: string) => string | undefined): string {
  const nombres = series.map((e) => {
    const repite = series.filter((x) => x.s === e.s).length > 1;
    return repite || e.v !== porDefecto(e.s) ? `${e.s}-${e.v}` : e.s;
  });
  const [primera] = series;
  const partes = ["vaiven", nombres.join("_y_"),
    primera.desde || primera.hasta ? `${primera.desde || "inicio"}_${primera.hasta || "hoy"}` : undefined,
    primera.sh ? `sombreado_${primera.sh}` : undefined];
  return partes.filter(Boolean).join("_").replace(/[^\w.-]+/g, "-");
}

/** El nombre del archivo de la imagen y de las descargas (sin extensión). */
export function nombreArchivoImagen(estado: EstadoVista, docs: Documento[], porDefecto: (s: string) => string | undefined): string {
  if (estado.series.length > 1) return nombreArchivoVista(estado.series, porDefecto);
  const e = estado.series[0], d = docs[0];
  const partes = ["vaiven", e.s, e.v, tienePais(d) ? e.p.join("-") : undefined, e.pa ? "pesos_actuales" : undefined,
    e.f || undefined, e.m || undefined, e.t !== "nivel" ? e.t : undefined, e.mm ? `mm${e.mm}` : undefined,
    e.desde || e.hasta ? `${e.desde || "inicio"}_${e.hasta || "hoy"}` : undefined, e.sh ? `sombreado_${e.sh}` : undefined];
  return partes.filter(Boolean).join("_").replace(/[^\w.-]+/g, "-");
}
