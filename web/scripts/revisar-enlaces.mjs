// Revisa que los enlaces internos del sitio armado (web/dist) lleven a un archivo que existe, directamente o por
// una regla de public/_redirects. Corre después de `astro build`; falla si encuentra enlaces rotos.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dirname, "..", "dist");
if (!existsSync(DIST)) {
  console.error("No está web/dist: corré `npm run build -w @vaiven/web` primero.");
  process.exit(2);
}

const redirecciones = new Map(
  readFileSync(join(DIST, "_redirects"), "utf-8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.trim().split(/\s+/))
    .map(([desde, hasta]) => [desde, hasta]),
);

function existe(ruta) {
  const limpia = decodeURI(ruta.split("#")[0].split("?")[0]);
  if (redirecciones.has(limpia)) return existe(redirecciones.get(limpia));
  const archivo = join(DIST, limpia);
  if (existsSync(archivo) && statSync(archivo).isFile()) return true;
  return existsSync(join(archivo, "index.html"));
}

function html(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "datos" ? [] : html(ruta);
    return e.name.endsWith(".html") ? [ruta] : [];
  });
}

const rotos = [];
let revisados = 0;
for (const pagina of html(DIST)) {
  const contenido = readFileSync(pagina, "utf-8");
  for (const [, enlace] of contenido.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    if (enlace.startsWith("//")) continue;
    revisados += 1;
    if (!existe(enlace)) rotos.push(`${pagina.replace(DIST, "")}: ${enlace}`);
  }
}
console.log(`${revisados} enlaces internos revisados.`);
if (rotos.length) {
  console.error(`Enlaces rotos (${rotos.length}):\n${rotos.join("\n")}`);
  process.exit(1);
}
console.log("Sin enlaces rotos.");
