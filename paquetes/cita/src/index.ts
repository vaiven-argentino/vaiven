// Cita sugerida (SPEC 9) en texto, APA y BibTeX. La usan la ficha de la web y la herramienta `citar` del MCP, así que
// las dos devuelven exactamente lo mismo. El texto es el que publica el export; APA y BibTeX se arman con los mismos
// datos. Si hay una transformación, se agrega una línea que la nombra: la calcula Vaivén, no la fuente.

export interface DatosCita {
  serie: string;
  variante: string;
  nombre: string;
  version_datos: string;
  cita: string;
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

/**
 * Lo que nombra la línea de la transformación en la cita, en el orden en que se aplica: pesos actuales →
 * frecuencia → medida → transformación → media móvil. En las series con dimensión pais, también la entidad.
 */
export interface OpcionesCita {
  /** Una entidad (la ficha) o varias (el MCP). */
  entidad?: string | string[];
  pesosActuales?: boolean;
  frecuencia?: string;
  medida?: string;
  /** Variante del IPC con que se deflactó (medida real). */
  deflactor?: string;
  baseReal?: string;
  transformacion?: string;
  mediaMovil?: number;
}

/** «frecuencia anual, variación interanual (%)», o `undefined` si la serie va tal cual se publica. */
export function nombreTransformacion(o: OpcionesCita): string | undefined {
  const partes: string[] = [];
  const entidades = typeof o.entidad === "string" ? [o.entidad] : (o.entidad ?? []);
  if (entidades.length === 1) partes.push(`entidad ${entidades[0]}`);
  else if (entidades.length > 1) partes.push(`entidades ${entidades.slice(0, -1).join(", ")} y ${entidades.at(-1)}`);
  if (o.pesosActuales) partes.push("en pesos actuales");
  if (o.frecuencia) partes.push(`frecuencia ${o.frecuencia}`);
  if (o.medida === "real") {
    partes.push(`a precios constantes${o.baseReal ? ` de ${o.baseReal}` : ""}, deflactada con el IPC «${o.deflactor ?? "ipc.oficial"}»`);
  } else if (o.medida === "en_dolares") {
    partes.push("en dólares");
  } else if (o.medida === "pct_pib") {
    partes.push("en % del PIB");
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

export function textoCita(d: DatosCita, transformacion?: string): string {
  return transformacion ? `${d.cita} Transformación: ${transformacion} (calculada por Vaivén).` : d.cita;
}

export function apa(d: DatosCita, transformacion?: string): string {
  const anio = d.version_datos.slice(0, 4);
  const dia = d.version_datos.slice(0, 10);
  const extra = transformacion ? ` Transformación: ${transformacion} (calculada por Vaivén).` : "";
  return `Vaivén. (${anio}). ${d.nombre}, variante «${d.variante}» (versión de datos ${dia}) [Conjunto de datos]. ${urlDeCita(d.cita)}${extra}`;
}

export function bibtex(d: DatosCita, transformacion?: string): string {
  const anio = d.version_datos.slice(0, 4);
  const dia = d.version_datos.slice(0, 10);
  const clave = `vaiven_${d.serie}_${d.variante}_${dia.replaceAll("-", "")}`.replace(/[^a-zA-Z0-9_]/g, "_");
  const nota = `Versión de datos ${dia}. Licencia CC BY 4.0.${transformacion ? ` Transformación: ${transformacion} (calculada por Vaivén).` : ""}`;
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
