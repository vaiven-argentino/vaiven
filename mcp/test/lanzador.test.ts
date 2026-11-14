// El lanzador de `.mcp.json` (mcp/scripts/stdio-local.mjs): empaqueta, carga el servidor y deja stdout limpio para
// el protocolo. Si algo escribiera en stdout (por ejemplo, el encabezado de npm), el cliente no podría conectarse.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expect, it } from "vitest";
import { EXPORT } from "./ayuda";

const RAIZ = join(import.meta.dirname, "..", "..");

it("el .mcp.json del repo apunta al lanzador con el export del repo", () => {
  const config = JSON.parse(readFileSync(join(RAIZ, ".mcp.json"), "utf8"));
  expect(config.mcpServers["vaiven-local"]).toEqual({
    command: "node",
    args: ["${CLAUDE_PROJECT_DIR:-.}/mcp/scripts/stdio-local.mjs", "--export", "${CLAUDE_PROJECT_DIR:-.}/export"],
  });
});

it("el lanzador responde por stdio, con o sin --export", async () => {
  for (const args of [["--export", EXPORT], []]) {
    const cliente = new Client({ name: "prueba-lanzador", version: "1.0.0" });
    await cliente.connect(new StdioClientTransport({
      command: process.execPath, args: [join(RAIZ, "mcp", "scripts", "stdio-local.mjs"), ...args], cwd: RAIZ, stderr: "ignore",
    }));
    const { tools } = await cliente.listTools();
    expect(tools.map((t) => t.name)).toContain("obtener_serie");
    const r = await cliente.callTool({ name: "obtener_serie", arguments: { id: "desocupacion", desde: "2002-05", hasta: "2002-05" } });
    expect(JSON.parse((r.content as Array<{ text: string }>)[0].text).datos).toEqual([["2002-05", 21.5]]);
    await cliente.close();
  }
}, 60_000);
