// La variante local: se empaqueta con esbuild (como `npm run empaquetar`) y se le habla por stdio con el cliente oficial.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { build } from "esbuild";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EXPORT } from "./ayuda";

const dir = mkdtempSync(join(tmpdir(), "vaiven-mcp-"));
const salida = join(dir, "vaiven-mcp.mjs");

beforeAll(async () => {
  await build({
    entryPoints: [join(import.meta.dirname, "..", "src", "stdio.ts")], bundle: true, platform: "node", format: "esm",
    target: "node22", outfile: salida, banner: { js: "#!/usr/bin/env node" }, logLevel: "warning",
  });
}, 60_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it.each([["legacy"], [{ pin: "2026-07-28" }]] as const)("responde por stdio con el export local (%j)", async (modo) => {
  const cliente = new Client({ name: "prueba-stdio", version: "1.0.0" }, { versionNegotiation: { mode: modo } });
  await cliente.connect(new StdioClientTransport({ command: process.execPath, args: [salida, "--export", EXPORT], stderr: "ignore" }));
  const { tools } = await cliente.listTools();
  expect(tools).toHaveLength(4);
  const r = await cliente.callTool({ name: "obtener_serie", arguments: { id: "desocupacion", desde: "2002-05", hasta: "2002-05" } });
  expect(JSON.parse((r.content as Array<{ text: string }>)[0].text).datos).toEqual([["2002-05", 21.5]]);
  await cliente.close();
}, 30_000);
