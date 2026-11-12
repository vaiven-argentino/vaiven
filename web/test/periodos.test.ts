// Períodos en la web: qué se sombrea, accesos de /periodos/ al explorador y la línea de tiempo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transformar, type DocumentoEventos, type DocumentoPeriodos } from "@vaiven/transformaciones";
import { describe, expect, it } from "vitest";
import { estadoDesdeUrl, serieDeUrl, urlDesdeEstado, type Documento, type IndiceSerie } from "../src/lib/estado";
import { accesoEvento, accesosDe, bandasDe, eventosEnRango, lineaDeTiempo, nombreSombreado, periodosEnRango, posicion } from "../src/lib/periodos";

const EXPORT = join(import.meta.dirname, "..", "..", "export");
const leer = <T>(r: string): T => JSON.parse(readFileSync(join(EXPORT, r), "utf-8"));
const periodos = leer<DocumentoPeriodos>("periodos.json");
const eventos = leer<DocumentoEventos>("eventos.json");
const catalogo = leer<{ series: Array<{ id: string; codigo: string; nombre: string; bloque: string; variante_por_defecto: string; variantes: Array<{ id: string; nombre: string; estado: string; archivo: string | null }> }> }>("catalogo.json");
const indice: IndiceSerie[] = catalogo.series.map((s) => ({ ...s, variantes: s.variantes.filter((v) => v.estado === "publicada" && v.archivo).map((v) => ({ id: v.id, nombre: v.nombre, archivo: v.archivo! })) }));
const publicadas = new Set(indice.filter((s) => s.variantes.length).map((s) => s.id));

describe("sombreado en los gráficos", () => {
  const ipc = leer<Documento>("series/ipc/oficial.json");
  const r = transformar(ipc as never, { transformacion: "var_mensual", desde: "1989", hasta: "1991" });
  it("los gobiernos que tocan lo que se ve, y por mandato Menem en dos", () => {
    expect(periodosEnRango(periodos, "gobierno", r).map((p) => p.id)).toEqual(["p.gobierno.alfonsin", "p.gobierno.menem"]);
    expect(periodosEnRango(periodos, "mandato", r).map((p) => p.id)).toEqual(["p.gobierno.alfonsin", "p.gobierno.menem-1989"]);
  });
  it("los eventos del rango, con letras en orden", () => {
    const ev = eventosEnRango(eventos, r);
    expect(ev[0].letra).toBe("A");
    expect(ev.every((e) => e.fecha >= "1989-01-01" && e.fecha <= "1991-12-31")).toBe(true);
  });
  it("los de facto van marcados para el gris más oscuro", () => {
    const r70 = transformar(ipc as never, { desde: "1976", hasta: "1983" });
    expect(bandasDe(periodosEnRango(periodos, "gobierno", r70)).find((b) => b.nombre.includes("Videla"))!.facto).toBe(true);
  });
  it("las etapas del curso se nombran con el nombre público", () => {
    expect(nombreSombreado("catedra", periodos.tipos)).toBe("Etapas de la política económica (curso)");
  });
});

describe("accesos de /periodos/ al explorador", () => {
  const alfonsin = periodos.periodos.find((p) => p.id === "p.gobierno.alfonsin")!;
  const austral = periodos.periodos.find((p) => p.id === "p.plan.austral")!;
  it("gobiernos: seis series, de un año antes a un año después, con el sombreado del tipo", () => {
    const a = accesosDe(alfonsin, publicadas, 2026);
    expect(a.map((x) => x.texto)).toHaveLength(6);
    expect(a[0].url).toBe("/explorador/?desde=1982&hasta=1990&sh=gobierno");
  });
  it("planes: cuatro series con la inflación mensual", () => {
    const a = accesosDe(austral, publicadas, 2026);
    expect(a.map((x) => x.texto)).toEqual(["Inflación (mensual)", "Tipo de cambio oficial", "Tipo de cambio real", "Reservas"]);
    expect(a[0].url).toBe("/explorador/?t=var_mensual&desde=1984&hasta=1989&sh=plan");
  });
  it("los vigentes van hasta el último dato y las series sin publicar no se ofrecen", () => {
    const milei = periodos.periodos.find((p) => p.id === "p.gobierno.milei")!;
    expect(accesosDe(milei, publicadas, 2026)[0].url).toBe("/explorador/?desde=2022&sh=gobierno");
    expect(accesosDe(alfonsin, new Set(["ipc"]), 2026)).toHaveLength(1);
  });
  it("cada acceso es una URL canónica del explorador: abrirla no cambia nada", () => {
    for (const p of [alfonsin, austral, periodos.periodos.find((x) => x.id === "p.regimen.cepo-2011")!]) {
      for (const a of accesosDe(p, publicadas, 2026)) {
        const q = new URLSearchParams(a.url.split("?")[1]);
        const { serie, variante } = serieDeUrl(q, indice);
        const doc = leer<Documento>(`series/${serie.id}/${variante}.json`);
        const { estado, avisos } = estadoDesdeUrl(q, serie.id, variante, doc);
        expect(avisos).toEqual([]);
        expect(`/explorador/${urlDesdeEstado(estado, doc, indice)}`).toBe(a.url);
      }
    }
  });
  it("desde un evento, la inflación mensual con los eventos marcados", () => {
    expect(accesoEvento("2001-12-01", 2026).url).toBe("/explorador/?t=var_mensual&desde=2000&hasta=2002&ev=1");
  });
});

describe("línea de tiempo", () => {
  const carriles = lineaDeTiempo(periodos, eventos, 1000, 1970, 2027, "2026-11-12");
  it("un carril por tipo y uno de eventos, con los planes en filas", () => {
    expect(carriles.map((c) => c.tipo)).toEqual(["catedra", "gobierno", "ministro", "plan", "regimen_cambiario", "episodio", "evento"]);
    expect(carriles.find((c) => c.tipo === "plan")!.filas).toBe(2);
    expect(carriles.find((c) => c.tipo === "gobierno")!.filas).toBe(1);
  });
  it("las posiciones respetan las fechas y los vigentes llegan a hoy", () => {
    expect(posicion("1970-01-01", 1970, 2027, 1000)).toBe(0);
    const gob = carriles.find((c) => c.tipo === "gobierno")!.tramos;
    const milei = gob.at(-1)!;
    expect(milei.x + milei.ancho).toBeCloseTo(posicion("2026-11-12", 1970, 2027, 1000), 5);
    expect(gob.find((t) => t.id === "p.gobierno.videla")!.clase).toBe("facto");
  });
});
