// El recurso ui://vaiven/grafico de MCP Apps (SPEC 7.4): la interfaz que dibuja el resultado de especificacion_grafico
// dentro de Claude. En el Paso 0 de la 4e es una sonda (mcp/app/), que dice qué permite cada host antes de armar el
// gráfico definitivo. Un cliente sin la extensión no pide el recurso y sigue recibiendo el texto completo.
import type { McpServer } from "@modelcontextprotocol/server";
import { PARTES_HTML_GRAFICO } from "./html.generado";

export const URI_GRAFICO = "ui://vaiven/grafico";
export const MIME_APP = "text/html;profile=mcp-app";
/** El identificador de la extensión (ext-apps, SEP-1724). */
export const EXTENSION_UI = "io.modelcontextprotocol/ui";
export const ORIGEN_PUBLICO = "https://vaiven.argentino.workers.dev";

/** `_meta` de la herramienta que abre la interfaz: la forma actual y la vieja, como `registerAppTool` de ext-apps. */
export const META_HERRAMIENTA_GRAFICO = { ui: { resourceUri: URI_GRAFICO }, "ui/resourceUri": URI_GRAFICO };

/** El HTML con el dominio de Vaivén puesto (de dónde se pide el script externo de la sonda). */
export function htmlGrafico(origen: string): string {
  return PARTES_HTML_GRAFICO.join(origen);
}

/** `_meta.ui` del contenido: la CSP declara solo el dominio de Vaivén (sin fetch, iframes ni base). */
export function metaRecurso(origen: string) {
  return { ui: { csp: { resourceDomains: [origen] }, prefersBorder: true } };
}

export function registrarRecursoGrafico(servidor: McpServer, origen: string): void {
  servidor.registerResource("grafico", URI_GRAFICO, {
    title: "Vaivén · gráfico interactivo",
    description: "Interfaz de especificacion_grafico (MCP Apps): dibuja el gráfico, sus avisos y sus citas.",
    mimeType: MIME_APP,
    _meta: metaRecurso(origen),
  }, (uri) => ({
    contents: [{ uri: uri.href, mimeType: MIME_APP, text: htmlGrafico(origen), _meta: metaRecurso(origen) }],
  }));
}
