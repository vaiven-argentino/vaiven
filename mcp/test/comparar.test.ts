// comparar_series y especificacion_grafico (SPEC 4.1 y 7.2), contra el export real.
import { describe, expect, it } from "vitest";
import { ErrorHerramienta } from "../src/datos";
import { compararSeries, especificacionGrafico } from "../src/herramientas/comparar";
import { repoReal } from "./ayuda";

const repo = repoReal();

describe("comparar_series", () => {
  it("por defecto, a la frecuencia común: IPC mensual con PIB trimestral da trimestral", async () => {
    const r = await compararSeries(repo, { series: [{ id: "ipc" }, { id: "pib" }], desde: "2005", hasta: "2005" });
    expect(r.alinear).toBe("frecuencia_comun");
    expect(r.frecuencia).toBe("trimestral");
    expect(r.columnas!.map((c) => [c.serie, c.id])).toEqual([[1, "ipc.oficial"], [2, "pib.retropolada"]]);
    expect(r.datos!.map((f) => f[0])).toEqual(["2005-01", "2005-04", "2005-07", "2005-10"]);
    expect(r.advertencias_combinacion.map((a) => a.id)).toEqual(["c.frecuencia-comun"]);
    expect(r.series.map((s) => s.numero)).toEqual([1, 2]);
    expect(r.series[0]).not.toHaveProperty("datos");
    expect(r.series[0].cita).toContain("Inflación minorista (IPC)");
  });

  it("la desocupación (EPH puntual) con el PIB da anual, con el aviso de la onda", async () => {
    const r = await compararSeries(repo, { series: [{ id: "desocupacion" }, { id: "pib", transformacion: "var_interanual" }], desde: "1995", hasta: "2002" });
    expect(r.frecuencia).toBe("anual");
    expect(r.advertencias_combinacion[0].descripcion).toContain("semestral de la EPH puntual");
    expect(r.advertencias_combinacion.map((a) => a.id)).toEqual(["c.frecuencia-comun", "c.variacion-promedio"]);
  });

  it("con alinear: ninguna, cada serie en su frecuencia", async () => {
    const r = await compararSeries(repo, { series: [{ id: "ipc" }, { id: "pib" }], desde: "2005", hasta: "2005", alinear: "ninguna" });
    expect(r).not.toHaveProperty("datos");
    expect((r.series[0] as { datos: unknown[] }).datos).toHaveLength(12);
    expect((r.series[1] as { datos: unknown[] }).datos).toHaveLength(4);
  });

  it("una internacional va por país", async () => {
    const r = await compararSeries(repo, { series: [{ id: "reservas" }, { id: "int-pib", paises: ["ARG", "BRA"] }], desde: "2001", hasta: "2003" });
    expect(r.columnas!.map((c) => c.pais ?? "")).toEqual(["", "ARG", "BRA"]);
    expect(r.frecuencia).toBe("anual");
  });

  it("los errores dicen qué serie los causa", async () => {
    await expect(compararSeries(repo, { series: [{ id: "ipc" }, { id: "reservas", transformacion: "var_dic_dic" }] }))
      .rejects.toThrow(/^Serie 2 \(reservas\.brutas\): La variante reservas\.brutas no admite «var_dic_dic»\./);
    await expect(compararSeries(repo, { series: [{ id: "ipc" }, { id: "no-existe" }] })).rejects.toThrow(/^Serie 2 \(no-existe\): No hay ninguna serie/);
    await expect(compararSeries(repo, { series: [{ id: "int-pib" }, { id: "int-pib-per-capita" }] }))
      .rejects.toThrow(ErrorHerramienta);
  });
});

describe("especificacion_grafico", () => {
  it("dos unidades: doble eje, con el enlace al explorador", async () => {
    const r = await especificacionGrafico(repo, { series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "reservas" }], desde: "2000", hasta: "2005" });
    expect(r.disposicion).toEqual({ tipo: "doble_eje", paneles: [{ unidad: "variación % interanual", series: [1] }, { unidad: "millones de US$", series: [2] }] });
    expect(r.url_explorador).toBe("https://vaiven.argentino.workers.dev/explorador/?desde=2000&hasta=2005&s2=reservas");
    expect(r.especificacion).toHaveProperty("layer");
    expect(r.series.map((s) => s.cita.length > 0)).toEqual([true, true]);
  });

  it("con ejes: paneles, sombreado y eventos", async () => {
    const r = await especificacionGrafico(repo, {
      series: [{ id: "ipc", transformacion: "var_mensual" }, { id: "tc-oficial", transformacion: "var_mensual" }, { id: "reservas" }],
      desde: "1988", hasta: "1991", sombreado: "gobierno", eventos: true, ejes: "paneles",
    });
    expect(r.disposicion.tipo).toBe("paneles");
    expect(r.url_explorador).toBe("https://vaiven.argentino.workers.dev/explorador/?t=var_mensual&desde=1988&hasta=1991&sh=gobierno&ev=1&s2=tc-oficial&t2=var_mensual&s3=reservas&ejes=paneles");
    expect(r.sombreado).toEqual({ tipo: "gobierno", periodos: 2 });
    expect(r.eventos!.length).toBeGreaterThan(0);
  });

  it("sin período, toda la serie (desde=todo en el enlace)", async () => {
    const r = await especificacionGrafico(repo, { series: [{ id: "ipc" }] });
    expect(r.url_explorador).toBe("https://vaiven.argentino.workers.dev/explorador/?t=nivel&desde=todo");
  });

  it("lo que el explorador no puede mostrar da error", async () => {
    await expect(especificacionGrafico(repo, { series: [{ id: "salario-real", medida: "real", base_real: "2017" }] })).rejects.toThrow(/`base_real`/);
    await expect(especificacionGrafico(repo, { series: [{ id: "ipc" }], eventos: ["papas"] })).rejects.toThrow(/Categorías de eventos que no existen: papas/);
  });
});

describe("límite de especificacion_grafico (SPEC 7.3)", () => {
  it("más de 1.000 observaciones: error, con la alternativa", async () => {
    await expect(especificacionGrafico(repo, { series: [{ id: "ipc" }, { id: "reservas" }] }))
      .rejects.toThrow(/observaciones y el límite de especificacion_grafico es 1\.000 \(por la CPU del servidor\)/);
  });
  it("comparar_series sigue con el límite general", async () => {
    const r = await compararSeries(repo, { series: [{ id: "ipc" }, { id: "reservas" }] });
    expect(r.n_observaciones).toBeGreaterThan(1000);
  });
});
