// Lector del gráfico (correcciones de la revisión externa de la 4b): el gráfico se recorre con el teclado. Con el foco,
// ← y → pasan de un dato a otro (Inicio y Fin, a los extremos); una regla vertical marca el dato y una línea que se
// anuncia dice fecha, valor, período y, si el dato cruza un cambio, el reparto (lo mismo que el tooltip al pasar el
// cursor). El SVG de Vega sigue oculto para los lectores de pantalla: la alternativa completa es la tabla.
import type { VistaGrafico } from "./comun";

/** Lo que se lee de cada dato: dónde se dibuja (ISO, la fecha de dibujo de ubicacion.ts) y el texto. */
export interface Lectura {
  t: string;
  texto: string;
}

/** El índice al que lleva una tecla, o null si la tecla no es del lector. */
export function moverLector(indice: number, tecla: string, total: number): number | null {
  if (!total) return null;
  const ultimo = total - 1;
  switch (tecla) {
    case "ArrowRight": return Math.min(ultimo, indice < 0 ? 0 : indice + 1);
    case "ArrowLeft": return Math.max(0, indice < 0 ? ultimo : indice - 1);
    case "Home": return 0;
    case "End": return ultimo;
    case "PageUp": return Math.max(0, indice - 12);
    case "PageDown": return Math.min(ultimo, indice + 12);
    default: return null;
  }
}

/**
 * Conecta el lector a un marco que envuelve el gráfico. `salida` es la línea que se anuncia (aria-live). Devuelve
 * `actualizar`, que se llama después de cada dibujo con la vista de Vega y las lecturas de los datos.
 */
export function conectarLector(marco: HTMLElement, salida: HTMLElement) {
  let lecturas: Lectura[] = [];
  let vista: VistaGrafico | null = null;
  let indice = -1;
  const regla = Object.assign(document.createElement("div"), { className: "lector-regla" });
  regla.hidden = true;
  regla.setAttribute("aria-hidden", "true");
  marco.append(regla);

  function mostrar(): void {
    const l = lecturas[indice];
    if (!l) { regla.hidden = true; return; }
    salida.textContent = l.texto;
    const x = vista?.view.scale("x");
    if (x && vista) {
      regla.style.left = `${vista.view.origin()[0] + x(new Date(l.t))}px`;
      regla.hidden = false;
    }
  }

  marco.addEventListener("keydown", (ev) => {
    const nuevo = moverLector(indice, ev.key, lecturas.length);
    if (nuevo === null) return;
    ev.preventDefault();
    indice = nuevo;
    mostrar();
  });
  marco.addEventListener("focus", () => {
    if (indice < 0 && lecturas.length) salida.textContent = `${lecturas.length} datos. Usá las flechas para recorrerlos.`;
  });
  marco.addEventListener("blur", () => { regla.hidden = true; });

  return {
    actualizar(nuevas: Lectura[], v: VistaGrafico | null): void {
      lecturas = nuevas;
      vista = v;
      indice = Math.min(indice, nuevas.length - 1);
      if (document.activeElement === marco && indice >= 0) mostrar();
      else regla.hidden = true;
    },
  };
}
