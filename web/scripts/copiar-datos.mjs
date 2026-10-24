// Copia el export al sitio antes de `astro dev` y `astro build` (SPEC 2.5: API de solo lectura en /datos/).
// También publica los esquemas del contrato en /esquemas/ y genera public/_redirects.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(import.meta.dirname, "..");
const RAIZ = join(WEB, "..");
const EXPORT = join(RAIZ, "export");
const PUBLICO = join(WEB, "public");

const destinoDatos = join(PUBLICO, "datos");
rmSync(destinoDatos, { recursive: true, force: true });
cpSync(EXPORT, destinoDatos, { recursive: true, filter: (origen) => !origen.endsWith("README.md") });

const destinoEsquemas = join(PUBLICO, "esquemas");
rmSync(destinoEsquemas, { recursive: true, force: true });
mkdirSync(destinoEsquemas, { recursive: true });
for (const nombre of readdirSync(join(RAIZ, "tests", "contrato"))) {
  const version = /^serie-(.+)\.schema\.json$/.exec(nombre)?.[1];
  if (version) cpSync(join(RAIZ, "tests", "contrato", nombre), join(destinoEsquemas, `serie-${version}.json`));
}

const reglas = ["# Generado por web/scripts/copiar-datos.mjs: no se edita a mano."];
const catalogo = JSON.parse(readFileSync(join(EXPORT, "catalogo.json"), "utf-8"));
for (const s of catalogo.series) reglas.push(`/series/${s.id}/${s.variante_por_defecto}/ /series/${s.id}/ 301`);

// La descarga completa vigente también se ofrece con un nombre fijo.
const descargas = existsSync(join(EXPORT, "descargas")) ? readdirSync(join(EXPORT, "descargas")) : [];
for (const ext of ["zip", "parquet"]) {
  const archivo = descargas.filter((n) => n.startsWith("vaiven_") && n.endsWith(`.${ext}`)).sort().at(-1);
  if (archivo) reglas.push(`/datos/descargas/vaiven.${ext} /datos/descargas/${archivo} 302`);
  else console.warn(`Aviso: no está export/descargas/vaiven_<versión>.${ext}. Generala con \`uv run python -m pipeline descargas\`.`);
}
writeFileSync(join(PUBLICO, "_redirects"), reglas.join("\n") + "\n");
console.log(`Export copiado a public/datos/ y ${reglas.length - 1} redirecciones en public/_redirects.`);
