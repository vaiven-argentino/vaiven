// El endpoint completo (manejarMcp) con el cliente oficial del SDK, en las dos eras del protocolo:
// 2026-07-28 (sin estado) y 2025 (initialize, que es por donde entran hoy muchos clientes).
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { manejarMcp, type OpcionesHttp } from "../src/http";
import { repoReal } from "./ayuda";

const repo = repoReal();
const URL_MCP = "http://localhost/mcp";
const abiertos: Client[] = [];
afterEach(async () => {
  await Promise.all(abiertos.splice(0).map((c) => c.close()));
});

async function conectar(modo: "legacy" | { pin: string }, opciones: OpcionesHttp = {}) {
  const cliente = new Client({ name: "prueba", version: "1.0.0" }, { versionNegotiation: { mode: modo } });
  const transporte = new StreamableHTTPClientTransport(new URL(URL_MCP), {
    fetch: (url, init) => manejarMcp(new Request(url, init), repo, opciones),
  });
  await cliente.connect(transporte);
  abiertos.push(cliente);
  return cliente;
}

const json = (r: { content: Array<{ type: string; text?: string }> }) => JSON.parse(r.content[0].text!);

describe.each([
  ["2026-07-28", { pin: "2026-07-28" }],
  ["2025 (initialize)", "legacy"],
] as const)("era %s", (_, modo) => {
  it("lista las 4 herramientas, con descripciones en español y de solo lectura", async () => {
    const c = await conectar(modo);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["buscar_series", "citar", "describir_serie", "obtener_serie"]);
    for (const t of tools) {
      expect(t.description).toMatch(/Vaivén/);
      expect(t.annotations?.readOnlyHint).toBe(true);
    }
    expect(c.getInstructions()).toContain("buscar_series");
  });
  it("llama a las herramientas y devuelve el JSON en un bloque de texto", async () => {
    const c = await conectar(modo);
    const r = await c.callTool({ name: "obtener_serie", arguments: { id: "reservas", desde: "1979-02", hasta: "1979-04" } });
    expect(r.isError).toBeFalsy();
    const datos = json(r as never);
    expect(datos.datos).toEqual([["1979-02", 6282.9], ["1979-03", null], ["1979-04", 7270.3]]);
    expect(r.structuredContent).toBeUndefined();
  });
  it("los errores salen como isError, en español", async () => {
    const c = await conectar(modo);
    const r = await c.callTool({ name: "obtener_serie", arguments: { id: "ipc", variante: "cavallo-bertolotto" } });
    expect(r.isError).toBe(true);
    expect((r.content as Array<{ text: string }>)[0].text).toMatch(/pendiente de licencia/);
  });
});

it("con la era 2026-07-28 negocia esa revisión", async () => {
  const c = await conectar({ pin: "2026-07-28" });
  expect(c.getProtocolEra()).toBe("modern");
  const c2 = await conectar("legacy");
  expect(c2.getProtocolEra()).toBe("legacy");
});

describe("HTTP", () => {
  const pedir = (init: RequestInit & { host?: string } = {}, opciones: OpcionesHttp = {}) => {
    const headers = new Headers(init.headers);
    if (init.host) headers.set("host", init.host);
    return manejarMcp(new Request(URL_MCP, { ...init, headers }), repo, opciones);
  };
  it("OPTIONS responde 204 con CORS abierto", async () => {
    const r = await pedir({ method: "OPTIONS", headers: { origin: "https://ejemplo.org" } });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-headers")).toContain("Mcp-Protocol-Version");
  });
  it("GET y DELETE responden 405 con un texto que remite a /agentes/", async () => {
    for (const method of ["GET", "DELETE"]) {
      const r = await pedir({ method });
      expect(r.status).toBe(405);
      expect(r.headers.get("allow")).toBe("POST, OPTIONS");
      expect(await r.text()).toContain("/agentes/");
    }
  });
  it("un Host ajeno da 403 (DNS rebinding); el público y localhost pasan", async () => {
    expect((await pedir({ method: "GET", host: "atacante.example" })).status).toBe(403);
    expect((await pedir({ method: "GET", host: "vaiven.argentino.workers.dev" })).status).toBe(405);
  });
  it("el límite por IP responde 429 con Retry-After", async () => {
    const r = await pedir({ method: "POST", body: "{}", headers: { "content-type": "application/json" } }, { limitador: async () => false });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
    expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(/Demasiados pedidos/);
  });
  it("registra método, herramienta, protocolo y estado de cada POST", async () => {
    const registros: unknown[] = [];
    const c = await conectar("legacy", { registrar: (r) => registros.push(r) });
    await c.callTool({ name: "citar", arguments: { id: "ipc" } });
    expect(registros).toContainEqual({ mcp: { metodo: "initialize", estado: 200 } });
    expect(registros).toContainEqual({ mcp: { metodo: "tools/call", herramienta: "citar", protocolo: "2025-11-25", estado: 200 } });
  });
  it("las respuestas de /mcp no se guardan en caché", async () => {
    expect((await pedir({ method: "GET" })).headers.get("cache-control")).toBe("no-store");
  });
});
