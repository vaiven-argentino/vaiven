// buscar_series (SPEC 7.2): series del catálogo por texto, bloque, prioridad y período.
import type { Repositorio } from "../datos";
import type { SerieCatalogo } from "../tipos";
import { SERIES_DEL_MVP, normalizar, seCruza } from "./comun";

export interface ArgsBuscar {
  texto?: string;
  bloque?: string;
  prioridad?: "A" | "B";
  desde?: string;
  hasta?: string;
}

// Palabras que la gente usa y que no aparecen tal cual en los metadatos (ya normalizadas).
const SINONIMOS: Record<string, string[]> = {
  desempleo: ["desocupacion"],
  desempleados: ["desocupacion"],
  desocupados: ["desocupacion"],
  paro: ["desocupacion"],
  empleo: ["trabajo", "desocupacion"],
  inflacion: ["ipc", "precios"],
  "costo de vida": ["ipc"],
  dolar: ["tipo de cambio", "cambiario"],
  divisas: ["reservas", "tipo de cambio"],
  devaluacion: ["tipo de cambio"],
  tcn: ["tipo de cambio"],
  ventas: ["exportaciones"],
  comercio: ["exportaciones", "sector externo"],
  "comercio exterior": ["exportaciones", "sector externo"],
  bcra: ["reservas", "banco central"],
  "banco central": ["reservas"],
  pbi: ["pib"],
};

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "en", "y", "e", "a", "por", "con", "para", "un", "una",
  "serie", "series", "dato", "datos", "argentina", "argentino", "argentinos", "tasa", "nivel", "evolucion"]);

/** Dónde se busca: lo principal (id, código, nombre y bloque) pesa más que el resto (definición, unidad y variantes). */
function pajar(s: SerieCatalogo): { principal: string; resto: string } {
  return {
    principal: normalizar([s.id, s.codigo, s.nombre, s.bloque].join(" | ")),
    resto: normalizar([s.definicion, s.unidad, ...s.variantes.map((v) => `${v.id} ${v.nombre}`)].join(" | ")),
  };
}

/** Términos de la búsqueda: las frases con sinónimo van enteras; el resto, por palabra. */
function terminos(texto: string): string[][] {
  let resto = ` ${normalizar(texto).replace(/[^\p{L}\p{N}-]+/gu, " ")} `;
  const salida: string[][] = [];
  for (const frase of Object.keys(SINONIMOS).filter((k) => k.includes(" "))) {
    if (resto.includes(` ${frase} `)) {
      salida.push([frase, ...SINONIMOS[frase]]);
      resto = resto.replace(` ${frase} `, " ");
    }
  }
  for (const palabra of resto.split(" ").filter((p) => p && !VACIAS.has(p))) {
    const variantes = [palabra, ...(SINONIMOS[palabra] ?? [])];
    // Plural o singular: «exportacion» encuentra «exportaciones» y «reserva», «reservas».
    if (palabra.length > 5 && palabra.endsWith("es")) variantes.push(palabra.slice(0, -2));
    else if (palabra.length > 4 && palabra.endsWith("s")) variantes.push(palabra.slice(0, -1));
    salida.push(variantes);
  }
  return salida;
}

function resumen(s: SerieCatalogo) {
  const publicadas = s.variantes.filter((v) => v.estado === "publicada" && v.cobertura);
  const desde = publicadas.map((v) => v.cobertura!.desde).sort()[0] ?? null;
  const hasta = publicadas.map((v) => v.cobertura!.hasta).sort().at(-1) ?? null;
  return {
    id: s.id,
    codigo: s.codigo,
    nombre: s.nombre,
    bloque: s.bloque,
    prioridad: s.prioridad,
    frecuencia: s.frecuencia,
    cobertura: desde && hasta ? { desde, hasta } : null,
    variante_por_defecto: s.variante_por_defecto,
    variantes: s.variantes.map((v) => ({
      id: v.id, nombre: v.nombre, estado: v.estado, frecuencia: v.frecuencia, cobertura: v.cobertura,
      ...(v.nota ? { nota: v.nota } : {}),
    })),
  };
}

export async function buscarSeries(repo: Repositorio, args: ArgsBuscar) {
  const catalogo = await repo.catalogo();
  let series = catalogo.series;
  if (args.bloque) {
    const b = normalizar(args.bloque.trim());
    series = series.filter((s) => normalizar(s.bloque).includes(b));
  }
  if (args.prioridad) series = series.filter((s) => s.prioridad === args.prioridad);
  if (args.desde || args.hasta) {
    series = series.filter((s) => s.variantes.some((v) => v.estado === "publicada" && v.cobertura && seCruza(v.cobertura, args.desde, args.hasta)));
  }

  const notas = [
    `Vaivén publica por ahora ${catalogo.series.length} de las ${SERIES_DEL_MVP} series de su catálogo; el resto se suma en las próximas fases.`,
  ];
  if (args.texto?.trim()) {
    const busqueda = terminos(args.texto);
    const puntajes = series.map((s) => {
      const { principal, resto } = pajar(s);
      const puntaje = busqueda.reduce((suma, alternativas) =>
        suma + (alternativas.some((t) => principal.includes(t)) ? 3 : alternativas.some((t) => resto.includes(t)) ? 1 : 0), 0);
      return { s, puntaje };
    });
    const encontradas = puntajes.filter((p) => p.puntaje > 0).sort((a, b) => b.puntaje - a.puntaje).map((p) => p.s);
    if (encontradas.length) {
      series = encontradas;
    } else {
      notas.push(`Ninguna serie coincide con «${args.texto.trim()}»: se listan todas las que cumplen los demás filtros.`);
    }
  }
  return { version_datos: catalogo.version_datos, total: series.length, series: series.map(resumen), notas };
}
