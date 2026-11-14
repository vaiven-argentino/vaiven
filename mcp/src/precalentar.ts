// Precalentamiento del servidor para el Worker. En Workers, el arranque del isolate (el código a nivel de módulo)
// tiene su propio límite de 1 s, mientras que cada pedido tiene 10 ms de CPU en el plan gratuito. Sin esto, el primer
// pedido de cada isolate paga la inicialización del SDK, de zod y de las transformaciones (unos 50 ms medidos en
// producción). Todo lo de acá es sincrónico y no lee el export: el binding de assets recién existe en el pedido, y
// workerd no deja usar temporizadores ni números aleatorios al cargar el módulo (los usa el transporte HTTP del SDK,
// que por eso se inicializa recién con el primer pedido).
// En Node (variante local) no se usa: ahí conviene la inicialización perezosa (lo dice el propio SDK).
import { preloadSchemas } from "@modelcontextprotocol/server";
import { transformar, type SerieExportada } from "@vaiven/transformaciones";
import { TEMA_CLARO, alinearVista, armarVista, porDefecto, type Documento } from "@vaiven/grafico";
import { apa, bibtex, nombreTransformacion, textoCita } from "@vaiven/cita";
import { Repositorio } from "./datos";
import { ESQUEMAS, crearServidor } from "./servidor";

const SERIE_DE_PRUEBA: SerieExportada = {
  id: "precalentar.prueba", unidad: "índice", tipo: "precio", agregacion: "promedio", frecuencia: "mensual",
  transformaciones: ["var_mensual", "var_interanual", "base_100", "frecuencia"],
  tramos: [{ fuente: "f.prueba", desde: "2000-01", hasta: "hoy", frecuencia: "mensual" }],
  advertencias: [{ id: "q.prueba", desde: "2000-06", hasta: null, tipo: "metodologia", descripcion: "Prueba." }],
  excluidos: [{ fecha: "2000-03", motivo: "Prueba." }],
  datos: Array.from({ length: 36 }, (_, i) => [`${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, 100 + i] as [string, number])
    .filter(([f]) => f !== "2000-03"),
};

export function precalentar(): void {
  // Los esquemas del protocolo que el SDK arma perezosamente.
  preloadSchemas();
  // El JSON Schema de cada herramienta (queda fijo por isolate) y los validadores de zod.
  const servidor = crearServidor(new Repositorio({ leer: () => Promise.reject(new Error("precalentamiento")) }));
  for (const nombre of Object.keys(ESQUEMAS) as Array<keyof typeof ESQUEMAS>) {
    servidor.toolInputSchemaJson(nombre);
  }
  ESQUEMAS.obtener_serie["~standard"].validate({ id: "ipc", desde: "2001", hasta: "2002-06", transformacion: "var_interanual" });
  ESQUEMAS.buscar_series["~standard"].validate({ texto: "inflación" });
  // Las transformaciones y la cita, sobre una serie chica en memoria.
  transformar(SERIE_DE_PRUEBA, { transformacion: "var_interanual", desde: "2001" });
  transformar(SERIE_DE_PRUEBA, { frecuencia: "anual", transformacion: "base_100", base: { desde: "2001", hasta: "2001" } });
  const doc = { serie: "prueba", variante: "oficial", nombre: "Prueba", version_datos: "2026-01-01T00:00:00Z", cita: "Vaivén (2026). Prueba. https://vaiven.argentino.workers.dev/series/prueba/" };
  const tr = nombreTransformacion({ transformacion: "var_interanual" });
  textoCita(doc, tr); apa(doc, tr); bibtex(doc, tr);
  // La comparación y el armado del gráfico (comparar_series y especificacion_grafico, fase 4c/4d): sin esto, el primer
  // pedido de cada isolate pagaba unos 95 ms de compilación (medido en Node con mcp/scripts/medir-cpu.mjs).
  const a = { ...SERIE_DE_PRUEBA, empalme: "derivar", serie: "prueba", variante: "a" } as unknown as Documento;
  const b = { ...a, id: "precalentar.otra", unidad: "otra unidad", variante: "b" } as unknown as Documento;
  const estado = { series: [{ ...porDefecto("prueba", "a", a), t: "var_interanual" as const }, porDefecto("prueba", "b", b)], ejes: "" as const };
  const vista = { estado, docs: [a, b], insumos: {}, tema: TEMA_CLARO, ancho: 800, alto: 400 };
  armarVista(vista);
  armarVista({ ...vista, estado: { ...estado, ejes: "paneles" } });
  alinearVista(vista);
}
