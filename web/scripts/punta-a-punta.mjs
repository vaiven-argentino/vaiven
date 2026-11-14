// Prueba de punta a punta (SPEC 11: «encontrar, graficar, descargar y citar cada serie desde el celular y la
// computadora»; fase 2, ampliada en la 4a). Por cada serie publicada, en 390 y 1280 px: la busca en el catálogo, abre
// la ficha, cambia de transformación, de medida (real, en dólares, % del PIB), de país y a pesos actuales cuando la
// variante los ofrece (y en cada gráfico controla que los dos ejes tengan etiquetas), baja el CSV, el PNG y el ZIP, copia la cita y abre otra variante.
//
// Uso: node web/scripts/punta-a-punta.mjs --base http://localhost:8787 --salida <carpeta para las descargas> [--solo explorador]
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") && acc.push([a.slice(2), arr[i + 1]]), acc), []));
const base = (args.base ?? "http://localhost:8787").replace(/\/$/, "");
const salida = args.salida;
if (!salida) { console.error("Falta --salida <carpeta>."); process.exit(2); }
mkdirSync(salida, { recursive: true });

const catalogo = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "export", "catalogo.json"), "utf-8"));
const registroEventos = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "export", "eventos.json"), "utf-8"));
/** Cuántos eventos hay desde un año, con un filtro de categorías opcional. */
const eventosDesde = (anio, categorias) => registroEventos.eventos.filter((e) => e.fecha >= `${anio}-01-01` && (!categorias || categorias.includes(e.categoria))).length;
const fallas = [];
const ok = (cond, mensaje) => { if (!cond) fallas.push(mensaje); return cond; };
// Los dos ejes con etiquetas (revisión del 07/11/2026: la línea del 0 había apagado el eje Y de los gráficos con
// valores negativos y ninguna prueba lo vio).
async function ejes(pagina) {
  return pagina.$$eval("#grafico svg g.role-axis", (gs) => gs.map((g) => ({
    eje: (g.getAttribute("aria-label") ?? "").slice(0, 6), etiquetas: g.querySelectorAll(".role-axis-label text").length,
  })));
}
const conEjes = async (pagina, id, que) => {
  const e = await ejes(pagina);
  ok(e.some((x) => x.eje === "X-axis" && x.etiquetas >= 2), `${id}: ${que} sin etiquetas en el eje X`);
  ok(e.some((x) => x.eje === "Y-axis" && x.etiquetas >= 2), `${id}: ${que} sin etiquetas en el eje Y`);
};

async function bajar(pagina, accion, nombre) {
  const [descarga] = await Promise.all([pagina.waitForEvent("download", { timeout: 15000 }), accion()]);
  const ruta = join(salida, `${Date.now()}_${descarga.suggestedFilename()}`);
  await descarga.saveAs(ruta);
  return { ruta, nombre: descarga.suggestedFilename(), bytes: statSync(ruta).size, esperado: nombre };
}

// Vistas del explorador que se prueban: con sombreado, eventos, varios países, trimestral, negativos y atraso.
const VISTAS_EXPLORADOR = [
  { url: "?sh=gobierno&ev=1", sombreado: true, eventos: true },
  { url: "?t=var_mensual&desde=1985-06&hasta=1988-08&sh=plan&ev=1", sombreado: true, eventos: true },
  { url: "?s=pib&sh=mandato", sombreado: true },
  { url: "?s=resultado-fiscal&v=financiero&sh=regimen_cambiario", sombreado: true },
  { url: "?s=int-pib&p=ARG,BRA,CHL,URY,USA,WLD&t=indice_desde_tasas&base=2001&desde=2001&hasta=2011", paises: 6 },
  { url: "?s=reservas&sh=catedra", sombreado: true },
  // Filtro y densidad de eventos (revisión externa de la 4b, 9.4): 1970–hoy con todos los eventos va en rayitas, con la
  // lista completa; con un filtro, solo esas categorías y el aviso de cuántos quedan afuera.
  { url: "?desde=1970&ev=1", eventos: eventosDesde(1970), rayitas: true },
  { url: "?desde=1970&ev=cambiario,deuda", eventos: eventosDesde(1970, ["cambiario", "deuda"]), filtro: ["cambiario", "deuda"] },
  // Varias series (4c/4d): doble eje (o paneles en 390 px), cuatro paneles con sombreado y eventos, y una internacional.
  { url: "?t=var_mensual&desde=1988&hasta=1991&sh=gobierno&ev=1&s2=tc-oficial&t2=var_mensual", sombreado: true, eventos: true },
  { url: "?s=reservas&s2=ipc&s3=desocupacion&s4=pib&ejes=paneles", series: 4 },
  { url: "?s=pib&s2=int-pib&p2=ARG,BRA", paises: 2, series: 2 },
];

const controlesExplorador = (pagina) => pagina.$$eval("#x-controles select, #x-controles input, #x-serie, #x-variante",
  (es) => es.filter((e) => !e.closest("[hidden]")).map((e) => `${e.id}=${e.type === "checkbox" ? e.checked : e.value}`).join("|"));

async function explorador(pagina, ancho) {
  for (const v of VISTAS_EXPLORADOR) {
    const id = `explorador${v.url} @ ${ancho}px`;
    await pagina.goto(`${base}/explorador/${v.url}`, { waitUntil: "networkidle" });
    const listo = await pagina.waitForSelector("#x-grafico[data-listo='1'] svg", { timeout: 15000 }).then(() => true, () => false);
    if (!ok(listo, `${id}: no se dibujó el gráfico`)) continue;
    await conEjesEn(pagina, "#x-grafico", id, "la vista");
    // La URL queda igual (es canónica) y no hay avisos de parámetros descartados.
    ok(new URL(pagina.url()).search === v.url, `${id}: la URL cambió a ${new URL(pagina.url()).search}`);
    const avisos = await pagina.$eval("#x-avisos", (e) => e.textContent);
    ok(!/La URL (pedía|tiene)/.test(avisos), `${id}: avisos de parámetros: ${avisos}`);
    if (v.sombreado) ok(await pagina.$$eval("#x-grafico svg .mark-rect path", (ps) => ps.length) > 0, `${id}: no se ve el sombreado`);
    if (v.eventos) ok(await pagina.$$eval("#x-lista-eventos li", (ls) => ls.length) > 0, `${id}: no se listan los eventos`);
    if (typeof v.eventos === "number") {
      const n = await pagina.$$eval("#x-lista-eventos li", (ls) => ls.length);
      ok(n === v.eventos, `${id}: la lista tiene ${n} eventos y se esperaban ${v.eventos}`);
    }
    if (v.rayitas) {
      ok(await pagina.$eval("#x-grafico", (g) => g.dataset.eventos) === "rayitas", `${id}: los eventos no pasan a rayitas`);
      ok(await pagina.$eval("#x-lista-eventos", (l) => l.classList.contains("con-fechas")), `${id}: la lista no lleva las fechas`);
    }
    if (v.filtro) {
      const marcadas = await pagina.$$eval("#x-categorias input:checked", (is) => is.map((i) => i.dataset.categoria));
      ok(marcadas.join(",") === v.filtro.join(","), `${id}: las casillas marcadas son ${marcadas.join(",")}`);
      const aviso = await pagina.$eval("#x-aviso-filtro", (p) => (p.hidden ? "" : p.textContent));
      ok(aviso.startsWith(`Se muestran ${v.eventos} de ${eventosDesde(1970)} eventos (filtro: cambiario, deuda)`), `${id}: el aviso del filtro dice «${aviso}»`);
    }
    if (v.paises) ok(await pagina.$$eval("#x-leyenda-paises > span", (ls) => ls.length) === v.paises, `${id}: la leyenda no tiene ${v.paises} países`);
    if (v.series) ok(await pagina.$$eval("#x-series-lista li", (ls) => ls.length) === v.series, `${id}: la lista no tiene ${v.series} series`);
    // Ida y vuelta: recargar la URL da los mismos controles.
    const antes = await controlesExplorador(pagina);
    await pagina.reload({ waitUntil: "networkidle" });
    await pagina.waitForSelector("#x-grafico[data-listo='1'] svg", { timeout: 15000 });
    ok(await controlesExplorador(pagina) === antes, `${id}: al recargar cambian los controles`);
  }
  // Cambiar un control guarda la vista en la URL, y abrir esa URL la reproduce.
  const id = `explorador (controles) @ ${ancho}px`;
  await pagina.goto(`${base}/explorador/`, { waitUntil: "networkidle" });
  await pagina.waitForSelector("#x-grafico[data-listo='1'] svg", { timeout: 15000 });
  if (!(await pagina.locator("#x-panel").evaluate((d) => d.open))) await pagina.click("#x-panel > summary");
  await pagina.selectOption("#x-sombreado", "ministro");
  await pagina.waitForTimeout(800);
  await pagina.selectOption("#x-etapa", "p.catedra.convertibilidad");
  await pagina.waitForTimeout(800);
  const url = new URL(pagina.url()).search;
  ok(url === "?desde=1991-04&hasta=1999-12&sh=ministro", `${id}: la URL no guarda la vista (${url})`);
  const antes = await controlesExplorador(pagina);
  await pagina.goto(`${base}/explorador/${url}`, { waitUntil: "networkidle" });
  await pagina.waitForSelector("#x-grafico[data-listo='1'] svg", { timeout: 15000 });
  ok(await controlesExplorador(pagina) === antes, `${id}: la URL no reproduce la vista`);
  // Descargas de la vista: no vacías.
  const csv = await bajar(pagina, () => pagina.click("#x-bajar-csv"), "csv");
  // CSV largo, también con una serie (decisión del PR B de la 4c/4d).
  ok(csv.bytes > 100 && readFileSync(csv.ruta, "utf-8").startsWith("fecha,serie,variante,transformacion,unidad,valor,periodo,periodo_proporcion,otros_periodos\n"), `${id}: CSV vacío o sin las columnas del formato largo`);
  const xlsx = await bajar(pagina, () => pagina.click("#x-bajar-xlsx"), "xlsx");
  ok(xlsx.bytes > 3000 && xlsx.nombre.endsWith(".xlsx") && readFileSync(xlsx.ruta).subarray(0, 2).toString() === "PK", `${id}: XLSX vacío o no es un ZIP (${xlsx.bytes} B)`);
  const png = await bajar(pagina, () => pagina.click("#x-bajar-png"), "png");
  ok(png.bytes > 5000, `${id}: PNG vacío (${png.bytes} B)`);
  const svg = await bajar(pagina, () => pagina.click("#x-bajar-svg"), "svg");
  ok(svg.bytes > 5000 && readFileSync(svg.ruta, "utf-8").includes("Sombreado: ministros de Economía"), `${id}: el SVG no lleva el sombreado impreso`);
  console.log(`${id}: URL ${url}; CSV ${csv.bytes} B, XLSX ${xlsx.bytes} B (${xlsx.ruta}), PNG ${png.bytes} B, SVG ${svg.bytes} B`);

  // Una casilla de categoría escribe `ev` en forma canónica; «Marcar eventos» apagado lo saca.
  const idFiltro = `explorador (filtro de eventos) @ ${ancho}px`;
  await pagina.goto(`${base}/explorador/?ev=1`, { waitUntil: "networkidle" });
  await pagina.waitForSelector("#x-grafico[data-listo='1'] svg", { timeout: 15000 });
  if (!(await pagina.locator("#x-panel").evaluate((d) => d.open))) await pagina.click("#x-panel > summary");
  await pagina.uncheck("#x-categorias input[data-categoria='episodio']");
  await pagina.waitForTimeout(600);
  let q = new URL(pagina.url()).search;
  ok(q === "?ev=cambiario,monetario,financiero,fiscal,deuda,crisis,institucional", `${idFiltro}: la URL quedó ${q}`);
  ok(await pagina.$eval("#x-lista-episodios", (l) => l.hidden), `${idFiltro}: sin la categoría, siguen los episodios`);
  await pagina.uncheck("#x-eventos");
  await pagina.waitForTimeout(600);
  q = new URL(pagina.url()).search;
  ok(q === "", `${idFiltro}: sin eventos, la URL quedó ${q}`);
  console.log(`${idFiltro}: casillas → URL canónica`);
  await exploradorVarias(pagina, ancho);
}

/** Varias series (SPEC 6.2, 4c/4d): agregar y quitar con el teclado, el botón de los ejes y las descargas de la vista. */
async function exploradorVarias(pagina, ancho) {
  const id = `explorador (varias series) @ ${ancho}px`;
  const listo = () => pagina.waitForSelector("#x-grafico[data-listo='1'] svg", { timeout: 15000 });
  const q = () => new URL(pagina.url()).search;
  await pagina.goto(`${base}/explorador/?t=var_interanual&desde=1995&hasta=2010`, { waitUntil: "networkidle" });
  await listo();
  // Agregar con el teclado: el foco va al selector de la serie nueva, que arranca vacía y no va a la URL.
  await pagina.focus("#x-agregar");
  await pagina.keyboard.press("Enter");
  await pagina.waitForTimeout(300);
  ok(await pagina.evaluate(() => document.activeElement?.id) === "x-serie", `${id}: al agregar, el foco no va al selector de la serie`);
  // La URL canónica no escribe `t`: la variación interanual es la vista inicial del IPC.
  ok(await pagina.$eval("#x-serie", (s) => s.value) === "" && q() === "?desde=1995&hasta=2010", `${id}: la serie agregada no arranca vacía (${q()})`);
  await pagina.selectOption("#x-serie", "reservas");
  await pagina.waitForTimeout(800);
  await listo();
  ok(q() === "?desde=1995&hasta=2010&s2=reservas", `${id}: la URL quedó ${q()}`);
  // Dos unidades: doble eje en la computadora y paneles en el celular; el botón pasa a la otra disposición.
  const angosto = ancho < 600;
  const antes = await pagina.$eval("#x-ejes", (b) => b.textContent);
  ok(antes === (angosto ? "Ver en doble eje" : "Ver en paneles"), `${id}: el botón dice «${antes}»`);
  await pagina.click("#x-ejes");
  await pagina.waitForTimeout(800);
  ok(q().endsWith(angosto ? "&ejes=doble" : "&ejes=paneles"), `${id}: el botón de los ejes dejó la URL en ${q()}`);
  // Quitar la serie 1: la 2 pasa a ser la 1 y conserva el período.
  await pagina.click("#x-series-lista li:first-child button.quitar");
  await pagina.waitForTimeout(800);
  await listo();
  ok(q().startsWith("?s=reservas&desde=1995&hasta=2010"), `${id}: al quitar la serie 1, la URL quedó ${q()}`);
  ok(await pagina.evaluate(() => document.activeElement?.id) === "x-agregar", `${id}: al quitar, el foco no va a «Agregar serie»`);
  // Descargas con varias series: doble eje con sombreado y cuatro paneles.
  for (const url of ["?t=var_interanual&desde=1995&hasta=2010&sh=gobierno&s2=reservas&ejes=doble", "?s=reservas&s2=ipc&s3=desocupacion&s4=pib&ejes=paneles"]) {
    await pagina.goto(`${base}/explorador/${url}`, { waitUntil: "networkidle" });
    await listo();
    const csv = await bajar(pagina, () => pagina.click("#x-bajar-csv"), "csv");
    const texto = readFileSync(csv.ruta, "utf-8");
    ok(texto.startsWith("fecha,serie,variante,transformacion,unidad,valor,") && texto.includes(",reservas,"), `${id}: CSV largo inesperado (${url})`);
    ok(/^vaiven_ipc_y_reservas|^vaiven_reservas_y_ipc/.test(csv.nombre), `${id}: nombre del CSV inesperado (${csv.nombre})`);
    const xlsx = await bajar(pagina, () => pagina.click("#x-bajar-xlsx"), "xlsx");
    ok(xlsx.bytes > 3000 && readFileSync(xlsx.ruta).subarray(0, 2).toString() === "PK", `${id}: XLSX vacío o no es un ZIP (${xlsx.bytes} B)`);
    const png = await bajar(pagina, () => pagina.click("#x-bajar-png"), "png");
    ok(png.bytes > 5000, `${id}: PNG vacío (${png.bytes} B)`);
    const svg = await bajar(pagina, () => pagina.click("#x-bajar-svg"), "svg");
    const s = readFileSync(svg.ruta, "utf-8");
    if (url.includes("ejes=doble")) ok(s.includes("Las escalas de los dos ejes son independientes"), `${id}: el SVG del doble eje no lleva el aviso`);
    else ok(s.includes("4. PIB real") || s.includes("Serie 4"), `${id}: el SVG de los paneles no lleva la serie 4`);
    console.log(`${id}: ${url}: CSV ${csv.bytes} B, XLSX ${xlsx.bytes} B, PNG ${png.bytes} B (${png.ruta}), SVG ${svg.bytes} B (${svg.ruta})`);
  }
}

// La regla de ubicación va debajo del gráfico (segunda revisión externa de la 4b, 2.2): con sombreado, el gráfico empieza en
// la misma posición que sin él, en el explorador y en la ficha (tolerancia de 10 px).
async function graficoSinCorrerse(navegador) {
  for (const ancho of [390, 1280]) {
    const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
    const pagina = await contexto.newPage();
    for (const [ruta, sel] of [["/explorador/", "#x-grafico"], ["/series/ipc/", "#grafico"]]) {
      const arriba = async (url) => {
        await pagina.goto(`${base}${url}`, { waitUntil: "networkidle" });
        await pagina.waitForSelector(`${sel}[data-listo='1'] svg`, { timeout: 15000 });
        return pagina.$eval(sel, (g) => Math.round(g.getBoundingClientRect().top + window.scrollY));
      };
      const sin = await arriba(ruta);
      const con = await arriba(`${ruta}?sh=gobierno`);
      const id = `${ruta}?sh=gobierno @ ${ancho}px`;
      ok(Math.abs(con - sin) <= 10, `${id}: con sombreado el gráfico empieza en ${con} px y sin sombreado en ${sin} px`);
      const regla = await pagina.evaluate(([r, g]) => {
        const nodo = document.querySelector(r);
        return { visible: !nodo.hidden, despues: nodo.getBoundingClientRect().top > document.querySelector(`${g} svg`).getBoundingClientRect().bottom };
      }, [ruta === "/explorador/" ? "#x-regla" : "#regla", sel]);
      ok(regla.visible && regla.despues, `${id}: la regla de ubicación no está debajo del gráfico`);
      console.log(`${id}: gráfico desde ${con} px (sin sombreado, ${sin} px); regla debajo`);
    }
    await contexto.close();
  }
}

// Escritorio (revisión externa de la 4b, 9.4): en 1280 × 800, el gráfico empieza en la primera mitad de la pantalla.
async function explorador1280x800(navegador) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const pagina = await contexto.newPage();
  for (const url of ["", "?sh=gobierno&ev=1"]) {
    const id = `explorador${url} @ 1280×800`;
    await pagina.goto(`${base}/explorador/${url}`, { waitUntil: "networkidle" });
    await pagina.waitForSelector("#x-grafico[data-listo='1'] svg", { timeout: 15000 });
    const arriba = await pagina.$eval("#x-grafico", (g) => Math.round(g.getBoundingClientRect().top));
    ok(arriba < 400, `${id}: el gráfico empieza en ${arriba} px (tiene que ser menos de 400)`);
    const panel = await pagina.$eval("#x-controles", (f) => ({ ancho: Math.round(f.getBoundingClientRect().width), posicion: getComputedStyle(f).position }));
    ok(panel.ancho >= 290 && panel.ancho <= 310 && panel.posicion === "sticky", `${id}: el panel mide ${panel.ancho} px (${panel.posicion})`);
    console.log(`${id}: gráfico desde ${arriba} px; panel de ${panel.ancho} px`);
  }
  await contexto.close();
}

// Ficha con sombreado y eventos, su enlace al explorador, y los accesos de /periodos/ (fase 4b, PR 3).
async function fichaYPeriodos(pagina, ancho) {
  let id = `ficha /series/ipc/?sh=gobierno&ev=1 @ ${ancho}px`;
  await pagina.goto(`${base}/series/ipc/?sh=gobierno&ev=1`, { waitUntil: "networkidle" });
  if (ok(await pagina.waitForSelector("#grafico[data-listo='1'] svg", { timeout: 15000 }).then(() => true, () => false), `${id}: no se dibujó el gráfico`)) {
    await conEjes(pagina, id, "el gráfico con sombreado");
    ok(await pagina.$$eval("#grafico svg .mark-rect path", (ps) => ps.length) > 0, `${id}: no se ve el sombreado`);
    ok(await pagina.$$eval("#lista-eventos li", (ls) => ls.length) > 0, `${id}: no se listan los eventos`);
    ok(await pagina.$$eval("#lista-periodos li", (ls) => ls.length) > 0, `${id}: no se listan los períodos`);
    ok(await pagina.$eval("#tabla-periodo", (th) => !th.hidden && th.textContent === "Gobierno"), `${id}: la tabla no tiene la columna del período`);
    const href = await pagina.$eval("#abrir-explorador", (a) => a.getAttribute("href"));
    ok(/sh=gobierno/.test(href) && /ev=1/.test(href), `${id}: el enlace al explorador no lleva la vista (${href})`);
    await pagina.click("#abrir-explorador");
    await pagina.waitForURL("**/explorador/**");
    await pagina.waitForSelector("#x-grafico[data-listo='1'] svg", { timeout: 15000 });
    ok(await pagina.$eval("#x-sombreado", (s) => s.value) === "gobierno" && await pagina.$eval("#x-eventos", (c) => c.checked), `${id}: el explorador no abre con la misma vista`);
  }
  // La ficha con un filtro de eventos: solo esa categoría, las casillas y el aviso.
  id = `ficha /series/ipc/?desde=todo&ev=deuda @ ${ancho}px`;
  await pagina.goto(`${base}/series/ipc/?desde=todo&ev=deuda`, { waitUntil: "networkidle" });
  if (ok(await pagina.waitForSelector("#grafico[data-listo='1'] svg", { timeout: 15000 }).then(() => true, () => false), `${id}: no se dibujó el gráfico`)) {
    const marcadas = await pagina.$$eval("#c-categorias input:checked", (is) => is.map((i) => i.dataset.categoria));
    ok(marcadas.join(",") === "deuda", `${id}: las casillas marcadas son ${marcadas.join(",")}`);
    const n = await pagina.$$eval("#lista-eventos li", (ls) => ls.length);
    ok(n > 0 && n <= eventosDesde(1943, ["deuda"]), `${id}: la lista tiene ${n} eventos`);
    ok(await pagina.$eval("#aviso-filtro", (p) => !p.hidden && p.textContent.includes("(filtro: deuda)")), `${id}: falta el aviso del filtro`);
    ok(new URL(pagina.url()).search === "?desde=todo&ev=deuda", `${id}: la URL cambió a ${new URL(pagina.url()).search}`);
  }
  // Sin parámetros, la ficha no sombrea (el sombreado viene apagado).
  id = `ficha /series/pib/ @ ${ancho}px`;
  await pagina.goto(`${base}/series/pib/`, { waitUntil: "networkidle" });
  await pagina.waitForSelector("#grafico[data-listo='1'] svg", { timeout: 15000 });
  ok(await pagina.$eval("#c-sombreado", (s) => s.value) === "" && await pagina.$eval("#leyenda-periodos", (d) => d.hidden), `${id}: el sombreado no arranca apagado`);
  // /periodos/: una fila por período y evento (cada una, un <details>), y sus accesos abren el explorador con esa vista.
  id = `/periodos/ @ ${ancho}px`;
  await pagina.goto(`${base}/periodos/`, { waitUntil: "networkidle" });
  const tarjetas = await pagina.$$eval("li.fila > details", (ts) => ts.length);
  ok(tarjetas >= 160, `${id}: hay ${tarjetas} filas`);
  const altoPagina = await pagina.evaluate(() => document.documentElement.scrollHeight);
  if (ancho === 390) ok(altoPagina < 12000, `${id}: la página mide ${altoPagina} px (meta: unos 10.000)`);
  // Llegar con #id abre la fila (y la que contiene un mandato).
  await pagina.goto(`${base}/periodos/#p.plan.austral`, { waitUntil: "networkidle" });
  ok(await pagina.$eval("[id='p.plan.austral'] > details", (d) => d.open), `${id}: #p.plan.austral no abre su fila`);
  await pagina.goto(`${base}/periodos/#p.gobierno.menem-1995`, { waitUntil: "networkidle" });
  ok(await pagina.$eval("[id='p.gobierno.menem-1995']", (li) => li.closest("details").open), `${id}: el mandato no abre la fila de Menem`);
  await pagina.goto(`${base}/periodos/#p.plan.austral`, { waitUntil: "networkidle" });
  ok(await pagina.$$eval(".linea-marco svg a", (as) => as.length) >= 150, `${id}: la línea de tiempo no enlaza los tramos`);
  ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${id}: la página se desborda de costado`);
  const acceso = pagina.locator("[id='p.plan.austral'] .accesos a").first();
  const destino = await acceso.getAttribute("href");
  await acceso.click();
  await pagina.waitForURL("**/explorador/**");
  await pagina.waitForSelector("#x-grafico[data-listo='1'] svg", { timeout: 15000 });
  ok(new URL(pagina.url()).pathname + new URL(pagina.url()).search === destino, `${id}: el acceso cambió de URL al abrirse`);
  ok(await pagina.$$eval("#x-grafico svg .mark-rect path", (ps) => ps.length) > 0, `${id}: el acceso no muestra el sombreado`);
  console.log(`${id}: ${tarjetas} filas, página de ${altoPagina} px; acceso ${destino} reproducido; ficha con sombreado, filtro de eventos y enlace al explorador`);
}

async function conEjesEn(pagina, sel, id, que) {
  const e = await pagina.$$eval(`${sel} svg g.role-axis`, (gs) => gs.map((g) => ({
    eje: (g.getAttribute("aria-label") ?? "").slice(0, 6), etiquetas: g.querySelectorAll(".role-axis-label text").length,
  })));
  ok(e.some((x) => x.eje === "X-axis" && x.etiquetas >= 2), `${id}: ${que} sin etiquetas en el eje X`);
  ok(e.some((x) => x.eje === "Y-axis" && x.etiquetas >= 2), `${id}: ${que} sin etiquetas en el eje Y`);
}

const navegador = await chromium.launch();
for (const ancho of [390, 1280]) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 }, acceptDownloads: true });
  await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const pagina = await contexto.newPage();
  for (const s of args.solo === "explorador" ? [] : catalogo.series) {
    const id = `${s.id} @ ${ancho}px`;
    // Encontrar
    await pagina.goto(`${base}/series/`, { waitUntil: "networkidle" });
    await pagina.fill("#f-texto", s.nombre.split(" ")[0].normalize("NFD").replace(/\p{Diacritic}/gu, ""));
    const enlace = pagina.locator("#lista-series > li:not([hidden]) h2 a", { hasText: s.nombre });
    if (!ok(await enlace.count() === 1, `${id}: la búsqueda no encuentra «${s.nombre}»`)) continue;
    await enlace.click();
    await pagina.waitForURL(`**/series/${s.id}/`);
    // Graficar
    const listo = await pagina.waitForSelector("#grafico[data-listo='1'] svg", { timeout: 15000 }).then(() => true, () => false);
    ok(listo, `${id}: no se dibujó el gráfico`);
    if (listo) await conEjes(pagina, id, "el gráfico inicial");
    const opciones = await pagina.$$eval("#c-transformacion option", (os) => os.map((o) => o.value));
    if (opciones.length > 1) {
      const panel = pagina.locator("#panel-opciones");
      if (!(await panel.evaluate((d) => d.open))) await pagina.click("#panel-opciones > summary");
      const otra = opciones.find((o) => o !== (new URL(pagina.url()).searchParams.get("t") ?? "")) ?? opciones[0];
      await pagina.selectOption("#c-transformacion", opciones.includes("var_interanual") ? "var_interanual" : otra);
      await pagina.waitForTimeout(400);
      ok(await pagina.$("#grafico svg"), `${id}: el gráfico no se redibujó al cambiar la transformación`);
      await conEjes(pagina, id, "el gráfico con otra transformación");
    }
    // Medidas, país y pesos actuales (fase 4a): cada opción tiene que dibujar sin error.
    const probadas = [];
    const sinError = async (que) => {
      await pagina.waitForTimeout(600);
      const estado = await pagina.$eval("#estado-grafico", (e) => (e.dataset.tipo === "error" ? e.textContent : ""));
      ok(!estado, `${id}: ${que} da error: «${estado}»`);
      ok(await pagina.$("#grafico svg"), `${id}: el gráfico no se redibujó con ${que}`);
      await conEjes(pagina, id, que);
      probadas.push(que);
    };
    const abrirPanel = async () => {
      const panel = pagina.locator("#panel-opciones");
      if (!(await panel.evaluate((d) => d.open))) await pagina.click("#panel-opciones > summary");
    };
    if (await pagina.$("#c-medida")) {
      await abrirPanel();
      await pagina.selectOption("#c-transformacion", "nivel");
      for (const m of await pagina.$$eval("#c-medida option", (os) => os.map((o) => o.value).filter(Boolean))) {
        await pagina.selectOption("#c-medida", m);
        await sinError(`la medida ${m}`);
        if (m === "real" && (await pagina.$$("#c-deflactor option")).length > 1) {
          await pagina.selectOption("#c-deflactor", { index: 1 });
          await sinError("la medida real con otro IPC");
        }
      }
      await pagina.selectOption("#c-medida", "");
    }
    if (await pagina.$("#c-entidad")) {
      await abrirPanel();
      await pagina.selectOption("#c-entidad", { index: 1 });
      await sinError("otro país");
    }
    if (await pagina.$("#c-pesos")) {
      await abrirPanel();
      await pagina.check("#c-pesos");
      await sinError("pesos actuales");
    }
    // Descargar
    const csv = await bajar(pagina, () => pagina.click(".lista-descargas a:text-is('CSV')"), "csv");
    ok(csv.bytes > 100 && /^fecha,(pais,)?valor/.test(readFileSync(csv.ruta, "utf-8")), `${id}: CSV vacío o mal formado (${csv.bytes} bytes)`);
    const png = await bajar(pagina, () => pagina.click("#bajar-png"), "png");
    ok(png.bytes > 5000 && png.nombre.endsWith(".png"), `${id}: PNG vacío (${png.bytes} bytes)`);
    const zip = await bajar(pagina, () => pagina.click(".lista-descargas a:text-is('ZIP')"), "zip");
    ok(zip.bytes > 1000 && /^vaiven_\d{4}-\d{2}-\d{2}\.zip$/.test(zip.nombre), `${id}: ZIP inesperado (${zip.nombre}, ${zip.bytes} bytes)`);
    // Citar
    await pagina.click("button[data-copiar='cita-texto']");
    const copiada = await pagina.evaluate(() => navigator.clipboard.readText());
    ok(copiada.startsWith("Vaivén (") && copiada.includes(`/series/${s.id}/`), `${id}: la cita copiada no es la esperada: «${copiada.slice(0, 80)}»`);
    // Otra variante publicada, si la hay
    const otraVariante = s.variantes.find((v) => v.estado === "publicada" && v.id !== s.variante_por_defecto);
    if (otraVariante) {
      await pagina.click(`.variantes a[href="/series/${s.id}/${otraVariante.id}/"]`);
      await pagina.waitForURL(`**/series/${s.id}/${otraVariante.id}/`);
      ok(await pagina.waitForSelector("#grafico[data-listo='1'] svg", { timeout: 15000 }).then(() => true, () => false), `${id}: no se dibujó la variante ${otraVariante.id}`);
      ok((await pagina.textContent("#cita-texto")).includes(`/series/${s.id}/${otraVariante.id}/`), `${id}: la cita de ${otraVariante.id} no apunta a su ficha`);
    }
    console.log(`${id}: encontrar, graficar${probadas.length ? ` (${probadas.join(", ")})` : ""}, descargar (CSV ${csv.bytes} B, PNG ${png.bytes} B, ZIP ${zip.bytes} B) y citar${otraVariante ? `; variante ${otraVariante.id}` : ""}`);
  }
  // Explorador (fase 4b): abrir una URL reproduce la vista; cambiar un control, recargar y comparar; descargas.
  await explorador(pagina, ancho);
  await fichaYPeriodos(pagina, ancho);
  await contexto.close();
}
await explorador1280x800(navegador);
await graficoSinCorrerse(navegador);
await navegador.close();
if (fallas.length) {
  console.error(`\n${fallas.length} fallas:\n${fallas.join("\n")}`);
  process.exit(1);
}
console.log(args.solo === "explorador"
  ? "\nTodo bien: el explorador reproduce sus vistas desde la URL y descarga CSV, XLSX, PNG y SVG en 390 y 1280 px."
  : `\nTodo bien: las ${catalogo.series.length} series se pueden encontrar, graficar, descargar y citar en 390 y 1280 px, y el explorador reproduce sus vistas desde la URL.`);
