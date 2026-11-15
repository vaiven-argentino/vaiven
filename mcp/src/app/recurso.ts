// El recurso ui://vaiven/grafico de MCP Apps (SPEC 7.4): la interfaz que dibuja el resultado de especificacion_grafico
// dentro de Claude (mcp/app/). El HTML es mínimo y pide su script al dominio de Vaivén, declarado en la CSP; la variante
// local por stdio lo lleva adentro. Un cliente sin la extensión no pide el recurso y sigue recibiendo el texto completo.
import type { McpServer } from "@modelcontextprotocol/server";
import { PARTES_HTML_GRAFICO, SCRIPT_GRAFICO } from "./html.generado";

export { SCRIPT_GRAFICO };

export const URI_GRAFICO = "ui://vaiven/grafico";
export const MIME_APP = "text/html;profile=mcp-app";
/** El identificador de la extensión (ext-apps, SEP-1724). */
export const EXTENSION_UI = "io.modelcontextprotocol/ui";
export const ORIGEN_PUBLICO = "https://vaiven.argentino.workers.dev";

/** `_meta` de la herramienta que abre la interfaz: la forma actual y la vieja, como `registerAppTool` de ext-apps. */
export const META_HERRAMIENTA_GRAFICO = { ui: { resourceUri: URI_GRAFICO }, "ui/resourceUri": URI_GRAFICO };

/** El HTML con el dominio de Vaivén puesto: de ahí pide el script (en el Worker, un asset estático). */
export function htmlGrafico(origen: string): string {
  return PARTES_HTML_GRAFICO.join(origen);
}

/** `_meta.ui` del contenido: la CSP declara solo el dominio de Vaivén (sin fetch, iframes ni base). */
export function metaRecurso(origen: string) {
  return { ui: { csp: { resourceDomains: [origen] }, prefersBorder: true } };
}

/**
 * Registra el recurso. `html` cambia el HTML que se sirve (la variante local por stdio pasa el que lleva el script
 * adentro, mcp/src/app/html-en-linea.generado.ts, que el Worker no importa).
 */
export function registrarRecursoGrafico(servidor: McpServer, origen: string, html: (origen: string) => string = htmlGrafico): void {
  servidor.registerResource("grafico", URI_GRAFICO, {
    title: "Vaivén · gráfico interactivo",
    description: "Interfaz de especificacion_grafico (MCP Apps): dibuja el gráfico, deja cambiar la vista y muestra los avisos y las citas.",
    mimeType: MIME_APP,
    _meta: metaRecurso(origen),
  }, (uri) => ({
    contents: [{ uri: uri.href, mimeType: MIME_APP, text: html(origen), _meta: metaRecurso(origen) }],
  }));
}
