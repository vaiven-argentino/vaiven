// Lo que comparten la ficha y el explorador en el navegador: formato de Vega en español, colores del tema, insumos de
// las medidas pedidos a /datos/, descargas y exportación del gráfico a PNG o SVG.
import type { InsumosCargados, Opciones, SerieExportada } from "@vaiven/transformaciones";
import { opcionesDelDenominador } from "../lib/ficha";
import type { Tema } from "./espec";

export const LOCALE_NUMEROS = { decimal: ",", thousands: ".", grouping: [3], currency: ["$", ""] };
export const LOCALE_FECHAS = {
  dateTime: "%e de %B de %Y, %X", date: "%d/%m/%Y", time: "%H:%M:%S", periods: ["a. m.", "p. m."],
  days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  shortDays: ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."],
  months: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  shortMonths: ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."],
};

/** Los colores del modo actual (claro u oscuro), leídos de las variables CSS. */
export function tema(): Tema {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return {
    fondo: v("--fondo"), texto: v("--texto"), secundario: v("--secundario"), linea: v("--linea"), banda: v("--banda"),
    borde: v("--borde"), serie: v("--graf-1"), fuente: "Inter Variable, system-ui, sans-serif",
    periodoA: v("--periodo-a"), periodoB: v("--periodo-b"), periodoFacto: v("--periodo-facto"),
    paleta: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => v(`--graf-${k}`)),
  };
}

export async function leerDatos<T>(archivo: string): Promise<T> {
  const res = await fetch(`/datos/${archivo}`);
  if (!res.ok) throw new Error(`no se pudo leer /datos/${archivo} (${res.status})`);
  return res.json() as Promise<T>;
}

export type Cargados = InsumosCargados & { series: Record<string, SerieExportada> };

/**
 * Pide a /datos/ los insumos que la medida elegida todavía no tiene (el IPC, el tipo de cambio, el PIB o los signos
 * monetarios). Devuelve true si tuvo que pedir algo.
 */
export async function cargarInsumos(serie: SerieExportada, o: Opciones, cargados: Cargados, alPedir?: () => void): Promise<boolean> {
  const pedidos: Array<Promise<void>> = [];
  if (o.pesosActuales && !cargados.signos) {
    const archivo = serie.insumos?.pesos_actuales?.opciones[0].archivo;
    if (archivo) pedidos.push(leerDatos<NonNullable<InsumosCargados["signos"]>>(archivo).then((s) => { cargados.signos = s; }));
  }
  if (o.medida) {
    const insumo = serie.insumos?.[o.medida];
    const ids = o.medida === "real" ? [o.deflactor ?? insumo?.por_defecto]
      : insumo ? opcionesDelDenominador(insumo, o.denominador).map((x) => x.id) : [];
    for (const op of insumo?.opciones ?? []) {
      if (ids.includes(op.id) && !cargados.series[op.id]) pedidos.push(leerDatos<SerieExportada>(op.archivo).then((s) => { cargados.series[op.id] = s; }));
    }
  }
  if (!pedidos.length) return false;
  alPedir?.();
  await Promise.all(pedidos);
  return true;
}

export function bajar(url: string, nombre: string): void {
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function bajarTexto(texto: string, tipo: string, nombre: string): void {
  bajar(URL.createObjectURL(new Blob([texto], { type: tipo })), nombre);
}

/** Exporta una especificación de Vega-Lite (con su `impreso`) a PNG (al doble de resolución) o SVG. */
export async function exportarImagen(spec: Record<string, unknown>, formato: "png" | "svg", nombre: string): Promise<void> {
  const { vega, vegaLite } = await import("vega-embed");
  // Vega exporta `locale` (de vega-format), aunque sus tipos no lo declaren.
  const locale = (vega as unknown as { locale?: (n: object, t: object) => unknown }).locale?.(LOCALE_NUMEROS, LOCALE_FECHAS);
  const v = new vega.View(vega.parse(vegaLite.compile(spec as never).spec), { renderer: "none", ...(locale ? { locale } : {}) } as never);
  const url = formato === "png"
    ? await v.toImageURL("png", 2)
    : URL.createObjectURL(new Blob([await v.toSVG()], { type: "image/svg+xml" }));
  bajar(url, nombre);
  v.finalize();
}

/** Como en la cita: si una fuente tiene otros términos (Bruegel), se dice. */
export function licenciaImagen(fuentes: Array<{ organismo: string; licencia: string }>): string {
  const otras = [...new Set(fuentes.filter((f) => f.licencia !== "CC-BY-4.0").map((f) => f.organismo))];
  return otras.length ? `Licencia de Vaivén CC BY 4.0; los datos de ${otras.join(" y ")} conservan sus términos.` : "Licencia CC BY 4.0.";
}

/** Lo que se usa de la vista de Vega: finalizarla y ubicar una fecha en el eje X (para el lector del gráfico). */
export interface VistaGrafico {
  finalize: () => void;
  view: { scale: (nombre: string) => ((v: unknown) => number) | undefined; origin: () => [number, number] };
}

/** Dibuja una especificación en un contenedor con el formato en español; devuelve la vista para poder finalizarla. */
export async function dibujarEn(contenedor: HTMLElement, spec: Record<string, unknown>): Promise<VistaGrafico> {
  const { default: embed } = await import("vega-embed");
  return embed(contenedor, spec as never, {
    renderer: "svg", actions: false, formatLocale: LOCALE_NUMEROS, timeFormatLocale: LOCALE_FECHAS as never,
    tooltip: { theme: "custom" },
  }) as unknown as Promise<VistaGrafico>;
}
