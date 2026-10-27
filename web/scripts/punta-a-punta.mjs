// Prueba de punta a punta (SPEC 11: «encontrar, graficar, descargar y citar cada serie desde el celular y la
// computadora»; fase 2, ampliada en la 4a). Por cada serie publicada, en 390 y 1280 px: la busca en el catálogo, abre
// la ficha, cambia de transformación, de medida (real, en dólares, % del PIB), de país y a pesos actuales cuando la
// variante los ofrece, baja el CSV, el PNG y el ZIP, copia la cita y abre otra variante.
//
// Uso: node web/scripts/punta-a-punta.mjs --base http://localhost:8787 --salida <carpeta para las descargas>
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
const fallas = [];
const ok = (cond, mensaje) => { if (!cond) fallas.push(mensaje); return cond; };

async function bajar(pagina, accion, nombre) {
  const [descarga] = await Promise.all([pagina.waitForEvent("download", { timeout: 15000 }), accion()]);
  const ruta = join(salida, `${Date.now()}_${descarga.suggestedFilename()}`);
  await descarga.saveAs(ruta);
  return { ruta, nombre: descarga.suggestedFilename(), bytes: statSync(ruta).size, esperado: nombre };
}

const navegador = await chromium.launch();
for (const ancho of [390, 1280]) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 }, acceptDownloads: true });
  await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const pagina = await contexto.newPage();
  for (const s of catalogo.series) {
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
    const opciones = await pagina.$$eval("#c-transformacion option", (os) => os.map((o) => o.value));
    if (opciones.length > 1) {
      const panel = pagina.locator("#panel-opciones");
      if (!(await panel.evaluate((d) => d.open))) await pagina.click("#panel-opciones > summary");
      const otra = opciones.find((o) => o !== (new URL(pagina.url()).searchParams.get("t") ?? "")) ?? opciones[0];
      await pagina.selectOption("#c-transformacion", opciones.includes("var_interanual") ? "var_interanual" : otra);
      await pagina.waitForTimeout(400);
      ok(await pagina.$("#grafico svg"), `${id}: el gráfico no se redibujó al cambiar la transformación`);
    }
    // Medidas, país y pesos actuales (fase 4a): cada opción tiene que dibujar sin error.
    const probadas = [];
    const sinError = async (que) => {
      await pagina.waitForTimeout(600);
      const estado = await pagina.$eval("#estado-grafico", (e) => (e.dataset.tipo === "error" ? e.textContent : ""));
      ok(!estado, `${id}: ${que} da error: «${estado}»`);
      ok(await pagina.$("#grafico svg"), `${id}: el gráfico no se redibujó con ${que}`);
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
  await contexto.close();
}
await navegador.close();
if (fallas.length) {
  console.error(`\n${fallas.length} fallas:\n${fallas.join("\n")}`);
  process.exit(1);
}
console.log(`\nTodo bien: las ${catalogo.series.length} series se pueden encontrar, graficar, descargar y citar en 390 y 1280 px.`);
