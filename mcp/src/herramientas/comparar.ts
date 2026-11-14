// comparar_series y especificacion_grafico (SPEC 4.1, 7.2 y 7.3): hasta 4 series, cada una con su cadena de
// transformaciones. Validan cada serie con las reglas de obtener_serie (prepararSerie), combinan con alinear.ts y, en
// el gráfico, arman la vista con la misma función que el explorador (armarVista). No hay una segunda implementación.
import {
  EPISODIO, TEMA_CLARO, armarVista, categoriasEv, compararVista, logInicial, porDefecto, serieVista, urlDesdeVista, seriesDeUrl, vistaDesdeUrl,
  type Documento, type Estado, type EstadoVista, type IndiceSerie, type Sombreado,
} from "@vaiven/grafico";
import {
  ErrorComparacion, ErrorFecha, ErrorTransformacion, alinear, comparar, tienePais,
  type AdvertenciaCombinacion, type Comparacion, type InsumosCargados, type PedidoComparacion,
} from "@vaiven/transformaciones";
import { ErrorHerramienta, type Repositorio } from "../datos";
import { redondear } from "./comun";
import { errorDeTransformacion, esTransformada, prepararSerie, respuestaSerie, unidadNominal, type ArgsObtener, type SeriePreparada } from "./obtener";

export type ArgsSerie = Omit<ArgsObtener, "desde" | "hasta">;

export interface ArgsComparar {
  series: ArgsSerie[];
  desde?: string;
  hasta?: string;
  alinear?: "frecuencia_comun" | "ninguna";
}

export interface ArgsEspecificacion {
  series: ArgsSerie[];
  desde?: string;
  hasta?: string;
  sombreado?: Exclude<Sombreado, "">;
  eventos?: boolean | string[];
  ejes?: "auto" | "paneles";
}

/** Tamaño del gráfico del MCP (el explorador usa el de la pantalla; lo demás es igual, SPEC 10). */
export const ANCHO_MCP = 800;
export const ALTO_MCP = 400;
/**
 * Límite de observaciones de especificacion_grafico (SPEC 7.3): menor que el general, por la CPU. Medido en la 4c/4d
 * (mcp/scripts/medir-cpu.mjs, NOTAS_FASE4 «4c/4d»): unos 12 a 15 ms en Node con 1.000 observaciones; se mide en
 * producción después del despliegue y se baja si aparecen errores 1102.
 */
export const LIMITE_ESPECIFICACION = 1_000;

/** El explorador publicado (el mismo host que HOST_PUBLICO de http.ts; acá sin importarlo, para no armar un ciclo). */
const URL_EXPLORADOR = "https://vaiven.argentino.workers.dev/explorador/";

/** Valida y prepara cada serie con las reglas de obtener_serie (el período es común). */
async function preparar(repo: Repositorio, series: ArgsSerie[], desde?: string, hasta?: string): Promise<SeriePreparada[]> {
  if (desde && hasta && desde > hasta) throw new ErrorHerramienta(`El período está invertido: desde ${desde} es posterior a hasta ${hasta}.`);
  const preparadas: SeriePreparada[] = [];
  for (const [k, s] of series.entries()) {
    try {
      preparadas.push(await prepararSerie(repo, { ...s, ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) }));
    } catch (e) {
      if (e instanceof ErrorHerramienta) throw new ErrorHerramienta(`Serie ${k + 1} (${s.id}): ${e.message}`);
      throw e;
    }
  }
  return preparadas;
}

/** El pedido para alinear.ts: la cadena de cada serie sin el período (es común). */
function pedido(preparadas: SeriePreparada[], desde?: string, hasta?: string): PedidoComparacion {
  return {
    series: preparadas.map((p) => {
      const { desde: _d, hasta: _h, ...opciones } = p.opciones;
      return { documento: p.doc, opciones, insumos: p.insumos, ...(p.paises.length ? { paises: p.paises } : {}) };
    }),
    ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}),
  };
}

/** Un error de la combinación o de la librería, como error de la herramienta (con lo que admite la serie). */
function traducir(e: unknown, preparadas: SeriePreparada[]): unknown {
  if (e instanceof ErrorComparacion) return new ErrorHerramienta(e.message);
  if (e instanceof ErrorTransformacion || e instanceof ErrorFecha) {
    const k = preparadas.findIndex((p) => e.message.includes(p.doc.id));
    return k >= 0 ? new ErrorHerramienta(`Serie ${k + 1} (${preparadas[k].doc.id}): ${(errorDeTransformacion(e, preparadas[k].doc) as Error).message}`)
      : new ErrorHerramienta(e.message);
  }
  return e;
}

const versionDe = (preparadas: SeriePreparada[]) => preparadas.map((p) => p.doc.version_datos).sort().at(-1)!;
const avisos = (xs: AdvertenciaCombinacion[]) => xs.map((a) => ({ id: a.id, descripcion: a.descripcion, ...(a.series ? { series: a.series } : {}) }));

/** Por serie: lo de obtener_serie (unidad, advertencias, notas, último dato y su atraso, fuentes y cita), con o sin datos. */
function porSerie(preparadas: SeriePreparada[], c: Comparacion, conDatos: boolean) {
  return preparadas.map((p, k) => {
    const s = c.series[k];
    const r = respuestaSerie(p, s.entidades.map((e) => s.resultados[e]), { sinDatos: !conDatos });
    const { datos, frecuencias, id: _id, ...resto } = r;
    return { numero: k + 1, id: r.id, ...resto, ...(conDatos ? { datos, frecuencias } : {}) };
  });
}

export async function compararSeries(repo: Repositorio, args: ArgsComparar) {
  const preparadas = await preparar(repo, args.series, args.desde, args.hasta);
  const p = pedido(preparadas, args.desde, args.hasta);
  let c: Comparacion;
  try {
    c = comparar(p);
  } catch (e) {
    throw traducir(e, preparadas);
  }
  const modo = args.alinear ?? "frecuencia_comun";
  const base = {
    alinear: modo,
    series: porSerie(preparadas, c, modo === "ninguna"),
    n_observaciones: c.observaciones,
    version_datos: versionDe(preparadas),
  };
  if (modo === "ninguna") return { ...base, advertencias_combinacion: avisos(c.advertencias.filter((a) => a.id === "c.sin-datos")) };
  let a;
  try {
    a = alinear(p, c);
  } catch (e) {
    throw traducir(e, preparadas);
  }
  // A la frecuencia común, los valores que calculó Vaivén van con 6 cifras significativas, como en obtener_serie.
  const redondeo = a.columnas.map((col) => esTransformada(preparadas[col.serie - 1]) || a.advertencias.some((x) => x.id === "c.frecuencia-comun" && x.series?.includes(col.serie)));
  return {
    alinear: modo,
    frecuencia: a.frecuencia,
    columnas: a.columnas.map((col) => ({
      serie: col.serie, id: preparadas[col.serie - 1].doc.id, ...(col.pais ? { pais: col.pais } : {}),
      unidad: unidadNominal(preparadas[col.serie - 1].doc, preparadas[col.serie - 1].args.medida, col.unidad),
      ...(col.notas.length ? { notas: col.notas } : {}),
    })),
    datos: a.filas.map(([fecha, ...vs]) => [fecha, ...vs.map((v, j) => (redondeo[j] ? redondear(v) : v))]),
    series: base.series,
    advertencias_combinacion: avisos([...c.advertencias.filter((x) => x.id === "c.sin-datos"), ...a.advertencias]),
    n_observaciones: base.n_observaciones,
    version_datos: base.version_datos,
    notas: ["`datos` va como filas [fecha, v1, v2…] en el orden de `columnas` (una por serie y por país). Un null es un dato faltante, excluido o de un período incompleto: no se interpola."],
  };
}

/** El índice de series del explorador (lo que la URL necesita saber de cada serie). */
async function indiceDe(repo: Repositorio): Promise<IndiceSerie[]> {
  const { series } = await repo.catalogo();
  return series.map((s) => ({
    id: s.id, codigo: s.codigo, nombre: s.nombre, bloque: s.bloque, variante_por_defecto: s.variante_por_defecto,
    variantes: s.variantes.filter((v) => v.estado === "publicada" && v.archivo).map((v) => ({ id: v.id, nombre: v.nombre, archivo: v.archivo! })),
  }));
}

/**
 * El estado de la vista que piden los parámetros (como lo escribiría el explorador). Lo que la URL del explorador no
 * puede expresar da error, para que el gráfico y el enlace muestren lo mismo.
 */
function estadoDe(args: ArgsEspecificacion, preparadas: SeriePreparada[], categorias: string[]): EstadoVista {
  let ev: string[] = [];
  if (args.eventos === true) ev = [...categorias];
  else if (Array.isArray(args.eventos)) {
    const pedidas = args.eventos;
    const malas = pedidas.filter((x) => !categorias.includes(x));
    if (malas.length) throw new ErrorHerramienta(`Categorías de eventos que no existen: ${malas.join(", ")}. Las categorías son: ${categorias.join(", ")} (\`${EPISODIO}\`: los episodios, como la hiperinflación).`);
    ev = categorias.filter((x) => pedidas.includes(x));
  }
  const series = preparadas.map((p, k): Estado => {
    const a = p.args;
    if (a.base_real) throw new ErrorHerramienta(`Serie ${k + 1}: el gráfico no admite \`base_real\` (el explorador usa los precios del último período). Pedí los datos con obtener_serie.`);
    if (a.base && a.base.includes("/")) throw new ErrorHerramienta(`Serie ${k + 1}: en el gráfico, \`base\` es AAAA o AAAA-MM (el explorador no admite un período AAAA-MM/AAAA-MM).`);
    const doc = p.doc as unknown as Documento;
    const def = porDefecto(p.doc.serie, p.doc.variante, doc);
    const paises = p.paises.length ? p.paises : def.p;
    const t = p.transformacion, m = a.medida ?? "";
    return {
      ...def, t, m, d: m === "real" && p.deflactor ? p.deflactor : "", pib: m === "pct_pib" && a.denominador ? a.denominador : "",
      pa: !!a.pesos_actuales, f: p.frecuencia ?? "", mm: 0, base: a.base ?? "", desde: args.desde ?? "", hasta: args.hasta ?? "",
      log: logInicial(serieVista(doc, paises), t, m), p: paises, sh: args.sombreado ?? "", ev,
    };
  });
  return { series, ejes: args.ejes === "paneles" ? "paneles" : "" };
}

export async function especificacionGrafico(repo: Repositorio, args: ArgsEspecificacion) {
  const preparadas = await preparar(repo, args.series, args.desde, args.hasta);
  const [indice, periodos, eventos] = await Promise.all([indiceDe(repo), repo.periodos(), repo.eventos()]);
  const categorias = categoriasEv(eventos);
  const estado = estadoDe(args, preparadas, categorias);
  const docs = preparadas.map((p) => p.doc as unknown as Documento);
  // La URL del explorador, y la vista que el explorador leería de ella: tienen que coincidir con lo pedido.
  const url = urlDesdeVista(estado, docs, indice, categorias);
  const q = new URLSearchParams(url);
  const { pedidas, avisos: a1 } = seriesDeUrl(q, indice);
  const leida = vistaDesdeUrl(q, pedidas, docs, categorias);
  if (a1.length || leida.avisos.length || JSON.stringify(leida.estado) !== JSON.stringify(estado)) {
    throw new ErrorHerramienta(`El explorador no puede mostrar exactamente esta vista: ${[...a1, ...leida.avisos].join(" ") || "algún parámetro no tiene equivalente en la URL"}. Pedí los datos con comparar_series.`);
  }
  const insumos: InsumosCargados = { series: Object.assign({}, ...preparadas.map((p) => p.insumos.series ?? {})), ...(preparadas.find((p) => p.insumos.signos) ? { signos: preparadas.find((p) => p.insumos.signos)!.insumos.signos } : {}) };
  const entrada = { estado, docs, insumos, periodos, eventos, tema: TEMA_CLARO, ancho: ANCHO_MCP, alto: ALTO_MCP };
  let vista;
  try {
    // El límite se controla antes de armar el gráfico, para no gastar la CPU en uno que no se va a devolver.
    const comparacion = compararVista(entrada);
    if (comparacion.observaciones > LIMITE_ESPECIFICACION) {
      throw new ErrorHerramienta(`El gráfico tendría ${comparacion.observaciones.toLocaleString("es-AR")} observaciones y el límite de especificacion_grafico es ${LIMITE_ESPECIFICACION.toLocaleString("es-AR")} (por la CPU del servidor). Acotá el período, la cantidad de series o de países, o pasá alguna serie a una frecuencia más baja; para los datos, comparar_series admite hasta 10.000.`);
    }
    vista = armarVista({ ...entrada, comparacion });
  } catch (e) {
    throw traducir(e, preparadas);
  }
  const c = vista.comparacion;
  return {
    especificacion: vista.especificacion,
    url_explorador: `${URL_EXPLORADOR}${url}`,
    disposicion: { tipo: c.disposicion.tipo, paneles: c.disposicion.paneles.map((p) => ({ unidad: p.unidad, series: p.series.map((k) => k + 1) })) },
    series: preparadas.map((p, k) => {
      const r = respuestaSerie(p, c.series[k].entidades.map((e) => c.series[k].resultados[e]), { sinDatos: true });
      return {
        numero: k + 1, id: r.id, nombre: r.nombre, nombre_variante: r.nombre_variante, unidad: r.unidad, transformacion: r.transformacion,
        ...(tienePais(p.doc) ? { paises: r.paises } : {}), ultimo_dato: r.ultimo_dato, advertencias: r.advertencias, notas: r.notas, cita: r.cita,
      };
    }),
    advertencias_combinacion: avisos(vista.avisos),
    ...(vista.periodos.length ? { sombreado: { tipo: args.sombreado, periodos: vista.periodos.length } } : {}),
    ...(vista.eventos.length ? { eventos: vista.eventos.map((e) => ({ letra: e.letra, fecha: e.fecha, nombre: e.nombre })) } : {}),
    n_observaciones: c.observaciones,
    version_datos: versionDe(preparadas),
  };
}
