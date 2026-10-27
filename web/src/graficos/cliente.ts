// Interactividad de la ficha: transformaciones, período y escala, con el estado en la URL; gráfico (Vega-Lite,
// cargado recién cuando hace falta); tabla, resumen, avisos, descargas de la vista y cita.
import {
  ErrorTransformacion, disponibles, serieDeEntidad, tienePais, transformar, type InsumosCargados, type Opciones, type Resultado,
  type SerieExportada, type Transformacion,
} from "@vaiven/transformaciones";
import type { DocumentoSerie } from "../lib/export";
import { apa, bibtex, nombreTransformacion, textoCita } from "@vaiven/cita";
import { esVariacion, filasTabla, medidaInicial, numerarQuiebres, rangoQuiebre, resumen, transformacionInicial, type QuiebreNumerado } from "../lib/ficha";
import { NOMBRE_TIPO_QUIEBRE, NOMBRE_TRANSFORMACION, diaDeVersion, fechaCorta, fechaLegible, numero } from "../lib/formato";
import { especificacion, type Tema } from "./espec";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const LOCALE_NUMEROS = { decimal: ",", thousands: ".", grouping: [3], currency: ["$", ""] };
const LOCALE_FECHAS = {
  dateTime: "%e de %B de %Y, %X", date: "%d/%m/%Y", time: "%H:%M:%S", periods: ["a. m.", "p. m."],
  days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  shortDays: ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."],
  months: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  shortMonths: ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."],
};

function iniciar(): void {
  const nodoDatos = $<HTMLScriptElement>("datos-ficha");
  if (!nodoDatos?.textContent) return;
  const doc = JSON.parse(nodoDatos.textContent) as DocumentoSerie;
  const pais = tienePais(doc);
  // La serie que se ve: en las series con dimensión pais, la de la entidad elegida.
  let serie: SerieExportada & { vista_inicial?: DocumentoSerie["vista_inicial"] } = { ...serieDeEntidad(doc), vista_inicial: doc.vista_inicial };
  let quiebres: QuiebreNumerado[] = numerarQuiebres(serie);
  // Insumos de las medidas, pedidos a /datos/ la primera vez que se eligen.
  const cargados: InsumosCargados & { series: Record<string, SerieExportada> } = { series: {} };

  const form = $<HTMLFormElement>("controles")!;
  const cTransf = $<HTMLSelectElement>("c-transformacion")!;
  const cEntidad = $<HTMLSelectElement>("c-entidad");
  const cMedida = $<HTMLSelectElement>("c-medida");
  const cDeflactor = $<HTMLSelectElement>("c-deflactor");
  const campoDeflactor = $<HTMLDivElement>("campo-deflactor");
  const cPesos = $<HTMLInputElement>("c-pesos");
  const cBase = $<HTMLInputElement>("c-base");
  const campoBase = $<HTMLDivElement>("campo-base");
  const cFrec = $<HTMLSelectElement>("c-frecuencia");
  const cMedia = $<HTMLSelectElement>("c-media");
  const cDesde = $<HTMLInputElement>("c-desde")!;
  const cHasta = $<HTMLInputElement>("c-hasta")!;
  const cLog = $<HTMLInputElement>("c-log")!;
  const campoLog = $<HTMLLabelElement>("campo-log")!;
  const estado = $<HTMLParagraphElement>("estado-grafico")!;
  const contenedor = $<HTMLDivElement>("grafico")!;

  // Estado inicial: la URL manda; si no dice nada, la transformación inicial de la serie.
  const q = new URLSearchParams(location.search);
  if (cEntidad && q.get("e") && [...cEntidad.options].some((o) => o.value === q.get("e"))) cEntidad.value = q.get("e")!;
  if (pais && cEntidad) elegirEntidad(cEntidad.value);
  if (cPesos && q.get("pa") === "1") cPesos.checked = true;
  if (cMedida) cMedida.value = q.get("m") ?? medidaInicial(serie) ?? "";
  if (cDeflactor && q.get("d") && [...cDeflactor.options].some((o) => o.value === q.get("d"))) cDeflactor.value = q.get("d")!;
  const disp = disponibles(serie, { pesosActuales: cPesos?.checked });
  const t = q.get("t") as Transformacion | null;
  cTransf.value = t && disp.transformaciones.includes(t) ? t : transformacionInicial(serie);
  if (cFrec && q.get("f") && disp.frecuencias.includes(q.get("f") as "anual")) cFrec.value = q.get("f")!;
  if (cMedia && q.get("mm")) cMedia.value = q.get("mm")!;
  if (cBase && q.get("base")) cBase.value = q.get("base")!;
  if (q.get("desde")) cDesde.value = q.get("desde")!;
  if (q.get("hasta")) cHasta.value = q.get("hasta")!;
  cLog.checked = q.get("log") === "1" || (q.get("log") === null && escalaLogInicial());
  // En pantallas chicas el panel de opciones arranca cerrado (SPEC 6.5), para que el gráfico quede a la vista.
  const panel = $<HTMLDetailsElement>("panel-opciones");
  if (panel && window.matchMedia("(max-width: 700px)").matches) panel.open = false;
  document.querySelectorAll<HTMLElement>("[data-requiere-js]").forEach((el) => (el.hidden = false));

  function elegirEntidad(id: string): void {
    serie = { ...serieDeEntidad(doc, id), vista_inicial: doc.vista_inicial };
    quiebres = numerarQuiebres(serie);
  }

  function escalaLogInicial(): boolean {
    const v = serie.datos.map((d) => d[1]);
    return !cMedida?.value && v.every((x) => x > 0) && Math.max(...v) / Math.min(...v) > 1000 && cTransf.value === "nivel";
  }

  /** Habilita en los selectores lo que la variante admite ahora (en moneda de época, depende de pasar a pesos actuales). */
  function habilitar(): void {
    const d = disponibles(serie, { pesosActuales: cPesos?.checked });
    for (const o of cTransf.options) o.disabled = !d.transformaciones.includes(o.value as Transformacion);
    if (cTransf.selectedOptions[0]?.disabled) cTransf.value = "nivel";
    if (cFrec) {
      for (const o of cFrec.options) o.disabled = o.value !== "" && !d.frecuencias.includes(o.value as "anual");
      if (cFrec.selectedOptions[0]?.disabled) cFrec.value = "";
    }
    if (cMedia) cMedia.disabled = !d.mediaMovil;
    if (campoDeflactor) campoDeflactor.hidden = cMedida?.value !== "real";
    // % del PIB pide la frecuencia del PIB: si la serie es más fina, pasa sola a anual.
    if (cMedida?.value === "pct_pib" && cFrec && !cFrec.value && !["anual", "trimestral"].includes(serie.frecuencia) && d.frecuencias.includes("anual")) {
      cFrec.value = "anual";
    }
  }

  function opciones(): Opciones {
    const o: Opciones = { transformacion: cTransf.value as Transformacion };
    if (cPesos?.checked) o.pesosActuales = true;
    if (cMedida?.value) o.medida = cMedida.value as "real" | "en_dolares" | "pct_pib";
    if (o.medida === "real" && cDeflactor?.value) o.deflactor = cDeflactor.value;
    if (cFrec?.value) o.frecuencia = cFrec.value as "trimestral" | "anual";
    if (cMedia?.value) o.mediaMovil = Number(cMedia.value);
    if (o.transformacion === "base_100") {
      const base = (cBase?.value || "").trim();
      o.base = /^\d{4}$/.test(base) ? { desde: base, hasta: base } : { fecha: base };
    }
    if (cDesde.value) o.desde = cDesde.value;
    if (cHasta.value) o.hasta = cHasta.value;
    return o;
  }

  function guardarEnUrl(): void {
    const p = new URLSearchParams();
    if (pais && cEntidad && cEntidad.value !== doc.entidades_por_defecto[0]) p.set("e", cEntidad.value);
    if (cPesos?.checked) p.set("pa", "1");
    if (cMedida && cMedida.value !== (medidaInicial(serie) ?? "")) p.set("m", cMedida.value);
    if (cMedida?.value === "real" && cDeflactor && cDeflactor.selectedIndex > 0) p.set("d", cDeflactor.value);
    if (cTransf.value !== transformacionInicial(serie)) p.set("t", cTransf.value);
    if (cFrec?.value) p.set("f", cFrec.value);
    if (cMedia?.value) p.set("mm", cMedia.value);
    if (cTransf.value === "base_100" && cBase?.value) p.set("base", cBase.value);
    if (cDesde.value) p.set("desde", cDesde.value);
    if (cHasta.value) p.set("hasta", cHasta.value);
    if (cLog.checked !== escalaLogInicial()) p.set("log", cLog.checked ? "1" : "0");
    const nueva = `${location.pathname}${p.size ? `?${p}` : ""}${location.hash}`;
    history.replaceState(null, "", nueva);
  }

  let ultimo: { r: Resultado; o: Opciones } | null = null;

  /** Pide a /datos/ los insumos que la medida elegida todavía no tiene. */
  async function cargarInsumos(o: Opciones): Promise<void> {
    const pedidos: Array<Promise<void>> = [];
    const leer = async (archivo: string) => {
      const res = await fetch(`/datos/${archivo}`);
      if (!res.ok) throw new Error(`no se pudo leer /datos/${archivo} (${res.status})`);
      return res.json();
    };
    if (o.pesosActuales && !cargados.signos) {
      const archivo = serie.insumos?.pesos_actuales?.opciones[0].archivo;
      if (archivo) pedidos.push(leer(archivo).then((s) => { cargados.signos = s; }));
    }
    if (o.medida) {
      const insumo = serie.insumos?.[o.medida];
      const ids = o.medida === "real" ? [o.deflactor ?? insumo?.por_defecto] : insumo?.opciones.map((x) => x.id) ?? [];
      for (const op of insumo?.opciones ?? []) {
        if (ids.includes(op.id) && !cargados.series[op.id]) pedidos.push(leer(op.archivo).then((s) => { cargados.series[op.id] = s; }));
      }
    }
    if (!pedidos.length) return;
    estado.textContent = "Cargando los datos que necesita la medida…";
    await Promise.all(pedidos);
  }

  async function actualizar(): Promise<void> {
    if (campoBase) campoBase.hidden = cTransf.value !== "base_100";
    habilitar();
    const o = opciones();
    let r: Resultado;
    try {
      await cargarInsumos(o);
      r = transformar(serie, o, cargados);
    } catch (err) {
      estado.textContent = err instanceof ErrorTransformacion || err instanceof Error ? err.message : String(err);
      estado.dataset.tipo = "error";
      return;
    }
    estado.textContent = "";
    delete estado.dataset.tipo;
    ultimo = { r, o };
    const variacion = esVariacion(o.transformacion ?? "nivel");
    const positivos = r.datos.every((d) => d[1] === null || d[1] > 0);
    cLog.disabled = !positivos;
    campoLog.classList.toggle("deshabilitado", !positivos);
    const entidad = pais && cEntidad ? ` · ${cEntidad.selectedOptions[0]?.textContent ?? cEntidad.value}` : "";
    $("unidad-grafico")!.textContent = `${r.unidad}${entidad}`;
    $("resumen-grafico")!.textContent = resumen(r, r.unidad, variacion, quiebres);
    avisos(r);
    tabla(r, variacion);
    cita(o);
    guardarEnUrl();
    resumenOpciones(o);
    void dibujar();
  }

  function resumenOpciones(o: Opciones): void {
    const partes: string[] = [];
    if (pais && cEntidad) partes.push(cEntidad.selectedOptions[0]?.textContent ?? cEntidad.value);
    if (o.pesosActuales) partes.push("pesos actuales");
    if (o.medida) partes.push(cMedida?.selectedOptions[0]?.textContent ?? o.medida);
    partes.push(NOMBRE_TRANSFORMACION[o.transformacion ?? "nivel"]);
    if (o.frecuencia) partes.push(o.frecuencia);
    if (o.mediaMovil) partes.push(`media móvil de ${o.mediaMovil}`);
    partes.push(o.desde || o.hasta ? `${o.desde ?? "inicio"}–${o.hasta ?? "hoy"}` : "toda la serie");
    const nodo = $("resumen-opciones");
    if (nodo) nodo.textContent = partes.join(" · ");
  }

  function avisos(r: Resultado): void {
    const ids = new Set(r.advertencias.map((a) => a.id));
    const cruzados = quiebres.filter((q) => ids.has(q.advertencia.id) && q.forma !== "general");
    const lineas: string[] = [];
    if (cruzados.length) {
      lineas.push(`El período cruza ${cruzados.length === 1 ? "un quiebre" : `${cruzados.length} quiebres`}: ${cruzados
        .map((q) => `${q.n}. ${NOMBRE_TIPO_QUIEBRE[q.advertencia.tipo] ?? q.advertencia.tipo} (${rangoQuiebre(q.advertencia)})`)
        .join("; ")}. El detalle está en «Quiebres», más abajo.`);
    }
    for (const e of r.excluidos) lineas.push(`${fechaCorta(e.fecha)}: dato excluido hasta confirmarlo. ${e.motivo}`);
    for (const n of r.notas) lineas.push(n);
    const pico = picoQueComprime(r);
    if (pico) lineas.push(`El máximo (${pico}) comprime el resto del gráfico. Para ver mejor los otros años, elegí un período más corto (por ejemplo, «Desde 1991»)${cLog.disabled ? "" : " o la escala logarítmica"}.`);
    const caja = $("avisos")!;
    caja.replaceChildren(...lineas.map((l) => Object.assign(document.createElement("p"), { textContent: l })));
    caja.hidden = !lineas.length;
  }

  /** Si el máximo supera 15 veces el percentil 90 (en valor absoluto), la mayor parte de la serie queda aplastada. */
  function picoQueComprime(r: Resultado): string | null {
    if (cLog.checked && !cLog.disabled) return null;
    const conDato = r.datos.map((d, k) => ({ f: d[0], v: d[1], k })).filter((d): d is { f: string; v: number; k: number } => d.v !== null);
    if (conDato.length < 20) return null;
    const abs = conDato.map((d) => Math.abs(d.v)).sort((a, b) => a - b);
    const p90 = abs[Math.floor(abs.length * 0.9)];
    const max = conDato.reduce((a, b) => (Math.abs(b.v) > Math.abs(a.v) ? b : a));
    if (!p90 || Math.abs(max.v) < 15 * p90) return null;
    return `${numero(max.v, esVariacion(cTransf.value))} en ${fechaLegible(max.f, r.frecuencias[max.k])}`;
  }

  function tabla(r: Resultado, variacion: boolean): void {
    const cuerpo = $<HTMLTableSectionElement>("tabla-cuerpo")!;
    $("tabla-unidad")!.textContent = r.unidad;
    const filas = filasTabla(r, variacion).map((f) => {
      const tr = document.createElement("tr");
      if (f.excluido) tr.className = "excluido";
      const th = Object.assign(document.createElement("th"), { scope: "row", textContent: f.etiqueta });
      const td = Object.assign(document.createElement("td"), { textContent: f.valor });
      tr.append(th, td);
      return tr;
    });
    cuerpo.replaceChildren(...filas);
    $("tabla-cantidad")!.textContent = `${r.datos.length} filas`;
  }

  function opcionesCita(o: Opciones) {
    return { ...o, entidad: pais ? (cEntidad?.selectedOptions[0]?.textContent ?? cEntidad?.value) : undefined };
  }

  function cita(o: Opciones): void {
    const tr = nombreTransformacion(opcionesCita(o));
    $("cita-texto")!.textContent = textoCita(doc, tr);
    $("cita-apa")!.textContent = apa(doc, tr);
    $("cita-bibtex")!.textContent = bibtex(doc, tr);
  }

  function tema(): Tema {
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    return {
      fondo: v("--fondo"), texto: v("--texto"), secundario: v("--secundario"), linea: v("--linea"), banda: v("--banda"),
      borde: v("--borde"), serie: v("--graf-1"), fuente: "Inter Variable, system-ui, sans-serif",
    };
  }

  let vista: { finalize: () => void } | null = null;
  let turno = 0;
  async function dibujar(): Promise<void> {
    if (!ultimo) return;
    const mio = ++turno;
    const { r, o } = ultimo;
    const ancho = contenedor.clientWidth || 600;
    const spec = especificacion({
      resultado: r, tramos: serie.tramos, empalme: doc.empalme, quiebres, tema: tema(), esVariacion: esVariacion(o.transformacion ?? "nivel"),
      log: cLog.checked && !cLog.disabled, alto: ancho < 520 ? 240 : 320, ancho, descripcion: $("resumen-grafico")!.textContent ?? "",
    });
    try {
      const { default: embed } = await import("vega-embed");
      if (mio !== turno) return;
      vista?.finalize();
      const res = await embed(contenedor, spec as never, {
        renderer: "svg", actions: false, formatLocale: LOCALE_NUMEROS, timeFormatLocale: LOCALE_FECHAS as never,
        tooltip: { theme: "custom" },
      });
      vista = res;
      contenedor.dataset.listo = "1";
    } catch (err) {
      estado.textContent = `No se pudo dibujar el gráfico (${err instanceof Error ? err.message : String(err)}). La tabla y las descargas siguen disponibles.`;
      estado.dataset.tipo = "error";
    }
  }

  // Exportar el gráfico con título, unidad, fuentes, variante y versión impresos (SPEC 6.2).
  async function imagen(formato: "png" | "svg"): Promise<void> {
    if (!ultimo) return;
    const { r, o } = ultimo;
    const { vega, vegaLite } = await import("vega-embed");
    const fuentes = [...new Set(doc.fuentes.map((f) => f.organismo))].join("; ");
    const spec = especificacion({
      resultado: r, tramos: serie.tramos, empalme: doc.empalme, quiebres, tema: tema(), esVariacion: esVariacion(o.transformacion ?? "nivel"),
      log: cLog.checked && !cLog.disabled, alto: 380, ancho: 900, descripcion: $("resumen-grafico")!.textContent ?? "",
      impreso: {
        titulo: `${doc.nombre} · ${doc.nombre_variante}`,
        subtitulo: r.unidad,
        pie: [`Fuentes: ${fuentes}.`, `Elaboración: Vaivén, variante «${doc.variante}», versión de datos ${diaDeVersion(doc.version_datos)}. Licencia CC BY 4.0.`, location.href],
      },
    });
    // Vega exporta `locale` (de vega-format), aunque sus tipos no lo declaren.
    const locale = (vega as unknown as { locale?: (n: object, t: object) => unknown }).locale?.(LOCALE_NUMEROS, LOCALE_FECHAS);
    const v = new vega.View(vega.parse(vegaLite.compile(spec as never).spec), { renderer: "none", ...(locale ? { locale } : {}) } as never);
    const url = formato === "png"
      ? await v.toImageURL("png", 2)
      : URL.createObjectURL(new Blob([await v.toSVG()], { type: "image/svg+xml" }));
    bajar(url, `${nombreArchivo()}.${formato}`);
    v.finalize();
  }

  function nombreArchivo(): string {
    const o = ultimo?.o;
    const partes = ["vaiven", doc.serie, doc.variante, pais ? cEntidad?.value : undefined, o?.pesosActuales ? "pesos_actuales" : undefined,
      o?.frecuencia, o?.medida, o?.transformacion !== "nivel" ? o?.transformacion : undefined, o?.mediaMovil ? `mm${o.mediaMovil}` : undefined];
    return partes.filter(Boolean).join("_");
  }

  function bajar(url: string, nombre: string): void {
    const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
    if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function csvVista(): void {
    if (!ultimo) return;
    const filas = ["fecha,valor", ...ultimo.r.datos.map(([f, v]) => `${f},${v === null ? "" : v}`)];
    bajar(URL.createObjectURL(new Blob([filas.join("\n") + "\n"], { type: "text/csv;charset=utf-8" })), `${nombreArchivo()}.csv`);
  }

  function citaTxt(): void {
    if (!ultimo) return;
    const tr = nombreTransformacion(opcionesCita(ultimo.o));
    const licencias = [...new Set(doc.fuentes.map((f) => `${f.organismo}: ${f.licencia}`))];
    const texto = [
      `${doc.nombre} · ${doc.nombre_variante}`, `Unidad: ${ultimo.r.unidad}`, `Vista: ${location.href}`, "",
      "Cómo citar:", textoCita(doc, tr), "", "APA:", apa(doc, tr), "", "BibTeX:", bibtex(doc, tr), "",
      `Licencia de los datos derivados: ${doc.licencia}.`, `Licencias de las fuentes: ${licencias.join("; ")}.`,
    ].join("\n");
    bajar(URL.createObjectURL(new Blob([texto + "\n"], { type: "text/plain;charset=utf-8" })), `${nombreArchivo()}_cita.txt`);
  }

  // Eventos
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("change", (e) => {
    if (e.target === cEntidad && cEntidad) elegirEntidad(cEntidad.value);
    void actualizar();
  });
  cBase?.addEventListener("input", () => { if (/^\d{4}(-\d{2})?$/.test(cBase.value.trim())) void actualizar(); });
  document.querySelectorAll<HTMLButtonElement>("[data-desde]").forEach((b) => b.addEventListener("click", () => {
    cDesde.value = b.dataset.desde ?? "";
    cHasta.value = "";
    void actualizar();
  }));
  $("bajar-csv")?.addEventListener("click", csvVista);
  $("bajar-cita")?.addEventListener("click", citaTxt);
  $("bajar-png")?.addEventListener("click", () => void imagen("png"));
  $("bajar-svg")?.addEventListener("click", () => void imagen("svg"));
  document.querySelectorAll<HTMLButtonElement>("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
    const origen = $(b.dataset.copiar!)!;
    const aviso = b.nextElementSibling as HTMLElement | null;
    try {
      await navigator.clipboard.writeText(origen.textContent ?? "");
      if (aviso) aviso.textContent = "Copiada.";
    } catch {
      const rango = document.createRange();
      rango.selectNodeContents(origen);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(rango);
      if (aviso) aviso.textContent = "Seleccionada: copiala con Ctrl+C.";
    }
    setTimeout(() => { if (aviso) aviso.textContent = ""; }, 4000);
  }));
  document.addEventListener("vaiven:tema", () => void dibujar());
  let anchoPrevio = contenedor.clientWidth;
  new ResizeObserver(() => {
    const ancho = contenedor.clientWidth;
    if ((ancho < 520) !== (anchoPrevio < 520)) void dibujar();
    anchoPrevio = ancho;
  }).observe(contenedor);

  void actualizar();
}

iniciar();
