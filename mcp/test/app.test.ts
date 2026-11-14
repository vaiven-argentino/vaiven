// El recurso del gráfico interactivo (MCP Apps, SPEC 7.4), en las dos eras del protocolo: se declara solo en
// especificacion_grafico, se lee con su MIME y su CSP, y un cliente sin la extensión sigue recibiendo el texto completo.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { EXTENSION_UI, MIME_APP, ORIGEN_PUBLICO, URI_GRAFICO } from "../src/app/recurso";
import { manejarMcp, type OpcionesHttp } from "../src/http";
import type { Repositorio } from "../src/datos";
import { repoReal } from "./ayuda";

const abiertos: Client[] = [];
afterEach(async () => {
  await Promise.all(abiertos.splice(0).map((c) => c.close()));
});

async function conectar(modo: "legacy" | { pin: string }, repo: Repositorio, opciones: OpcionesHttp = {}) {
  const cliente = new Client({ name: "prueba-sin-extension", version: "1.0.0" }, { versionNegotiation: { mode: modo } });
  await cliente.connect(new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: (url, init) => manejarMcp(new Request(url, init), repo, opciones),
  }));
  abiertos.push(cliente);
  return cliente;
}

const repo = repoReal();

describe.each([
  ["2026-07-28", { pin: "2026-07-28" }],
  ["2025 (initialize)", "legacy"],
] as const)("era %s", (_, modo) => {
  it("solo especificacion_grafico declara la interfaz", async () => {
    const c = await conectar(modo, repo);
    const { tools } = await c.listTools();
    const conUi = tools.filter((t) => t._meta && "ui" in t._meta);
    expect(conUi.map((t) => t.name)).toEqual(["especificacion_grafico"]);
    expect(conUi[0]._meta).toEqual({ ui: { resourceUri: URI_GRAFICO }, "ui/resourceUri": URI_GRAFICO });
    // Ninguna otra herramienta lleva la clave vieja.
    expect(tools.filter((t) => t._meta && "ui/resourceUri" in t._meta).map((t) => t.name)).toEqual(["especificacion_grafico"]);
  });

  it("lista y lee ui://vaiven/grafico con su MIME y su CSP", async () => {
    const c = await conectar(modo, repo);
    const { resources } = await c.listResources();
    expect(resources.map((r) => r.uri)).toEqual([URI_GRAFICO]);
    expect(resources[0]).toMatchObject({ mimeType: MIME_APP, _meta: { ui: { csp: { resourceDomains: [ORIGEN_PUBLICO] } } } });
    const { contents } = await c.readResource({ uri: URI_GRAFICO });
    expect(contents).toHaveLength(1);
    const [html] = contents as Array<{ uri: string; mimeType: string; text: string; _meta: unknown }>;
    expect(html).toMatchObject({ uri: URI_GRAFICO, mimeType: MIME_APP, _meta: { ui: { csp: { resourceDomains: [ORIGEN_PUBLICO] }, prefersBorder: true } } });
    expect(html.text).toMatch(/^<!doctype html>/);
    expect(html.text).toContain(`<script src="${ORIGEN_PUBLICO}/mcp-app/sonda.js">`);
    expect(html.text).not.toContain("__ORIGEN__");
    expect(html.text).not.toContain("/*__VAIVEN_APP__*/");
    // El script en línea no puede cerrar su etiqueta antes de tiempo.
    const modulo = html.text.slice(html.text.indexOf('<script type="module">') + 22);
    expect(modulo.indexOf("</script")).toBe(modulo.lastIndexOf("</script"));
  });

  it("un cliente sin la extensión recibe el resultado completo en el texto", async () => {
    const c = await conectar(modo, repo);
    const r = await c.callTool({ name: "especificacion_grafico", arguments: { series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "reservas" }], desde: "2000", hasta: "2010" } });
    expect(r.isError).toBeFalsy();
    const texto = JSON.parse((r.content as Array<{ text: string }>)[0].text) as Record<string, unknown>;
    expect(texto.url_explorador).toBe("https://vaiven.argentino.workers.dev/explorador/?desde=2000&hasta=2010&s2=reservas");
    expect(texto.disposicion).toMatchObject({ tipo: "doble_eje" });
    const series = texto.series as Array<{ cita: unknown; advertencias: unknown }>;
    expect(series).toHaveLength(2);
    for (const s of series) {
      expect(s.cita).toBeTruthy();
      expect(s).toHaveProperty("advertencias");
    }
    expect(texto).toHaveProperty("advertencias_combinacion");
  });
});

it("declara la extensión io.modelcontextprotocol/ui", async () => {
  const c = await conectar("legacy", repo);
  expect(c.getServerCapabilities()?.extensions).toEqual({ [EXTENSION_UI]: {} });
  expect(c.getServerCapabilities()?.resources).toBeDefined();
});

it("el recurso pide el script al dominio que atiende el pedido (producción o una URL de versión)", async () => {
  const origen = "https://prueba-4e-vaiven.argentino.workers.dev";
  const c = await conectar("legacy", repoReal(), { origenApp: origen });
  const { contents } = await c.readResource({ uri: URI_GRAFICO });
  const [html] = contents as Array<{ text: string; _meta: unknown }>;
  expect(html._meta).toEqual({ ui: { csp: { resourceDomains: [origen] }, prefersBorder: true } });
  expect(html.text).toContain(`<script src="${origen}/mcp-app/sonda.js">`);
  expect(html.text).toContain(`window.__vaivenOrigen = "${origen}"`);
});

it("acepta el host de la URL de versión de la prueba", async () => {
  const r = await manejarMcp(new Request("https://prueba-4e-vaiven.argentino.workers.dev/mcp", {
    method: "POST", headers: { host: "prueba-4e-vaiven.argentino.workers.dev", "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  }), repo);
  expect(r.status).not.toBe(403);
});
