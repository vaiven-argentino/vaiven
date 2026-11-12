// Lectura del export. El MCP no calcula empalmes: lee las variantes ya publicadas (SPEC 7.3).
// La misma interfaz sirve para el Worker (static assets), la variante local (carpeta o URL) y las pruebas.
import {
  ESQUEMAS_SOPORTADOS, ESQUEMA_EVENTOS, ESQUEMA_PERIODOS, type DocumentoEventos, type DocumentoPeriodos, type InsumosCargados,
  type SerieExportada, type SignosMonetarios,
} from "@vaiven/transformaciones";
import type { Catalogo, DocumentoSerie, Quiebre, SerieCatalogo, VarianteCatalogo } from "./tipos";

/** De dónde sale el export. `ruta` es relativa a la raíz del export (por ejemplo, «catalogo.json»). */
export interface FuenteDatos {
  leer(ruta: string): Promise<unknown>;
}

/** Error que se le muestra al modelo tal cual: dice qué pasó y cómo seguir. */
export class ErrorHerramienta extends Error {}

/** El export servido por los static assets del Worker, en /datos/ (sin costo de subpedidos externos). */
export function fuenteAssets(assets: { fetch(request: Request): Promise<Response> }, origen: string): FuenteDatos {
  return {
    async leer(ruta) {
      const respuesta = await assets.fetch(new Request(new URL(`/datos/${ruta}`, origen)));
      if (!respuesta.ok) throw new Error(`No se pudo leer /datos/${ruta} (${respuesta.status}).`);
      return respuesta.json();
    },
  };
}

/** El export publicado en otra URL (por ejemplo, https://vaiven.argentino.workers.dev/datos/). */
export function fuenteUrl(base: string): FuenteDatos {
  const raiz = base.endsWith("/") ? base : `${base}/`;
  return {
    async leer(ruta) {
      const respuesta = await fetch(new URL(ruta, raiz));
      if (!respuesta.ok) throw new Error(`No se pudo leer ${new URL(ruta, raiz)} (${respuesta.status}).`);
      return respuesta.json();
    },
  };
}

const normalizar = (s: string) => s.trim().toLowerCase();

/**
 * Acceso al export con caché en memoria. En el Worker vive lo que vive el isolate: como cada actualización de datos
 * redespliega (publicar.yml) y arranca isolates nuevos, la caché nunca sirve un export viejo.
 */
export class Repositorio {
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(private readonly fuente: FuenteDatos) {}

  private leer<T>(ruta: string): Promise<T> {
    let pendiente = this.cache.get(ruta);
    if (!pendiente) {
      pendiente = this.fuente.leer(ruta);
      // Si falla, no queda en la caché: el próximo pedido lo vuelve a intentar.
      pendiente.catch(() => this.cache.delete(ruta));
      this.cache.set(ruta, pendiente);
    }
    return pendiente as Promise<T>;
  }

  catalogo(): Promise<Catalogo> {
    return this.leer<Catalogo>("catalogo.json");
  }

  /** Los registros de períodos y eventos (desde la fase 4b). Sin ellos en el export, un error que entiende el modelo. */
  async periodos(): Promise<DocumentoPeriodos> {
    return this.registro<DocumentoPeriodos>("periodos.json", ESQUEMA_PERIODOS);
  }

  async eventos(): Promise<DocumentoEventos> {
    return this.registro<DocumentoEventos>("eventos.json", ESQUEMA_EVENTOS);
  }

  private async registro<T extends { esquema: string }>(archivo: string, esquema: string): Promise<T> {
    let doc: T;
    try {
      doc = await this.leer<T>(archivo);
    } catch {
      throw new ErrorHerramienta(`Los períodos y eventos todavía no están publicados en esta versión de Vaivén (falta ${archivo}).`);
    }
    if (doc.esquema !== esquema) throw new Error(`${archivo}: esquema ${doc.esquema} sin soporte (se espera ${esquema}).`);
    return doc;
  }

  async quiebres(): Promise<Map<string, Quiebre>> {
    return new Map((await this.leer<Quiebre[]>("quiebres.json")).map((q) => [q.id, q]));
  }

  async documento(v: VarianteCatalogo): Promise<DocumentoSerie> {
    if (!v.archivo) throw new ErrorHerramienta(`La variante «${v.id}» no tiene datos publicados.`);
    const doc = await this.leer<DocumentoSerie>(v.archivo);
    if (!(ESQUEMAS_SOPORTADOS as readonly string[]).includes(doc.esquema)) {
      throw new Error(`${v.archivo}: esquema ${doc.esquema} sin soporte (soportados: ${ESQUEMAS_SOPORTADOS.join(", ")}).`);
    }
    return doc;
  }

  /**
   * Los insumos que necesita una medida (esquema 1.2), leídos del export: el IPC elegido para la real, el tipo de
   * cambio para dólares, el PIB para % del PIB y los signos monetarios para pesos actuales. Si la variante no declara
   * la medida, no lee nada: la librería da el error con lo que sí admite.
   */
  async insumos(doc: DocumentoSerie, o: { pesosActuales?: boolean; medida?: "real" | "en_dolares" | "pct_pib"; deflactor?: string; denominador?: string }): Promise<InsumosCargados> {
    const declarados = doc.insumos ?? {};
    const salida: InsumosCargados = {};
    if (o.pesosActuales && declarados.pesos_actuales) {
      salida.signos = await this.leer<SignosMonetarios>(declarados.pesos_actuales.opciones[0].archivo);
    }
    const insumo = o.medida ? declarados[o.medida] : undefined;
    if (insumo) {
      // En % del PIB, solo el PIB elegido (por defecto, el de la opción por defecto), en sus frecuencias.
      const denominador = o.denominador ?? insumo.opciones.find((x) => x.id === insumo.por_defecto)?.denominador;
      const ids = o.medida === "real" ? [o.deflactor ?? insumo.por_defecto]
        : insumo.opciones.filter((x) => !denominador || !x.denominador || x.denominador === denominador).map((x) => x.id);
      const elegidas = insumo.opciones.filter((x) => ids.includes(x.id));
      const series = await Promise.all(elegidas.map((x) => this.leer<SerieExportada>(x.archivo)));
      salida.series = Object.fromEntries(elegidas.map((x, k) => [x.id, series[k]]));
    }
    return salida;
  }

  /**
   * Encuentra la serie y la variante pedidas. `id` puede ser el id de la serie («ipc»), su código («PRE-01») o el
   * id de una variante («ipc.provincias»), sin distinguir mayúsculas. Sin variante, va la de por defecto.
   */
  async resolver(id: string, variante?: string): Promise<{ serie: SerieCatalogo; variante: VarianteCatalogo }> {
    const { series } = await this.catalogo();
    const buscado = normalizar(id);
    let serie = series.find((s) => normalizar(s.id) === buscado || normalizar(s.codigo) === buscado);
    let deId: string | undefined;
    if (!serie && buscado.includes(".")) {
      const punto = buscado.indexOf(".");
      serie = series.find((s) => normalizar(s.id) === buscado.slice(0, punto) || normalizar(s.codigo) === buscado.slice(0, punto));
      deId = buscado.slice(punto + 1);
    }
    if (!serie) {
      const ids = series.map((s) => `${s.id} (${s.codigo})`).join(", ");
      throw new ErrorHerramienta(`No hay ninguna serie «${id}». Las series publicadas son: ${ids}. Usá buscar_series para buscar por tema.`);
    }
    if (deId && variante && normalizar(variante) !== deId) {
      throw new ErrorHerramienta(`El id «${id}» ya nombra la variante «${deId}», pero se pidió también la variante «${variante}». Pasá solo una.`);
    }
    const pedida = deId ?? (variante ? normalizar(variante) : normalizar(serie.variante_por_defecto));
    const v = serie.variantes.find((x) => normalizar(x.id) === pedida);
    if (!v) {
      const lista = serie.variantes.map((x) => `${x.id} (${x.estado})`).join(", ");
      throw new ErrorHerramienta(`La serie «${serie.id}» no tiene una variante «${pedida}». Variantes: ${lista}.`);
    }
    return { serie, variante: v };
  }
}

/** Corta el pedido si la variante no está publicada, con su estado, su nota y las alternativas. */
export function exigirPublicada(serie: SerieCatalogo, v: VarianteCatalogo): void {
  if (v.estado === "publicada") return;
  const estado = v.estado === "pendiente_licencia" ? "está pendiente de licencia" : "está pendiente";
  const publicadas = serie.variantes.filter((x) => x.estado === "publicada").map((x) => x.id);
  throw new ErrorHerramienta(
    `La variante «${serie.id}.${v.id}» (${v.nombre}) ${estado}: no tiene datos publicados.` +
      (v.nota ? ` ${v.nota}` : "") +
      (publicadas.length ? ` Variantes publicadas: ${publicadas.join(", ")}.` : ""),
  );
}
