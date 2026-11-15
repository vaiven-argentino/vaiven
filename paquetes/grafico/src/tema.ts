// El tema claro de la web como valores fijos, para armar la vista fuera del navegador (el MCP, SPEC 7.2). En la web,
// `tema()` (web/src/graficos/comun.ts) lee las mismas variables de global.css; una prueba controla que coincidan. Los
// colores van en minúscula, como los recibe el navegador: el armado del sitio minifica el CSS y pasa «#B84A00» a
// «#b84a00». Así la especificación del MCP es igual, carácter por carácter, a la que dibuja el explorador.
import type { Tema } from "./espec";

export const TEMA_CLARO: Tema = {
  fondo: "#faf7f0", texto: "#22201b", secundario: "#575045", linea: "#ddd5c4", banda: "#e7e0d1", borde: "#7d7466",
  serie: "#0b5fa5", fuente: "Inter Variable, system-ui, sans-serif",
  periodoA: "#f0eadd", periodoB: "#e6decd", periodoFacto: "#d8cdb5", periodoFranja: "#d8cdb5",
  paleta: ["#0b5fa5", "#b84a00", "#00785a", "#a8497f", "#8f6400", "#22201b", "#3b7ea1", "#5b3a8e"],
};

/**
 * El tema oscuro de la web como valores fijos (4e): el MCP lo usa con `tema: oscuro`, para la interfaz dentro de Claude
 * en modo oscuro. Son las variables de `:root[data-theme="dark"]` de global.css; una prueba controla que coincidan.
 */
export const TEMA_OSCURO: Tema = {
  fondo: "#17140f", texto: "#efe9de", secundario: "#bdb3a3", linea: "#3a332a", banda: "#332c23", borde: "#857b6c",
  serie: "#56b4e9", fuente: "Inter Variable, system-ui, sans-serif",
  periodoA: "#231f18", periodoB: "#2d2820", periodoFacto: "#3b342a", periodoFranja: "#3b342a",
  paleta: ["#56b4e9", "#e69f00", "#4cc9a0", "#e9a6cb", "#f0e442", "#efe9de", "#d55e00", "#b9a3e3"],
};
