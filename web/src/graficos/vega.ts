// Dibujar y exportar una especificación con Vega, en español. Lo usan el explorador, la ficha y la interfaz del gráfico
// en Claude (mcp/app, 4e): por eso no depende de nada propio de las páginas (ni del DOM de la web ni de /datos/).
import { LOCALE_FECHAS, LOCALE_NUMEROS } from "@vaiven/grafico/locale";

export { LOCALE_FECHAS, LOCALE_NUMEROS };

/** Lo que se usa de la vista de Vega: finalizarla, exportarla y ubicar una fecha en el eje X (para el lector). */
export interface VistaGrafico {
  finalize: () => void;
  view: {
    scale: (nombre: string) => ((v: unknown) => number) | undefined; origin: () => [number, number];
    toSVG: () => Promise<string>; toImageURL: (tipo: string, escala?: number) => Promise<string>;
  };
}

export interface OpcionesDibujo {
  /**
   * Con el intérprete de expresiones de Vega, que no necesita `unsafe-eval` (la CSP de MCP Apps no lo garantiza, SPEC
   * 7.4). Dibuja lo mismo; en la web no hace falta.
   */
  ast?: boolean;
}

/** Dibuja una especificación en un contenedor con el formato en español; devuelve la vista para poder finalizarla. */
export async function dibujarEn(contenedor: HTMLElement, spec: Record<string, unknown>, o: OpcionesDibujo = {}): Promise<VistaGrafico> {
  const { default: embed } = await import("vega-embed");
  return embed(contenedor, spec as never, {
    renderer: "svg", actions: false, formatLocale: LOCALE_NUMEROS, timeFormatLocale: LOCALE_FECHAS as never,
    tooltip: { theme: "custom" }, ...(o.ast ? { ast: true } : {}),
  }) as unknown as Promise<VistaGrafico>;
}

/**
 * Una especificación de Vega-Lite (con su `impreso`) como imagen: PNG al doble de resolución (una URL `data:`) o el texto
 * del SVG. Sin dibujarla en la página.
 */
export async function imagenDe(spec: Record<string, unknown>, formato: "png" | "svg", o: OpcionesDibujo = {}): Promise<string> {
  const { vega, vegaLite } = await import("vega-embed");
  // Vega exporta `locale` (de vega-format), aunque sus tipos no lo declaren.
  const locale = (vega as unknown as { locale?: (n: object, t: object) => unknown }).locale?.(LOCALE_NUMEROS, LOCALE_FECHAS);
  // Con `ast`, el intérprete de expresiones (vega-interpreter, el mismo que usa vega-embed) en lugar de compilarlas.
  const expr = o.ast ? (await import("vega-interpreter")).expressionInterpreter : undefined;
  const v = new vega.View(vega.parse(vegaLite.compile(spec as never).spec, undefined, o.ast ? { ast: true } as never : undefined),
    { renderer: "none", ...(locale ? { locale } : {}), ...(expr ? { expr } : {}) } as never);
  try {
    return formato === "png" ? await v.toImageURL("png", 2) : await v.toSVG();
  } finally {
    v.finalize();
  }
}
