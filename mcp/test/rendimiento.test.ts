// Tiempo por pedido, como aproximación del costo de CPU (el plan gratuito de Workers da 10 ms por pedido).
// En Node no es la misma medida que en workerd: sirve para detectar un salto grande. La CPU real se mira en los
// registros del Worker después del despliegue.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, it } from "vitest";
import { manejarMcp } from "../src/http";
import { repoReal } from "./ayuda";

it("cada llamada tarda pocos milisegundos con la caché caliente", async () => {
  const repo = repoReal();
  let ultimo = 0;
  const cliente = new Client({ name: "medicion", version: "1.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
  await cliente.connect(new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: async (url, init) => {
      const t0 = performance.now();
      const r = await manejarMcp(new Request(url, init), repo);
      const cuerpo = await r.arrayBuffer();
      ultimo = performance.now() - t0;
      return new Response(cuerpo, { status: r.status, headers: r.headers });
    },
  }));
  const llamadas = {
    "tools/list": () => cliente.listTools(),
    buscar_series: () => cliente.callTool({ name: "buscar_series", arguments: { texto: "inflación" } }),
    describir_serie: () => cliente.callTool({ name: "describir_serie", arguments: { id: "ipc" } }),
    "obtener_serie (IPC completo, interanual)": () => cliente.callTool({ name: "obtener_serie", arguments: { id: "ipc", transformacion: "var_interanual" } }),
    "describir_serie (agregados, 5 variantes)": () => cliente.callTool({ name: "describir_serie", arguments: { id: "agregados" } }),
    "obtener_serie (salario real)": () => cliente.callTool({ name: "obtener_serie", arguments: { id: "salario-real", medida: "real" } }),
    "obtener_serie (PIB, 19 países, índice)": () => cliente.callTool({ name: "obtener_serie", arguments: {
      id: "int-pib", transformacion: "indice_desde_tasas",
      paises: ["ARG", "USA", "CHN", "MEX", "BRA", "BOL", "CHL", "COL", "ECU", "GUY", "PRY", "PER", "SUR", "URY", "VEN", "WLD", "LCN", "EUU", "EMU"],
    } }),
    citar: () => cliente.callTool({ name: "citar", arguments: { id: "reservas" } }),
  };
  const tiempos: Record<string, string> = {};
  for (const [nombre, f] of Object.entries(llamadas)) {
    await f(); // calienta la caché del export y el JIT
    const muestras: number[] = [];
    for (let i = 0; i < 20; i++) {
      await f();
      muestras.push(ultimo);
    }
    muestras.sort((a, b) => a - b);
    tiempos[nombre] = `mediana ${muestras[10].toFixed(2)} ms · p90 ${muestras[18].toFixed(2)} ms`;
    expect(muestras[10]).toBeLessThan(50);
  }
  console.log(tiempos);
  await cliente.close();
});
