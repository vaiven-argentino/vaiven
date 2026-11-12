// Descargas de la vista del explorador (SPEC 6.2): CSV y XLSX con la misma información. El XLSX lleva, además de los
// datos, una hoja de metadatos, la cita y, si hay sombreado, los períodos con sus fuentes. Funciones puras: el
// navegador solo las convierte en archivo.

export interface FilaDescarga {
  fecha: string;
  pais?: string;
  valor: number | null;
  /** El período del sombreado vigente el último día de la observación. */
  periodo?: string;
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
  periodos?: Array<{ nombre: string; desde: string; hasta: string | null; fuentes: string }>;
}

const comillas = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

/** CSV de la vista: fecha[, pais], valor[, periodo]. Sin datos, celda vacía (nunca un cero). */
export function csvDeVista(v: VistaDescarga): string {
  const cab = ["fecha", ...(v.conPais ? ["pais"] : []), "valor", ...(v.periodo ? ["periodo"] : [])];
  const lineas = v.filas.map((f) => [
    f.fecha, ...(v.conPais ? [f.pais ?? ""] : []), f.valor === null ? "" : String(f.valor), ...(v.periodo ? [comillas(f.periodo ?? "")] : []),
  ].join(","));
  return [cab.join(","), ...lineas].join("\n") + "\n";
}

type Celda = { value: string | number; fontWeight?: "bold"; wrap?: boolean } | null;

/** Las hojas del XLSX, en el formato de write-excel-file (`data` + `sheet` + `columns`). */
export function hojasXlsx(v: VistaDescarga) {
  const negrita = (t: string): Celda => ({ value: t, fontWeight: "bold" });
  const texto = (t: string | null | undefined): Celda => (t ? { value: t } : null);
  const datos: Celda[][] = [
    [negrita("Fecha"), ...(v.conPais ? [negrita("País")] : []), negrita(v.unidad), ...(v.periodo ? [negrita(v.periodo)] : [])],
    ...v.filas.map((f) => [
      { value: f.fecha }, ...(v.conPais ? [texto(f.pais)] : []), f.valor === null ? null : { value: f.valor },
      ...(v.periodo ? [texto(f.periodo)] : []),
    ]),
  ];
  const hojas = [
    { sheet: "Datos", data: datos, columns: [{ width: 12 }, ...(v.conPais ? [{ width: 24 }] : []), { width: 22 }, ...(v.periodo ? [{ width: 34 }] : [])], stickyRowsCount: 1 },
    { sheet: "Metadatos", data: [[negrita("Campo"), negrita("Valor")], ...v.metadatos.map(([k, x]) => [{ value: k }, { value: x, wrap: true }])], columns: [{ width: 26 }, { width: 100 }] },
    { sheet: "Cita", data: [[negrita("Formato"), negrita("Cita")], [{ value: "Texto" }, { value: v.cita.texto, wrap: true }],
      [{ value: "APA" }, { value: v.cita.apa, wrap: true }], [{ value: "BibTeX" }, { value: v.cita.bibtex, wrap: true }]], columns: [{ width: 12 }, { width: 110 }] },
  ];
  if (v.periodos?.length) {
    hojas.push({
      sheet: "Períodos",
      data: [[negrita("Período"), negrita("Desde"), negrita("Hasta (excluido)"), negrita("Fuentes")],
        ...v.periodos.map((p) => [{ value: p.nombre }, { value: p.desde }, texto(p.hasta ?? "vigente"), { value: p.fuentes, wrap: true }])],
      columns: [{ width: 40 }, { width: 12 }, { width: 16 }, { width: 110 }],
    });
  }
  return hojas;
}
