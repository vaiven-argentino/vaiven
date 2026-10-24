// Las transformaciones sobre el export reproducen lo publicado por el INDEC (confirmado el 24/10/2026).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { transformar } from "../src/index";
import type { SerieExportada } from "../src/index";

const ipc: SerieExportada = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "export", "series", "ipc", "oficial.json"), "utf-8"));

// Los informes publican un decimal: el valor calculado tiene que redondear a lo publicado.
const redondeaA = (x: number | null, publicado: number, tolerancia = 0.05) =>
  expect(Math.abs((x ?? Number.NaN) - publicado)).toBeLessThanOrEqual(tolerancia);

describe("IPC oficial contra los informes técnicos del INDEC", () => {
  const dicDic = Object.fromEntries(transformar(ipc, { transformacion: "var_dic_dic" }).datos);
  const mensual = Object.fromEntries(transformar(ipc, { transformacion: "var_mensual" }).datos);

  it.each([
    // [año, % dic.–dic., informe]
    ["2017", 24.8, "ipc_01_18.pdf"],
    ["2018", 47.6, "ipc_01_19.pdf"],
    ["2019", 53.8, "ipc_01_20578b3e8357.pdf"],
    ["2023", 211.4, "ipc_01_24DBD5D8158C.pdf"],
    ["2024", 117.8, "ipc_01_2517A7124C09.pdf"],
  ] as const)("inflación dic.–dic. de %s: %s %% (%s)", (anio, publicado) => {
    redondeaA(dicDic[anio], publicado);
  });

  it.each([
    ["2023-12", 25.5, "ipc_01_24DBD5D8158C.pdf"],
    ["2024-04", 8.8, "ipc_05_24F9890B1583.pdf"],
  ] as const)("variación mensual de %s: %s %% (%s)", (mes, publicado) => {
    redondeaA(mensual[mes], publicado);
  });

  it.each([
    // No son valores publicados como tales: salen de los niveles de la serie empalmada del INDEC
    // (sh_ipc_2008.xls, «IPC GBA desde 1943»). La fuente del tramo de Vaivén es otra copia (datos.gob.ar).
    ["1989", 4923.6],
    ["1990", 1343.9],
    ["1991", 84.0],
  ] as const)("hiperinflación, dic.–dic. de %s: %s %% (serie empalmada del INDEC)", (anio, calculado) => {
    redondeaA(dicDic[anio], calculado, 0.1);
  });
});
