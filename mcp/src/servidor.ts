// El servidor MCP: las cuatro herramientas de la fase 3, las dos de períodos de la 4b y las dos de comparación de la
// 4c/4d sobre un Repositorio. Lo usan el Worker (/mcp) y la
// variante local por stdio. Los esquemas de los parámetros se arman una sola vez, al cargar el módulo, para no
// gastar CPU en cada pedido (el plan gratuito de Workers da 10 ms por pedido).
import { McpServer, type CallToolResult, type StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { z } from "zod";
import paquete from "../package.json";
import { ErrorHerramienta, type Repositorio } from "./datos";
import { buscarSeries } from "./herramientas/buscar";
import { citar } from "./herramientas/citar";
import { compararSeries, especificacionGrafico } from "./herramientas/comparar";
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

/** Los parámetros de una serie dentro de comparar_series y especificacion_grafico: los de obtener_serie sin el período. */
const serieComparada = z.strictObject({
  id,
  variante: z.string().optional().describe(PARAMETRO.variante),
  pesos_actuales: z.boolean().optional().describe(PARAMETRO.pesosActuales),
  frecuencia: frecuencia.optional().describe(PARAMETRO.frecuencia),
  medida: medida.optional().describe(PARAMETRO.medida),
  deflactor: z.string().optional().describe(PARAMETRO.deflactor),
  base_real: periodo(PARAMETRO.baseReal).optional(),
  denominador: denominador.optional().describe(PARAMETRO.denominador),
  transformacion: z.enum(TRANSFORMACIONES).optional().describe(PARAMETRO.transformacion),
  base: z.string().optional().describe(PARAMETRO.base),
  paises: paises.optional().describe(PARAMETRO.paises),
});
const aviso = z.object({ id: z.string(), descripcion: z.string(), series: z.array(z.number()).optional() });

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
  comparar_series: conJsonFijo(z.strictObject({
    series: z.array(serieComparada).min(1).max(4).describe(PARAMETRO.series),
    desde: periodo(PARAMETRO.desdeComun).optional(),
    hasta: periodo(PARAMETRO.hastaComun).optional(),
    alinear: z.enum(["frecuencia_comun", "ninguna"]).optional().describe(PARAMETRO.alinear),
  })),
  especificacion_grafico: conJsonFijo(z.strictObject({
    series: z.array(serieComparada).min(1).max(4).describe(PARAMETRO.seriesGrafico),
    desde: periodo(PARAMETRO.desdeComun).optional(),
    hasta: periodo(PARAMETRO.hastaComun).optional(),
    sombreado: z.enum(["catedra", "gobierno", "mandato", "ministro", "plan", "regimen_cambiario"]).optional().describe(PARAMETRO.sombreado),
    eventos: z.union([z.boolean(), z.array(z.string()).min(1)]).optional().describe(PARAMETRO.eventos),
    ejes: z.enum(["auto", "paneles"]).optional().describe(PARAMETRO.ejes),
  })),
};

/**
 * Lo que devuelven las dos herramientas de comparación (SPEC 7.2), también en `structuredContent` (para el gráfico
 * interactivo de la 4e, 7.4). Los campos grandes (los datos y la especificación) van como `unknown`: el SDK valida la
 * salida en cada pedido y, en el plan gratuito, cada milisegundo de CPU cuenta. El contrato completo está en
 * tests/contrato/ (comparar_series-1.0 y especificacion_grafico-1.0), que las pruebas validan con las respuestas reales.
 */
export const SALIDAS = {
  comparar_series: conJsonFijo(z.object({
    alinear: z.enum(["frecuencia_comun", "ninguna"]),
    frecuencia: z.enum(["mensual", "trimestral", "anual"]).optional(),
    columnas: z.array(z.object({ serie: z.number(), id: z.string(), pais: z.string().optional(), unidad: z.string(), notas: z.array(z.string()).optional() })).optional(),
    datos: z.unknown().optional(),
    series: z.array(z.object({ numero: z.number(), id: z.string(), unidad: z.string(), cita: z.string() }).passthrough()),
    advertencias_combinacion: z.array(aviso),
    n_observaciones: z.number(),
    version_datos: z.string(),
    notas: z.array(z.string()).optional(),
  })),
  especificacion_grafico: conJsonFijo(z.object({
    especificacion: z.record(z.string(), z.unknown()),
    url_explorador: z.string(),
    disposicion: z.object({ tipo: z.enum(["unico", "doble_eje", "paneles"]), paneles: z.array(z.object({ unidad: z.string(), series: z.array(z.number()) })) }),
    series: z.array(z.object({ numero: z.number(), id: z.string(), unidad: z.string(), cita: z.string() }).passthrough()),
    advertencias_combinacion: z.array(aviso),
    sombreado: z.object({ tipo: z.string(), periodos: z.number() }).optional(),
    eventos: z.array(z.object({ letra: z.string(), fecha: z.string(), nombre: z.string() })).optional(),
    n_observaciones: z.number(),
    version_datos: z.string(),
  })),
};

// Solo leen datos públicos: no cambian nada y dan lo mismo si se repiten.
const ANOTACIONES = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/**
 * El resultado va como JSON en un bloque de texto, que lee cualquier cliente. No se repite en `structuredContent`:
 * duplicaba la respuesta (hasta 34 KB en el IPC completo) y su serialización, y en el plan gratuito de Workers cada
 * milisegundo de CPU cuenta. Las herramientas no declaran `outputSchema`, así que el protocolo no lo exige.
 */
async function responder(f: () => Promise<Record<string, unknown>>, estructurado = false, enTexto?: (r: Record<string, unknown>) => Record<string, unknown>): Promise<CallToolResult> {
  try {
    const r = await f();
    // Las herramientas con `outputSchema` (comparar_series y especificacion_grafico) devuelven también
    // `structuredContent` (SPEC 7.2). El texto lleva el mismo JSON, salvo lo que `enTexto` deja afuera (la especificación
    // del gráfico, que solo va en structuredContent: SPEC 7.2 y 7.4).
    return { content: [{ type: "text", text: JSON.stringify(enTexto ? enTexto(r) : r) }], ...(estructurado ? { structuredContent: r } : {}) };
  } catch (e) {
    if (e instanceof ErrorHerramienta) return { isError: true, content: [{ type: "text", text: e.message }] };
    console.error(e);
    return { isError: true, content: [{ type: "text", text: "Error interno de Vaivén al leer los datos. Probá de nuevo en un rato." }] };
  }
}

/**
 * El texto de especificacion_grafico, sin la especificación de Vega-Lite (decidido con Camilo el 14/11/2026): con 4 series
 * desde 1970 pesaría unos 550 KB en la conversación. La especificación completa va en structuredContent.
 */
export function sinEspecificacion(r: Record<string, unknown>): Record<string, unknown> {
  const { especificacion: _e, ...resto } = r;
  return {
    ...resto,
    especificacion: "La especificación de Vega-Lite completa (con los datos) va en structuredContent.especificacion. Para mostrar el gráfico sin ella, compartí url_explorador.",
  };
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
  servidor.registerTool("comparar_series", { ...config("comparar_series"), inputSchema: ESQUEMAS.comparar_series, outputSchema: SALIDAS.comparar_series },
    (a) => responder(() => compararSeries(repo, a), true));
  servidor.registerTool("especificacion_grafico", { ...config("especificacion_grafico"), inputSchema: ESQUEMAS.especificacion_grafico, outputSchema: SALIDAS.especificacion_grafico },
    (a) => responder(() => especificacionGrafico(repo, a), true, sinEspecificacion));
  return servidor;
}
