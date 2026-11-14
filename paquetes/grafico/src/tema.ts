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
