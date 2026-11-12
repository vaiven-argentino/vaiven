// Interactividad de la ficha: transformaciones, período y escala, con el estado en la URL; gráfico (Vega-Lite,
// cargado recién cuando hace falta); tabla, resumen, avisos, descargas de la vista y cita.
import {
  ErrorTransformacion, REGLA_UBICACION, disponibles, fechaDeDibujo, rangoLegible, referenciaDe, serieDeEntidad,
  tienePais, transformar, type DocumentoEventos, type DocumentoPeriodos, type Opciones, type Periodo, type Resultado,
  type SerieExportada, type Transformacion,
} from "@vaiven/transformaciones";
import type { DocumentoSerie } from "../lib/export";
import { apa, bibtex, nombreTransformacion, textoCita } from "@vaiven/cita";
import { desdeInicial, esVariacion, filasTabla, frecuenciaInicial, medidaInicial, numerarQuiebres, rangoQuiebre, resumen, transformacionInicial, type QuiebreNumerado } from "../lib/ficha";
import { NOMBRE_TIPO_QUIEBRE, NOMBRE_TRANSFORMACION, diaDeVersion, fechaCorta, fechaLegible, numero } from "../lib/formato";
import { diaLegible, especificacion, modoEventosDe, type BandaEpisodio, type MarcaEvento, type ModoEventos } from "./espec";
import {
  ACLARACION_ETAPAS, EPISODIO, avisoConfianza, avisoFiltroEventos, bandasDe, columnaPeriodo, columnasDe, contextoDe,
  episodiosEnRango, escribirEv, esSombreado, eventosEnRango, leerEv, periodosEnRango, textoLectura, textoSombreado, tipoDe,
  ubicacionesDe, type ColumnasPeriodo, type OpcionSombreado,
} from "../lib/periodos";
import { conectarLector, type Lectura } from "./lector";
import { csvDeVista } from "../lib/descarga";
import { bajar, cargarInsumos as pedirInsumos, dibujarEn, exportarImagen, leerDatos, licenciaImagen as licencia, tema, type Cargados, type VistaGrafico } from "./comun";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function iniciar(): void {
  const nodoDatos = $<HTMLScriptElement>("datos-ficha");
  if (!nodoDatos?.textContent) return;
  const doc = JSON.parse(nodoDatos.textContent) as DocumentoSerie;
  const pais = tienePais(doc);
  // La serie que se ve: en las series con dimensión pais, la de la entidad elegida.
  let serie: SerieExportada & { vista_inicial?: DocumentoSerie["vista_inicial"] } = { ...serieDeEntidad(doc), vista_inicial: doc.vista_inicial };
  // Se numeran todos los quiebres de la variante (también los de un solo país), para que el número sea el mismo que
  // en la lista «Quiebres»; el gráfico y los avisos muestran solo los de los países que se ven.
  let quiebres: QuiebreNumerado[] = numerarQuiebres({ ...serie, advertencias: doc.advertencias });
  // Insumos de las medidas, pedidos a /datos/ la primera vez que se eligen.
  const cargados: Cargados = { series: {} };

  const form = $<HTMLFormElement>("controles")!;
  const cTransf = $<HTMLSelectElement>("c-transformacion")!;
  const cEntidad = $<HTMLSelectElement>("c-entidad");
  const cMedida = $<HTMLSelectElement>("c-medida");
  const cDeflactor = $<HTMLSelectElement>("c-deflactor");
  const campoDeflactor = $<HTMLDivElement>("campo-deflactor");
  const cDenominador = $<HTMLSelectElement>("c-denominador");
  const campoDenominador = $<HTMLDivElement>("campo-denominador");
  const cPesos = $<HTMLInputElement>("c-pesos");
  const cBase = $<HTMLInputElement>("c-base");
  const campoBase = $<HTMLDivElement>("campo-base");
  const cFrec = $<HTMLSelectElement>("c-frecuencia");
  const cMedia = $<HTMLSelectElement>("c-media");
  const cDesde = $<HTMLInputElement>("c-desde")!;
  const cHasta = $<HTMLInputElement>("c-hasta")!;
  const cLog = $<HTMLInputElement>("c-log")!;
  const cSombreado = $<HTMLSelectElement>("c-sombreado");
  const cEventos = $<HTMLInputElement>("c-eventos");
  // Filtro de eventos (parámetro `ev`): una casilla por categoría de eventos.json y una para los episodios.
  const cCampoCategorias = $<HTMLFieldSetElement>("c-categorias");
  const cCategorias = [...document.querySelectorAll<HTMLInputElement>("#c-categorias input[data-categoria]")];
  const CATEGORIAS = cCategorias.map((k) => k.dataset.categoria!);
  const nombresCategorias = cCategorias.filter((k) => k.dataset.categoria !== EPISODIO).map((k) => ({ id: k.dataset.categoria!, nombre: k.dataset.nombre ?? k.dataset.categoria! }));
  /** Las categorías marcadas, o ninguna si «Marcar eventos» está apagado. */
  const evElegido = (): string[] => (cEventos?.checked ? cCategorias.filter((k) => k.checked).map((k) => k.dataset.categoria!) : []);
  let registroPeriodos: DocumentoPeriodos | null = null;
  let registroEventos: DocumentoEventos | null = null;
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
  if (cDenominador && q.get("pib") && [...cDenominador.options].some((o) => o.value === q.get("pib"))) cDenominador.value = q.get("pib")!;
  const disp = disponibles(serie, { pesosActuales: cPesos?.checked });
  const t = q.get("t") as Transformacion | null;
  cTransf.value = t && disp.transformaciones.includes(t) ? t : transformacionInicial(serie);
  if (cFrec) {
    // Sin `f`, la frecuencia inicial de la vista (anual en el resultado fiscal en % del PIB); «original», la de la serie.
    const f = q.get("f");
    if (f && disp.frecuencias.includes(f as "anual")) cFrec.value = f;
    else cFrec.value = f === null && q.get("m") === null ? (frecuenciaInicial(serie) ?? "") : "";
  }
  if (cMedia && q.get("mm")) cMedia.value = q.get("mm")!;
  if (cBase && q.get("base")) cBase.value = q.get("base")!;
  // Sin `desde`, el período inicial de la vista (el IPC arranca en 1991); «todo», toda la serie.
  const desde = q.get("desde");
  cDesde.value = desde === null ? (desdeInicial(serie) ?? "") : desde === "todo" ? "" : desde;
  if (q.get("hasta")) cHasta.value = q.get("hasta")!;
  cLog.checked = q.get("log") === "1" || (q.get("log") === null && escalaLogInicial());
  // Sombreado y eventos (fase 4b): apagados salvo que la URL los pida.
  if (cSombreado && esSombreado(q.get("sh"))) cSombreado.value = q.get("sh")!;
  if (cEventos) {
    const { ev } = leerEv(q.get("ev"), CATEGORIAS);
    cEventos.checked = ev.length > 0;
    cCategorias.forEach((k) => (k.checked = !ev.length || ev.includes(k.dataset.categoria!)));
    if (cCampoCategorias) cCampoCategorias.disabled = !ev.length;
  }
  // En pantallas chicas el panel de opciones arranca cerrado (SPEC 6.5), para que el gráfico quede a la vista.
  const panel = $<HTMLDetailsElement>("panel-opciones");
  if (panel && window.matchMedia("(max-width: 700px)").matches) panel.open = false;
  document.querySelectorAll<HTMLElement>("[data-requiere-js]").forEach((el) => (el.hidden = false));

  function elegirEntidad(id: string): void {
    serie = { ...serieDeEntidad(doc, id), vista_inicial: doc.vista_inicial };
    quiebres = numerarQuiebres({ ...serie, advertencias: doc.advertencias });
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
    if (campoDenominador) campoDenominador.hidden = cMedida?.value !== "pct_pib";
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
    if (o.medida === "pct_pib") {
      const insumo = serie.insumos?.pct_pib;
      o.denominador = cDenominador?.value || insumo?.opciones.find((x) => x.id === insumo.por_defecto)?.denominador;
    }
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
    if (cMedida?.value === "pct_pib" && cDenominador && cDenominador.selectedIndex > 0) p.set("pib", cDenominador.value);
    if (cTransf.value !== transformacionInicial(serie)) p.set("t", cTransf.value);
    const frecDefecto = (cMedida?.value ?? "") === (medidaInicial(serie) ?? "") ? (frecuenciaInicial(serie) ?? "") : "";
    if (cFrec && cFrec.value !== frecDefecto) p.set("f", cFrec.value || "original");
    if (cMedia?.value) p.set("mm", cMedia.value);
    if (cTransf.value === "base_100" && cBase?.value) p.set("base", cBase.value);
    if (cDesde.value !== (desdeInicial(serie) ?? "")) p.set("desde", cDesde.value || "todo");
    if (cHasta.value) p.set("hasta", cHasta.value);
    if (cLog.checked !== escalaLogInicial()) p.set("log", cLog.checked ? "1" : "0");
    if (cSombreado?.value) p.set("sh", cSombreado.value);
    const ev = escribirEv(evElegido(), CATEGORIAS);
    if (ev) p.set("ev", ev);
    const nueva = `${location.pathname}${p.size ? `?${p}` : ""}${location.hash}`;
    history.replaceState(null, "", nueva);
  }

  let ultimo: {
    r: Resultado; o: Opciones; otras: Array<{ nombre: string; resultado: Resultado }>; periodos: Periodo[]; eventos: MarcaEvento[];
    episodios: BandaEpisodio[]; totalEventos: number;
  } | null = null;
  // Cómo se ubica cada dato (ubicacion.ts): con la agregación de la variante y la transformación pedida.
  const contexto = (o: Opciones) => contextoDe(serie.agregacion, o);
  const sombreado = () => (cSombreado && esSombreado(cSombreado.value) ? cSombreado.value as OpcionSombreado : null);

  /** Los períodos y eventos que se ven (se piden a /datos/ la primera vez que se activan). */
  async function marcas(r: Resultado): Promise<{ periodos: Periodo[]; eventos: MarcaEvento[]; episodios: BandaEpisodio[]; totalEventos: number }> {
    const sh = sombreado();
    const filtro = evElegido();
    const ev = filtro.length > 0;
    try {
      // Los episodios están en periodos.json: se marcan junto con los eventos.
      if (sh || ev) registroPeriodos ??= await leerDatos<DocumentoPeriodos>("periodos.json");
      if (ev) registroEventos ??= await leerDatos<DocumentoEventos>("eventos.json");
    } catch (err) {
      estado.textContent = `No se pudieron leer los períodos o los eventos (${err instanceof Error ? err.message : String(err)}).`;
      return { periodos: [], eventos: [], episodios: [], totalEventos: 0 };
    }
    return {
      periodos: sh && registroPeriodos ? periodosEnRango(registroPeriodos, sh, r) : [],
      eventos: ev && registroEventos ? eventosEnRango(registroEventos, r, filtro) : [],
      episodios: filtro.includes(EPISODIO) && registroPeriodos ? episodiosEnRango(registroPeriodos, r) : [],
      totalEventos: ev && registroEventos ? eventosEnRango(registroEventos, r).length : 0,
    };
  }

  /** Pide a /datos/ los insumos que la medida elegida todavía no tiene. */
  async function cargarInsumos(o: Opciones): Promise<void> {
    await pedirInsumos(serie, o, cargados, () => { estado.textContent = "Cargando los datos que necesita la medida…"; });
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
    ultimo = { r, o, otras: pais ? otrasEntidades(o) : [], ...(await marcas(r)) };
    const variacion = esVariacion(o.transformacion ?? "nivel");
    const positivos = r.datos.every((d) => d[1] === null || d[1] > 0);
    cLog.disabled = !positivos;
    campoLog.classList.toggle("deshabilitado", !positivos);
    $("unidad-grafico")!.textContent = r.unidad;
    leyendaPaises();
    $("resumen-grafico")!.textContent = resumen(r, r.unidad, variacion, quiebres)
      + (sombreado() || ultimo.eventos.length ? textoSombreado(sombreado() ?? "gobierno", ultimo.periodos, ultimo.eventos, tiposPeriodo()) : "");
    leyendas();
    avisos(r, ultimo.otras.map((x) => x.resultado));
    tabla(r, variacion);
    cita(o);
    guardarEnUrl();
    enlaceExplorador();
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

  function avisos(r: Resultado, otras: Resultado[] = []): void {
    // Los quiebres de todos los países que se ven, no los de toda la serie (segunda revisión de la 4a, 3.2).
    const ids = new Set([r, ...otras].flatMap((x) => x.advertencias.map((a) => a.id)));
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
    if (ultimo?.periodos.length) lineas.push(REGLA_UBICACION);
    if (avisoFiltro()) lineas.push(avisoFiltro());
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

  /** Los nombres de los tipos de período (el de las etapas del curso, público), leídos del selector. */
  function tiposPeriodo(): Array<{ id: string; nombre: string }> {
    return cSombreado ? [...cSombreado.options].filter((o) => o.value).map((o) => ({ id: o.value, nombre: o.textContent ?? o.value })) : [];
  }

  function leyendas(): void {
    if (!ultimo) return;
    const { periodos, eventos, episodios } = ultimo;
    const lp = $("leyenda-periodos");
    if (!lp) return;
    lp.hidden = !periodos.length;
    $("titulo-periodos")!.textContent = `Períodos: ${cSombreado?.selectedOptions[0]?.textContent?.toLowerCase() ?? ""}`;
    $("lista-periodos")!.replaceChildren(...periodos.map((p) => {
      const li = document.createElement("li");
      li.append(`${p.nombre}${p.caracter === "de_facto" ? " (de facto)" : p.caracter === "interino" ? " (interino)" : ""} `,
        Object.assign(document.createElement("span"), { className: "rango", textContent: rangoLegible(p) }));
      const aviso = avisoConfianza(p);
      if (aviso) li.append(" ", Object.assign(document.createElement("span"), { className: "a-confirmar", textContent: `⚠ ${aviso}` }));
      return li;
    }));
    $("leyenda-eventos")!.hidden = !eventos.length && !episodios.length;
    const lep = $("lista-episodios")!;
    lep.hidden = !episodios.length;
    lep.replaceChildren(...episodios.map((x) => {
      const li = document.createElement("li");
      li.append(`${x.nombre} `, Object.assign(document.createElement("span"), { className: "rango", textContent: rangoLegible(x) }));
      if (x.fases?.length) li.append(` (${x.fases.map((f) => `${f.nombre_corto.toLowerCase()}: ${rangoLegible(f)}`).join("; ")})`);
      return li;
    }));
    listaEventos();
    const filtro = avisoFiltro();
    const nodoFiltro = $("aviso-filtro");
    if (nodoFiltro) { nodoFiltro.textContent = filtro; nodoFiltro.hidden = !filtro; }
  }

  /** El aviso de los eventos que deja afuera el filtro («Se muestran 12 de 30 eventos…»), o vacío. */
  function avisoFiltro(): string {
    return ultimo ? avisoFiltroEventos(ultimo.eventos.length, ultimo.totalEventos, evElegido(), nombresCategorias) : "";
  }

  /** Cómo se marcan los eventos en el gráfico de la pantalla: con letras o, si no hay lugar, con rayitas (SPEC 6.2). */
  const modoActual = (): ModoEventos => (ultimo ? modoEventosDe(ultimo.r, ultimo.eventos, contenedor.clientWidth || 600) : "letras");

  /** La lista de los eventos marcados, siempre completa: con su letra o, con rayitas, con la fecha. */
  function listaEventos(): void {
    const lista = $("lista-eventos");
    if (!ultimo || !lista) return;
    const rayitas = modoActual() === "rayitas";
    lista.classList.toggle("con-fechas", rayitas);
    lista.replaceChildren(...ultimo.eventos.map((e) => {
      const li = document.createElement("li");
      const fecha = Object.assign(document.createElement("span"), { className: "rango", textContent: diaLegible(e.fecha) });
      if (rayitas) li.append(fecha, ` · ${e.nombre}`);
      else li.append(`${e.nombre} `, fecha);
      return li;
    }));
  }

  /** Las tres columnas del período de cada fila (ubicacion.ts), o nada si no hay sombreado. */
  function periodoDeFilas(res: Resultado): ColumnasPeriodo[] {
    const sh = sombreado();
    if (!ultimo?.periodos.length || !sh) return [];
    return ubicacionesDe(ultimo.periodos, sh, res, contexto(ultimo.o)).map(columnasDe);
  }

  function tabla(r: Resultado, variacion: boolean): void {
    const cuerpo = $<HTMLTableSectionElement>("tabla-cuerpo")!;
    $("tabla-unidad")!.textContent = r.unidad;
    const sh = sombreado();
    const conPeriodo = !!sh && !!ultimo?.periodos.length;
    const cabPeriodo = $("tabla-periodo");
    if (cabPeriodo) {
      cabPeriodo.hidden = !conPeriodo;
      cabPeriodo.textContent = sh ? columnaPeriodo(sh) : "";
    }
    for (const id of ["tabla-proporcion", "tabla-otros"]) { const c = $(id); if (c) c.hidden = !conPeriodo; }
    const periodosFila = periodoDeFilas(r);
    const filas = filasTabla(r, variacion).map((f, k) => {
      const tr = document.createElement("tr");
      if (f.excluido) tr.className = "excluido";
      const th = Object.assign(document.createElement("th"), { scope: "row", textContent: f.etiqueta });
      const td = Object.assign(document.createElement("td"), { textContent: f.valor });
      tr.append(th, td);
      if (conPeriodo) {
        const fila = periodosFila[k];
        const prop = fila?.periodo_proporcion;
        tr.append(Object.assign(document.createElement("td"), { className: "periodo-fila", textContent: fila?.periodo ?? "—" }),
          Object.assign(document.createElement("td"), { textContent: typeof prop === "number" ? `${Math.round(prop * 100)} %` : (prop ?? "") }),
          Object.assign(document.createElement("td"), { textContent: fila?.otros_periodos || "—" }));
      }
      return tr;
    });
    cuerpo.replaceChildren(...filas);
    $("tabla-cantidad")!.textContent = `${r.datos.length} filas`;
  }

  /** Las entidades que se ven, la resaltada primero (en las series con dimensión pais). */
  function mostradas(): string[] {
    if (!pais || !cEntidad) return [];
    return [cEntidad.value, ...doc.entidades_por_defecto.filter((id) => id !== cEntidad.value)];
  }
  const nombrePais = (id: string) => (pais ? doc.entidades.find((e) => e.id === id)?.nombre : undefined) ?? id;

  /** Las demás entidades de la selección inicial, con las mismas opciones, en tono secundario. */
  function otrasEntidades(o: Opciones): Array<{ nombre: string; resultado: Resultado }> {
    return mostradas().slice(1).flatMap((id) => {
      try {
        return [{ nombre: nombrePais(id), resultado: transformar(serieDeEntidad(doc, id), o, cargados) }];
      } catch {
        return [];
      }
    });
  }

  function leyendaPaises(): void {
    const nodo = $("leyenda-paises");
    if (!nodo) return;
    const [primera, ...resto] = mostradas().map(nombrePais);
    const muestra = (clase: string) => Object.assign(document.createElement("span"), { className: clase, ariaHidden: "true" });
    nodo.replaceChildren(muestra("muestra resaltada"), " ", Object.assign(document.createElement("strong"), { textContent: primera }),
      ...(resto.length ? [" · ", muestra("muestra"), ` ${resto.join(", ")}`] : []));
  }

  function cita(o: Opciones): void {
    const tr = nombreTransformacion(o);
    const paises = mostradas().map(nombrePais);
    $("cita-texto")!.textContent = textoCita(doc, tr, paises);
    $("cita-apa")!.textContent = apa(doc, tr, paises);
    $("cita-bibtex")!.textContent = bibtex(doc, tr, paises);
  }

  let vista: VistaGrafico | null = null;
  let turno = 0;
  const lector = $("lector") && $("lectura") ? conectarLector($("lector")!, $("lectura")!) : null;

  /**
   * Lo que dice el lector del gráfico de cada dato: fecha, valor, la banda del sombreado con sus fechas (y el reparto),
   * el episodio y los eventos del dato (revisión externa de la 4b, 9.4).
   */
  function lecturas(): Lectura[] {
    if (!ultimo) return [];
    const { r, o, periodos, episodios, eventos } = ultimo;
    const sh = sombreado();
    const ctx = contexto(o);
    const us = periodos.length && sh ? ubicacionesDe(periodos, sh, r, ctx) : [];
    const variacion = esVariacion(o.transformacion ?? "nivel");
    const modo = modoActual();
    return r.datos.flatMap(([f, v], k) => {
      if (v === null) return [];
      const texto = textoLectura({
        fecha: f, frecuencia: r.frecuencias[k], valor: numero(v, variacion), contexto: ctx,
        ...(us[k] && sh ? { columna: columnaPeriodo(sh), ubicacion: us[k] } : {}), episodios, eventos, modo,
      });
      return [{ t: fechaDeDibujo(referenciaDe(f, r.frecuencias[k], ctx)), texto }];
    });
  }
  async function dibujar(): Promise<void> {
    if (!ultimo) return;
    const mio = ++turno;
    const { r, o, otras } = ultimo;
    const ancho = contenedor.clientWidth || 600;
    const spec = especificacion({
      nombre: pais && cEntidad ? nombrePais(cEntidad.value) : undefined, otras,
      resultado: r, tramos: serie.tramos, empalme: doc.empalme, quiebres, tema: tema(), esVariacion: esVariacion(o.transformacion ?? "nivel"),
      log: cLog.checked && !cLog.disabled, alto: ancho < 520 ? 240 : 320, ancho, descripcion: $("resumen-grafico")!.textContent ?? "",
      ...marcasDelGrafico(),
    });
    try {
      await import("vega-embed");
      if (mio !== turno) return;
      vista?.finalize();
      vista = await dibujarEn(contenedor, spec);
      contenedor.dataset.listo = "1";
      contenedor.dataset.eventos = ultimo.eventos.length ? modoActual() : "";
      listaEventos();
      lector?.actualizar(lecturas(), vista);
    } catch (err) {
      estado.textContent = `No se pudo dibujar el gráfico (${err instanceof Error ? err.message : String(err)}). La tabla y las descargas siguen disponibles.`;
      estado.dataset.tipo = "error";
    }
  }

  // Exportar el gráfico con título, unidad, fuentes, variante y versión impresos (SPEC 6.2).
  async function imagen(formato: "png" | "svg"): Promise<void> {
    if (!ultimo) return;
    const { r, o, otras, periodos, eventos, episodios } = ultimo;
    const fuentes = [...new Set(doc.fuentes.map((f) => f.organismo))].join("; ");
    const lineasMarcas = [
      ...(periodos.length && registroPeriodos ? [`Sombreado: ${cSombreado?.selectedOptions[0]?.textContent?.toLowerCase()}${sombreado() === "catedra" ? ` (${ACLARACION_ETAPAS})` : ""}. Cada dato, en el período vigente a mitad de su intervalo (los saldos en nivel, el último día). Fuente: Vaivén, períodos, versión ${diaDeVersion(registroPeriodos.version_datos)}.`] : []),
      ...(episodios.length ? [`Episodios: ${episodios.map((e) => e.nombre).join("; ")}.`] : []),
      // En la imagen (900 px) los eventos pueden ir con letras aunque en la pantalla vayan como rayitas.
      ...(eventos.length ? [`Eventos: ${eventos.map((e) => (modoEventosDe(r, eventos, 900) === "letras" ? `${e.letra}. ${e.nombre}` : `${diaLegible(e.fecha)}, ${e.nombre}`)).join("; ")}.`] : []),
    ];
    const spec = especificacion({
      nombre: pais && cEntidad ? nombrePais(cEntidad.value) : undefined, otras,
      resultado: r, tramos: serie.tramos, empalme: doc.empalme, quiebres, tema: tema(), esVariacion: esVariacion(o.transformacion ?? "nivel"),
      log: cLog.checked && !cLog.disabled, alto: 380, ancho: 900, descripcion: $("resumen-grafico")!.textContent ?? "",
      ...marcasDelGrafico(),
      impreso: {
        titulo: `${doc.nombre} · ${doc.nombre_variante}`,
        subtitulo: r.unidad,
        pie: [`Fuentes: ${fuentes}.`, ...lineaPaises(), ...lineasMarcas,
          `Elaboración: Vaivén, variante «${doc.variante}», versión de datos ${diaDeVersion(doc.version_datos)}. ${licenciaImagen()}`, location.href],
      },
    });
    await exportarImagen(spec, formato, `${nombreArchivo()}.${formato}`);
  }

  function marcasDelGrafico() {
    if (!ultimo) return {};
    const { periodos, eventos, episodios, o } = ultimo;
    const sh = sombreado();
    return {
      ubicacion: contexto(o),
      ...(periodos.length ? { sombreado: { bandas: bandasDe(periodos), franja: sh === "plan" } } : {}),
      ...(periodos.length && sh ? { asignacion: { periodos, tipo: tipoDe(sh) } } : {}),
      ...(eventos.length ? { eventos } : {}),
      ...(episodios.length ? { episodios } : {}),
    };
  }

  /** El mismo gráfico en el explorador: la serie, la variante y los parámetros de la ficha (el país resaltado, en `e`). */
  function enlaceExplorador(): void {
    const a = document.getElementById("abrir-explorador") as HTMLAnchorElement | null;
    if (!a) return;
    const q = new URLSearchParams(location.search);
    const salida = new URLSearchParams();
    if (doc.serie !== "ipc") salida.set("s", doc.serie);
    if (!doc.es_variante_por_defecto) salida.set("v", doc.variante);
    for (const [k, v] of q) salida.set(k, v);
    a.href = `/explorador/${salida.size ? `?${salida}` : ""}`;
  }

  function lineaPaises(): string[] {
    const [primera, ...resto] = mostradas().map(nombrePais);
    return primera ? [`Resaltado: ${primera}${resto.length ? `; en gris: ${resto.join(", ")}` : ""}.`] : [];
  }

  const licenciaImagen = () => licencia(doc.fuentes);

  function nombreArchivo(): string {
    const o = ultimo?.o;
    const partes = ["vaiven", doc.serie, doc.variante, pais ? cEntidad?.value : undefined, o?.pesosActuales ? "pesos_actuales" : undefined,
      o?.frecuencia, o?.medida, o?.transformacion !== "nivel" ? o?.transformacion : undefined, o?.mediaMovil ? `mm${o.mediaMovil}` : undefined,
      sombreado() ? `sombreado_${sombreado()}` : undefined];
    return partes.filter(Boolean).join("_");
  }

  function csvVista(): void {
    if (!ultimo) return;
    const sh = sombreado();
    const conPeriodo = !!sh && ultimo.periodos.length > 0;
    const de = (res: Resultado, p?: string) => {
      const ps = conPeriodo ? periodoDeFilas(res) : [];
      return res.datos.map(([fecha, valor], k) => ({ fecha, pais: p, valor, ...ps[k] }));
    };
    // En las series con dimensión pais, el CSV lleva todos los países que se ven (la resaltada primero).
    const filas = pais
      ? [...de(ultimo.r, cEntidad?.value), ...ultimo.otras.flatMap((o, k) => de(o.resultado, mostradas()[k + 1]))]
      : de(ultimo.r);
    const texto = csvDeVista({ unidad: ultimo.r.unidad, conPais: pais, periodo: conPeriodo && sh ? columnaPeriodo(sh) : undefined, filas, metadatos: [], cita: { texto: "", apa: "", bibtex: "" } });
    bajar(URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" })), `${nombreArchivo()}.csv`);
  }

  function citaTxt(): void {
    if (!ultimo) return;
    const tr = nombreTransformacion(ultimo.o);
    const paises = mostradas().map(nombrePais);
    const licencias = [...new Set(doc.fuentes.map((f) => `${f.organismo}: ${f.licencia}`))];
    const texto = [
      `${doc.nombre} · ${doc.nombre_variante}`, `Unidad: ${ultimo.r.unidad}`, `Vista: ${location.href}`, "",
      "Cómo citar:", textoCita(doc, tr, paises), "", "APA:", apa(doc, tr, paises), "", "BibTeX:", bibtex(doc, tr, paises), "",
      `Licencia de los datos derivados: ${doc.licencia}.`, `Licencias de las fuentes: ${licencias.join("; ")}.`,
    ].join("\n");
    bajar(URL.createObjectURL(new Blob([texto + "\n"], { type: "text/plain;charset=utf-8" })), `${nombreArchivo()}_cita.txt`);
  }

  // Eventos
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("change", (e) => {
    if (e.target === cEntidad && cEntidad) elegirEntidad(cEntidad.value);
    // «Marcar eventos» habilita las categorías (y, si estaban todas desmarcadas, las vuelve a marcar); desmarcar todas
    // las categorías apaga «Marcar eventos».
    const t = e.target as HTMLInputElement;
    if (t === cEventos && cEventos.checked && !cCategorias.some((k) => k.checked)) cCategorias.forEach((k) => (k.checked = true));
    if (t.dataset?.categoria && !cCategorias.some((k) => k.checked) && cEventos) cEventos.checked = false;
    if (cCampoCategorias) cCampoCategorias.disabled = !cEventos?.checked;
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
    // Se redibuja al cruzar los 520 px y con cambios grandes, porque el modo de los eventos (letras o rayitas) depende
    // del ancho.
    if ((ancho < 520) !== (anchoPrevio < 520) || Math.abs(ancho - anchoPrevio) > 80) void dibujar();
    anchoPrevio = ancho;
  }).observe(contenedor);

  void actualizar();
}

iniciar();
