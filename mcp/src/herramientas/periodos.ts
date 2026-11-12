// listar_periodos y periodo_en_fecha (SPEC 7.2): gobiernos, ministros de Economía, planes, regímenes cambiarios y
// etapas de la política económica, con sus fechas y fuentes (export/periodos.json y eventos.json). Solo leen.
import { citaRegistro } from "@vaiven/cita";
import {
  SUPERPONIBLES, TIPOS_PERIODO, diasDe, extremosDudosos, periodosDe, rangoLegible, referenciaDe, seCruzan, ubicar, vigenteEl,
  type DocumentoPeriodos, type Evento, type FuentePeriodo, type Mandato, type Periodo, type TipoPeriodo,
} from "@vaiven/transformaciones";
import { ErrorHerramienta, type Repositorio } from "../datos";

export interface ArgsListarPeriodos {
  tipo?: TipoPeriodo;
  por_mandato?: boolean;
}

export interface ArgsPeriodoEnFecha {
  fecha: string;
}

const URL_DATOS = "https://vaiven.argentino.workers.dev/datos/periodos.json";
const CONVENCION =
  "Intervalos semiabiertos: `desde` es el primer día y `hasta` el día en que empieza el siguiente (el día del " +
  "traspaso es del que entra); `hasta: null` quiere decir vigente. `confianza` dice cuán firme es cada fecha: alta " +
  "(norma, comunicación del BCRA o acta, o dos fuentes que coinciden), media (una sola fuente o sin verificación " +
  "independiente) o baja (las fuentes no coinciden: fecha a confirmar).";
/** Lo que acompaña a las etapas del curso en las respuestas (no son una periodización propia de Vaivén). */
const ACLARACION_ETAPAS = "Etapas según la periodización de un curso universitario; los nombres son los del curso.";

const subtramo = (m: Mandato) => ({
  id: m.id, nombre: m.nombre, desde: m.desde, hasta: m.hasta,
  ...(m.descripcion ? { descripcion: m.descripcion } : {}), ...(m.confianza ? { confianza: m.confianza } : {}),
});

/** Una fuente en una línea: «desde · norma: Decreto 1/1983 (publicado 1983-12-12) https://…». */
export function fuenteEnTexto(f: FuentePeriodo): string {
  const partes = [`${f.tipo}: ${f.referencia ?? f.nota ?? ""}`];
  if (f.pagina !== undefined) partes.push(`p. ${f.pagina}`);
  if (f.publicado) partes.push(`publicado ${f.publicado}`);
  if (f.referencia && f.nota) partes.push(f.nota);
  return `${f.para && f.para !== "ambas" ? `${f.para} · ` : ""}${partes.join(", ")}${f.url ? ` ${f.url}` : ""}`;
}

function resumen(p: Periodo, nombreTipo: Map<string, string>) {
  return {
    id: p.id,
    tipo: p.tipo,
    tipo_nombre: nombreTipo.get(p.tipo) ?? p.tipo,
    nombre: p.nombre,
    desde: p.desde,
    hasta: p.hasta,
    ...(p.caracter ? { caracter: p.caracter } : {}),
    ...(p.cargo ? { cargo: p.cargo } : {}),
    ...(p.orden !== undefined ? { orden: p.orden } : {}),
    ...(p.padre ? { gobierno: p.padre } : {}),
    ...(p.descripcion ? { descripcion: p.descripcion } : {}),
    ...(p.notas ? { notas: p.notas } : {}),
    ...(p.tipo === "catedra" ? { aclaracion: ACLARACION_ETAPAS } : {}),
    ...(Object.values(p.cortes).includes("convencional") ? { cortes: p.cortes } : {}),
    ...(p.confianza ? { confianza: p.confianza } : {}),
    ...(p.fases?.length ? { fases: p.fases.map(subtramo) } : {}),
    fuentes: p.fuentes.map(fuenteEnTexto),
  };
}

function compacto(p: Periodo) {
  return {
    id: p.id, tipo: p.tipo, nombre: p.nombre, desde: p.desde, hasta: p.hasta,
    ...(p.caracter ? { caracter: p.caracter } : {}), ...(p.padre ? { gobierno: p.padre } : {}),
    ...(p.mandatos?.length ? { mandatos: p.mandatos.map((m) => m.id) } : {}),
    ...(p.fases?.length ? { fases: p.fases.map((m) => m.id) } : {}),
    ...(extremosDudosos(p).length ? { a_confirmar: extremosDudosos(p) } : {}),
  };
}

/** Advertencias de las fechas de confianza baja («fecha a confirmar»). */
function dudosas(periodos: Periodo[], nombreTipo: Map<string, string>): string[] {
  return periodos.flatMap((p) => extremosDudosos(p).map((e) =>
    `${nombreTipo.get(p.tipo) ?? p.tipo} · ${p.nombre}: la fecha de ${e === "desde" ? "inicio" : "fin"} (${p[e]}) es ` +
    "dudosa (confianza baja): las fuentes no coinciden. Tomala como fecha a confirmar."));
}

function convencionales(periodos: Periodo[], nombreTipo: Map<string, string>): string[] {
  return periodos.flatMap((p) => (["desde", "hasta"] as const)
    .filter((e) => p.cortes[e] === "convencional")
    .map((e) => {
      const nota = p.fuentes.find((f) => f.tipo === "convencional" && (f.para === e || f.para === "ambas"))?.nota;
      return `${nombreTipo.get(p.tipo) ?? p.tipo} · ${p.nombre}: ${e === "desde" ? "el inicio" : "el fin"} (${p[e]}) es un corte ` +
        `convencional de Vaivén, no un hecho fechado.${nota ? ` ${nota}` : ""}`;
    }));
}

function comunes(doc: DocumentoPeriodos) {
  return {
    version_datos: doc.version_datos,
    fuentes: [{ organismo: "Vaivén", nombre: "Períodos y eventos (metadatos/periodos.yaml y eventos.yaml)", url: URL_DATOS, licencia: doc.licencia }],
    cita: citaRegistro("periodos", doc.version_datos),
  };
}

export async function listarPeriodos(repo: Repositorio, args: ArgsListarPeriodos) {
  const doc = await repo.periodos();
  const nombreTipo = new Map(doc.tipos.map((t) => [t.id, t.nombre]));
  if (args.por_mandato && args.tipo && args.tipo !== "gobierno") {
    throw new ErrorHerramienta("`por_mandato` solo vale para los gobiernos: usalo sin `tipo` o con tipo «gobierno».");
  }
  const tipos = args.tipo ? [args.tipo] : [...TIPOS_PERIODO];
  const periodos = tipos.flatMap((t) => periodosDe(doc, t, args.por_mandato ?? false));
  // Sin tipo, la lista completa con fuentes pasa los 100 KB: se devuelve compacta y se pide un tipo para las fuentes.
  const compacta = !args.tipo;
  return {
    tipos: doc.tipos.filter((t) => tipos.includes(t.id)).map((t) => ({ id: t.id, nombre: t.nombre })),
    convencion: CONVENCION,
    ...(compacta ? { nota: "Lista compacta, sin fuentes ni descripciones: pedí un `tipo` para verlas." } : {}),
    total: periodos.length,
    periodos: periodos.map((p) => compacta ? compacto(p) : ({
      ...resumen(p, nombreTipo),
      // Sin por_mandato, los gobiernos de dos mandatos los listan aparte (Menem, Fernández de Kirchner).
      ...(!args.por_mandato && p.mandatos?.length ? { mandatos: p.mandatos.map(subtramo) } : {}),
    })),
    ...(tipos.includes("catedra") ? { aclaracion_etapas: ACLARACION_ETAPAS } : {}),
    advertencias: [...convencionales(periodos, nombreTipo), ...dudosas(periodos, nombreTipo)],
    ...comunes(doc),
  };
}

const FECHA = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/** Valida la fecha y devuelve el rango de días que cubre (un día o un mes). */
function rangoDeFecha(fecha: string, hoy: string): { desde: string; hasta: string; alcance: "dia" | "mes" } {
  const m = FECHA.exec(fecha.trim());
  if (!m) throw new ErrorHerramienta(`La fecha «${fecha}» no se entiende: usá AAAA-MM-DD (un día) o AAAA-MM (un mes).`);
  const [, a, mes, dia] = m;
  const n = { a: Number(a), m: Number(mes), d: Number(dia ?? 1) };
  const real = new Date(Date.UTC(n.a, n.m - 1, n.d));
  if (n.m < 1 || n.m > 12 || real.getUTCMonth() !== n.m - 1 || real.getUTCDate() !== n.d) {
    throw new ErrorHerramienta(`La fecha «${fecha}» no existe.`);
  }
  const r = dia ? { desde: fecha, hasta: fecha, alcance: "dia" as const } : { ...diasDe(`${a}-${mes}`, "mensual"), alcance: "mes" as const };
  if (r.hasta < "1970-01-01") throw new ErrorHerramienta("Vaivén cubre desde el 1/1/1970: pedí una fecha desde 1970.");
  if (r.desde > hoy) throw new ErrorHerramienta(`La fecha «${fecha}» es posterior a hoy (${hoy}).`);
  return r;
}

export async function periodoEnFecha(repo: Repositorio, args: ArgsPeriodoEnFecha, hoy = new Date().toISOString().slice(0, 10)) {
  const [doc, eventos] = await Promise.all([repo.periodos(), repo.eventos()]);
  const rango = rangoDeFecha(args.fecha, hoy);
  const nombreTipo = new Map(doc.tipos.map((t) => [t.id, t.nombre]));
  const enRango = (lista: Periodo[]) => rango.alcance === "dia"
    ? lista.filter((p) => vigenteEl(p, rango.desde)) : seCruzan(lista, rango.desde, rango.hasta);
  const porTipo = Object.fromEntries(TIPOS_PERIODO.map((t) => [t, enRango(periodosDe(doc, t))])) as Record<TipoPeriodo, Periodo[]>;
  const mandatos = enRango(periodosDe(doc, "gobierno", true)).filter((p) => p.padre);
  const todos = Object.values(porTipo).flat();
  const avisos = [...convencionales(todos, nombreTipo), ...dudosas(todos, nombreTipo)];
  if (rango.alcance === "dia" && !porTipo.ministro.length) {
    avisos.push("Ese día no había un ministro de Economía titular (por ejemplo, entre una renuncia y la jura del siguiente).");
  }
  if (rango.alcance === "mes" && porTipo.gobierno.length > 1) {
    avisos.push(`En ese mes hubo ${porTipo.gobierno.length} gobiernos: ${porTipo.gobierno.map((p) => `${p.nombre} (${rangoLegible(p)})`).join("; ")}.`);
  }
  // Con un mes: a qué período asigna Vaivén un dato mensual (la misma regla que el gráfico y las descargas) y el
  // reparto por días. Un saldo a fin de mes (reservas, deuda) va al vigente el último día.
  const mes = rango.alcance === "mes" ? `${rango.desde.slice(0, 7)}` : null;
  const asignacion = mes ? Object.fromEntries(TIPOS_PERIODO.map((t) => {
    const lista = periodosDe(doc, t);
    const flujo = ubicar(referenciaDe(mes, "mensual", { agregacion: "promedio" }), lista, t);
    const saldo = ubicar(referenciaDe(mes, "mensual", { agregacion: "fin_de_periodo" }), lista, t);
    const conMayoria = (u: typeof flujo) => (u.mayoria ? u.etiqueta : `${u.etiqueta} (sin mayoría)`);
    return [t, {
      promedio_o_suma: conMayoria(flujo),
      saldo_fin_de_mes: saldo.etiqueta,
      ...(SUPERPONIBLES.includes(t) ? {} : {
        reparto: flujo.reparto.map((x) => ({ nombre: x.nombre, dias: x.dias, proporcion: Math.round(x.proporcion * 1000) / 1000 })),
      }),
    }];
  })) : undefined;
  if (mes && asignacion && (asignacion.ministro as { reparto: Array<{ nombre: string }> }).reparto.some((x) => x.nombre === "sin ministro titular")) {
    avisos.push("En ese mes hubo días sin ministro de Economía titular ni interino (ver `asignacion.ministro.reparto`).");
  }
  const resumir = (lista: Periodo[]) => lista.map((p) => resumen(p, nombreTipo));
  return {
    fecha: args.fecha.trim(),
    alcance: rango.alcance,
    ...(rango.alcance === "mes" ? { rango: { desde: rango.desde, hasta: rango.hasta } } : {}),
    convencion: CONVENCION,
    gobierno: resumir(porTipo.gobierno),
    ...(mandatos.length ? { mandato: mandatos.map((m) => ({ id: m.id, nombre: m.nombre, desde: m.desde, hasta: m.hasta, gobierno: m.padre })) } : {}),
    ministro: resumir(porTipo.ministro),
    plan: resumir(porTipo.plan),
    regimen_cambiario: resumir(porTipo.regimen_cambiario),
    catedra: resumir(porTipo.catedra),
    episodio: resumir(porTipo.episodio),
    ...(asignacion ? {
      asignacion,
      regla_asignacion: "Un dato mensual (promedio, suma o variación) se asigna al período vigente a mitad de mes; un " +
        "saldo a fin de mes en nivel, al vigente el último día. Si el de mitad de mes no cubre más de la mitad, dice " +
        "«sin mayoría». Es la misma regla que usan el gráfico y las descargas de Vaivén.",
    } : {}),
    nombres_tipos: Object.fromEntries(doc.tipos.map((t) => [t.id, t.nombre])),
    eventos: eventos.eventos.filter((e) => e.fecha >= rango.desde && e.fecha <= rango.hasta).map((e: Evento) => ({
      id: e.id, fecha: e.fecha, ...(e.vigencia ? { vigencia: e.vigencia } : {}), nombre: e.nombre, categoria: e.categoria,
      descripcion: e.descripcion, fuentes: e.fuentes.map(fuenteEnTexto),
    })),
    advertencias: avisos,
    ...comunes(doc),
  };
}
