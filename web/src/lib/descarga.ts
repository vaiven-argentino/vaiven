// Descargas de la vista (SPEC 6.2). `csvDeVista` es el CSV de la ficha (una serie, formato de la 4b); el explorador usa el
// CSV largo y las hojas de `hojasVista` (más abajo). El XLSX lleva, además de los datos, una hoja de metadatos, la cita
// y, si hay sombreado, los períodos con sus fuentes. Con sombreado, cada fila
// lleva tres columnas del período: `periodo` (el vigente en el instante o en el punto medio del dato, con «(sin
// mayoría)» si no pasa del 50 %), `periodo_proporcion` y `otros_periodos` (ubicacion.ts de la librería). Funciones
// puras: el navegador solo las convierte en archivo.

export interface FilaDescarga {
  fecha: string;
  pais?: string;
  valor: number | null;
  /** El período del sombreado al que se asigna el dato, la proporción que cubre y el resto del reparto. */
  periodo?: string;
  periodo_proporcion?: number | string;
  otros_periodos?: string;
}

export interface VistaDescarga {
  /** Encabezado de la columna de valores (la unidad). */
  unidad: string;
  conPais: boolean;
  /** Nombre de la columna del período («Gobierno», «Régimen cambiario»…), si hay sombreado. */
  periodo?: string;
  filas: FilaDescarga[];
  metadatos: Array<[string, string]>;
  cita: { texto: string; apa: string; bibtex: string };
  periodos?: Array<{ nombre: string; desde: string; hasta: string | null; confianza?: string; fuentes: string }>;
}

const comillas = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

export const COLUMNAS_PERIODO = ["periodo", "periodo_proporcion", "otros_periodos"] as const;

/** CSV de la vista: fecha[, pais], valor[, periodo, periodo_proporcion, otros_periodos]. Sin datos, celda vacía (nunca un cero). */
export function csvDeVista(v: VistaDescarga): string {
  const cab = ["fecha", ...(v.conPais ? ["pais"] : []), "valor", ...(v.periodo ? COLUMNAS_PERIODO : [])];
  const lineas = v.filas.map((f) => [
    f.fecha, ...(v.conPais ? [f.pais ?? ""] : []), f.valor === null ? "" : String(f.valor),
    ...(v.periodo ? [comillas(f.periodo ?? ""), comillas(String(f.periodo_proporcion ?? "")), comillas(f.otros_periodos ?? "")] : []),
  ].join(","));
  return [cab.join(","), ...lineas].join("\n") + "\n";
}

type Celda = { value: string | number; fontWeight?: "bold"; wrap?: boolean } | null;

// ── Descargas del explorador con una o varias series (SPEC 6.2, fase 4c/4d) ─────────────
// El CSV va en formato largo, con una fila por observación y la fecha de cada serie en su frecuencia (también con una
// sola serie). El XLSX lleva la hoja larga (igual al CSV), la hoja ancha a la frecuencia común (alinear.ts), los
// metadatos con la regla de alineación, una cita por serie y, con sombreado, los períodos.

/** Las columnas del CSV largo. `pais` va solo si la vista tiene una serie internacional. */
export const COLUMNAS_LARGO = ["fecha", "serie", "variante", "pais", "transformacion", "unidad", "valor", ...COLUMNAS_PERIODO] as const;

export interface FilaLarga {
  fecha: string;
  serie: string;
  variante: string;
  pais?: string;
  /** La transformación en palabras («variación interanual, en términos reales (IPC oficial)»); sin ninguna, «nivel». */
  transformacion: string;
  unidad: string;
  valor: number | null;
  periodo?: string;
  periodo_proporcion?: number | string;
  otros_periodos?: string;
}

/** La regla de la frecuencia común (SPEC 4.1), para la hoja de metadatos y la nota de la tabla. */
export const REGLA_ALINEACION =
  "Todas las series pasan a la frecuencia más baja del conjunto (mensual < trimestral < anual; una semestral de la EPH lleva a anual y una diaria cuenta como mensual), " +
  "con la agregación de cada serie y solo con períodos completos. La medida y la variación se aplican después de agregar: una variación interanual alineada a anual " +
  "es la variación del promedio anual, no el promedio de las variaciones. Nunca se interpola: un período sin dato queda vacío.";

export interface HojaAncha {
  frecuencia: string;
  /** Una por serie (y país): el nombre y la unidad. */
  columnas: Array<{ titulo: string; unidad: string }>;
  filas: Array<[string, ...Array<number | null>]>;
  /** Con sombreado: el período de cada fila (su intervalo), con la regla de ubicación. */
  periodos?: Array<Partial<ColumnasPeriodo>>;
}

type ColumnasPeriodo = { periodo?: string; periodo_proporcion?: number | string; otros_periodos?: string };

export interface VistaDescargaVarias {
  filas: FilaLarga[];
  /** La vista tiene una serie internacional: lleva la columna `pais`. */
  conPais: boolean;
  ancha: HojaAncha;
  /** El nombre de la columna del período («Gobierno»…), con sombreado. */
  columnaPeriodo?: string;
  metadatos: Array<[string, string]>;
  citas: Array<{ serie: string; texto: string; apa: string; bibtex: string }>;
  periodos?: VistaDescarga["periodos"];
}

/** CSV largo: una fila por observación de cada serie (y país). Sin dato, celda vacía (nunca un cero). */
export function csvLargo(v: Pick<VistaDescargaVarias, "filas" | "conPais">): string {
  const cab = COLUMNAS_LARGO.filter((c) => c !== "pais" || v.conPais);
  const lineas = v.filas.map((f) => cab.map((c) => {
    const x = f[c as keyof FilaLarga];
    return x === null || x === undefined ? "" : typeof x === "number" ? String(x) : comillas(x);
  }).join(","));
  return [cab.join(","), ...lineas].join("\n") + "\n";
}

/** Las hojas del XLSX de la vista: larga, ancha, metadatos, citas y, con sombreado, períodos. */
export function hojasVista(v: VistaDescargaVarias) {
  const negrita = (t: string): Celda => ({ value: t, fontWeight: "bold" });
  const texto = (t: string | null | undefined): Celda => (t ? { value: t } : null);
  const valor = (x: number | string | null | undefined): Celda => (x === null || x === undefined || x === "" ? null : { value: x });
  const cab = COLUMNAS_LARGO.filter((c) => c !== "pais" || v.conPais);
  const larga: Celda[][] = [cab.map(negrita), ...v.filas.map((f) => cab.map((c) => {
    const x = f[c as keyof FilaLarga];
    return typeof x === "number" ? { value: x } : texto(x as string | undefined);
  }))];
  const conPeriodo = !!v.columnaPeriodo && !!v.ancha.periodos;
  const extra = conPeriodo ? [v.columnaPeriodo!, "Proporción del período", "Otros períodos"] : [];
  const ancha: Celda[][] = [
    [negrita(`Fecha (${v.ancha.frecuencia})`), ...v.ancha.columnas.map((c) => negrita(c.titulo)), ...extra.map(negrita)],
    [negrita("Unidad"), ...v.ancha.columnas.map((c) => texto(c.unidad)), ...extra.map(() => null)],
    ...v.ancha.filas.map(([fecha, ...vs], k) => [{ value: fecha }, ...vs.map(valor),
      ...(conPeriodo ? [texto(v.ancha.periodos![k].periodo), valor(v.ancha.periodos![k].periodo_proporcion), texto(v.ancha.periodos![k].otros_periodos)] : [])]),
  ];
  const hojas = [
    { sheet: "Datos (largo)", data: larga, columns: cab.map((c) => ({ width: c === "transformacion" || c === "otros_periodos" || c === "periodo" ? 34 : c === "unidad" ? 26 : 12 })), stickyRowsCount: 1 },
    { sheet: "Datos (frecuencia común)", data: ancha, columns: [{ width: 16 }, ...v.ancha.columnas.map(() => ({ width: 26 })), ...(conPeriodo ? [{ width: 34 }, { width: 14 }, { width: 44 }] : [])], stickyRowsCount: 2 },
    { sheet: "Metadatos", data: [[negrita("Campo"), negrita("Valor")], ...v.metadatos.map(([k, x]) => [{ value: k }, { value: x, wrap: true }])], columns: [{ width: 30 }, { width: 100 }] },
    {
      sheet: "Cita",
      data: [[negrita("Serie"), negrita("Formato"), negrita("Cita")], ...v.citas.flatMap((c) => [
        [{ value: c.serie }, { value: "Texto" }, { value: c.texto, wrap: true }],
        [{ value: c.serie }, { value: "APA" }, { value: c.apa, wrap: true }],
        [{ value: c.serie }, { value: "BibTeX" }, { value: c.bibtex, wrap: true }],
      ])],
      columns: [{ width: 30 }, { width: 10 }, { width: 110 }],
    },
  ];
  if (v.periodos?.length) {
    hojas.push({
      sheet: "Períodos",
      data: [[negrita("Período"), negrita("Desde"), negrita("Hasta (excluido)"), negrita("Confianza"), negrita("Fuentes")],
        ...v.periodos.map((p) => [{ value: p.nombre }, { value: p.desde }, texto(p.hasta ?? "vigente"), texto(p.confianza), { value: p.fuentes, wrap: true }])],
      columns: [{ width: 40 }, { width: 12 }, { width: 16 }, { width: 22 }, { width: 110 }],
    });
  }
  return hojas;
}
