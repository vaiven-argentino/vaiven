// Regresión de las URL de la 4b (SPEC 10: «las URL de una sola serie de la 4b dan la misma vista que antes»).
// Con --guardar, abre cada URL del explorador en el sitio armado con el código de la 4b y guarda lo que se ve:
// la URL final (después de canonizar), los avisos, el resumen, el último dato, la cita, el enlace a la ficha, la tabla
// y el SVG del gráfico (estos dos, como hash). Con --comparar, abre las mismas URL y dice qué cambió.
//
// Uso (contra `wrangler dev`, como el revisor visual):
//   node web/scripts/regresion-urls.mjs --base http://localhost:8787 --guardar [--svg <carpeta>]
//   node web/scripts/regresion-urls.mjs --base http://localhost:8787 --comparar [--svg <carpeta>]
// --svg guarda los SVG completos en esa carpeta (fuera del repo), para mirar una diferencia.
//
// Las vistas dependen de los datos (el último dato, la tabla, el gráfico), que cambian con cada actualización diaria. Por
// eso se comparan siempre con el export con que se guardaron: el de la 4b (EXPORT_4B). Con otro export, el script se
// niega y dice cómo armar el sitio con el de la 4b:
//   git checkout 71b1306 -- export && npm run build -w @vaiven/web   (y wrangler dev, como siempre)
//   node web/scripts/regresion-urls.mjs --comparar
//   git checkout HEAD -- export && npm run build -w @vaiven/web
// La parte que no depende de los datos (serie, estado, avisos, URL canónica y opciones) la prueba
// web/test/regresion-4b.test.ts con cualquier export.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const argv = process.argv.slice(2);
const opcion = (n) => { const i = argv.indexOf(n); return i === -1 ? undefined : argv[i + 1]; };
const base = (opcion("--base") ?? "http://localhost:8787").replace(/\/$/, "");
const guardar = argv.includes("--guardar");
const carpetaSvg = opcion("--svg");
if (!guardar && !argv.includes("--comparar")) { console.error("Falta --guardar o --comparar."); process.exit(2); }
if (carpetaSvg) mkdirSync(carpetaSvg, { recursive: true });

const RAIZ = join(import.meta.dirname, "..", "..");
const ARCHIVO_URLS = join(RAIZ, "web", "test", "regresion", "urls-4b.json");
const ARCHIVO_VISTAS = join(RAIZ, "web", "test", "regresion", "vistas-4b.json");
const ANCHOS = [1280, 390];
const hash = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);
/** El commit cuyo export se usó para guardar las vistas (main al cerrar la 4b). */
const EXPORT_4B = "71b1306";
if (!guardar) {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync("git", ["diff", "--quiet", EXPORT_4B, "--", "export/series", "export/catalogo.json", "export/periodos.json", "export/eventos.json"], { cwd: RAIZ });
  } catch {
    console.error(`El export no es el de la 4b (${EXPORT_4B}): las vistas cambian con los datos. Armá el sitio con ese export:\n` +
      `  git checkout ${EXPORT_4B} -- export && npm run build -w @vaiven/web\n` +
      "y, después de comparar, volvé al export actual: git checkout HEAD -- export && npm run build -w @vaiven/web");
    process.exit(2);
  }
}

/** Las URL fijas: las canónicas de estado.test.ts, las del explorador en CASOS_FIJOS y en punta-a-punta, y dos de lectura. */
const FIJAS = [
  "", "?t=var_mensual&desde=1985-06&hasta=1988-08&sh=plan&ev=1", "?s=pib&t=nivel&log=1&sh=gobierno",
  "?s=resultado-fiscal&v=financiero&desde=1993&sh=mandato",
  "?s=int-pib&p=ARG,BRA,CHL,URY,USA,WLD&t=indice_desde_tasas&base=2001&desde=2001&hasta=2011",
  "?s=tc-oficial&v=moneda-de-epoca&pa=1&t=var_interanual&sh=regimen_cambiario", "?s=salario-real&m=&mm=12",
  "?s=reservas&f=anual&desde=1983&sh=ministro", "?s=desocupacion&sh=catedra&ev=1", "?desde=1970&ev=cambiario,deuda",
  "?s=pib&sh=gobierno&ev=deuda,episodio", "?t=var_mensual&desde=1988&hasta=1991&ev=episodio",
  // revision-visual.mjs, CASOS_FIJOS del explorador
  "?t=var_interanual&desde=2000&hasta=2004", "?s=pib&sh=mandato", "?s=fuga", "?sh=gobierno&ev=1",
  "?s=pib&desde=1995&hasta=2020&sh=gobierno", "?t=var_mensual&desde=1988&hasta=1991&sh=gobierno&ev=1",
  "?s=reservas&desde=1988&hasta=1991&sh=gobierno", "?desde=1970&ev=1",
  // punta-a-punta.mjs
  "?s=resultado-fiscal&v=financiero&sh=regimen_cambiario", "?s=reservas&sh=catedra",
  // descartes con avisos, y las comas codificadas
  "?s=reservas&t=var_dic_dic&m=real&f=semanal&sh=papas&desde=83&mm=5", "?s=int-pib&p=ARG%2CBRA",
  // serie y variante inexistentes
  "?s=no-existe", "?s=ipc&v=no-existe",
];

async function listaDeUrls(navegador) {
  // Los accesos de /periodos/ (todos, del HTML armado) y el enlace «Abrir esta vista en el explorador» de cada ficha.
  const pagina = await navegador.newPage();
  await pagina.goto(`${base}/periodos/`, { waitUntil: "domcontentloaded" });
  const accesos = [...new Set(await pagina.$$eval('a[href^="/explorador/"]', (as) => as.map((a) => a.getAttribute("href").slice("/explorador/".length))))].sort();
  const catalogo = JSON.parse(readFileSync(join(RAIZ, "export", "catalogo.json"), "utf-8"));
  const fichas = [];
  for (const s of catalogo.series) {
    for (const v of s.variantes.filter((x) => x.estado === "publicada")) {
      const ruta = v.id === s.variante_por_defecto ? `/series/${s.id}/` : `/series/${s.id}/${v.id}/`;
      for (const q of ["", "?sh=gobierno&ev=1"]) {
        await pagina.goto(`${base}${ruta}${q}`, { waitUntil: "networkidle" });
        const href = await pagina.$eval("#abrir-explorador", (a) => a.getAttribute("href")).catch(() => null);
        if (href) fichas.push(href.slice(href.indexOf("/explorador/") + "/explorador/".length));
      }
    }
  }
  await pagina.close();
  return { fijas: FIJAS, accesos, fichas: [...new Set(fichas)].sort() };
}

async function capturar(pagina, url, ancho) {
  await pagina.goto(`${base}/explorador/${url}`, { waitUntil: "networkidle" });
  await pagina.waitForSelector("#x-grafico svg", { timeout: 20000 });
  return pagina.evaluate(() => {
    const texto = (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const visible = (sel) => { const e = document.querySelector(sel); return e && !e.hidden && !e.closest("[hidden]") ? texto(sel) : ""; };
    return {
      url: location.search,
      avisos: visible("#x-avisos"),
      resumen: texto("#x-resumen"),
      ultimo: texto("#x-ultimo"),
      unidad: texto("#x-unidad"),
      leyendas: [visible("#x-leyenda-paises"), visible("#x-leyenda-periodos"), visible("#x-leyenda-eventos"), visible("#x-aviso-filtro")].join(" | "),
      cita: texto("#x-cita"),
      ficha: document.querySelector("#x-ficha")?.getAttribute("href") ?? "",
      tabla: texto("#x-tabla-cabeza") + " // " + texto("#x-tabla-cuerpo"),
      svg: document.querySelector("#x-grafico svg").outerHTML,
    };
  }).then((c) => ({ ...c, ancho }));
}

const navegador = await chromium.launch();
const urls = guardar ? await listaDeUrls(navegador) : JSON.parse(readFileSync(ARCHIVO_URLS, "utf-8"));
const todas = [...urls.fijas, ...urls.accesos, ...urls.fichas];
const unicas = [...new Set(todas)];
// En el navegador: las fijas y las fichas, todas; de los accesos de /periodos/, uno de cada 12 (la lista entera se
// prueba sin navegador, en web/test/regresion-4b.test.ts).
const enNavegador = [...new Set([...urls.fijas, ...urls.fichas, ...urls.accesos.filter((_, i) => i % 12 === 0)])];
const anteriores = guardar ? {} : JSON.parse(readFileSync(ARCHIVO_VISTAS, "utf-8"));
const vistas = {};
const diferencias = [];
for (const ancho of ANCHOS) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: 800 }, colorScheme: "light", deviceScaleFactor: 1 });
  const pagina = await contexto.newPage();
  for (const url of enNavegador) {
    const clave = `${ancho} ${url || "(sin parámetros)"}`;
    let c;
    try { c = await capturar(pagina, url, ancho); }
    catch (e) { diferencias.push(`${clave}: no cargó (${e.message.split("\n")[0]})`); continue; }
    if (carpetaSvg) writeFileSync(join(carpetaSvg, `${hash(clave)}.svg`), c.svg);
    // Lo largo va como hash; lo que conviene leer en una diferencia (URL, avisos, último dato, unidad, ficha), entero.
    const { svg, tabla, resumen, leyendas, cita, ...resto } = c;
    vistas[clave] = { ...resto, resumen: hash(resumen), leyendas: hash(leyendas), cita: hash(cita), tabla: hash(tabla), svg: hash(svg) };
    if (!guardar) {
      const a = anteriores[clave];
      if (!a) { diferencias.push(`${clave}: no estaba guardada`); continue; }
      for (const k of Object.keys(a)) {
        if (a[k] !== vistas[clave][k]) diferencias.push(`${clave}: cambió «${k}»\n    antes: ${a[k]}\n    ahora: ${vistas[clave][k]}${k === "svg" && carpetaSvg ? ` (${join(carpetaSvg, `${hash(clave)}.svg`)})` : ""}`);
      }
    }
  }
  await contexto.close();
}
await navegador.close();

if (guardar) {
  mkdirSync(join(RAIZ, "web", "test", "regresion"), { recursive: true });
  writeFileSync(ARCHIVO_URLS, `${JSON.stringify(urls, null, 1)}\n`);
  writeFileSync(ARCHIVO_VISTAS, `${JSON.stringify(vistas, null, 1)}\n`);
  console.log(`Guardadas ${unicas.length} URL (${urls.fijas.length} fijas, ${urls.accesos.length} accesos, ${urls.fichas.length} de fichas); ${Object.keys(vistas).length} vistas en el navegador.`);
  if (diferencias.length) { console.log(diferencias.join("\n")); process.exit(1); }
} else if (diferencias.length) {
  console.log(`${diferencias.length} diferencias en ${Object.keys(vistas).length} vistas:\n${diferencias.join("\n")}`);
  process.exit(1);
} else {
  console.log(`Sin diferencias: ${Object.keys(vistas).length} vistas (${enNavegador.length} URL × ${ANCHOS.length} anchos).`);
}
