// El tema claro de la web como valores fijos, para armar la vista fuera del navegador (el MCP, SPEC 7.2). En la web,
// `tema()` (web/src/graficos/comun.ts) lee las mismas variables de global.css; una prueba controla que coincidan.
import type { Tema } from "./espec";

export const TEMA_CLARO: Tema = {
  fondo: "#FAF7F0", texto: "#22201B", secundario: "#575045", linea: "#DDD5C4", banda: "#E7E0D1", borde: "#7D7466",
  serie: "#0B5FA5", fuente: "Inter Variable, system-ui, sans-serif",
  periodoA: "#F0EADD", periodoB: "#E6DECD", periodoFacto: "#D8CDB5", periodoFranja: "#D8CDB5",
  paleta: ["#0B5FA5", "#B84A00", "#00785A", "#A8497F", "#8F6400", "#22201B", "#3B7EA1", "#5B3A8E"],
};
