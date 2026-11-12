// listar_periodos y periodo_en_fecha (SPEC 7.2): gobiernos, ministros de Economía, planes, regímenes cambiarios y
// etapas de la política económica, con sus fechas y fuentes (export/periodos.json y eventos.json). Solo leen.
import { citaRegistro } from "@vaiven/cita";
import {
  TIPOS_PERIODO, diasDe, periodosDe, rangoLegible, seCruzan, vigenteEl, type DocumentoPeriodos, type Evento,
  type FuentePeriodo, type Periodo, type TipoPeriodo,
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
  "traspaso es del que entra); `hasta: null` quiere decir vigente.";

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
    ...(Object.values(p.cortes).includes("convencional") ? { cortes: p.cortes } : {}),
    fuentes: p.fuentes.map(fuenteEnTexto),
  };
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
  return {
    tipos: doc.tipos.filter((t) => tipos.includes(t.id)).map((t) => ({ id: t.id, nombre: t.nombre })),
    convencion: CONVENCION,
    total: periodos.length,
    periodos: periodos.map((p) => ({
      ...resumen(p, nombreTipo),
      // Sin por_mandato, los gobiernos de dos mandatos los listan aparte (Menem, Fernández de Kirchner).
      ...(!args.por_mandato && p.mandatos?.length
        ? { mandatos: p.mandatos.map((m) => ({ id: m.id, nombre: m.nombre, desde: m.desde, hasta: m.hasta })) } : {}),
    })),
    advertencias: convencionales(periodos, nombreTipo),
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
  const avisos = convencionales(todos, nombreTipo);
  if (rango.alcance === "dia" && !porTipo.ministro.length) {
    avisos.push("Ese día no había un ministro de Economía titular (por ejemplo, entre una renuncia y la jura del siguiente).");
  }
  if (rango.alcance === "mes" && porTipo.gobierno.length > 1) {
    avisos.push(`En ese mes hubo ${porTipo.gobierno.length} gobiernos: ${porTipo.gobierno.map((p) => `${p.nombre} (${rangoLegible(p)})`).join("; ")}.`);
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
    nombres_tipos: Object.fromEntries(doc.tipos.map((t) => [t.id, t.nombre])),
    eventos: eventos.eventos.filter((e) => e.fecha >= rango.desde && e.fecha <= rango.hasta).map((e: Evento) => ({
      id: e.id, fecha: e.fecha, ...(e.vigencia ? { vigencia: e.vigencia } : {}), nombre: e.nombre, categoria: e.categoria,
      descripcion: e.descripcion, fuentes: e.fuentes.map(fuenteEnTexto),
    })),
    advertencias: avisos,
    ...comunes(doc),
  };
}
