// Variante local del servidor MCP (SPEC 7.1): el mismo servidor por stdio, para Claude Desktop u otro cliente local.
// Lee el export de una carpeta (--export) o el publicado (--url, por defecto https://vaiven.argentino.workers.dev/datos/).
// Se empaqueta con `npm run empaquetar -w @vaiven/mcp` en mcp/dist/vaiven-mcp.mjs.
import { resolve } from "node:path";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Repositorio, fuenteUrl, type FuenteDatos } from "./datos";
import { fuenteCarpeta } from "./fuente-carpeta";
import { VERSION_SERVIDOR, crearServidor } from "./servidor";

const URL_PUBLICADA = "https://vaiven.argentino.workers.dev/datos/";

const AYUDA = `vaiven-mcp ${VERSION_SERVIDOR}: servidor MCP de Vaivén por stdio.

Uso: vaiven-mcp [--export <carpeta>] [--url <base>]
  --export <carpeta>  lee el export de una copia local (por ejemplo, la carpeta export/ del repositorio)
  --url <base>        lee el export publicado en esa URL (por defecto, ${URL_PUBLICADA})
`;

function opcion(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stderr.write(AYUDA);
  process.exit(0);
}

const carpeta = opcion("--export");
const fuente: FuenteDatos = carpeta ? fuenteCarpeta(resolve(carpeta)) : fuenteUrl(opcion("--url") ?? URL_PUBLICADA);
const repo = new Repositorio(fuente);
// stdout es el canal del protocolo: los avisos van por stderr.
process.stderr.write(`Vaivén MCP ${VERSION_SERVIDOR} por stdio, con el export de ${carpeta ? resolve(carpeta) : opcion("--url") ?? URL_PUBLICADA}\n`);
serveStdio(() => crearServidor(repo), { onerror: (e) => process.stderr.write(`MCP: ${e.message}\n`) });
