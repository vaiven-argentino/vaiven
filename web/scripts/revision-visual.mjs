// Revisión visual del sitio (la usa el subagente revisor-visual). Recorre las páginas en 390 y 1280 px, en modo
// claro y oscuro, saca capturas y mide: accesibilidad con axe-core (WCAG 2.1 A y AA), desbordes horizontales,
// contraste de los gráficos (el SVG de Vega no lo revisa axe) y solapamiento o recorte de los rótulos.
//
// Uso: node web/scripts/revision-visual.mjs --base http://localhost:8787 --salida <carpeta>
//        [--paginas /,/series/ipc/] [--anchos 390,1280] [--modos claro,oscuro]
// Usa el Playwright preinstalado (no instala navegadores). No escribe nada fuera de --salida.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = require.resolve("axe-core/axe.min.js");

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
  return acc;
}, []));
const base = (args.base ?? "http://localhost:8787").replace(/\/$/, "");
const salida = args.salida;
if (!salida) {
  console.error("Falta --salida <carpeta> (usá el scratchpad, no el repositorio).");
  process.exit(2);
}
mkdirSync(salida, { recursive: true });

function paginasPorDefecto() {
  const catalogo = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "export", "catalogo.json"), "utf-8"));
  const fichas = catalogo.series.flatMap((s) => s.variantes.filter((v) => v.estado === "publicada")
    .map((v) => (v.id === s.variante_por_defecto ? `/series/${s.id}/` : `/series/${s.id}/${v.id}/`)));
  return ["/", "/series/", ...fichas, "/datos/", "/agentes/", "/acerca/", "/no-existe/"];
}
const paginas = args.paginas ? args.paginas.split(",") : paginasPorDefecto();
const anchos = (args.anchos ?? "390,1280").split(",").map(Number);
const modos = (args.modos ?? "claro,oscuro").split(",");

// Se evalúa dentro de la página: desbordes, gráficos y contraste del SVG.
function medirEnPagina() {
  const selector = (el) => {
    if (!(el instanceof Element)) return "?";
    const partes = [];
    let nodo = el;
    while (nodo && nodo.nodeType === 1 && partes.length < 6) {
      if (nodo.id) { partes.unshift(`#${nodo.id}`); break; }
      let parte = nodo.tagName.toLowerCase();
      const clase = [...nodo.classList].find((c) => !c.startsWith("astro-") && !c.startsWith("data-astro"));
      if (clase) parte += `.${clase}`;
      const hermanos = nodo.parentElement ? [...nodo.parentElement.children].filter((h) => h.tagName === nodo.tagName) : [];
      if (hermanos.length > 1) parte += `:nth-of-type(${hermanos.indexOf(nodo) + 1})`;
      partes.unshift(parte);
      nodo = nodo.parentElement;
    }
    return partes.join(" > ");
  };
  const rgb = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return a === 0 ? null : [r, g, b];
  };
  const lum = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const problemas = [];
  const ancho = window.innerWidth;
  if (document.documentElement.scrollWidth > ancho + 1) {
    problemas.push({ tipo: "desborde", elemento: "html", detalle: `scrollWidth ${document.documentElement.scrollWidth}px > ${ancho}px` });
  }
  const conScroll = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
    }
    return false;
  };
  const vistos = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).position === "fixed") continue;
    if ((r.right > ancho + 1 || r.left < -1) && !conScroll(el) && !el.closest(".visualmente-oculto") && !el.closest(".saltar")) {
      const s = selector(el);
      if (![...vistos].some((v) => s.startsWith(v))) {
        vistos.add(s);
        problemas.push({ tipo: "desborde", elemento: s, detalle: `de ${Math.round(r.left)} a ${Math.round(r.right)} px (ancho ${ancho})` });
      }
    }
  }

  const fondoPagina = rgb(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255];
  const svg = document.querySelector("#grafico svg");
  const grafico = { hay: Boolean(svg), textos: 0 };
  if (document.getElementById("grafico") && !svg) problemas.push({ tipo: "gráfico", elemento: "#grafico", detalle: "no se dibujó el SVG" });
  if (svg) {
    const caja = svg.getBoundingClientRect();
    const resumen = document.getElementById("resumen-grafico")?.textContent?.trim();
    if (!resumen) problemas.push({ tipo: "gráfico", elemento: "#resumen-grafico", detalle: "falta el texto alternativo" });
    const textos = [...svg.querySelectorAll("text")].filter((t) => t.textContent.trim());
    grafico.textos = textos.length;
    const cajas = textos.map((t) => ({ t, r: t.getBoundingClientRect(), rol: t.closest("[class*='role-']")?.getAttribute("class")?.match(/role-[a-z-]+/)?.[0] ?? "" }));
    for (const { t, r } of cajas) {
      if (r.left < caja.left - 1 || r.right > caja.right + 1 || r.top < caja.top - 1 || r.bottom > caja.bottom + 1) {
        problemas.push({ tipo: "gráfico: recorte", elemento: `#grafico text «${t.textContent.trim()}»`, detalle: "el rótulo sale del área del gráfico" });
      }
      const color = rgb(getComputedStyle(t).fill);
      if (color) {
        const c = contraste(color, fondoPagina);
        if (c < 4.5) problemas.push({ tipo: "gráfico: contraste", elemento: `#grafico text «${t.textContent.trim()}»`, detalle: `${c.toFixed(2)}:1 (mínimo 4,5:1)` });
      }
    }
    for (let i = 0; i < cajas.length; i++) {
      for (let j = i + 1; j < cajas.length; j++) {
        const a = cajas[i], b = cajas[j];
        if (a.rol !== b.rol) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 1 && iy > 1) {
          problemas.push({ tipo: "gráfico: solapamiento", elemento: `#grafico ${a.rol || "text"}`, detalle: `«${a.t.textContent.trim()}» pisa a «${b.t.textContent.trim()}»` });
        }
      }
    }
    for (const linea of svg.querySelectorAll(".mark-line path")) {
      const color = rgb(getComputedStyle(linea).stroke);
      if (color) {
        const c = contraste(color, fondoPagina);
        if (c < 3) problemas.push({ tipo: "gráfico: contraste", elemento: "#grafico .mark-line path", detalle: `línea a ${c.toFixed(2)}:1 (mínimo 3:1)` });
      }
    }
  }
  return { problemas, grafico, titulo: document.title };
}

const informe = [];
const navegador = await chromium.launch();
for (const ruta of paginas) {
  for (const ancho of anchos) {
    for (const modo of modos) {
      const contexto = await navegador.newContext({
        viewport: { width: ancho, height: 900 }, colorScheme: modo === "oscuro" ? "dark" : "light", deviceScaleFactor: 1,
      });
      const pagina = await contexto.newPage();
      const errores = [];
      pagina.on("pageerror", (e) => errores.push(e.message));
      pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text().split("\n")[0]); });
      const respuesta = await pagina.goto(base + ruta, { waitUntil: "networkidle" });
      if (await pagina.$("#grafico")) {
        await pagina.waitForSelector("#grafico[data-listo='1'] svg", { timeout: 15000 }).catch(() => {});
      }
      const nombre = `${ruta.replace(/^\/|\/$/g, "").replaceAll("/", "_") || "inicio"}_${ancho}_${modo}.png`;
      await pagina.screenshot({ path: join(salida, nombre), fullPage: true });
      await pagina.addScriptTag({ path: AXE });
      const axe = await pagina.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
        return r.violations.map((v) => ({
          id: v.id, impacto: v.impact, ayuda: v.help,
          nodos: v.nodes.slice(0, 8).map((n) => ({ elemento: n.target.join(" "), detalle: (n.any[0] ?? n.all[0] ?? n.none[0])?.message ?? n.failureSummary })),
        }));
      });
      const medidas = await pagina.evaluate(medirEnPagina);
      const problemas = [
        ...(respuesta && respuesta.status() >= 400 && ruta !== "/no-existe/" ? [{ tipo: "http", elemento: ruta, detalle: `estado ${respuesta.status()}` }] : []),
        // En /no-existe/ el 404 es lo esperado (se prueba la página de error).
        ...errores.filter((e) => !(ruta === "/no-existe/" && e.includes("404"))).map((e) => ({ tipo: "consola", elemento: "página", detalle: e })),
        ...axe.flatMap((v) => v.nodos.map((n) => ({ tipo: `axe: ${v.id} (${v.impacto})`, elemento: n.elemento, detalle: n.detalle }))),
        ...medidas.problemas,
      ];
      informe.push({ pagina: ruta, ancho, modo, captura: join(salida, nombre), grafico: medidas.grafico, problemas });
      await contexto.close();
    }
  }
}
await navegador.close();

writeFileSync(join(salida, "informe.json"), JSON.stringify(informe, null, 2));
const total = informe.reduce((s, x) => s + x.problemas.length, 0);
console.log(`Revisadas ${paginas.length} páginas × ${anchos.length} anchos × ${modos.length} modos = ${informe.length} vistas. Problemas: ${total}.`);
for (const vista of informe) {
  for (const p of vista.problemas) console.log(`${vista.pagina} | ${vista.ancho} px | ${vista.modo} | ${p.elemento} | ${p.tipo} | ${p.detalle}`);
}
console.log(`Capturas e informe completo en ${salida}`);
