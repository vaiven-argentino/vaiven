// El servidor MCP: las cuatro herramientas de la fase 3 y las dos de períodos de la 4b sobre un Repositorio. Lo usan el Worker (/mcp) y la
// variante local por stdio. Los esquemas de los parámetros se arman una sola vez, al cargar el módulo, para no
// gastar CPU en cada pedido (el plan gratuito de Workers da 10 ms por pedido).
import { McpServer, type CallToolResult, type StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { z } from "zod";
import paquete from "../package.json";
import { ErrorHerramienta, type Repositorio } from "./datos";
import { buscarSeries } from "./herramientas/buscar";
import { citar } from "./herramientas/citar";
import { PERIODO } from "./herramientas/comun";
import { describirSerie } from "./herramientas/describir";
import { obtenerSerie } from "./herramientas/obtener";
import { listarPeriodos, periodoEnFecha } from "./herramientas/periodos";
import { DESCRIPCION, INSTRUCCIONES, PARAMETRO, TITULO } from "./textos";

/**
 * El SDK arma el JSON Schema de cada herramienta (para tools/list) una vez por instancia del servidor, o sea, en cada
 * pedido. Con este envoltorio se arma una sola vez por isolate y después se reusa.
 */
function conJsonFijo<S extends StandardSchemaWithJSON>(esquema: S): S {
  const std = esquema["~standard"];
  const memo = new Map<string, Record<string, unknown>>();
  const fijo = (tipo: "input" | "output") => (opciones: Parameters<typeof std.jsonSchema.input>[0]) => {
    const clave = `${tipo}:${opciones.target}:${JSON.stringify(opciones.libraryOptions ?? {})}`;
    let json = memo.get(clave);
    if (!json) {
      json = std.jsonSchema[tipo](opciones);
      memo.set(clave, json);
    }
    return json;
  };
  return { "~standard": { ...std, jsonSchema: { input: fijo("input"), output: fijo("output") } } } as unknown as S;
}

const periodo = (descripcion: string) => z.string().regex(PERIODO, "Usá AAAA o AAAA-MM.").describe(descripcion);
const id = z.string().min(1).describe(PARAMETRO.id);
const frecuencia = z.enum(["trimestral", "anual"]);
const TRANSFORMACIONES = ["nivel", "var_mensual", "var_interanual", "var_dic_dic", "acumulada_anio", "base_100", "indice_desde_tasas"] as const;
const medida = z.enum(["real", "en_dolares", "pct_pib"]);
const denominador = z.enum(["cada-base", "retropolado", "banco-mundial"]);
const paises = z.array(z.string().regex(/^[A-Za-z0-9]{3}$/, "Usá códigos de tres letras (ISO3 o agregado del Banco Mundial).")).max(30);

// Esquemas estrictos (segunda revisión de la 4a): un parámetro mal escrito (por ejemplo, `entidades` en lugar de
// `paises`) da un error que el agente ve, en lugar de ignorarse sin aviso.
export const ESQUEMAS = {
  buscar_series: conJsonFijo(z.strictObject({
    texto: z.string().optional().describe(PARAMETRO.texto),
    bloque: z.string().optional().describe(PARAMETRO.bloque),
    prioridad: z.enum(["A", "B"]).optional().describe(PARAMETRO.prioridad),
    desde: periodo(PARAMETRO.desdeBusqueda).optional(),
    hasta: periodo(PARAMETRO.hastaBusqueda).optional(),
  })),
  describir_serie: conJsonFijo(z.strictObject({ id })),
  obtener_serie: conJsonFijo(z.strictObject({
    id,
    variante: z.string().optional().describe(PARAMETRO.variante),
    desde: periodo(PARAMETRO.desde).optional(),
    hasta: periodo(PARAMETRO.hasta).optional(),
    pesos_actuales: z.boolean().optional().describe(PARAMETRO.pesosActuales),
    frecuencia: frecuencia.optional().describe(PARAMETRO.frecuencia),
    medida: medida.optional().describe(PARAMETRO.medida),
    deflactor: z.string().optional().describe(PARAMETRO.deflactor),
    base_real: periodo(PARAMETRO.baseReal).optional(),
    denominador: denominador.optional().describe(PARAMETRO.denominador),
    transformacion: z.enum(TRANSFORMACIONES).optional().describe(PARAMETRO.transformacion),
    base: z.string().optional().describe(PARAMETRO.base),
    paises: paises.optional().describe(PARAMETRO.paises),
  })),
  citar: conJsonFijo(z.strictObject({
    id,
    variante: z.string().optional().describe(PARAMETRO.variante),
    formato: z.enum(["texto", "apa", "bibtex"]).optional().describe(PARAMETRO.formato),
    transformacion: z.enum(TRANSFORMACIONES).optional().describe(PARAMETRO.transformacionCita),
    frecuencia: frecuencia.optional().describe(PARAMETRO.frecuenciaCita),
    pesos_actuales: z.boolean().optional().describe(PARAMETRO.comoEnObtener),
    medida: medida.optional().describe(PARAMETRO.comoEnObtener),
    deflactor: z.string().optional().describe(PARAMETRO.comoEnObtener),
    base_real: periodo(PARAMETRO.comoEnObtener).optional(),
    denominador: denominador.optional().describe(PARAMETRO.comoEnObtener),
    paises: paises.optional().describe(PARAMETRO.comoEnObtener),
  })),
  listar_periodos: conJsonFijo(z.strictObject({
    tipo: z.enum(["gobierno", "ministro", "plan", "regimen_cambiario", "catedra", "episodio"]).optional().describe(PARAMETRO.tipoPeriodo),
    por_mandato: z.boolean().optional().describe(PARAMETRO.porMandato),
  })),
  periodo_en_fecha: conJsonFijo(z.strictObject({
    fecha: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Usá AAAA-MM-DD (un día) o AAAA-MM (un mes).").describe(PARAMETRO.fechaPeriodo),
  })),
};

// Solo leen datos públicos: no cambian nada y dan lo mismo si se repiten.
const ANOTACIONES = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/**
 * El resultado va como JSON en un bloque de texto, que lee cualquier cliente. No se repite en `structuredContent`:
 * duplicaba la respuesta (hasta 34 KB en el IPC completo) y su serialización, y en el plan gratuito de Workers cada
 * milisegundo de CPU cuenta. Las herramientas no declaran `outputSchema`, así que el protocolo no lo exige.
 */
async function responder(f: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    const r = await f();
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  } catch (e) {
    if (e instanceof ErrorHerramienta) return { isError: true, content: [{ type: "text", text: e.message }] };
    console.error(e);
    return { isError: true, content: [{ type: "text", text: "Error interno de Vaivén al leer los datos. Probá de nuevo en un rato." }] };
  }
}

export const VERSION_SERVIDOR = paquete.version;

export function crearServidor(repo: Repositorio): McpServer {
  const servidor = new McpServer(
    { name: "vaiven", title: "Vaivén: series económicas argentinas", version: VERSION_SERVIDOR, websiteUrl: "https://vaiven.argentino.workers.dev/agentes/" },
    { instructions: INSTRUCCIONES },
  );
  const config = (nombre: keyof typeof ESQUEMAS) => ({
    title: TITULO[nombre], description: DESCRIPCION[nombre], annotations: { title: TITULO[nombre], ...ANOTACIONES },
  });
  servidor.registerTool("buscar_series", { ...config("buscar_series"), inputSchema: ESQUEMAS.buscar_series },
    (a) => responder(() => buscarSeries(repo, a)));
  servidor.registerTool("describir_serie", { ...config("describir_serie"), inputSchema: ESQUEMAS.describir_serie },
    (a) => responder(() => describirSerie(repo, a)));
  servidor.registerTool("obtener_serie", { ...config("obtener_serie"), inputSchema: ESQUEMAS.obtener_serie },
    (a) => responder(() => obtenerSerie(repo, a)));
  servidor.registerTool("citar", { ...config("citar"), inputSchema: ESQUEMAS.citar },
    (a) => responder(() => citar(repo, a)));
  servidor.registerTool("listar_periodos", { ...config("listar_periodos"), inputSchema: ESQUEMAS.listar_periodos },
    (a) => responder(() => listarPeriodos(repo, a)));
  servidor.registerTool("periodo_en_fecha", { ...config("periodo_en_fecha"), inputSchema: ESQUEMAS.periodo_en_fecha },
    (a) => responder(() => periodoEnFecha(repo, a)));
  return servidor;
}
