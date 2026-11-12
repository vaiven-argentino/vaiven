// Explorador (SPEC 6.2; fase 4b: una serie por vez). Arma los controles según lo que admite la variante elegida, pide
// los datos a /datos/ y guarda todo en la URL. El gráfico usa la misma especificación que la ficha, con sombreado por
// períodos, eventos y, en las series internacionales, un color por país.
import { apa, bibtex, citaRegistro, NOMBRE_DENOMINADOR, nombreTransformacion, textoCita } from "@vaiven/cita";
import {
  ErrorTransformacion, diasDe, disponibles, periodoDeCadaFecha, periodosDe, rangoLegible, serieDeEntidad, seCruzan, tienePais,
  transformar, type DocumentoEventos, type DocumentoPeriodos, type Periodo, type Resultado, type TipoPeriodo, type Transformacion,
} from "@vaiven/transformaciones";
import { csvDeVista, hojasXlsx, type VistaDescarga } from "../lib/descarga";
import { estadoDesdeUrl, MAX_PAISES, MEDIAS, opcionesDe, porDefecto, serieDeUrl, serieVista, urlDesdeEstado, type Documento, type Estado, type IndiceSerie } from "../lib/estado";
import { esVariacion, numerarQuiebres, rangoQuiebre, resumen, type QuiebreNumerado } from "../lib/ficha";
import { NOMBRE_MEDIDA, NOMBRE_TIPO_QUIEBRE, NOMBRE_TRANSFORMACION, diaDeVersion, fechaCorta, fechaLegible, numero } from "../lib/formato";
import { bajar, bajarTexto, cargarInsumos, dibujarEn, exportarImagen, leerDatos, licenciaImagen, tema, type Cargados } from "./comun";
import { especificacion, type BandaPeriodo, type MarcaEvento } from "./espec";

type DocumentoCompleto = Documento & {
  nombre: string; nombre_variante: string; variante: string; serie: string; codigo: string; version_datos: string; cita: string;
  empalme: "encadenar_tasas" | "yuxtaponer" | "derivar"; fuentes: Array<{ organismo: string; nombre: string; licencia: string; url: string }>;
  licencia: string; es_variante_por_defecto: boolean;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface DatosPagina {
  series: IndiceSerie[];
  tipos: Array<{ id: string; nombre: string }>;
  etapas: Array<{ id: string; nombre: string; desde: string; hasta: string | null }>;
}

const NOMBRE_SOMBREADO: Record<string, string> = {
  gobierno: "gobiernos", mandato: "gobiernos, por mandato", ministro: "ministros de Economía", plan: "planes de estabilización",
  regimen_cambiario: "regímenes cambiarios",
};
const COLUMNA_PERIODO: Record<string, string> = {
  gobierno: "Gobierno", mandato: "Gobierno (mandato)", ministro: "Ministro de Economía", plan: "Plan", regimen_cambiario: "Régimen cambiario",
};

function iniciar(): void {
  const nodo = document.getElementById("x-datos");
  if (!nodo?.textContent) return;
  const pagina = JSON.parse(nodo.textContent) as DatosPagina;
  const indice = pagina.series;
  const nombreTipo = new Map(pagina.tipos.map((t) => [t.id, t.nombre]));
  const nombreSombreado = (sh: string) => (sh === "catedra" ? (nombreTipo.get("catedra") ?? "Etapas").toLowerCase() : NOMBRE_SOMBREADO[sh]);
  const columnaPeriodo = (sh: string) => sh === "catedra" ? "Etapa" : COLUMNA_PERIODO[sh];

  const c = {
    serie: $<HTMLSelectElement>("x-serie"), variante: $<HTMLSelectElement>("x-variante"),
    campoPaises: $<HTMLFieldSetElement>("x-campo-paises"), paises: $<HTMLDivElement>("x-paises"), resaltado: $<HTMLSelectElement>("x-resaltado"),
    campoPesos: $<HTMLLabelElement>("x-campo-pesos"), pesos: $<HTMLInputElement>("x-pesos"),
    campoMedida: $<HTMLDivElement>("x-campo-medida"), medida: $<HTMLSelectElement>("x-medida"),
    campoDeflactor: $<HTMLDivElement>("x-campo-deflactor"), deflactor: $<HTMLSelectElement>("x-deflactor"),
    campoPib: $<HTMLDivElement>("x-campo-pib"), pib: $<HTMLSelectElement>("x-pib"),
    transformacion: $<HTMLSelectElement>("x-transformacion"),
    campoBase: $<HTMLDivElement>("x-campo-base"), base: $<HTMLInputElement>("x-base"),
    campoFrecuencia: $<HTMLDivElement>("x-campo-frecuencia"), frecuencia: $<HTMLSelectElement>("x-frecuencia"),
    campoMedia: $<HTMLDivElement>("x-campo-media"), media: $<HTMLSelectElement>("x-media"),
    desde: $<HTMLInputElement>("x-desde"), hasta: $<HTMLInputElement>("x-hasta"),
    etapa: document.getElementById("x-etapa") as HTMLSelectElement | null,
    campoLog: $<HTMLLabelElement>("x-campo-log"), log: $<HTMLInputElement>("x-log"),
    sombreado: $<HTMLSelectElement>("x-sombreado"), eventos: $<HTMLInputElement>("x-eventos"),
  };
  const estadoTexto = $<HTMLParagraphElement>("x-estado");
  const contenedor = $<HTMLDivElement>("x-grafico");

  const documentos = new Map<string, DocumentoCompleto>();
  const cargados: Cargados = { series: {} };
  let registroPeriodos: DocumentoPeriodos | null = null;
  let registroEventos: DocumentoEventos | null = null;
  let doc!: DocumentoCompleto;
  let estado!: Estado;
  let avisosUrl: string[] = [];

  document.querySelectorAll<HTMLElement>("[data-requiere-js]").forEach((el) => (el.hidden = false));
  if (window.matchMedia("(max-width: 700px)").matches) $<HTMLDetailsElement>("x-panel").open = false;

  async function documento(s: string, v: string): Promise<DocumentoCompleto> {
    const clave = `${s}.${v}`;
    if (!documentos.has(clave)) {
      const archivo = indice.find((x) => x.id === s)!.variantes.find((x) => x.id === v)!.archivo;
      documentos.set(clave, await leerDatos<DocumentoCompleto>(archivo));
    }
    return documentos.get(clave)!;
  }

  // ---- Controles: se arman según lo que admite la variante ----
  const opcion = (valor: string, texto: string, elegido = false) => Object.assign(document.createElement("option"), { value: valor, textContent: texto, selected: elegido });

  function armarControles(): void {
    const s = indice.find((x) => x.id === estado.s)!;
    c.serie.value = estado.s;
    c.variante.replaceChildren(...s.variantes.map((v) => opcion(v.id, v.nombre, v.id === estado.v)));
    c.campoPaises.hidden = !tienePais(doc);
    if (tienePais(doc)) {
      c.paises.replaceChildren(...doc.entidades.map((ent) => {
        const etiqueta = Object.assign(document.createElement("label"), { className: "casilla" });
        const caja = Object.assign(document.createElement("input"), { type: "checkbox", value: ent.id, checked: estado.p.includes(ent.id) });
        caja.dataset.pais = ent.id;
        etiqueta.append(caja, ` ${ent.nombre}`);
        return etiqueta;
      }));
      c.resaltado.replaceChildren(...estado.p.map((id) => opcion(id, nombrePais(id), id === estado.p[0])));
    }
    const serie = serieVista(doc, estado.p);
    const base = disponibles(serie);
    const disp = disponibles(serie, { pesosActuales: estado.pa });
    c.campoPesos.hidden = !base.medidas.includes("pesos_actuales");
    c.pesos.checked = estado.pa;
    const medidas = disp.medidas.filter((m) => m !== "pesos_actuales") as Array<"real" | "en_dolares" | "pct_pib">;
    c.campoMedida.hidden = !medidas.length;
    c.medida.replaceChildren(opcion("", "Nominal (como se publica)", !estado.m), ...medidas.map((m) => opcion(m, NOMBRE_MEDIDA[m], m === estado.m)));
    c.campoDeflactor.hidden = estado.m !== "real" || !disp.deflactores.length;
    c.deflactor.replaceChildren(...disp.deflactores.map((o, k) => opcion(o.id, o.nombre ?? o.id, estado.d ? o.id === estado.d : k === 0)));
    c.campoPib.hidden = estado.m !== "pct_pib" || disp.denominadores.length < 2;
    const pibDef = serie.insumos?.pct_pib?.opciones.find((o) => o.id === serie.insumos?.pct_pib?.por_defecto)?.denominador;
    c.pib.replaceChildren(...disp.denominadores.map((d) => opcion(d, NOMBRE_DENOMINADOR[d] ?? d, d === (estado.pib || pibDef))));
    c.transformacion.replaceChildren(...disp.transformaciones.map((t) => opcion(t, NOMBRE_TRANSFORMACION[t], t === estado.t)));
    c.campoBase.hidden = estado.t !== "base_100" && estado.t !== "indice_desde_tasas";
    c.base.value = estado.base;
    c.base.placeholder = estado.t === "base_100" ? serie.datos[0]?.[0].slice(0, 4) ?? "" : "primer año";
    c.campoFrecuencia.hidden = !disp.frecuencias.length;
    c.frecuencia.replaceChildren(opcion("", "Original", !estado.f), ...disp.frecuencias.map((f) => opcion(f, f === "anual" ? "Anual" : "Trimestral", f === estado.f)));
    c.campoMedia.hidden = !disp.mediaMovil;
    c.media.value = estado.mm ? String(estado.mm) : "";
    c.desde.value = estado.desde;
    c.hasta.value = estado.hasta;
    if (c.etapa) c.etapa.value = etapaElegida() ?? "";
    c.log.checked = estado.log;
    c.sombreado.value = estado.sh;
    c.eventos.checked = estado.ev;
  }

  const nombrePais = (id: string) => (tienePais(doc) ? doc.entidades.find((e) => e.id === id)?.nombre : undefined) ?? id;

  /** La etapa del curso que coincide con el período elegido, si coincide con alguna. */
  function etapaElegida(): string | undefined {
    return pagina.etapas.find((e) => e.desde.slice(0, 7) === estado.desde && mesFinal(e.hasta) === estado.hasta)?.id;
  }
  /** El último mes de un período que termina (excluido) en `hasta`: el 10/12/1983 → 1983-12; el 1/4/1991 → 1991-03. */
  function mesFinal(hasta: string | null): string {
    if (!hasta) return "";
    const [a, m, d] = hasta.split("-").map(Number);
    if (d > 1) return `${a}-${String(m).padStart(2, "0")}`;
    return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  }

  /** Lee los controles y arma el estado (la serie y la variante se manejan aparte). */
  function leerControles(): void {
    if (tienePais(doc)) {
      const marcados = [...c.paises.querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value);
      const resaltado = marcados.includes(c.resaltado.value) ? c.resaltado.value : marcados[0];
      estado.p = resaltado ? [resaltado, ...marcados.filter((x) => x !== resaltado)].slice(0, MAX_PAISES) : estado.p;
    }
    estado.pa = !c.campoPesos.hidden && c.pesos.checked;
    estado.m = (c.campoMedida.hidden ? "" : c.medida.value) as Estado["m"];
    estado.d = estado.m === "real" && c.deflactor.selectedIndex > 0 ? c.deflactor.value : "";
    estado.pib = estado.m === "pct_pib" && c.pib.selectedIndex > 0 ? c.pib.value : "";
    estado.t = (c.transformacion.value || "nivel") as Transformacion;
    estado.base = /^\d{4}(-\d{2})?$/.test(c.base.value.trim()) ? c.base.value.trim() : "";
    estado.f = (c.campoFrecuencia.hidden ? "" : c.frecuencia.value) as Estado["f"];
    estado.mm = (MEDIAS as readonly number[]).includes(Number(c.media.value)) && !c.campoMedia.hidden ? Number(c.media.value) : 0;
    estado.desde = /^\d{4}(-\d{2})?$/.test(c.desde.value.trim()) ? c.desde.value.trim() : "";
    estado.hasta = /^\d{4}(-\d{2})?$/.test(c.hasta.value.trim()) ? c.hasta.value.trim() : "";
    estado.log = c.log.checked;
    estado.sh = c.sombreado.value as Estado["sh"];
    estado.ev = c.eventos.checked;
    // Lo que deja de tener sentido con la nueva elección: la librería decide qué queda disponible.
    const disp = disponibles(serieVista(doc, estado.p), { pesosActuales: estado.pa });
    if (!disp.transformaciones.includes(estado.t)) estado.t = "nivel";
    if (estado.f && !(disp.frecuencias as string[]).includes(estado.f)) estado.f = "";
    if (estado.m && !(disp.medidas as string[]).includes(estado.m)) estado.m = "";
    // % del PIB pide la frecuencia del PIB: si la serie es más fina, pasa sola a anual (como la ficha).
    const serie = serieVista(doc, estado.p);
    if (estado.m === "pct_pib" && !estado.f && !["anual", "trimestral"].includes(serie.frecuencia) && disp.frecuencias.includes("anual")) estado.f = "anual";
  }

  // ---- Períodos y eventos ----
  async function periodosVisibles(r: Resultado): Promise<Periodo[]> {
    if (!estado.sh) return [];
    registroPeriodos ??= await leerDatos<DocumentoPeriodos>("periodos.json");
    const tipo = (estado.sh === "mandato" ? "gobierno" : estado.sh) as TipoPeriodo;
    const todos = periodosDe(registroPeriodos, tipo, estado.sh === "mandato");
    const fechas = r.datos.map((d) => d[0]);
    if (!fechas.length) return [];
    const desde = diasDe(fechas[0], r.frecuencias[0]).desde;
    const hasta = diasDe(fechas[fechas.length - 1], r.frecuencias[r.frecuencias.length - 1]).hasta;
    return seCruzan(todos, desde, hasta);
  }

  async function eventosVisibles(r: Resultado): Promise<MarcaEvento[]> {
    if (!estado.ev || !r.datos.length) return [];
    registroEventos ??= await leerDatos<DocumentoEventos>("eventos.json");
    const desde = diasDe(r.datos[0][0], r.frecuencias[0]).desde;
    const hasta = diasDe(r.datos[r.datos.length - 1][0], r.frecuencias[r.frecuencias.length - 1]).hasta;
    return registroEventos.eventos.filter((e) => e.fecha >= desde && e.fecha <= hasta)
      .map((e, k) => ({ letra: letra(k), fecha: e.fecha, nombre: e.nombre }));
  }
  const letra = (k: number) => (k < 26 ? String.fromCharCode(65 + k) : `${String.fromCharCode(64 + Math.floor(k / 26))}${String.fromCharCode(65 + (k % 26))}`);

  // ---- Vista ----
  let ultimo: {
    r: Resultado; otras: Array<{ id: string; nombre: string; resultado: Resultado }>; quiebres: QuiebreNumerado[];
    periodos: Periodo[]; eventos: MarcaEvento[]; transformacion: string | undefined;
  } | null = null;

  async function actualizar(): Promise<void> {
    const serie = serieVista(doc, estado.p);
    const o = opcionesDe(estado, serie);
    let r: Resultado;
    try {
      await cargarInsumos(serie, o, cargados, () => { estadoTexto.textContent = "Cargando los datos que necesita la medida…"; });
      r = transformar(serie, o, cargados);
    } catch (err) {
      estadoTexto.textContent = err instanceof ErrorTransformacion || err instanceof Error ? err.message : String(err);
      estadoTexto.dataset.tipo = "error";
      return;
    }
    estadoTexto.textContent = "";
    delete estadoTexto.dataset.tipo;
    const otras = tienePais(doc) ? estado.p.slice(1).flatMap((id) => {
      try { return [{ id, nombre: nombrePais(id), resultado: transformar(serieDeEntidad(doc, id), o, cargados) }]; } catch { return []; }
    }) : [];
    let periodos: Periodo[] = [], eventos: MarcaEvento[] = [];
    try {
      [periodos, eventos] = await Promise.all([periodosVisibles(r), eventosVisibles(r)]);
    } catch (err) {
      estadoTexto.textContent = `No se pudieron leer los períodos o los eventos (${err instanceof Error ? err.message : String(err)}).`;
    }
    const quiebres = numerarQuiebres({ ...serie, advertencias: doc.advertencias });
    const transformacion = nombreTransformacion({ ...o, deflactor: o.deflactor ?? (o.medida === "real" ? serie.insumos?.real?.por_defecto : undefined) });
    ultimo = { r, otras, quiebres, periodos, eventos, transformacion };
    armarControles();
    const positivos = r.datos.every((d) => d[1] === null || d[1] > 0) && otras.every((x) => x.resultado.datos.every((d) => d[1] === null || d[1] > 0));
    c.log.disabled = !positivos;
    c.campoLog.classList.toggle("deshabilitado", !positivos);
    $("x-unidad").textContent = r.unidad;
    leyendas();
    avisos();
    tabla();
    cita();
    $<HTMLAnchorElement>("x-ficha").href = urlFicha();
    history.replaceState(null, "", `${location.pathname}${urlDesdeEstado(estado, doc, indice)}${location.hash}`);
    resumenOpciones();
    void dibujar();
  }

  function resumenOpciones(): void {
    if (!ultimo) return;
    const partes = [doc.nombre];
    if (tienePais(doc)) partes.push(estado.p.map(nombrePais).join(", "));
    if (ultimo.transformacion) partes.push(ultimo.transformacion);
    partes.push(estado.desde || estado.hasta ? `${estado.desde || "inicio"}–${estado.hasta || "hoy"}` : "toda la serie");
    if (estado.sh) partes.push(`sombreado: ${nombreSombreado(estado.sh)}`);
    $("x-resumen-opciones").textContent = partes.join(" · ");
  }

  function textoResumen(): string {
    if (!ultimo) return "";
    const { r, quiebres, periodos, eventos } = ultimo;
    let t = resumen(r, r.unidad, esVariacion(estado.t), quiebres);
    if (periodos.length) t += ` Sombreado por ${nombreSombreado(estado.sh)}: ${periodos.length === 1 ? "un período" : `${periodos.length} períodos`}, de ${periodos[0].nombre} a ${periodos[periodos.length - 1].nombre}.`;
    if (eventos.length) t += ` ${eventos.length === 1 ? "Un evento marcado" : `${eventos.length} eventos marcados`} (lista debajo del gráfico).`;
    return t;
  }

  function leyendas(): void {
    if (!ultimo) return;
    const { periodos, eventos } = ultimo;
    $("x-resumen").textContent = textoResumen();
    const lp = $("x-leyenda-periodos");
    lp.hidden = !periodos.length;
    $("x-titulo-periodos").textContent = estado.sh ? `Períodos: ${nombreSombreado(estado.sh)}` : "Períodos";
    $("x-lista-periodos").replaceChildren(...periodos.map((p) => {
      const li = document.createElement("li");
      li.append(`${p.nombre}${p.caracter === "de_facto" ? " (de facto)" : p.caracter === "interino" ? " (interino)" : ""} `,
        Object.assign(document.createElement("span"), { className: "rango", textContent: rangoLegible(p) }));
      return li;
    }));
    const le = $("x-leyenda-eventos");
    le.hidden = !eventos.length;
    $("x-lista-eventos").replaceChildren(...eventos.map((e) => {
      const li = document.createElement("li");
      li.append(`${e.nombre} `, Object.assign(document.createElement("span"), { className: "rango", textContent: rangoLegible({ desde: e.fecha, hasta: null }).replace("desde el ", "") }));
      return li;
    }));
    const lpaises = $("x-leyenda-paises");
    lpaises.hidden = !tienePais(doc);
    if (tienePais(doc)) {
      const t = tema();
      lpaises.replaceChildren(...estado.p.map((id, k) => {
        const s = document.createElement("span");
        const muestra = Object.assign(document.createElement("span"), { className: "muestra" });
        muestra.style.borderTopColor = t.paleta?.[k] ?? t.serie;
        muestra.setAttribute("aria-hidden", "true");
        s.append(muestra, k === 0 ? Object.assign(document.createElement("strong"), { textContent: nombrePais(id) }) : nombrePais(id));
        return s;
      }));
    }
  }

  function avisos(): void {
    if (!ultimo) return;
    const { r, otras, quiebres } = ultimo;
    const ids = new Set([r, ...otras.map((x) => x.resultado)].flatMap((x) => x.advertencias.map((a) => a.id)));
    const cruzados = quiebres.filter((q) => ids.has(q.advertencia.id) && q.forma !== "general");
    const lineas = [...avisosUrl];
    if (cruzados.length) {
      lineas.push(`El período cruza ${cruzados.length === 1 ? "un quiebre" : `${cruzados.length} quiebres`}: ${cruzados
        .map((q) => `${q.n}. ${NOMBRE_TIPO_QUIEBRE[q.advertencia.tipo] ?? q.advertencia.tipo} (${rangoQuiebre(q.advertencia)})`)
        .join("; ")}. El detalle está en la ficha de la serie.`);
    }
    for (const e of r.excluidos) lineas.push(`${fechaCorta(e.fecha)}: dato excluido hasta confirmarlo. ${e.motivo}`);
    for (const n of r.notas) lineas.push(n);
    const caja = $("x-avisos");
    caja.replaceChildren(...lineas.map((l) => Object.assign(document.createElement("p"), { textContent: l })));
    caja.hidden = !lineas.length;
  }

  /** Filas de la vista: fecha, país (en las internacionales), valor y período del sombreado. */
  function filasVista() {
    if (!ultimo) return [];
    const { r, otras, periodos } = ultimo;
    const conPeriodo = (res: Resultado) => (periodos.length ? periodoDeCadaFecha(periodos, res.datos.map((d) => d[0]), res.frecuencias) : []);
    const de = (res: Resultado, pais?: string) => {
      const ps = conPeriodo(res);
      return res.datos.map(([f, v], k) => ({ fecha: f, pais, valor: v, periodo: ps[k]?.nombre, frecuencia: res.frecuencias[k] }));
    };
    return tienePais(doc) ? [...de(r, estado.p[0]), ...otras.flatMap((o) => de(o.resultado, o.id))] : de(r);
  }

  function tabla(): void {
    if (!ultimo) return;
    const { r } = ultimo;
    const conPais = tienePais(doc);
    const conPeriodo = !!estado.sh && ultimo.periodos.length > 0;
    const cab = document.createElement("tr");
    for (const t of ["Fecha", ...(conPais ? ["País"] : []), r.unidad, ...(conPeriodo ? [columnaPeriodo(estado.sh)] : [])]) {
      cab.append(Object.assign(document.createElement("th"), { scope: "col", textContent: t }));
    }
    $("x-tabla-cabeza").replaceChildren(cab);
    const variacion = esVariacion(estado.t);
    const excluidos = new Set(r.excluidos.map((e) => e.fecha));
    const filas = filasVista().map((f) => {
      const tr = document.createElement("tr");
      const esExcluido = f.valor === null && excluidos.has(f.fecha) && (!conPais || f.pais === estado.p[0]);
      if (esExcluido) tr.className = "excluido";
      tr.append(Object.assign(document.createElement("th"), { scope: "row", textContent: fechaLegible(f.fecha, f.frecuencia) }));
      if (conPais) tr.append(Object.assign(document.createElement("td"), { textContent: nombrePais(f.pais ?? "") }));
      tr.append(Object.assign(document.createElement("td"), { className: "valor", textContent: esExcluido ? "Excluido (ver nota)" : numero(f.valor, variacion) }));
      if (conPeriodo) tr.append(Object.assign(document.createElement("td"), { textContent: f.periodo ?? "—" }));
      return tr;
    });
    $("x-tabla-cuerpo").replaceChildren(...filas);
    $("x-tabla-cantidad").textContent = `${filas.length} filas`;
  }

  function cita(): void {
    if (!ultimo) return;
    const paises = tienePais(doc) ? estado.p.map(nombrePais) : undefined;
    let texto = textoCita(doc, ultimo.transformacion, paises);
    if (ultimo.periodos.length && registroPeriodos) texto += `\nSombreado: ${citaRegistro("periodos", registroPeriodos.version_datos)}`;
    $("x-cita").textContent = texto;
  }

  function urlFicha(): string {
    const s = indice.find((x) => x.id === estado.s)!;
    const ruta = estado.v === s.variante_por_defecto ? `/series/${estado.s}/` : `/series/${estado.s}/${estado.v}/`;
    // La ficha entiende los mismos parámetros (salvo serie, variante, países y sombreado); el período, en años.
    const q = new URLSearchParams(urlDesdeEstado(estado, doc, indice));
    for (const k of ["s", "v", "p", "sh", "ev"]) q.delete(k);
    if (tienePais(doc) && estado.p[0] !== doc.entidades_por_defecto[0]) q.set("e", estado.p[0]);
    for (const k of ["desde", "hasta"]) { const v = q.get(k); if (v && v !== "todo") q.set(k, v.slice(0, 4)); }
    return `${ruta}${q.size ? `?${q}` : ""}`;
  }

  // ---- Gráfico ----
  let vista: { finalize: () => void } | null = null;
  let turno = 0;

  function entrada(ancho: number, alto: number, impreso?: { titulo: string; subtitulo: string; pie: string[] }) {
    const { r, otras, quiebres, periodos, eventos } = ultimo!;
    const bandas: BandaPeriodo[] = periodos.map((p) => ({ desde: p.desde, hasta: p.hasta, nombre: p.nombre, nombre_corto: p.nombre_corto, facto: p.caracter === "de_facto" }));
    const serie = serieVista(doc, estado.p);
    return especificacion({
      resultado: r, tramos: serie.tramos, empalme: doc.empalme, quiebres, tema: tema(), esVariacion: esVariacion(estado.t),
      log: estado.log && !c.log.disabled, alto, ancho, descripcion: textoResumen(),
      nombre: tienePais(doc) ? nombrePais(estado.p[0]) : undefined, otras: otras.map((o) => ({ nombre: o.nombre, resultado: o.resultado })),
      colores: tienePais(doc), sombreado: bandas.length ? { bandas, franja: estado.sh === "plan" } : undefined, eventos, impreso,
    });
  }

  async function dibujar(): Promise<void> {
    if (!ultimo) return;
    const mio = ++turno;
    const ancho = contenedor.clientWidth || 600;
    try {
      await import("vega-embed");
      if (mio !== turno) return;
      vista?.finalize();
      vista = await dibujarEn(contenedor, entrada(ancho, ancho < 520 ? 260 : 360));
      contenedor.dataset.listo = "1";
    } catch (err) {
      estadoTexto.textContent = `No se pudo dibujar el gráfico (${err instanceof Error ? err.message : String(err)}). La tabla y las descargas siguen disponibles.`;
      estadoTexto.dataset.tipo = "error";
    }
  }

  // ---- Descargas ----
  function nombreArchivo(): string {
    const partes = ["vaiven", estado.s, estado.v, tienePais(doc) ? estado.p.join("-") : undefined, estado.pa ? "pesos_actuales" : undefined,
      estado.f || undefined, estado.m || undefined, estado.t !== "nivel" ? estado.t : undefined, estado.mm ? `mm${estado.mm}` : undefined,
      estado.desde || estado.hasta ? `${estado.desde || "inicio"}_${estado.hasta || "hoy"}` : undefined, estado.sh ? `sombreado_${estado.sh}` : undefined];
    return partes.filter(Boolean).join("_").replace(/[^\w.-]+/g, "-");
  }

  function lineasPie(): string[] {
    const fuentes = [...new Set(doc.fuentes.map((f) => f.organismo))].join("; ");
    const pie = [`Fuentes: ${fuentes}.`];
    if (tienePais(doc)) pie.push(`Países: ${estado.p.map(nombrePais).join(", ")} (resaltado: ${nombrePais(estado.p[0])}).`);
    if (ultimo?.transformacion) pie.push(`Transformación: ${ultimo.transformacion} (calculada por Vaivén).`);
    if (ultimo?.periodos.length && registroPeriodos) pie.push(`Sombreado: ${nombreSombreado(estado.sh)}. Fuente: Vaivén, períodos, versión ${diaDeVersion(registroPeriodos.version_datos)}.`);
    if (ultimo?.eventos.length) pie.push(`Eventos: ${ultimo.eventos.map((e) => `${e.letra}. ${e.nombre}`).join("; ")}.`);
    pie.push(`Elaboración: Vaivén, variante «${doc.variante}», versión de datos ${diaDeVersion(doc.version_datos)}. ${licenciaImagen(doc.fuentes)}`, location.href);
    return pie;
  }

  async function imagen(formato: "png" | "svg"): Promise<void> {
    if (!ultimo) return;
    const spec = entrada(900, 400, { titulo: `${doc.nombre} · ${doc.nombre_variante}`, subtitulo: ultimo.r.unidad, pie: lineasPie() });
    await exportarImagen(spec, formato, `${nombreArchivo()}.${formato}`);
  }

  function vistaDescarga(): VistaDescarga {
    const u = ultimo!;
    const conPeriodo = !!estado.sh && u.periodos.length > 0;
    const cruzados = u.quiebres.filter((q) => new Set(u.r.advertencias.map((a) => a.id)).has(q.advertencia.id));
    const paises = tienePais(doc) ? estado.p.map(nombrePais) : undefined;
    const metadatos: Array<[string, string]> = [
      ["Serie", `${doc.nombre} (${doc.codigo})`], ["Variante", `${doc.nombre_variante} («${doc.variante}»)`], ["Unidad", u.r.unidad],
      ["Transformación", u.transformacion ?? "ninguna (como se publica)"],
      ["Período", estado.desde || estado.hasta ? `${estado.desde || "inicio"} – ${estado.hasta || "último dato"}` : "toda la serie"],
      ...(paises ? [["Países", paises.join(", ")] as [string, string]] : []),
      ...(conPeriodo && registroPeriodos ? [["Sombreado", `${nombreSombreado(estado.sh)} (Vaivén, períodos, versión ${diaDeVersion(registroPeriodos.version_datos)}); la columna del período es la vigente el último día de cada fila`] as [string, string]] : []),
      ["Quiebres en el período", cruzados.length ? cruzados.map((q) => `${NOMBRE_TIPO_QUIEBRE[q.advertencia.tipo] ?? q.advertencia.tipo} (${rangoQuiebre(q.advertencia)}): ${q.advertencia.descripcion}`).join(" | ") : "ninguno"],
      ["Fuentes", doc.fuentes.map((f) => `${f.organismo}: ${f.nombre} (${f.licencia}) ${f.url}`).join(" | ")],
      ["Licencia de los datos derivados", doc.licencia],
      ["Versión de datos", diaDeVersion(doc.version_datos)],
      ["Vista en el explorador", location.href],
      ["Descargado", new Date().toISOString().slice(0, 10)],
      ["Nota", "Las celdas vacías son datos faltantes o excluidos: no se completan."],
    ];
    return {
      unidad: u.r.unidad, conPais: tienePais(doc), periodo: conPeriodo ? columnaPeriodo(estado.sh) : undefined,
      filas: filasVista().map((f) => ({ fecha: f.fecha, pais: f.pais, valor: f.valor, periodo: f.periodo })),
      metadatos,
      cita: { texto: $("x-cita").textContent ?? "", apa: apa(doc, u.transformacion, paises), bibtex: bibtex(doc, u.transformacion, paises) },
      periodos: conPeriodo ? u.periodos.map((p) => ({ nombre: p.nombre, desde: p.desde, hasta: p.hasta, fuentes: p.fuentes.map((f) => `${f.para ? `${f.para}: ` : ""}${f.referencia ?? f.nota ?? ""}${f.pagina ? `, p. ${f.pagina}` : ""}${f.url ? ` ${f.url}` : ""}`).join(" | ") })) : undefined,
    };
  }

  async function xlsx(): Promise<void> {
    if (!ultimo) return;
    estadoTexto.textContent = "Armando el XLSX…";
    try {
      const { default: escribir } = await import("write-excel-file/browser");
      const blob = await escribir(hojasXlsx(vistaDescarga()) as never).toBlob();
      bajar(URL.createObjectURL(blob), `${nombreArchivo()}.xlsx`);
      estadoTexto.textContent = "";
    } catch (err) {
      estadoTexto.textContent = `No se pudo armar el XLSX (${err instanceof Error ? err.message : String(err)}). El CSV tiene los mismos datos.`;
      estadoTexto.dataset.tipo = "error";
    }
  }

  function citaTxt(): void {
    if (!ultimo) return;
    const v = vistaDescarga();
    const texto = [`${doc.nombre} · ${doc.nombre_variante}`, `Unidad: ${v.unidad}`, `Vista: ${location.href}`, "",
      "Cómo citar:", v.cita.texto, "", "APA:", v.cita.apa, "", "BibTeX:", v.cita.bibtex, "",
      ...v.metadatos.filter(([k]) => ["Fuentes", "Licencia de los datos derivados"].includes(k)).map(([k, x]) => `${k}: ${x}`)].join("\n");
    bajarTexto(texto + "\n", "text/plain;charset=utf-8", `${nombreArchivo()}_cita.txt`);
  }

  // ---- Eventos de la interfaz ----
  async function elegirSerie(s: string, v?: string): Promise<void> {
    const serie = indice.find((x) => x.id === s)!;
    const variante = v ?? serie.variante_por_defecto;
    estadoTexto.textContent = "Cargando la serie…";
    try {
      doc = await documento(s, variante);
    } catch (err) {
      estadoTexto.textContent = `No se pudo cargar la serie (${err instanceof Error ? err.message : String(err)}).`;
      estadoTexto.dataset.tipo = "error";
      return;
    }
    // Se conservan el sombreado y los eventos; lo demás vuelve a la vista inicial de la serie.
    const { sh, ev } = estado;
    estado = { ...porDefecto(s, variante, doc), sh, ev };
    avisosUrl = [];
    await actualizar();
  }

  c.serie.addEventListener("change", () => void elegirSerie(c.serie.value));
  c.variante.addEventListener("change", () => void elegirSerie(estado.s, c.variante.value));
  $<HTMLFormElement>("x-controles").addEventListener("submit", (e) => e.preventDefault());
  $<HTMLFormElement>("x-controles").addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    if (t === c.etapa && c.etapa) {
      const etapa = pagina.etapas.find((x) => x.id === c.etapa!.value);
      if (etapa) { c.desde.value = etapa.desde.slice(0, 7); c.hasta.value = mesFinal(etapa.hasta); }
    }
    if (t.dataset.pais) {
      const marcados = c.paises.querySelectorAll<HTMLInputElement>("input:checked");
      if (marcados.length > MAX_PAISES) (t as HTMLInputElement).checked = false;
      if (!marcados.length) (t as HTMLInputElement).checked = true;
    }
    leerControles();
    avisosUrl = [];
    void actualizar();
  });
  document.querySelectorAll<HTMLButtonElement>(".atajo").forEach((b) => b.addEventListener("click", () => {
    c.desde.value = b.dataset.desde ?? "";
    c.hasta.value = b.dataset.hasta ?? "";
    leerControles();
    void actualizar();
  }));
  $("x-bajar-csv").addEventListener("click", () => { if (ultimo) bajarTexto(csvDeVista(vistaDescarga()), "text/csv;charset=utf-8", `${nombreArchivo()}.csv`); });
  $("x-bajar-xlsx").addEventListener("click", () => void xlsx());
  $("x-bajar-png").addEventListener("click", () => void imagen("png"));
  $("x-bajar-svg").addEventListener("click", () => void imagen("svg"));
  $("x-bajar-cita").addEventListener("click", citaTxt);
  $("x-copiar").addEventListener("click", async () => {
    const aviso = $("x-copiado");
    try {
      await navigator.clipboard.writeText($("x-cita").textContent ?? "");
      aviso.textContent = "Copiada.";
    } catch {
      const rango = document.createRange();
      rango.selectNodeContents($("x-cita"));
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(rango);
      aviso.textContent = "Seleccionada: copiala con Ctrl+C.";
    }
    setTimeout(() => { aviso.textContent = ""; }, 4000);
  });
  document.addEventListener("vaiven:tema", () => { leyendas(); void dibujar(); });
  let anchoPrevio = contenedor.clientWidth;
  new ResizeObserver(() => {
    const ancho = contenedor.clientWidth;
    if (Math.abs(ancho - anchoPrevio) > 40) void dibujar();
    anchoPrevio = ancho;
  }).observe(contenedor);

  // ---- Arranque: la URL manda ----
  void (async () => {
    const q = new URLSearchParams(location.search);
    const { serie, variante, avisos: a1 } = serieDeUrl(q, indice);
    try {
      doc = await documento(serie.id, variante);
    } catch (err) {
      estadoTexto.textContent = `No se pudo cargar la serie (${err instanceof Error ? err.message : String(err)}).`;
      estadoTexto.dataset.tipo = "error";
      return;
    }
    const { estado: e, avisos: a2 } = estadoDesdeUrl(q, serie.id, variante, doc);
    estado = e;
    avisosUrl = [...a1, ...a2];
    await actualizar();
  })();
}

iniciar();
