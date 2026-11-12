// Cita sugerida (SPEC 9) en texto, APA y BibTeX. La usan la ficha de la web y la herramienta `citar` del MCP, así que
// las dos devuelven exactamente lo mismo. El texto es el que publica el export; APA y BibTeX se arman con los mismos
// datos. Si hay una transformación, se agrega una línea que la nombra: la calcula Vaivén, no la fuente. En las series
// con dimensión pais, el país va aparte: elegirlo no es una transformación.

export interface DatosCita {
  serie: string;
  variante: string;
  nombre: string;
  version_datos: string;
  cita: string;
  /** Las fuentes de la variante: si alguna no es CC BY 4.0, la cita en BibTeX lo dice. */
  fuentes?: Array<{ organismo: string; licencia: string }>;
}

/** Cómo se nombra la entidad en la cita: «País: Argentina.» o «Países: Argentina, Brasil y Mundo.». */
function lineaEntidad(entidad?: string | string[]): string {
  const lista = typeof entidad === "string" ? [entidad] : (entidad ?? []);
  if (!lista.length) return "";
  const texto = lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`;
  return ` ${lista.length === 1 ? "País" : "Países"}: ${texto}.`;
}

function lineaTransformacion(transformacion?: string): string {
  return transformacion ? ` Transformación: ${transformacion} (calculada por Vaivén).` : "";
}

/** Nombres de las transformaciones, como los muestra la ficha. */
export const NOMBRE_TRANSFORMACION: Record<string, string> = {
  nivel: "Nivel (valor publicado)",
  var_mensual: "Variación mensual (%)",
  var_interanual: "Variación interanual (%)",
  var_dic_dic: "Variación diciembre–diciembre (%)",
  acumulada_anio: "Variación acumulada en el año (%)",
  base_100: "Índice base 100",
  indice_desde_tasas: "Índice desde las tasas (año base = 100)",
};

/** Nombres de las medidas (SPEC 4), como los muestra la ficha. */
export const NOMBRE_MEDIDA: Record<string, string> = {
  real: "A precios constantes (real)",
  en_dolares: "En dólares",
  pct_pib: "En % del PIB",
};

/** Qué PIB divide en % del PIB (el valor de `denominador` en los insumos). */
export const NOMBRE_DENOMINADOR: Record<string, string> = {
  "cada-base": "PIB publicado en cada base",
  retropolado: "PIB retropolado desde la base 2004",
  "banco-mundial": "PIB en dólares del Banco Mundial",
};

/**
 * Lo que nombra la línea de la transformación en la cita, en el orden en que se aplica: pesos actuales →
 * frecuencia → medida → transformación → media móvil. La entidad (país) no va acá: ver `textoCita`.
 */
export interface OpcionesCita {
  pesosActuales?: boolean;
  frecuencia?: string;
  medida?: string;
  /** Variante del IPC con que se deflactó (medida real). */
  deflactor?: string;
  baseReal?: string;
  /** PIB con que se calculó el % del PIB («cada-base», «retropolado» o «banco-mundial»). */
  denominador?: string;
  transformacion?: string;
  mediaMovil?: number;
}

/** «frecuencia anual, variación interanual (%)», o `undefined` si la serie va tal cual se publica. */
export function nombreTransformacion(o: OpcionesCita): string | undefined {
  const partes: string[] = [];
  if (o.pesosActuales) partes.push("en pesos actuales");
  if (o.frecuencia) partes.push(`frecuencia ${o.frecuencia}`);
  if (o.medida === "real") {
    partes.push(`a precios constantes${o.baseReal ? ` de ${o.baseReal}` : ""}, deflactada con el IPC «${o.deflactor ?? "ipc.oficial"}»`);
  } else if (o.medida === "en_dolares") {
    partes.push("en dólares");
  } else if (o.medida === "pct_pib") {
    partes.push(`en % del PIB${o.denominador ? ` (${NOMBRE_DENOMINADOR[o.denominador] ?? o.denominador})` : ""}`);
  }
  if (o.transformacion && o.transformacion !== "nivel") {
    partes.push((NOMBRE_TRANSFORMACION[o.transformacion] ?? o.transformacion).toLowerCase());
  }
  if (o.mediaMovil) partes.push(`media móvil de ${o.mediaMovil} períodos`);
  return partes.length ? partes.join(", ") : undefined;
}

export function urlDeCita(cita: string): string {
  return cita.slice(cita.lastIndexOf("https://")).trim();
}

/** `entidad`: el país o los países elegidos, en las series con dimensión pais (con su nombre, en la ficha y en el MCP). */
export function textoCita(d: DatosCita, transformacion?: string, entidad?: string | string[]): string {
  return `${d.cita}${lineaEntidad(entidad)}${lineaTransformacion(transformacion)}`;
}

export function apa(d: DatosCita, transformacion?: string, entidad?: string | string[]): string {
  const anio = d.version_datos.slice(0, 4);
  const dia = d.version_datos.slice(0, 10);
  const extra = `${lineaEntidad(entidad)}${lineaTransformacion(transformacion)}`;
  return `Vaivén. (${anio}). ${d.nombre}, variante «${d.variante}» (versión de datos ${dia}) [Conjunto de datos]. ${urlDeCita(d.cita)}${extra}`;
}

export function bibtex(d: DatosCita, transformacion?: string, entidad?: string | string[]): string {
  const anio = d.version_datos.slice(0, 4);
  const dia = d.version_datos.slice(0, 10);
  const clave = `vaiven_${d.serie}_${d.variante}_${dia.replaceAll("-", "")}`.replace(/[^a-zA-Z0-9_]/g, "_");
  // Los datos derivados de Vaivén son CC BY 4.0; una fuente con otros términos (Bruegel) los conserva.
  const otras = [...new Set((d.fuentes ?? []).filter((f) => f.licencia !== "CC-BY-4.0").map((f) => f.organismo))];
  const licencia = otras.length
    ? `Licencia de Vaivén CC BY 4.0; los datos de ${otras.join(" y ")} conservan sus propios términos de uso.`
    : "Licencia CC BY 4.0.";
  const nota = `Versión de datos ${dia}. ${licencia}${lineaEntidad(entidad)}${lineaTransformacion(transformacion)}`;
  return [
    `@misc{${clave},`,
    `  author = {{Vaivén}},`,
    `  title = {${d.nombre}, variante «${d.variante}»},`,
    `  year = {${anio}},`,
    `  howpublished = {Conjunto de datos},`,
    `  note = {${nota}},`,
    `  url = {${urlDeCita(d.cita)}}`,
    `}`,
  ].join("\n");
}

/** Cita de los registros de períodos o eventos (export/periodos.json y eventos.json), igual en la web y en el MCP. */
export function citaRegistro(registro: "periodos" | "eventos", version_datos: string, sitio = "https://vaiven.argentino.workers.dev"): string {
  const nombre = registro === "periodos" ? "Períodos de la política económica argentina, 1970–hoy" : "Eventos económicos argentinos, 1970–hoy";
  return `Vaivén (${version_datos.slice(0, 4)}). ${nombre}. Versión de datos ${version_datos.slice(0, 10)}. ${sitio}/periodos/`;
}
