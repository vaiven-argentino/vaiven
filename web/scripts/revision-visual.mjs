// Revisión visual del sitio (la usa el subagente revisor-visual). Recorre las páginas en 390 y 1280 px, en modo
// claro y oscuro, saca capturas y mide: accesibilidad con axe-core (WCAG 2.1 A y AA), desbordes horizontales,
// contraste de los gráficos (el SVG de Vega no lo revisa axe) y solapamiento o recorte de los rótulos.
//
// Además de las páginas, corre siempre los casos fijos (CASOS_FIJOS): vistas del explorador y de la ficha con parámetros
// que ya dieron problemas, cada una con sus anchos y su alto de ventana. Para cada vista informa también dónde empieza el
// gráfico (`topGrafico`), el alto de la página (`altoPagina`) y cómo se marcan los eventos (`eventos`: letras o rayitas).
//
// Uso: node web/scripts/revision-visual.mjs --base http://localhost:8787 --salida <carpeta>
//        [--paginas /,/series/ipc/] (se separan con una coma seguida de «/»: las URL pueden llevar comas) [--anchos 390,1280] [--modos claro,oscuro] [--sin-casos 1]
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
  return ["/", "/series/", ...fichas, "/explorador/", "/periodos/", "/datos/", "/agentes/", "/acerca/", "/no-existe/"];
}
const anchos = (args.anchos ?? "390,1280").split(",").map(Number);
const modos = (args.modos ?? "claro,oscuro").split(",");

// Casos fijos: siempre en modo claro y oscuro. `alto` es el de la ventana; `pantalla`, captura sin desplazar (lo que se
// ve al abrir) en lugar de la página entera.
const CASOS_FIJOS = [
  // Revisión visual de la 4b (PR 2 y PR 3).
  { ruta: "/explorador/?t=var_interanual&desde=2000&hasta=2004" }, // negativos
  { ruta: "/explorador/?s=int-pib&p=ARG,BRA,CHL,URY,USA,WLD&t=indice_desde_tasas&base=2001&desde=2001&hasta=2011" },
  { ruta: "/explorador/?s=pib&sh=mandato" }, // trimestral por mandato
  { ruta: "/explorador/?s=fuga" },
  { ruta: "/explorador/?sh=gobierno&ev=1" },
  { ruta: "/explorador/?t=var_mensual&desde=1985-06&hasta=1988-08&sh=plan&ev=1" }, // Plan Austral
  { ruta: "/series/ipc/?sh=gobierno&ev=1" },
  { ruta: "/series/pib/?sh=mandato" },
  { ruta: "/series/resultado-fiscal/?sh=regimen_cambiario" },
  { ruta: "/series/int-pib/?sh=gobierno" }, // crecimiento internacional
  { ruta: "/series/pib/" },
  // Correcciones de la revisión externa de la 4b (PR de interfaz).
  { ruta: "/explorador/?s=pib&desde=1995&hasta=2020&sh=gobierno" }, // anual con cambio de gobierno en diciembre (2001, 2015)
  { ruta: "/explorador/?t=var_mensual&desde=1988&hasta=1991&sh=gobierno&ev=1" }, // promedio mensual en julio de 1989
  { ruta: "/explorador/?s=reservas&desde=1988&hasta=1991&sh=gobierno" }, // saldo en julio de 1989
  { ruta: "/explorador/", anchos: [1280], alto: 800, pantalla: true }, // el gráfico, sin desplazar
  { ruta: "/periodos/", anchos: [390] },
  { ruta: "/explorador/?desde=1970&ev=1" }, // 1970–hoy con todos los eventos: rayitas
];
const vistas = [
  ...(args.paginas ? args.paginas.split(/,(?=\/)/) : paginasPorDefecto()).map((ruta) => ({ ruta })),
  ...(args["sin-casos"] ? [] : CASOS_FIJOS.filter((c) => !args.paginas || !args.paginas.split(/,(?=\/)/).includes(c.ruta)).map((c) => ({ ...c, fijo: true }))),
];

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
  // La ficha dibuja en #grafico; el explorador, en #x-grafico (con el resumen en #x-resumen).
  const contenedor = document.getElementById("grafico") ?? document.getElementById("x-grafico");
  const idGrafico = contenedor ? `#${contenedor.id}` : "#grafico";
  const svg = contenedor?.querySelector("svg");
  const grafico = {
    hay: Boolean(svg), textos: 0, topGrafico: contenedor ? Math.round(contenedor.getBoundingClientRect().top + window.scrollY) : null,
    eventos: contenedor?.dataset.eventos || null,
  };
  if (contenedor && !svg) problemas.push({ tipo: "gráfico", elemento: idGrafico, detalle: "no se dibujó el SVG" });
  if (svg) {
    const caja = svg.getBoundingClientRect();
    const idResumen = contenedor.id === "x-grafico" ? "x-resumen" : "resumen-grafico";
    const resumen = document.getElementById(idResumen)?.textContent?.trim();
    if (!resumen) problemas.push({ tipo: "gráfico", elemento: `#${idResumen}`, detalle: "falta el texto alternativo" });
    const textos = [...svg.querySelectorAll("text")].filter((t) => t.textContent.trim());
    grafico.textos = textos.length;
    const cajas = textos.map((t) => ({ t, r: t.getBoundingClientRect(), rol: t.closest("[class*='role-']")?.getAttribute("class")?.match(/role-[a-z-]+/)?.[0] ?? "" }));
    for (const { t, r } of cajas) {
      if (r.left < caja.left - 1 || r.right > caja.right + 1 || r.top < caja.top - 1 || r.bottom > caja.bottom + 1) {
        problemas.push({ tipo: "gráfico: recorte", elemento: `${idGrafico} text «${t.textContent.trim()}»`, detalle: "el rótulo sale del área del gráfico" });
      }
      const color = rgb(getComputedStyle(t).fill);
      if (color) {
        const c = contraste(color, fondoPagina);
        if (c < 4.5) problemas.push({ tipo: "gráfico: contraste", elemento: `${idGrafico} text «${t.textContent.trim()}»`, detalle: `${c.toFixed(2)}:1 (mínimo 4,5:1)` });
      }
    }
    for (let i = 0; i < cajas.length; i++) {
      for (let j = i + 1; j < cajas.length; j++) {
        const a = cajas[i], b = cajas[j];
        if (a.rol !== b.rol) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 1 && iy > 1) {
          problemas.push({ tipo: "gráfico: solapamiento", elemento: `${idGrafico} ${a.rol || "text"}`, detalle: `«${a.t.textContent.trim()}» pisa a «${b.t.textContent.trim()}»` });
        }
      }
    }
    for (const linea of svg.querySelectorAll(".mark-line path")) {
      const color = rgb(getComputedStyle(linea).stroke);
      if (color) {
        const c = contraste(color, fondoPagina);
        if (c < 3) problemas.push({ tipo: "gráfico: contraste", elemento: `${idGrafico} .mark-line path`, detalle: `línea a ${c.toFixed(2)}:1 (mínimo 3:1)` });
      }
    }
  }
  return { problemas, grafico, titulo: document.title, altoPagina: document.documentElement.scrollHeight };
}

const informe = [];
const navegador = await chromium.launch();
for (const vista of vistas) {
  const { ruta } = vista;
  // Los casos fijos van siempre en los dos modos.
  for (const ancho of vista.anchos ?? anchos) {
    for (const modo of vista.fijo ? ["claro", "oscuro"] : modos) {
      const alto = vista.alto ?? 900;
      const contexto = await navegador.newContext({
        viewport: { width: ancho, height: alto }, colorScheme: modo === "oscuro" ? "dark" : "light", deviceScaleFactor: 1,
      });
      const pagina = await contexto.newPage();
      const errores = [];
      pagina.on("pageerror", (e) => errores.push(e.message));
      pagina.on("console", (m) => { if (m.type() === "error") errores.push(m.text().split("\n")[0]); });
      const respuesta = await pagina.goto(base + ruta, { waitUntil: "networkidle" });
      if (await pagina.$("#grafico, #x-grafico")) {
        await pagina.waitForSelector("#grafico[data-listo='1'] svg, #x-grafico[data-listo='1'] svg", { timeout: 15000 }).catch(() => {});
      }
      const raiz = ruta.replace(/^\/|\/$/g, "").replace(/[/?&=%]+/g, "_").replace(/_+$/, "") || "inicio";
      const nombre = `${raiz}_${ancho}${vista.alto ? `x${vista.alto}` : ""}_${modo}${vista.pantalla ? "_pantalla" : ""}.png`;
      await pagina.screenshot({ path: join(salida, nombre), fullPage: !vista.pantalla });
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
      informe.push({ pagina: ruta, ancho, alto, modo, fijo: Boolean(vista.fijo), captura: join(salida, nombre), grafico: medidas.grafico, altoPagina: medidas.altoPagina, problemas });
      await contexto.close();
    }
  }
}
await navegador.close();

writeFileSync(join(salida, "informe.json"), JSON.stringify(informe, null, 2));
const total = informe.reduce((s, x) => s + x.problemas.length, 0);
const paginas = vistas.filter((v) => !v.fijo).length;
console.log(`Revisadas ${paginas} páginas × ${anchos.length} anchos × ${modos.length} modos, más ${vistas.length - paginas} casos fijos = ${informe.length} vistas. Problemas: ${total}.`);
for (const v of informe.filter((x) => x.fijo)) {
  console.log(`caso fijo | ${v.pagina} | ${v.ancho}×${v.alto} | ${v.modo} | gráfico desde ${v.grafico.topGrafico ?? "—"} px | eventos: ${v.grafico.eventos ?? "—"} | página de ${v.altoPagina} px`);
}
for (const vista of informe) {
  for (const p of vista.problemas) console.log(`${vista.pagina} | ${vista.ancho} px | ${vista.modo} | ${p.elemento} | ${p.tipo} | ${p.detalle}`);
}
console.log(`Capturas e informe completo en ${salida}`);
