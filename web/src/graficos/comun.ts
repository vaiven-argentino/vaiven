// Lo que comparten la ficha y el explorador en el navegador: formato de Vega en español, colores del tema, insumos de
// las medidas pedidos a /datos/, descargas y exportación del gráfico a PNG o SVG.
import type { InsumosCargados, Opciones, SerieExportada } from "@vaiven/transformaciones";
import { opcionesDelDenominador } from "../lib/ficha";
import type { Tema } from "./espec";

// El formato en español y el dibujo con Vega se mudaron a vega.ts (4e): los usa también la interfaz del gráfico en Claude.
import { LOCALE_FECHAS, LOCALE_NUMEROS, dibujarEn, imagenDe, type VistaGrafico } from "./vega";
export { LOCALE_FECHAS, LOCALE_NUMEROS, dibujarEn, type VistaGrafico };

/** Los colores del modo actual (claro u oscuro), leídos de las variables CSS. */
export function tema(): Tema {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return {
    fondo: v("--fondo"), texto: v("--texto"), secundario: v("--secundario"), linea: v("--linea"), banda: v("--banda"),
    borde: v("--borde"), serie: v("--graf-1"), fuente: "Inter Variable, system-ui, sans-serif",
    periodoA: v("--periodo-a"), periodoB: v("--periodo-b"), periodoFacto: v("--periodo-facto"), periodoFranja: v("--periodo-franja"),
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

/** Exporta una especificación de Vega-Lite (con su `impreso`) a PNG (al doble de resolución) o SVG, y la baja. */
export async function exportarImagen(spec: Record<string, unknown>, formato: "png" | "svg", nombre: string): Promise<void> {
  const imagen = await imagenDe(spec, formato);
  bajar(formato === "png" ? imagen : URL.createObjectURL(new Blob([imagen], { type: "image/svg+xml" })), nombre);
}

// La licencia del pie de la imagen se mudó a paquetes/grafico (src/imagen.ts) en la 4e.
export { licenciaImagen } from "@vaiven/grafico";
