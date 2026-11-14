// Mide la CPU de especificacion_grafico (SPEC 7.3: tiene que caber en los 10 ms del plan gratuito de Workers) en el
// peor caso que admite su límite de 1.000 observaciones: 4 series mensuales, con sombreado y eventos. (Sin límite, el
// peor caso de la SPEC, 4 mensuales de 1970 a hoy, daba 34 ms de mediana: ver NOTAS_FASE4, «4c/4d».) También comparar_series y obtener_serie, como
// referencia. Empaqueta con esbuild el mismo código que corre el Worker y mide con process.cpuUsage() (usuario +
// sistema) la llamada a manejarMcp más la lectura de la respuesta, como en el Worker:
//   - en caliente: la caché del export llena y el JIT caliente (el caso normal: el isolate se reusa);
//   - caché fría: un Repositorio nuevo en el mismo proceso (vuelve a leer y parsear los JSON del export);
//   - proceso nuevo: el primer pedido de un proceso recién arrancado, después de precalentar() (como un isolate nuevo).
// Node no es workerd ni la máquina de Cloudflare: el criterio es la mitad del límite (p90 en caliente ≤ 5 ms). La CPU
// real se contrasta en los registros del Worker después del despliegue.
//
// En la 4e suma la lectura del recurso del gráfico (resources/read de ui://vaiven/grafico, SPEC 7.4), que lleva todo
// en línea (el SDK de la app y Vega).
//
// Uso: node mcp/scripts/medir-cpu.mjs [--muestras 50] [--procesos 10]
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const MCP = join(import.meta.dirname, "..");
const EXPORT = join(MCP, "..", "export");
const argv = process.argv.slice(2);
const opcion = (n, def) => { const i = argv.indexOf(n); return i === -1 ? def : Number(argv[i + 1]); };
const MUESTRAS = opcion("--muestras", 50);
const PROCESOS = opcion("--procesos", 10);

export const CASOS = {
  // El peor caso que entra en el límite de 1.000 observaciones (SPEC 7.3): 4 mensuales, unos 21 años.
  "especificacion_grafico · peor caso dentro del límite (4 mensuales 2000–2020-09, 996 obs., gobiernos y eventos)": ["especificacion_grafico", {
    series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "tc-oficial", transformacion: "var_interanual" }, { id: "base-monetaria" }, { id: "reservas" }],
    desde: "2000", hasta: "2020-09", sombreado: "gobierno", eventos: true,
  }],
  "especificacion_grafico · 2 series (doble eje), 1995–2010": ["especificacion_grafico", {
    series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "reservas" }], desde: "1995", hasta: "2010",
  }],
  "especificacion_grafico · fuera del límite (4 mensuales 1970–hoy): el error": ["especificacion_grafico", {
    series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "tc-oficial", transformacion: "var_interanual" }, { id: "base-monetaria" }, { id: "reservas" }],
    desde: "1970", sombreado: "gobierno", eventos: true,
  }, { error: true }],
  "comparar_series · 4 mensuales 1970–hoy, a la frecuencia común": ["comparar_series", {
    series: [{ id: "ipc", transformacion: "var_interanual" }, { id: "tc-oficial", transformacion: "var_interanual" }, { id: "base-monetaria" }, { id: "reservas" }],
    desde: "1970",
  }],
  "obtener_serie · IPC completo, interanual (referencia de la 4a)": ["obtener_serie", { id: "ipc", transformacion: "var_interanual" }],
  "resources/read · ui://vaiven/grafico (4e, todo en línea)": ["@recurso", { uri: "ui://vaiven/grafico" }],
};

// Otros casos, para medir la CPU según el tamaño: VAIVEN_CPU_CASOS='{"título": ["herramienta", {argumentos}]}'.
if (process.env.VAIVEN_CPU_CASOS) {
  for (const k of Object.keys(CASOS)) delete CASOS[k];
  Object.assign(CASOS, JSON.parse(process.env.VAIVEN_CPU_CASOS));
}

if (!process.env.VAIVEN_CPU_HIJO) await (await import("./armar-app.mjs")).armarApp();

const dir = mkdtempSync(join(tmpdir(), "vaiven-cpu-"));
const entrada = join(dir, "entrada.ts");
writeFileSync(entrada, `
export { manejarMcp } from ${JSON.stringify(join(MCP, "src", "http.ts"))};
export { Repositorio } from ${JSON.stringify(join(MCP, "src", "datos.ts"))};
export { fuenteCarpeta } from ${JSON.stringify(join(MCP, "src", "fuente-carpeta.ts"))};
export { precalentar } from ${JSON.stringify(join(MCP, "src", "precalentar.ts"))};
export { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
`);
const bundle = join(dir, "mcp.mjs");
await build({ entryPoints: [entrada], bundle: true, platform: "node", format: "esm", target: "es2024", outfile: bundle, logLevel: "warning", nodePaths: [join(MCP, "node_modules"), join(MCP, "..", "node_modules")] });

/** Corre un caso en este proceso y devuelve las muestras en ms de CPU y el tamaño de la respuesta. */
async function medirEnProceso(m, nombre, args, { muestras, cacheFria, error = false }) {
  m.precalentar();
  let repo = new m.Repositorio(m.fuenteCarpeta(EXPORT));
  let cpu = 0, bytes = 0;
  const cliente = new m.Client({ name: "medicion", version: "1.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
  await cliente.connect(new m.StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: async (url, init) => {
      const pedido = new Request(url, init);
      const t0 = process.cpuUsage();
      const r = await m.manejarMcp(pedido, repo);
      const cuerpo = await r.arrayBuffer();
      const d = process.cpuUsage(t0);
      cpu = (d.user + d.system) / 1000;
      bytes = cuerpo.byteLength;
      return new Response(cuerpo, { status: r.status, headers: r.headers });
    },
  }));
  const salida = [];
  for (let i = 0; i < muestras; i++) {
    if (cacheFria) repo = new m.Repositorio(m.fuenteCarpeta(EXPORT));
    if (nombre === "@recurso") {
      const r = await cliente.readResource(args);
      if (!r.contents[0]?.text) throw new Error(`${args.uri}: sin contenido`);
    } else {
      const r = await cliente.callTool({ name: nombre, arguments: args });
      if (!!r.isError !== error) throw new Error(`${nombre}: ${r.content[0].text.slice(0, 300)}`);
    }
    salida.push(cpu);
  }
  await cliente.close();
  return { muestras: salida, bytes };
}

const p = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const fmt = (x) => x.toFixed(2).replace(".", ",");

if (process.env.VAIVEN_CPU_HIJO) {
  // Proceso nuevo: un solo pedido, el primero del proceso.
  const m = await import(bundle);
  const [nombre, args, extra] = CASOS[process.env.VAIVEN_CPU_HIJO];
  const { muestras } = await medirEnProceso(m, nombre, args, { muestras: 1, cacheFria: false, ...extra });
  process.stdout.write(String(muestras[0]));
  process.exit(0);
}

const m = await import(bundle);
console.log(`CPU por pedido (process.cpuUsage, ms), Node ${process.version}. Caliente: ${MUESTRAS} muestras tras una de calentamiento; proceso nuevo: ${PROCESOS} procesos.\n`);
for (const [titulo, [nombre, args, extra]] of Object.entries(CASOS)) {
  const caliente = await medirEnProceso(m, nombre, args, { muestras: MUESTRAS + 1, cacheFria: false, ...extra });
  caliente.muestras.shift();
  const fria = await medirEnProceso(m, nombre, args, { muestras: Math.min(MUESTRAS, 20), cacheFria: true, ...extra });
  const nuevos = Array.from({ length: PROCESOS }, () => Number(execFileSync(process.execPath, [import.meta.filename], { env: { ...process.env, VAIVEN_CPU_HIJO: titulo } }).toString()));
  console.log(`${titulo}\n  respuesta: ${Math.round(caliente.bytes / 1024)} KB` +
    `\n  en caliente: mediana ${fmt(p(caliente.muestras, 0.5))} · p90 ${fmt(p(caliente.muestras, 0.9))}` +
    `\n  caché fría: mediana ${fmt(p(fria.muestras, 0.5))} · p90 ${fmt(p(fria.muestras, 0.9))}` +
    `\n  proceso nuevo: mediana ${fmt(p(nuevos, 0.5))} · máximo ${fmt(Math.max(...nuevos))}\n`);
}
rmSync(dir, { recursive: true, force: true });
