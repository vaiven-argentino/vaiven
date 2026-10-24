// /mcp por Streamable HTTP, sin estado y sin autenticación (SPEC 7.1). El SDK atiende a los clientes de la revisión
// 2026-07-28 y, sin sesión, a los de la era 2025 (negociación de versiones). Acá se suma lo que el SDK deja a cargo
// de quien lo monta: CORS, la respuesta a GET y OPTIONS, la validación del Host y el límite de pedidos.
import { createMcpHandler, localhostAllowedHostnames, validateHostHeader, type McpHttpHandler } from "@modelcontextprotocol/server";
import type { Repositorio } from "./datos";
import { crearServidor } from "./servidor";

export const HOST_PUBLICO = "vaiven.argentino.workers.dev";

export interface OpcionesHttp {
  /** Hosts aceptados. Un Host ajeno da 403: es la defensa contra el DNS rebinding. */
  hosts?: string[];
  /** Devuelve `false` si el pedido supera el límite (en el Worker, el binding de Rate Limiting por IP). */
  limitador?: (request: Request) => Promise<boolean>;
  /** Recibe un resumen de cada pedido POST (en el Worker va a los registros, para ver la CPU por método). */
  registrar?: (resumen: ResumenPedido) => void;
}

/** Qué pidió el cliente: método JSON-RPC, herramienta (en tools/call) y versión del protocolo que declara. */
export interface ResumenPedido {
  mcp: { metodo: string; herramienta?: string; protocolo?: string; estado: number };
}

/** Lee el método y la herramienta de una copia del cuerpo; si no es JSON-RPC válido, lo dice y sigue. */
async function resumir(request: Request): Promise<Omit<ResumenPedido["mcp"], "estado">> {
  const protocolo = request.headers.get("mcp-protocol-version") ?? undefined;
  try {
    const cuerpo = (await request.clone().json()) as { method?: unknown; params?: { name?: unknown } };
    const metodo = typeof cuerpo.method === "string" ? cuerpo.method : "(respuesta o lote)";
    const herramienta = metodo === "tools/call" && typeof cuerpo.params?.name === "string" ? cuerpo.params.name : undefined;
    return { metodo, ...(herramienta ? { herramienta } : {}), ...(protocolo ? { protocolo } : {}) };
  } catch {
    return { metodo: "(cuerpo ilegible)", ...(protocolo ? { protocolo } : {}) };
  }
}

// Los datos son públicos y no hay cookies ni credenciales: se acepta cualquier origen, como en /datos/.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID",
  "access-control-expose-headers": "Mcp-Protocol-Version, Mcp-Session-Id",
  "access-control-max-age": "86400",
};

function conEncabezados(respuesta: Response): Response {
  const headers = new Headers(respuesta.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  headers.set("cache-control", "no-store");
  return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers });
}

const manejadores = new WeakMap<Repositorio, McpHttpHandler>();

function manejador(repo: Repositorio): McpHttpHandler {
  let h = manejadores.get(repo);
  if (!h) {
    // Una instancia nueva del servidor por pedido (la fábrica): no queda nada guardado entre pedidos.
    h = createMcpHandler(() => crearServidor(repo), { onerror: (e) => console.error(`MCP: ${e.message}`) });
    manejadores.set(repo, h);
  }
  return h;
}

export async function manejarMcp(request: Request, repo: Repositorio, opciones: OpcionesHttp = {}): Promise<Response> {
  if (request.method === "OPTIONS") return conEncabezados(new Response(null, { status: 204 }));

  // En Workers el pedido trae el encabezado Host; un Request armado en Node, no: ahí vale el host de la URL.
  const host = validateHostHeader(request.headers.get("host") ?? new URL(request.url).host, opciones.hosts ?? [HOST_PUBLICO, ...localhostAllowedHostnames()]);
  if (!host.ok) {
    return conEncabezados(Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: `Host no permitido: ${host.message}` } }, { status: 403 }));
  }

  if (request.method !== "POST") {
    // Sin estado no hay flujo SSE aparte ni sesiones que cerrar: GET y DELETE no corresponden.
    return conEncabezados(new Response(
      "Este es el servidor MCP de Vaivén. Conectalo desde un cliente MCP (por ejemplo, como conector personalizado en Claude); instrucciones en https://vaiven.argentino.workers.dev/agentes/\n",
      { status: 405, headers: { allow: "POST, OPTIONS", "content-type": "text/plain; charset=utf-8" } },
    ));
  }

  if (opciones.limitador && !(await opciones.limitador(request))) {
    return conEncabezados(Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Demasiados pedidos desde esta dirección. Esperá un minuto y probá de nuevo." } },
      { status: 429, headers: { "retry-after": "60" } },
    ));
  }

  const resumen = opciones.registrar ? await resumir(request) : undefined;
  const respuesta = conEncabezados(await manejador(repo).fetch(request));
  if (resumen) opciones.registrar!({ mcp: { ...resumen, estado: respuesta.status } });
  return respuesta;
}
